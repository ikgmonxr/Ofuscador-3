"use strict";

const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");

const PORT = Number(process.env.PORT || 3000);
const MAX_SOURCE_BYTES = 900 * 1024;

const indexCandidates = [
  path.join(__dirname, "index.html"),
  path.join(process.cwd(), "index.html"),
];

const KEYWORDS = new Set([
  "and", "break", "do", "else", "elseif", "end", "false", "for", "function",
  "goto", "if", "in", "local", "nil", "not", "or", "repeat", "return", "then",
  "true", "until", "while", "continue", "export", "type"
]);

function isIdentStart(ch) {
  return /[A-Za-z_]/.test(ch || "");
}
function isIdentPart(ch) {
  return /[A-Za-z0-9_]/.test(ch || "");
}
function isWordEnd(s) {
  return /[A-Za-z0-9_]/.test((s || "").slice(-1));
}
function isWordStart(s) {
  return /[A-Za-z0-9_]/.test((s || "")[0]);
}

function longBracketEnd(src, start) {
  const m = src.slice(start).match(/^\[(=*)\[/);
  if (!m) return null;
  const closer = "]" + m[1] + "]";
  const end = src.indexOf(closer, start + m[0].length);
  return end === -1 ? src.length : end + closer.length;
}

/**
 * Tokenizador simple pero seguro para Lua/Luau
 */
function tokenize(src) {
  const tokens = [];
  let i = 0;

  while (i < src.length) {
    const ch = src[i];

    // espacios
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // comentarios
    if (src.startsWith("--", i)) {
      if (src[i + 2] === "[") {
        const end = longBracketEnd(src, i + 2);
        i = end || src.length;
      } else {
        const nl = src.indexOf("\n", i);
        i = nl === -1 ? src.length : nl + 1;
      }
      continue;
    }

    // long strings [[...]]
    if (ch === "[" && longBracketEnd(src, i)) {
      const end = longBracketEnd(src, i);
      tokens.push({ type: "longString", value: src.slice(i, end) });
      i = end;
      continue;
    }

    // strings normales
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === "\\") {
          j += 2;
          continue;
        }
        if (src[j] === quote) {
          j++;
          break;
        }
        j++;
      }
      tokens.push({ type: "string", value: src.slice(i, j) });
      i = j;
      continue;
    }

    // identificadores / keywords
    if (isIdentStart(ch)) {
      let j = i + 1;
      while (isIdentPart(src[j])) j++;
      const value = src.slice(i, j);
      tokens.push({
        type: KEYWORDS.has(value) ? "keyword" : "identifier",
        value
      });
      i = j;
      continue;
    }

    // números
    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(src[i + 1] || ""))) {
      const m = src.slice(i).match(
        /^(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?[\d_]+)?)/
      );
      const value = m ? m[0] : ch;
      tokens.push({ type: "number", value });
      i += value.length;
      continue;
    }

    // operadores
    const op = ["...", "..=", "==", "~=", "<=", ">=", "//", "..", "->", "+=", "-=", "*=", "/=", "%="]
      .find(o => src.startsWith(o, i));
    tokens.push({ type: "symbol", value: op || ch });
    i += (op || ch).length;
  }

  return tokens;
}

function makeLocalName(n) {
  return "_l" + n.toString(36) + crypto.randomBytes(2).toString("hex");
}

function decodeShortString(raw) {
  const q = raw[0];
  if ((q !== '"' && q !== "'") || raw[raw.length - 1] !== q) return null;

  let out = "";
  for (let i = 1; i < raw.length - 1; i++) {
    if (raw[i] !== "\\") {
      out += raw[i];
      continue;
    }
    const n = raw[++i];
    const map = {
      n: "\n", t: "\t", r: "\r",
      "\\": "\\", '"': '"', "'": "'"
    };
    if (map[n] !== undefined) out += map[n];
    else return null; // escape desconocido → no tocar
  }
  return out;
}

/**
 * Ofuscación segura:
 * 1. Solo renombra variables declaradas con `local`
 * 2. Cifra strings cortas (evita URLs y assets)
 * 3. No toca globales ni propiedades de Roblox
 */
function obfuscate(source, options = {}) {
  const code = String(source || "").trim();
  if (!code) throw new Error("Script vacío");

  const tokens = tokenize(code);
  const encryptStrings = options.encryptStrings !== false;

  // ----- 1. Detectar solo variables local -----
  const renameMap = new Map();
  let counter = 0;

  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type === "keyword" && tokens[i].value === "local") {
      let j = i + 1;
      while (j < tokens.length) {
        if (tokens[j].type === "identifier") {
          const name = tokens[j].value;
          // no renombrar nombres muy cortos ni los que ya están
          if (name.length > 1 && !renameMap.has(name)) {
            counter++;
            renameMap.set(name, makeLocalName(counter));
          }
          j++;
          // local a, b, c
          if (j < tokens.length && tokens[j].type === "symbol" && tokens[j].value === ",") {
            j++;
            continue;
          }
          break;
        } else {
          break;
        }
      }
    }
  }

  // Aplicar rename SOLO a los que están en el mapa
  for (const t of tokens) {
    if (t.type === "identifier" && renameMap.has(t.value)) {
      t.value = renameMap.get(t.value);
    }
  }

  // ----- 2. Preparar cifrado de strings -----
  const key = crypto.randomBytes(3);
  const decName = "_d" + crypto.randomBytes(2).toString("hex");
  const keyArr = [...key].join(",");

  // ----- 3. Reconstruir código -----
  let body = "";
  let prev = "";

  for (const t of tokens) {
    let cur = t.value;

    if (encryptStrings && t.type === "string") {
      const decoded = decodeShortString(t.value);
      if (
        decoded &&
        decoded.length > 0 &&
        decoded.length <= 220 &&
        !/https?:\/\//i.test(decoded) &&
        !/rbxassetid/i.test(decoded)
      ) {
        const bytes = [...Buffer.from(decoded, "utf8")].map(
          (b, idx) => b ^ key[idx % key.length]
        );
        cur = `${decName}({${bytes.join(",")}})`;
      }
    }

    const needSpace =
      (isWordEnd(prev) && isWordStart(cur)) ||
      (prev.endsWith("-") && cur.startsWith("-"));

    if (needSpace) body += " ";
    body += cur;
    prev = cur;
  }

  const decoder = encryptStrings
    ? `local ${decName}=function(t)local k={${keyArr}}local r={}for i=1,#t do r[i]=string.char(bit32.bxor(t[i],k[(i-1)%#k+1]))end return table.concat(r)end;`
    : "";

  const result = `-- Protect by QyrexObf\n${decoder}${body}`;

  return {
    code: result,
    originalSize: code.length,
    outputSize: result.length,
    hash: crypto.createHash("sha256").update(result).digest("hex").slice(0, 12)
  };
}

// ===================== SERVER =====================

function sendJson(res, status, obj) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(obj));
}

const server = http.createServer((req, res) => {
  // Servir frontend
  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    const file = indexCandidates.find(f => fs.existsSync(f));
    if (!file) return sendJson(res, 500, { error: "Falta index.html" });

    return fs.readFile(file, (err, data) => {
      if (err) return sendJson(res, 500, { error: "No se pudo leer index.html" });
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(data);
    });
  }

  // Endpoint de ofuscación
  if (req.method === "POST" && req.url === "/api/obfuscate") {
    const chunks = [];
    let size = 0;

    req.on("data", chunk => {
      size += chunk.length;
      if (size > MAX_SOURCE_BYTES + 64 * 1024) {
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        return sendJson(res, 400, { error: "JSON inválido" });
      }

      const code = body && body.code;
      if (typeof code !== "string" || !code.trim()) {
        return sendJson(res, 400, { error: "Pega un script Lua primero" });
      }

      if (Buffer.byteLength(code, "utf8") > MAX_SOURCE_BYTES) {
        return sendJson(res, 413, { error: "Script demasiado grande (máx ~900KB)" });
      }

      try {
        const result = obfuscate(code, {
          encryptStrings: body.encryptStrings !== false
        });

        return sendJson(res, 200, {
          success: true,
          code: result.code,
          originalSize: result.originalSize,
          outputSize: result.outputSize,
          hash: result.hash,
          compressionRatio: Math.round((result.outputSize / result.originalSize) * 100) + "%"
        });
      } catch (err) {
        return sendJson(res, 500, {
          error: err.message || "Error al ofuscar"
        });
      }
    });

    return;
  }

  sendJson(res, 404, { error: "Ruta no encontrada" });
});

server.listen(PORT, () => {
  console.log(`QyrexObf listo → http://localhost:${PORT}`);
});
