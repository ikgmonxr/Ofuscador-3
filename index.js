"use strict";

const crypto = require("crypto");
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 3000);
const MAX_SOURCE_BYTES = 900 * 1024;

// ===================== KEYWORDS & SAFE NAMES =====================
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
  "NumberRange","PhysicalProperties","Axes","Faces","Rect",
  "HttpGet","loadstring","getgenv","getrenv","getsenv","getrawmetatable",
  "setreadonly","isreadonly","hookfunction","hookmetamethod","newcclosure",
  "checkcaller","islclosure","iscclosure","getnamecallmethod","setnamecallmethod"
]);

// ===================== TOKENIZER =====================
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

// ===================== ANTI-TAMPER (FUERTE) =====================
function generateAntiTamper(level = 3) {
  const id = crypto.randomBytes(4).toString("hex");
  const lock = `_c${id}`;
  const run = `_a${id}`;

  const hardLock = level >= 3
    ? `local function ${lock}()while true do end end;`
    : `local function ${lock}()error("Protected",0)end;`;

  const checks = [];

  checks.push(`
if _G.lune or _G.lute or _G.wally or _G.rojo or _G.selene or _G.darklua or _G.plugin
or _G.fetch or _G.console or _G.setTimeout or _G.Buffer or _G.window or _G.document
or _G.navigator or _G.location or _G.process or _G.globalThis or _G.XMLHttpRequest
or _G.WebSocket or _G.localStorage or _G.sessionStorage then ${lock}() end
`);

  checks.push(`
if _G.require and (pcall(function()return _G.require("lune")end) or pcall(function()return _G.require("lute")end)) then ${lock}() end
`);

  checks.push(`
if getfenv then
  local e=getfenv(0) or getfenv()
  if e and (e.lune or e.lute or e.process or e.fs or e.io or e.plugin) then ${lock}() end
end
`);

  checks.push(`
if not game or not workspace then ${lock}() end
local ok,hs=pcall(function()return game:GetService("HttpService")end)
if not ok or not hs then ${lock}() end
if not pcall(function()return hs:JSONEncode({a=1})end) then ${lock}() end
if not pcall(function()return hs:JSONDecode('{"a":1}')end) then ${lock}() end
`);

  checks.push(`
if type(typeof)~="function" or typeof(game)~="Instance" then ${lock}() end
if type(game)==type({}) then ${lock}() end
if type(typeof)=="function" and typeof(game)=="table" then ${lock}() end
`);

  checks.push(`
if type(string.byte)~="function" or string.byte("A")~=65 then ${lock}() end
if type(math.floor)~="function" or math.floor(math.pi)~=3 or math.floor(3.9)~=3 then ${lock}() end
if type(string)~="table" or type(math)~="table" or type(table)~="table" then ${lock}() end
`);

  if (level >= 2) {
    checks.push(`
if bit32 and type(bit32.bxor)=="function" and bit32.bxor(85,170)~=255 then ${lock}() end
if bit32 and type(bit32.band)=="function" and bit32.band(240,15)~=0 then ${lock}() end
`);
  }

  checks.push(`
local okE=pcall(error,"\\0",0)
if okE then ${lock}() end
`);

  checks.push(`
local okM,mt=pcall(getmetatable,game)
if okM and type(mt)==type({}) then ${lock}() end
`);

  checks.push(`
local w=7
if w~=w or w*0~=0 or w<0 then ${lock}() end
`);

  if (level >= 3) {
    checks.push(`
local okJ,jobId=pcall(function()return game.JobId end)
if okJ and jobId=="00000000-0000-0000-0000-000000000000" then ${lock}() end
`);
  }

  checks.push(`
if debug and debug.getinfo then
  local okD=pcall(function()return debug.getinfo(print)end)
  if okD then ${lock}() end
end
`);

  checks.push(`
if package and type(package)=="table" and (rawget(package,"lune") or rawget(package,"lute") or rawget(package,"wally") or rawget(package,"rojo")) then ${lock}() end
`);

  const body = checks.map(c => c.replace(/\s+/g, " ").trim()).join("");
  return `local ${run}=function()${hardLock}${body}end;${run}();`;
}

// ===================== STRING ENCRYPTION =====================
function encryptString(str, key) {
  const bytes = [...Buffer.from(str, "utf8")].map(
    (b, idx) => b ^ key[idx % key.length]
  );
  return bytes;
}

// ===================== MAIN OBFUSCATOR =====================
function obfuscate(source, options = {}) {
  const code = String(source || "").trim();
  if (!code) throw new Error("Script vacío");

  const tokens = tokenize(code);
  const encryptStrings = options.encryptStrings !== false;
  const antiTamper = options.antiTamper !== false;
  const level = Math.min(3, Math.max(1, Number(options.level) || 3));

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
      if (!isProperty) t.value = renameMap.get(t.value);
    }
  }

  const key = crypto.randomBytes(6);
  const decName = "_d" + crypto.randomBytes(3).toString("hex");
  const keyArr = [...key].join(",");

  let body = "";
  let prevText = "";

  for (const t of tokens) {
    let cur = t.value;

    if (encryptStrings && t.type === "string") {
      const decoded = decodeShortString(t.value);
      // Encriptamos URLs también (importante para hubs)
      if (decoded && decoded.length > 0 && decoded.length <= 600) {
        const bytes = encryptString(decoded, key);
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

  const anti = antiTamper ? generateAntiTamper(level) : "";

  const oneLine = `${anti}${decoder}${body}`.replace(/\s+/g, " ").trim();
  const result = `-- Protect by QyrexObf\n${oneLine}`;

  return {
    code: result,
    originalSize: code.length,
    outputSize: result.length,
    hash: crypto.createHash("sha256").update(result).digest("hex").slice(0, 12),
  };
}

// ===================== HTTP SERVER =====================
function sendJson(res, status, obj) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(obj));
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    return res.end();
  }

  if (req.method === "GET" && req.url === "/health") {
    return sendJson(res, 200, { status: "ok", service: "QyrexObf" });
  }

  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>QyrexObf</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:system-ui,sans-serif;background:#0a0a0f;color:#e8e8f0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
    .box{width:100%;max-width:720px;background:#12121a;border:1px solid #2a2a3a;border-radius:16px;padding:28px}
    h1{font-size:22px;margin-bottom:6px}
    p{color:#9898b0;font-size:14px;margin-bottom:20px}
    textarea{width:100%;height:180px;background:#0a0a0f;border:1px solid #2a2a3a;border-radius:10px;color:#e8e8f0;padding:14px;font-family:monospace;font-size:13px;resize:vertical;margin-bottom:14px}
    textarea:focus{outline:none;border-color:#7c5cfc}
    .row{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px}
    button{background:#7c5cfc;color:#fff;border:none;border-radius:10px;padding:12px 20px;font-weight:600;cursor:pointer;font-size:14px}
    button:hover{background:#6a4ae0}
    button:disabled{opacity:.5;cursor:not-allowed}
    .out{margin-top:16px}
    .meta{font-size:12px;color:#9898b0;margin-top:8px}
  </style>
</head>
<body>
  <div class="box">
    <h1>QyrexObf</h1>
    <p>Motor de ofuscación para scripts de Roblox (Hubs / loadstring)</p>
    <textarea id="input" placeholder="Pega tu script aquí..."></textarea>
    <div class="row">
      <button id="btn" onclick="run()">Ofuscar</button>
      <button onclick="copyOut()" style="background:#1a1a25;border:1px solid #2a2a3a">Copiar resultado</button>
    </div>
    <div class="out">
      <textarea id="output" placeholder="Resultado ofuscado..." readonly></textarea>
      <div class="meta" id="meta"></div>
    </div>
  </div>
  <script>
    async function run(){
      const code = document.getElementById('input').value;
      if(!code.trim()) return alert('Pega un script primero');
      const btn = document.getElementById('btn');
      btn.disabled = true;
      btn.textContent = 'Ofuscando...';
      try{
        const res = await fetch('/api/obfuscate', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ code, level: 3, encryptStrings: true, antiTamper: true })
        });
        const data = await res.json();
        if(data.success){
          document.getElementById('output').value = data.code;
          document.getElementById('meta').textContent = 
            'Original: ' + data.originalSize + ' chars  →  Ofuscado: ' + data.outputSize + ' chars  |  Hash: ' + data.hash;
        } else {
          alert(data.error || 'Error');
        }
      } catch(e){
        alert('Error de conexión');
      }
      btn.disabled = false;
      btn.textContent = 'Ofuscar';
    }
    function copyOut(){
      const t = document.getElementById('output');
      t.select();
      navigator.clipboard.writeText(t.value);
    }
  </script>
</body>
</html>`);
  }

  if (req.method !== "POST" || req.url !== "/api/obfuscate") {
    return sendJson(res, 404, { error: "Ruta no encontrada" });
  }

  let received = 0;
  const parts = [];

  req.on("data", (chunk) => {
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
      return sendJson(res, 400, { error: "Pega un script primero" });
    }
    if (Buffer.byteLength(code, "utf8") > MAX_SOURCE_BYTES) {
      return sendJson(res, 413, { error: "Script demasiado grande" });
    }

    try {
      const opts = {
        encryptStrings: body.encryptStrings !== false,
        antiTamper: body.antiTamper !== false,
        level: body.level || 3,
      };

      const result = obfuscate(code, opts);
      const ratio = Math.round((result.outputSize / result.originalSize) * 100);

      return sendJson(res, 200, {
        success: true,
        ...result,
        compressionRatio: ratio + "%",
      });
    } catch (e) {
      return sendJson(res, 500, { error: e.message || "Error al ofuscar" });
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("QyrexObf corriendo en puerto", PORT);
});
