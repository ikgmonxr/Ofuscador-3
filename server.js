"use strict";

const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");

const PORT = Number(process.env.PORT || 3000);
const MAX_SOURCE_BYTES = 900 * 1024;
const indexCandidates = [
  path.join(__dirname, "index.html"),
  path.join(process.cwd(), "index.html")
];

const luaKeywords = new Set([
  "and","break","do","else","elseif","end","false","for","function","goto",
  "if","in","local","nil","not","or","repeat","return","then","true","until","while",
  "continue","export","type"
]);

// Nombres que NO se deben renombrar (Roblox + comunes)
const RESERVED = new Set([
  ...luaKeywords,
  "game","workspace","script","plugin","shared","_G","_ENV","self",
  "Instance","Enum","Color3","Vector3","CFrame","UDim2","UDim","Rect",
  "TweenInfo","BrickColor","NumberSequence","ColorSequence","NumberRange",
  "PhysicalProperties","Axes","Faces","Ray","Region3",
  "task","wait","spawn","delay","tick","time","os","math","string","table",
  "pairs","ipairs","next","type","typeof","print","warn","error","pcall","xpcall",
  "select","unpack","rawget","rawset","rawequal","rawlen","setmetatable","getmetatable",
  "coroutine","debug","utf8","bit32","buffer","vector","require",
  "Players","RunService","UserInputService","TweenService","HttpService",
  "ReplicatedStorage","Lighting","CoreGui","Workspace","Camera","Mouse",
  "Humanoid","HumanoidRootPart","LocalPlayer","GetService","FindFirstChild",
  "WaitForChild","GetChildren","GetDescendants","IsA","Clone","Destroy",
  "Connect","Disconnect","Fire","Invoke"
]);

function isIdentifierStart(ch) { return /[A-Za-z_]/.test(ch || ""); }
function isIdentifierPart(ch) { return /[A-Za-z0-9_]/.test(ch || ""); }
function isWordEnd(token) { return /[A-Za-z0-9_]/.test((token || "").slice(-1)); }
function isWordStart(token) { return /[A-Za-z0-9_]/.test((token || "")[0]); }

function longBracketEnd(source, start) {
  const open = source.slice(start).match(/^\[(=*)\[/);
  if (!open) return null;
  const closer = `]${open[1]}]`;
  const end = source.indexOf(closer, start + open[0].length);
  return end === -1 ? source.length : end + closer.length;
}

function tokenizeLua(source) {
  const out = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (/\s/.test(ch)) { i++; continue; }

    if (source.startsWith("--", i)) {
      const longEnd = source[i + 2] === "[" ? longBracketEnd(source, i + 2) : null;
      if (longEnd) i = longEnd;
      else {
        const lineEnd = source.indexOf("\n", i);
        i = lineEnd === -1 ? source.length : lineEnd + 1;
      }
      continue;
    }

    if (ch === "[" && longBracketEnd(source, i)) {
      const end = longBracketEnd(source, i);
      out.push({ type: "longString", value: source.slice(i, end) });
      i = end;
      continue;
    }

    if (ch === "'" || ch === '"') {
      const quote = ch;
      let j = i + 1;
      while (j < source.length) {
        if (source[j] === "\\") { j += 2; continue; }
        if (source[j] === quote) { j++; break; }
        j++;
      }
      out.push({ type: "string", value: source.slice(i, j) });
      i = j;
      continue;
    }

    if (isIdentifierStart(ch)) {
      let j = i + 1;
      while (isIdentifierPart(source[j])) j++;
      const value = source.slice(i, j);
      out.push({ type: luaKeywords.has(value) ? "keyword" : "identifier", value });
      i = j;
      continue;
    }

    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(source[i + 1]))) {
      const match = source.slice(i).match(/^(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?[\d_]+)?)/);
      const value = match ? match[0] : ch;
      out.push({ type: "number", value });
      i += value.length;
      continue;
    }

    const op = ["...", "..=", "==", "~=", "<=", ">=", "//", "..", "->", "+=", "-=", "*=", "/=", "%="]
      .find(c => source.startsWith(c, i));
    out.push({ type: "symbol", value: op || ch });
    i += (op || ch).length;
  }
  return out;
}

function makeUglyName(n) {
  const chars = "IlO0oQq";
  let s = "_";
  for (let i = 0; i < 8; i++) {
    s += chars[(Math.random() * chars.length) | 0];
  }
  return s + n.toString(36);
}

function decodeLuaShortString(raw) {
  const quote = raw[0];
  if ((quote !== "'" && quote !== '"') || raw.at(-1) !== quote) return null;
  let result = "";
  for (let i = 1; i < raw.length - 1; i++) {
    if (raw[i] !== "\\") { result += raw[i]; continue; }
    const next = raw[++i];
    const escapes = { a:"\x07", b:"\b", f:"\f", n:"\n", r:"\r", t:"\t", v:"\v", "\\":"\\", '"':'"', "'":"'" };
    if (Object.hasOwn(escapes, next)) { result += escapes[next]; continue; }
    if (next === "z") { while (/\s/.test(raw[i + 1] || "")) i++; continue; }
    if (next === "\n") { result += "\n"; continue; }
    if (next === "\r") { if (raw[i + 1] === "\n") i++; result += "\n"; continue; }
    if (/[0-9]/.test(next)) {
      let digits = next;
      while (digits.length < 3 && /[0-9]/.test(raw[i + 1] || "")) digits += raw[++i];
      const value = Number(digits);
      if (value > 255) return null;
      result += String.fromCharCode(value);
      continue;
    }
    return null;
  }
  return result;
}

function encodeString(raw, decoderName, key) {
  const decoded = decodeLuaShortString(raw);
  if (decoded === null || decoded.length === 0 || decoded.length > 400) return raw;

  // No tocar URLs / assets
  if (/https?:\/\//i.test(decoded) || /rbxassetid/i.test(decoded)) return raw;

  const bytes = [...Buffer.from(decoded, "utf8")];
  const encoded = bytes.map((b, i) => b ^ key[i % key.length]);
  return `${decoderName}({${encoded.join(",")}})`;
}

function encodeNumber(raw) {
  if (!/^\d+$/.test(raw)) return raw;
  const n = Number(raw);
  if (n < 16 || n > 9999) return raw;

  const r = Math.random();
  if (r < 0.33) return `(${n + 7}-7)`;
  if (r < 0.66) return `(${n * 2}//2)`;
  return `((${n}~0))`;
}

function obfuscate(code, options) {
  const level = [1, 2, 3].includes(Number(options.level)) ? Number(options.level) : 3;
  const tokens = tokenizeLua(code);

  // --- Renombrado agresivo ---
  const renameMap = new Map();
  let counter = 0;

  for (const token of tokens) {
    if (token.type === "identifier" && !RESERVED.has(token.value) && token.value.length > 1) {
      if (!renameMap.has(token.value)) {
        counter++;
        renameMap.set(token.value, makeUglyName(counter));
      }
    }
  }

  // Aplicar rename
  for (const token of tokens) {
    if (token.type === "identifier" && renameMap.has(token.value)) {
      token.value = renameMap.get(token.value);
    }
  }

  // Nombre del decoder
  const seed = crypto.randomBytes(4).toString("hex");
  const decoderName = "_q" + seed;
  const key = crypto.randomBytes(4); // clave XOR

  // --- Render + cifrado ---
  let body = "";
  let prev = "";

  for (let i = 0; i < tokens.length; i++) {
    let cur = tokens[i].value;

    if (options.encryptStrings !== false && tokens[i].type === "string") {
      cur = encodeString(cur, decoderName, key);
    }

    if (level >= 2 && tokens[i].type === "number") {
      cur = encodeNumber(cur);
    }

    const needSpace =
      (isWordEnd(prev) && isWordStart(cur)) ||
      (prev.endsWith("-") && cur.startsWith("-"));

    if (needSpace) body += " ";
    body += cur;
    prev = cur;
  }

  // Decoder compacto
  const keyArr = [...key].join(",");
  const decoder = `local ${decoderName}=function(t)local k={${keyArr}}local r={}for i=1,#t do r[i]=string.char(bit32.bxor(t[i],k[(i-1)%#k+1]))end return table.concat(r)end;`;

  const finalCode = `-- Protect by QyrexObf\n${decoder}${body}`;

  const hash = crypto.createHash("sha256").update(finalCode).digest("hex").slice(0, 12);

  return {
    code: finalCode,
    level,
    hash
  };
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    const indexPath = indexCandidates.find(c => fs.existsSync(c));
    if (!indexPath) return sendJson(res, 500, { error: "Falta index.html" });
    return fs.readFile(indexPath, (err, page) => {
      if (err) return sendJson(res, 500, { error: "No se pudo leer index.html" });
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(page);
    });
  }

  if (req.method !== "POST" || req.url !== "/api/obfuscate") {
    return sendJson(res, 404, { error: "Ruta no encontrada" });
  }

  let received = 0;
  const parts = [];

  req.on("data", chunk => {
    received += chunk.length;
    if (received > MAX_SOURCE_BYTES + 60 * 1024) { req.destroy(); return; }
    parts.push(chunk);
  });

  req.on("end", () => {
    let body;
    try {
      body = JSON.parse(Buffer.concat(parts).toString("utf8"));
    } catch {
      return sendJson(res, 400, { error: "JSON inválido" });
    }

    const code = body?.code;
    if (typeof code !== "string" || !code.trim()) {
      return sendJson(res, 400, { error: "Pega un script primero" });
    }
    if (Buffer.byteLength(code, "utf8") > MAX_SOURCE_BYTES) {
      return sendJson(res, 413, { error: "Script demasiado grande" });
    }

    try {
      const result = obfuscate(code, body);
      const ratio = Math.round((result.code.length / code.length) * 100);
      return sendJson(res, 200, {
        ...result,
        compressionRatio: ratio + "%"
      });
    } catch (e) {
      return sendJson(res, 500, { error: e.message || "Error al ofuscar" });
    }
  });
});

server.listen(PORT, () => {
  console.log(`QyrexObf Ultra: http://localhost:${PORT}`);
});
