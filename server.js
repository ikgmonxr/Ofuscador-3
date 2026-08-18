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

// ===================== ULTRA ANTI-TAMPER =====================
function generateAntiTamper(level = 3) {
  const id = crypto.randomBytes(3).toString("hex");
  const lock = `_c${id}`;
  const run = `_a${id}`;

  const hardLock = level >= 3
    ? `local function ${lock}()while true do end end;`
    : `local function ${lock}()error("tamper",0)end;`;

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

// =
