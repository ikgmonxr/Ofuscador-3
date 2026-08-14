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

const RESERVED = new Set([
  ...luaKeywords,
  "game","workspace","script","plugin","shared","_G","_ENV","self",
  "Instance","Enum","Color3","Vector3","CFrame","UDim2","UDim","Rect",
  "TweenInfo","BrickColor","Ray","Region3","task","wait","spawn","delay",
  "tick","time","os","math","string","table","pairs","ipairs","next","type",
  "typeof","print","warn","error","pcall","xpcall","select","unpack",
  "rawget","rawset","rawequal","rawlen","setmetatable","getmetatable",
  "coroutine","debug","utf8","bit32","buffer","require",
  "Players","RunService","UserInputService","TweenService","HttpService",
  "ReplicatedStorage","Lighting","CoreGui","Workspace","Camera",
  "Humanoid","HumanoidRootPart","LocalPlayer","GetService","FindFirstChild",
  "WaitForChild","GetChildren","GetDescendants","IsA","Clone","Destroy",
  "Connect","Disconnect","Fire","Invoke"
]);

function isIdentifierStart(ch) { return /[A-Za-z_]/.test(ch || ""); }
function isIdentifierPart(ch) { return /[A-Za-z0-9_]/.test(ch || ""); }
function isWordEnd(t) { return /[A-Za-z0-9_]/.test((t || "").slice(-1)); }
function isWordStart(t) { return /[A-Za-z0-9_]/.test((t || "")[0]); }

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

function makeName(n) {
  return "_q" + n.toString(36) + crypto.randomBytes(2).toString("hex");
}

function decodeString(raw) {
  const q = raw[0];
  if ((q !== '"' && q !== "'") || raw.at(-1) !== q) return null;
  let out = "";
  for (let i = 1; i < raw.length - 1; i++) {
    if (raw[i] !== "\\") { out += raw[i]; continue; }
    const n = raw[++i];
    const map = { n: "\n", t: "\t", r: "\r", "\\": "\\", '"': '"', "'": "'" };
    if (map[n] !== undefined) out += map[n];
    else return null;
  }
  return out;
}

function obfuscate(code, options) {
  const tokens = tokenizeLua(code);
  const level = Number(options.level) || 2;
  const doStrings = options.encryptStrings !== false;

  // Renombrar solo identificadores seguros
  const map = new Map();
  let id = 0;
  for (const t of tokens) {
    if (t.type === "identifier" && !RESERVED.has(t.value) && t.value.length > 2) {
      if (!map.has(t.value)) {
        id++;
        map.set(t.value, makeName(id));
      }
    }
  }
  for (const t of tokens) {
    if (t.type === "identifier" && map.has(t.value)) {
      t.value = map.get(t.value);
    }
  }

  // Decoder
  const key = crypto.randomBytes(3);
  const decName = "_d" + crypto.randomBytes(2).toString("hex");
  const keyList = [...key].join(",");

  let body = "";
  let prev = "";

  for (const t of tokens) {
    let cur = t.value;

    // Cifrar strings cortas (seguro)
    if (doStrings && t.type === "string" && level >= 2) {
      const decoded = decodeString(t.value);
      if (decoded && decoded.length > 0 && decoded.length < 300 &&
          !/https?:\/\//i.test(decoded) && !/rbxassetid/i.test(decoded)) {
        const bytes = [...Buffer.from(decoded, "utf8")].map((b, i) => b ^ key[i % key.length]);
        cur = `${decName}({${bytes.join(",")}})`;
      }
    }

    const needSpace = (isWordEnd(prev) && isWordStart(cur)) ||
                      (prev.endsWith("-") && cur.startsWith("-"));
    if (needSpace) body += " ";
    body += cur;
    prev = cur;
  }

  const decoder = doStrings && level >= 2
    ? `local ${decName}=function(t)local k={${keyList}}local r={}for i=1,#t do r[i]=string.char(bit32.bxor(t[i],k[(i-1)%#k+1]))end return table.concat(r)end;`
    : "";

  const result = `-- Protect by QyrexObf\n${decoder}${body}`;
  const hash = crypto.createHash("sha256").update(result).digest("hex").slice(0, 10);

  return { code: result, level, hash };
}

function sendJson(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    const p = indexCandidates.find(f => fs.existsSync(f));
    if (!p) return sendJson(res, 500, { error: "Falta index.html" });
    return fs.readFile(p, (e, data) => {
      if (e) return sendJson(res, 500, { error: "No se pudo leer index.html" });
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(data);
    });
  }

  if (req.method !== "POST" || req.url !== "/api/obfuscate") {
    return sendJson(res, 404, { error: "No encontrado" });
  }

  const chunks = [];
  let size = 0;
  req.on("data", c => {
    size += c.length;
    if (size > MAX_SOURCE_BYTES + 50 * 1024) return req.destroy();
    chunks.push(c);
  });
  req.on("end", () => {
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { return sendJson(res, 400, { error: "JSON inválido" }); }

    const code = body?.code;
    if (typeof code !== "string" || !code.trim()) {
      return sendJson(res, 400, { error: "Pega un script" });
    }
    if (Buffer.byteLength(code) > MAX_SOURCE_BYTES) {
      return sendJson(res, 413, { error: "Demasiado grande" });
    }

    // SIN restricción de APIs de executor

    try {
      const result = obfuscate(code, body);
      return sendJson(res, 200, {
        ...result,
        compressionRatio: Math.round(result.code.length / code.length * 100) + "%"
      });
    } catch (e) {
      return sendJson(res, 500, { error: e.message || "Error" });
    }
  });
});

server.listen(PORT, () => {
  console.log(`QyrexObf estable → http://localhost:${PORT}`);
});
