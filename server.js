"use strict";

const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");

const PORT = Number(process.env.PORT || 3000);
const MAX_SOURCE_BYTES = 500 * 1024;
const indexCandidates = [path.join(__dirname, "index.html"), path.join(process.cwd(), "index.html")];

const luaKeywords = new Set([
  "and", "break", "do", "else", "elseif", "end", "false", "for", "function", "goto",
  "if", "in", "local", "nil", "not", "or", "repeat", "return", "then", "true", "until", "while",
  "continue", "export", "type",
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

/** Tokenise only what is necessary to preserve Lua syntax. */
function tokenizeLua(source) {
  const out = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (source.startsWith("--", i)) {
      const longEnd = source[i + 2] === "[" ? longBracketEnd(source, i + 2) : null;
      if (longEnd) i = longEnd;
      else { const lineEnd = source.indexOf("\n", i); i = lineEnd === -1 ? source.length : lineEnd + 1; }
      continue;
    }
    if (ch === "[" && longBracketEnd(source, i)) {
      const end = longBracketEnd(source, i);
      out.push({ type: "longString", value: source.slice(i, end) }); i = end; continue;
    }
    if (ch === "'" || ch === '"') {
      const quote = ch; let j = i + 1;
      while (j < source.length) {
        if (source[j] === "\\") { j += 2; continue; }
        if (source[j] === quote) { j++; break; }
        j++;
      }
      out.push({ type: "string", value: source.slice(i, j) }); i = j; continue;
    }
    if (isIdentifierStart(ch)) {
      let j = i + 1; while (isIdentifierPart(source[j])) j++;
      const value = source.slice(i, j);
      out.push({ type: luaKeywords.has(value) ? "keyword" : "identifier", value }); i = j; continue;
    }
    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(source[i + 1]))) {
      const match = source.slice(i).match(/^(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?[\d_]+)?)/);
      const value = match ? match[0] : ch;
      out.push({ type: "number", value }); i += value.length; continue;
    }
    const op = ["...", "..=", "==", "~=", "<=", ">=", "//", "..", "->", "+=", "-=", "*=", "/=", "%="]
      .find(candidate => source.startsWith(candidate, i));
    out.push({ type: "symbol", value: op || ch }); i += (op || ch).length;
  }
  return out;
}

function decodeLuaShortString(raw) {
  const quote = raw[0];
  if ((quote !== "'" && quote !== '"') || raw.at(-1) !== quote) return null;
  let result = "";
  for (let i = 1; i < raw.length - 1; i++) {
    if (raw[i] !== "\\") { result += raw[i]; continue; }
    const next = raw[++i];
    const escapes = { a: "\x07", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t", v: "\v", "\\": "\\", '"': '"', "'": "'" };
    if (Object.hasOwn(escapes, next)) { result += escapes[next]; continue; }
    if (next === "z") { while (/\s/.test(raw[i + 1] || "")) i++; continue; }
    if (next === "\n") { result += "\n"; continue; }
    if (next === "\r") { if (raw[i + 1] === "\n") i++; result += "\n"; continue; }
    if (/[0-9]/.test(next)) {
      let digits = next;
      while (digits.length < 3 && /[0-9]/.test(raw[i + 1] || "")) digits += raw[++i];
      const value = Number(digits); if (value > 255) return null;
      result += String.fromCharCode(value); continue;
    }
    // Unknown escapes are retained exactly; this prevents us changing source meaning.
    return null;
  }
  return result;
}

function encodeString(raw, level, decoderName) {
  const decoded = decodeLuaShortString(raw);
  if (decoded === null || decoded.length === 0) return raw;
  const bytes = [...Buffer.from(decoded, "utf8")];
  if (bytes.length > 512) return raw;
  const salt = level === 3 ? 37 : 0;
  const encoded = bytes.map(value => salt ? String(value ^ salt) : String(value));
  const payload = encoded.join(",");
  if (!salt) return `string.char(${payload})`;
  return `${decoderName}({${payload}})`;
}

function encodeInteger(raw, index) {
  if (!/^\d[\d_]*$/.test(raw)) return raw;
  const number = Number(raw.replaceAll("_", ""));
  if (!Number.isSafeInteger(number) || number < 0 || number > 2147483647) return raw;
  const key = ((index * 1103515245 + 12345) >>> 0) & 0x7fffffff;
  return `(((${number}~${key})~${key}))`;
}

function render(tokens, { encryptStrings, level, decoderName }) {
  let output = "";
  let previous = "";
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    let current = token.value;
    if (encryptStrings && token.type === "string") current = encodeString(current, level, decoderName);
    if (level === 3 && token.type === "number") current = encodeInteger(current, index);
    const needsSpace = (isWordEnd(previous) && isWordStart(current)) ||
      (previous.endsWith("-") && current.startsWith("-"));
    if (needsSpace) output += " ";
    output += current;
    previous = current;
  }
  return output;
}

function obfuscate(code, options) {
  const level = [1, 2, 3].includes(Number(options.level)) ? Number(options.level) : 2;
  const tokens = tokenizeLua(code);
  const usedNames = new Set(tokens.filter(token => token.type === "identifier").map(token => token.value));
  const seed = crypto.createHash("sha256").update(code).digest("hex");
  let suffixLength = 7;
  let decoderName = `__q${seed.slice(0, suffixLength)}`;
  while (usedNames.has(decoderName)) decoderName = `__q${seed.slice(0, ++suffixLength)}`;
  const useDecoder = Boolean(options.encryptStrings) && level === 3;
  const body = render(tokens, { encryptStrings: Boolean(options.encryptStrings), level, decoderName });
  const hash = crypto.createHash("sha256").update(body).digest("hex").slice(0, 16);
  const marker = options.integrityMarker ? " | integrity marker" : "";
  const header = `-- QyrexObf Local | level ${level} | build ${hash}${marker}\n`;
  const decoder = `local ${decoderName}=function(t)local r={}for i=1,#t do r[i]=string.char((t[i]~37))end return table.concat(r)end;`;
  return { code: header + (useDecoder ? decoder : "") + body, level, hash };
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    const indexPath = indexCandidates.find(candidate => fs.existsSync(candidate));
    if (!indexPath) return sendJson(res, 500, { error: "Falta index.html. Guarda index.html en la misma carpeta que server.js y reinicia el servidor." });
    return fs.readFile(indexPath, (error, page) => {
      if (error) return sendJson(res, 500, { error: "No se pudo leer index.html. Revisa los permisos de la carpeta." });
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(page);
    });
  }
  if (req.method !== "POST" || req.url !== "/api/obfuscate") return sendJson(res, 404, { error: "Ruta no encontrada." });

  let received = 0;
  const parts = [];
  req.on("data", chunk => {
    received += chunk.length;
    if (received > MAX_SOURCE_BYTES + 50 * 1024) { req.destroy(); return; }
    parts.push(chunk);
  });
  req.on("end", () => {
    let body;
    try { body = JSON.parse(Buffer.concat(parts).toString("utf8")); }
    catch { return sendJson(res, 400, { error: "El cuerpo debe ser JSON válido." }); }
    const { code } = body || {};
    if (typeof code !== "string" || !code.trim()) return sendJson(res, 400, { error: "Pega código Lua antes de procesar." });
    if (Buffer.byteLength(code, "utf8") > MAX_SOURCE_BYTES) return sendJson(res, 413, { error: "El límite es 500 KB por archivo." });
    try {
      const result = obfuscate(code, body);
      const ratio = Math.round((result.code.length / code.length) * 100);
      return sendJson(res, 200, { ...result, compressionRatio: `${ratio}%`, note: "Transformación local; la ofuscación no sustituye controles de acceso." });
    } catch (error) { return sendJson(res, 500, { error: "No se pudo transformar el código.", detail: error.message }); }
  });
  req.on("error", () => { if (!res.headersSent) sendJson(res, 400, { error: "Solicitud interrumpida." }); });
});

server.on("error", error => {
  if (error.code === "EADDRINUSE") console.error(`El puerto ${PORT} ya está en uso. Ejecuta: $env:PORT=3001; npm start`);
  else console.error(error);
  process.exitCode = 1;
});
server.listen(PORT, () => console.log(`QyrexObf local: http://localhost:${PORT}`));
