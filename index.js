"use strict";

const crypto = require("crypto");
const http = require("http");

const PORT = Number(process.env.PORT || 3000);
const MAX_SOURCE_BYTES = 900 * 1024;

// ===================== UTILS =====================
function randHex(n = 4) {
  return crypto.randomBytes(n).toString("hex");
}
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function toHex(n) {
  const v = n | 0;
  return (v < 0 ? "-" : "") + "0x" + Math.abs(v).toString(16);
}
function toBin(n) {
  const v = n | 0;
  return (v < 0 ? "-" : "") + "0b" + Math.abs(v).toString(2);
}
function messyNumber(n) {
  n = n | 0;
  const r = randInt(0, 7);
  if (r === 0) return String(n);
  if (r === 1) return toHex(n);
  if (r === 2) return toBin(n);
  if (r === 3) {
    const a = randInt(10, 6000);
    return "(" + toHex(n + a) + "-" + toHex(a) + ")";
  }
  if (r === 4) {
    const a = randInt(10, 5000);
    return "(" + toHex(n - a) + "+" + toHex(a) + ")";
  }
  if (r === 5) {
    const a = randInt(2, 60);
    return "(" + toHex(n * a) + "/" + a + ")";
  }
  if (r === 6) {
    const a = randInt(1, 300);
    const b = randInt(1, 300);
    return "(" + toHex(n + a - b) + "+" + toHex(b) + "-" + toHex(a) + ")";
  }
  return toHex(n);
}
function randomName() {
  const pool = "IlO01o";
  let s = "_";
  for (let i = 0; i < randInt(7, 14); i++) s += pool[randInt(0, pool.length - 1)];
  return s + randHex(3);
}

// ===================== KEYWORDS =====================
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
  "checkcaller","islclosure","iscclosure","getnamecallmethod"
]);

// ===================== TOKENIZER =====================
function isIdentStart(ch) { return /[A-Za-z_]/.test(ch || ""); }
function isIdentPart(ch) { return /[A-Za-z0-9_]/.test(ch || ""); }
function longBracketEnd(source, start) {
  const open = source.slice(start).match(/^\[(=*)\[/);
  if (!open) return null;
  const closer = "]" + open[1] + "]";
  const end = source.indexOf(closer, start + open[0].length);
  return end === -1 ? source.length : end + closer.length;
}
function tokenize(source) {
  const out = [];
  let i = 0;
  const len = source.length;
  while (i < len) {
    const ch = source[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (source.startsWith("--", i)) {
      if (source[i + 2] === "[") {
        const end = longBracketEnd(source, i + 2);
        i = end || (i + 2);
      } else {
        const nl = source.indexOf("\n", i);
        i = nl === -1 ? len : nl + 1;
      }
      continue;
    }
    if (ch === "[" && longBracketEnd(source, i) !== null) {
      const end = longBracketEnd(source, i);
      out.push({ type: "string", value: source.slice(i, end) });
      i = end;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const q = ch;
      let j = i + 1;
      while (j < len) {
        if (source[j] === "\\") { j += 2; continue; }
        if (source[j] === q) { j++; break; }
        j++;
      }
      out.push({ type: "string", value: source.slice(i, j) });
      i = j;
      continue;
    }
    if (isIdentStart(ch)) {
      let j = i + 1;
      while (isIdentPart(source[j])) j++;
      const value = source.slice(i, j);
      out.push({ type: luaKeywords.has(value) ? "keyword" : "ident", value });
      i = j;
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(source[i + 1] || ""))) {
      const m = source.slice(i).match(/^(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?[\d_]+)?)/);
      const value = m ? m[0] : ch;
      out.push({ type: "number", value });
      i += value.length;
      continue;
    }
    const multi = ["...", "..=", "==", "~=", "<=", ">=", "//", "..", "->", "+=", "-=", "*=", "/=", "%="];
    const found = multi.find(op => source.startsWith(op, i));
    if (found) {
      out.push({ type: "symbol", value: found });
      i += found.length;
      continue;
    }
    out.push({ type: "symbol", value: ch });
    i++;
  }
  return out;
}
function decodeString(raw) {
  if (raw.startsWith("[")) return null;
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

// ===================== SAFE JOIN =====================
function needsSpace(prev, next) {
  if (!prev || !next) return false;
  if (/[A-Za-z0-9_]$/.test(prev) && /^[A-Za-z0-9_]/.test(next)) return true;
  if (prev.endsWith("-") && next.startsWith("-")) return true;
  if (prev.endsWith(".") && next.startsWith(".")) return true;
  return false;
}
function joinTokens(parts) {
  let out = "";
  for (const p of parts) {
    if (!p) continue;
    if (out && needsSpace(out, p)) out += " ";
    out += p;
  }
  return out;
}

// ===================== JUNK =====================
function generateJunk() {
  const a = randomName();
  const b = randomName();
  const c = randomName();
  return joinTokens([
    `local ${a}=${messyNumber(randInt(1, 99999))}`,
    `local ${b}=${messyNumber(randInt(1, 99999))}`,
    `local ${c}=function() return ${a}+${b} end`,
    `if ${a}~=${a} then while true do end end`,
    `if type(${c})~="function" then while true do end end`,
  ]);
}

// ===================== ANTI-TAMPER FUERTE (Aqua + sandbox style) =====================
function generateAntiTamper() {
  const lock = randomName();
  const run = randomName();
  const t1 = randomName();
  const t2 = randomName();
  const t3 = randomName();

  // Hard lock
  const hardLock = `local function ${lock}() while true do end end`;

  const checks = [
    // --- Entorno no-Roblox / tooling ---
    `if _G.lune or _G.lute or _G.wally or _G.rojo or _G.selene or _G.darklua or _G.plugin then ${lock}() end`,
    `if _G.fetch or _G.console or _G.setTimeout or _G.Buffer or _G.window or _G.document then ${lock}() end`,
    `if _G.navigator or _G.location or _G.process or _G.globalThis or _G.XMLHttpRequest or _G.WebSocket then ${lock}() end`,
    `if _G.localStorage or _G.sessionStorage or _G.crypto or _G.performance then ${lock}() end`,
    `if _G.require and (pcall(function() return _G.require("lune") end) or pcall(function() return _G.require("lute") end)) then ${lock}() end`,
    `if package and type(package)=="table" and (rawget(package,"lune") or rawget(package,"lute") or rawget(package,"wally") or rawget(package,"rojo")) then ${lock}() end`,

    // --- getfenv sandbox ---
    `if getfenv then local e=getfenv(0) or getfenv() if e and (e.lune or e.lute or e.process or e.fs or e.io or e.plugin) then ${lock}() end end`,

    // --- Roblox core ---
    `if not game or not workspace then ${lock}() end`,
    `local ${t1},hs=pcall(function() return game:GetService("HttpService") end)`,
    `if not ${t1} or not hs then ${lock}() end`,
    `if not pcall(function() return hs:JSONEncode({a=1}) end) then ${lock}() end`,
    `if not pcall(function() return hs:JSONDecode('{"a":1}') end) then ${lock}() end`,

    // --- typeof / game type ---
    `if type(typeof)~="function" or typeof(game)~="Instance" then ${lock}() end`,
    `if type(game)==type({}) then ${lock}() end`,
    `if type(typeof)=="function" and typeof(game)=="table" then ${lock}() end`,

    // --- Primitives integrity ---
    `if type(string.byte)~="function" or string.byte("A")~=65 then ${lock}() end`,
    `if type(string.char)~="function" then ${lock}() end`,
    `if type(math.floor)~="function" or math.floor(math.pi)~=3 or math.floor(3.9)~=3 then ${lock}() end`,
    `if type(table.concat)~="function" or type(table.insert)~="function" then ${lock}() end`,
    `if type(string)~="table" or type(math)~="table" or type(table)~="table" then ${lock}() end`,
    `if type(rawget)~="function" or type(rawset)~="function" or type(rawequal)~="function" then ${lock}() end`,
    `if type(pcall)~="function" or type(xpcall)~="function" then ${lock}() end`,
    `if type(setmetatable)~="function" or type(getmetatable)~="function" then ${lock}() end`,
    `if type(tonumber)~="function" or type(tostring)~="function" then ${lock}() end`,

    // --- bit32 ---
    `if bit32 then if type(bit32.bxor)=="function" and bit32.bxor(85,170)~=255 then ${lock}() end if type(bit32.band)=="function" and bit32.band(240,15)~=0 then ${lock}() end end`,

    // --- error / metatable ---
    `local okE=pcall(error,"\\0",0) if okE then ${lock}() end`,
    `local okM,mt=pcall(getmetatable,game) if okM and type(mt)==type({}) then ${lock}() end`,

    // --- numeric invariants ---
    `local w=7 if w~=w or w*0~=0 or w<0 then ${lock}() end`,

    // --- Studio / zero JobId ---
    `local okJ,jobId=pcall(function() return game.JobId end) if okJ and jobId=="00000000-0000-0000-0000-000000000000" then ${lock}() end`,

    // --- debug ---
    `if debug and debug.getinfo then local okD=pcall(function() return debug.getinfo(print) end) if okD then ${lock}() end end`,

    // --- Players / LocalPlayer presence (client-oriented) ---
    `local okP,Players=pcall(function() return game:GetService("Players") end)`,
    `if not okP or not Players then ${lock}() end`,
  ];

  return joinTokens([
    hardLock,
    `local ${run}=function()`,
    ...checks,
    `end`,
    `${run}()`,
  ]);
}

// ===================== OBFUSCATOR =====================
function obfuscate(source, options = {}) {
  const code = String(source || "").trim();
  if (!code) throw new Error("Script vacío");

  const tokens = tokenize(code);

  // Rename locals
  const renameMap = new Map();
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type === "keyword" && tokens[i].value === "local") {
      let j = i + 1;
      while (j < tokens.length) {
        if (tokens[j].type === "ident") {
          const name = tokens[j].value;
          if (name.length > 1 && !NEVER_RENAME.has(name) && !renameMap.has(name)) {
            renameMap.set(name, randomName());
          }
          j++;
          if (j < tokens.length && tokens[j].type === "symbol" && tokens[j].value === ",") {
            j++;
            continue;
          }
          break;
        }
        break;
      }
    }
  }
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === "ident" && renameMap.has(t.value)) {
      const prev = i > 0 ? tokens[i - 1] : null;
      const isProp = prev && prev.type === "symbol" && (prev.value === "." || prev.value === ":");
      if (!isProp) t.value = renameMap.get(t.value);
    }
  }

  // String pool
  const key = crypto.randomBytes(16);
  const decName = randomName();
  const poolName = randomName();
  const stringPool = [];
  const poolMap = new Map();

  function poolIndex(str) {
    if (poolMap.has(str)) return poolMap.get(str);
    const enc = [...Buffer.from(str, "utf8")].map((b, idx) => b ^ key[idx % key.length]);
    const idx = stringPool.length;
    stringPool.push(enc);
    poolMap.set(str, idx);
    return idx;
  }

  const bodyParts = [];
  for (const t of tokens) {
    let cur = t.value;
    if (t.type === "number") {
      const num = Number(t.value);
      if (!isNaN(num) && Number.isFinite(num) && Math.abs(num) < 1e9 && Number.isInteger(num)) {
        cur = messyNumber(num);
      }
    }
    if (t.type === "string") {
      const decoded = decodeString(t.value);
      if (decoded !== null && decoded.length > 0 && decoded.length <= 1500) {
        const idx = poolIndex(decoded);
        cur = `${decName}(${poolName}[${messyNumber(idx + 1)}])`;
      }
    }
    bodyParts.push(cur);
  }
  const body = joinTokens(bodyParts);

  const poolEntries = stringPool.map((bytes, i) => {
    const arr = bytes.map(b => messyNumber(b)).join(",");
    return `[${messyNumber(i + 1)}]={${arr}}`;
  }).join(",");

  const keyExpr = [...key].map(k => messyNumber(k)).join(",");

  const decoder = joinTokens([
    `local ${poolName}={${poolEntries}}`,
    `local ${decName}=function(t)`,
    `local k={${keyExpr}}`,
    `local r={}`,
    `for i=1,#t do`,
    `r[i]=string.char(bit32.bxor(t[i],k[(i-1)%#k+1]))`,
    `end`,
    `return table.concat(r)`,
    `end`,
  ]);

  const anti = options.antiTamper !== false ? generateAntiTamper() : "";
  const junk1 = generateJunk();
  const junk2 = generateJunk();
  const junk3 = generateJunk();

  const envName = randomName();
  const runName = randomName();
  const proxyName = randomName();
  const gateName = randomName();

  // Multi-layer wrapper
  const finalParts = [
    `return (function(${envName})`,
    anti,
    junk1,
    decoder,
    junk2,
    `local ${gateName}=true`,
    `local ${runName}=function()`,
    `if not ${gateName} then while true do end end`,
    body,
    `end`,
    junk3,
    `local ${proxyName}=${runName}`,
    `return ${proxyName}()`,
    `end)({...})`,
  ];

  const result = "-- Protect QyrexObf\n" + joinTokens(finalParts);

  return {
    code: result,
    originalSize: code.length,
    outputSize: result.length,
    hash: crypto.createHash("sha256").update(result).digest("hex").slice(0, 12),
  };
}

// ===================== SERVER =====================
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
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>QyrexObf</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;background:#0a0a0f;color:#e8e8f0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.box{width:100%;max-width:820px;background:#12121a;border:1px solid #2a2a3a;border-radius:16px;padding:28px}
h1{font-size:22px;margin-bottom:4px}
p{color:#9898b0;font-size:13px;margin-bottom:18px}
textarea{width:100%;height:180px;background:#0a0a0f;border:1px solid #2a2a3a;border-radius:10px;color:#e8e8f0;padding:14px;font-family:ui-monospace,monospace;font-size:12px;resize:vertical;margin-bottom:12px}
textarea:focus{outline:none;border-color:#7c5cfc}
.row{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px}
button{background:#7c5cfc;color:#fff;border:none;border-radius:10px;padding:11px 18px;font-weight:600;cursor:pointer;font-size:13px}
button:hover{background:#6a4ae0}
button.sec{background:#1a1a25;border:1px solid #2a2a3a}
button:disabled{opacity:.5;cursor:not-allowed}
.meta{font-size:12px;color:#9898b0;margin-top:6px}
.ok{color:#22c55e}
</style>
</head>
<body>
<div class="box">
  <h1>QyrexObf</h1>
  <p>-- Protect QyrexObf • anti-tamper fuerte • strings cifradas • sin syntax errors</p>
  <textarea id="input" placeholder="Pega tu script aquí..."></textarea>
  <div class="row">
    <button id="btn" onclick="run()">Ofuscar</button>
    <button class="sec" onclick="copyOut()">Copiar resultado</button>
  </div>
  <textarea id="output" placeholder="Resultado ofuscado..." readonly></textarea>
  <div class="meta" id="meta"></div>
</div>
<script>
async function run(){
  const code=document.getElementById('input').value;
  if(!code.trim())return alert('Pega un script primero');
  const btn=document.getElementById('btn');
  btn.disabled=true;btn.textContent='Ofuscando...';
  try{
    const res=await fetch('/api/obfuscate',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({code,level:3,antiTamper:true})
    });
    const data=await res.json();
    if(data.success){
      document.getElementById('output').value=data.code;
      document.getElementById('meta').innerHTML=
        '<span class="ok">OK</span>  Original: '+data.originalSize+' → Ofuscado: '+data.outputSize+' | Hash: '+data.hash;
    }else alert(data.error||'Error');
  }catch(e){alert('Error de conexión');}
  btn.disabled=false;btn.textContent='Ofuscar';
}
function copyOut(){
  const t=document.getElementById('output');
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
    if (received > MAX_SOURCE_BYTES + 60 * 1024) { req.destroy(); return; }
    parts.push(chunk);
  });
  req.on("end", () => {
    let body;
    try { body = JSON.parse(Buffer.concat(parts).toString("utf8")); }
    catch { return sendJson(res, 400, { error: "JSON inválido" }); }

    const code = body && body.code;
    if (typeof code !== "string" || !code.trim()) {
      return sendJson(res, 400, { error: "Pega un script primero" });
    }
    if (Buffer.byteLength(code, "utf8") > MAX_SOURCE_BYTES) {
      return sendJson(res, 413, { error: "Script demasiado grande" });
    }
    try {
      const result = obfuscate(code, {
        level: body.level || 3,
        antiTamper: body.antiTamper !== false,
      });
      return sendJson(res, 200, {
        success: true,
        ...result,
        compressionRatio: Math.round((result.outputSize / result.originalSize) * 100) + "%",
      });
    } catch (e) {
      return sendJson(res, 500, { error: e.message || "Error al ofuscar" });
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("QyrexObf corriendo en puerto", PORT);
});
