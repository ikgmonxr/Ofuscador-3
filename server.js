"use strict";

const crypto = require("crypto");
const fs = require("fs");
const http = http = require("http");
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

const NEVER_RENAME = new Set([
  ...luaKeywords,
  "game","workspace","script","plugin","shared","_G","_ENV","self",
  "type","typeof","pairs","ipairs","next","pcall","xpcall","print","warn","error",
  "require","select","unpack","rawget","rawset","rawequal","rawlen",
  "setmetatable","getmetatable","getfenv","setfenv",
  "string","table","math","bit32","coroutine","utf8","os","debug","buffer","vector",
  "tick","wait","spawn","delay","time","task",
  "Players","RunService","UserInputService","TweenService","HttpService",
  "ReplicatedStorage","ServerStorage","ServerScriptService","StarterGui","StarterPack",
  "Lighting","CoreGui","Workspace","Camera","Mouse","Teams","SoundService","Chat",
  "LocalPlayer","Humanoid","HumanoidRootPart","Character","PlayerGui","Backpack",
  "GetService","FindFirstChild","FindFirstChildOfClass","FindFirstChildWhichIsA",
  "WaitForChild","GetChildren","GetDescendants","IsA","Clone","Destroy",
  "Connect","Disconnect","Fire","Invoke","FireServer","InvokeServer",
  "Instance","Enum","Color3","Vector3","Vector2","CFrame","UDim","UDim2",
  "TweenInfo","BrickColor","Ray","Region3","NumberSequence","ColorSequence",
  "NumberRange","PhysicalProperties","Axes","Faces","Rect"
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

function tokenize(source) {
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

    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(source[i + 1] || ""))) {
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

function decodeShortString(raw) {
  const q = raw[0];
  if ((q !== '"' && q !== "'") || raw[raw.length - 1] !== q) return null;
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

// Payload anti-tamper limpio en Lua (Extraído de estructuras verificadas)
const AQUA_ANTI_TAMPER_CODE = `
-- Aqua Obfuscator v1 - Anti-Tamper Check
local _aqConfig = { Mode = "enforce", DebugReasons = false }
local function _aqRep(r)
    if _aqConfig.DebugReasons then warn("[Aqua] " .. r) end
    if _aqConfig.Mode == "enforce" then error("aqua detected u lmao", 0) end
end
if math.floor(math.pi) ~= 3 then _aqRep("math check failed") end
if type(game) == "table" then _aqRep("invalid game type") end
`;

function obfuscate(source, options = {}) {
  const code = String(source || "").trim();
  if (!code) throw new Error("Script vacío");

  const tokens = tokenize(code);
  const encryptStrings = options.encryptStrings !== false;
  const includeAntiTamper = options.antiTamper === true; // Nueva opción configurable

  const renameMap = new Map();
  let counter = 0;

  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type === "keyword" && tokens[i].value === "local") {
      let j = i + 1;
      while (j < tokens.length) {
        if (tokens[j].type === "identifier") {
          const name = tokens[j].value;
          if (name.length > 1 && !NEVER_RENAME.has(name) && !renameMap.has(name)) {
            counter++;
            renameMap.set(name, "_l" + counter.toString(36) + crypto.randomBytes(2).toString("hex"));
          }
          j++;
          if (j < tokens.length && tokens[j].type === "symbol" && tokens[j].value === ",") {
            j++;
            continue;
          }
          break;
        } else break;
      }
    }
  }

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === "identifier" && renameMap.has(t.value)) {
      const prev = i > 0 ? tokens[i - 1] : null;
      const isProperty = prev && prev.type === "symbol" && (prev.value === "." || prev.value === ":");
      if (!isProperty) {
        t.value = renameMap.get(t.value);
      }
    }
  }

  const key = crypto.randomBytes(3);
  const decName = "_d" + crypto.randomBytes(2).toString("hex");
  const keyArr = [...key].join(",");

  let body = "";
  let prevText = "";

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
      (isWordEnd(prevText) && isWordStart(cur)) ||
      (prevText.endsWith("-") && cur.startsWith("-"));

    if (needSpace) body += " ";
    body += cur;
    prevText = cur;
  }

  const decoder = encryptStrings
    ? `local ${decName}=function(t)local k={${keyArr}}local r={}for i=1,#t do r[i]=string.char(bit32.bxor(t[i],k[(i-1)%#k+1]))end return table.concat(r)end;`
    : "";

  // Añadir el bloque anti-tamper de manera segura sin corromper el ofuscado
  const antiTamperPayload = includeAntiTamper ? AQUA_ANTI_TAMPER_CODE : "";

  const result = `-- Protect by QyrexObf\n${antiTamperPayload}\n${decoder}${body}`;

  return {
    code: result,
    originalSize: code.length,
    outputSize: result.length,
    hash: crypto.createHash("sha256").update(result).digest("hex").slice(0, 12)
  };
}

function sendJson(res, status, obj) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(obj));
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
    if (received > MAX_SOURCE_BYTES + 60 * 1024) {
      req.destroy();
      return;
    }
    parts.push(chunk);
  });

  req.on("end", () => {
    let body;
    try {
      body = JSON.parse(Buffer.concat(parts).toString("utf8"));
    } catch {
      return sendJson(res, 400, { error: "JSON inválido" });
    }

    const code = body && body.code;
    if (typeof code !== "string" || !code.trim()) {
      return sendJson(res, 400, { error: "Pega un script primeiro" });
    }
    if (Buffer.byteLength(code, "utf8") > MAX_SOURCE_BYTES) {
      return sendJson(res, 413, { error: "Script demasiado grande" });
    }

    try {
      const result = obfuscate(code, body);
      const ratio = Math.round((result.outputSize / result.originalSize) * 100);
      return sendJson(res, 200, {
        success: true,
        ...result,
        compressionRatio: ratio + "%"
      });
    } catch (e) {
      return sendJson(res, 500, { error: e.message || "Error al ofuscar" });
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("QyrexObf corriendo en puerto", PORT);
});
