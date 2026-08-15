/**
 * IKGONAVI Obfuscator v3.0 - Entry Point
 * Punto de entrada simple para evitar problemas de rutas
 */

const express = require("express");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "25mb" }));

const RESERVED = new Set([
  "and","break","do","else","elseif","end","false","for","function",
  "goto","if","in","local","nil","not","or","repeat","return","then",
  "true","until","while","_G","_ENV","self","game","workspace","script",
  "require","Instance","Enum","Color3","Vector3","CFrame","TweenInfo",
  "UDim2","UDim","Rect","Region3","Ray","BrickColor","NumberSequence",
  "ColorSequence","NumberRange","PhysicalProperties","Axes","Faces",
  "task","wait","spawn","delay","tick","time","os","math","string",
  "table","pairs","ipairs","next","type","typeof","print","warn","error",
  "pcall","xpcall","select","unpack","rawget","rawset","rawequal","rawlen",
  "setmetatable","getmetatable","coroutine","debug","utf8","bit32",
  "buffer","vector","SharedTable","getfenv","setfenv","loadstring","load",
  "assert","collectgarbage","newproxy","gcinfo","ypcall",
  "settings","UserSettings","stats","UserInputService","Players","RunService",
  "TweenService","HttpService","ReplicatedStorage","Lighting","CoreGui",
  "Workspace","Camera","Mouse","Humanoid","HumanoidRootPart","LocalPlayer",
  "GetService","FindFirstChild","WaitForChild","GetChildren","GetDescendants",
  "IsA","Clone","Destroy","Connect","Disconnect","Fire","Invoke"
]);

function rnd(n) {
  n = n || 6;
  const a = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const b = a + "0123456789";
  let s = a[(Math.random() * 52) | 0];
  for (let i = 1; i < n; i++) s += b[(Math.random() * b.length) | 0];
  return s;
}

function ln() {
  const p = "abcdefghijkmnopqrstuvwxyz";
  return "_" + p[(Math.random() * p.length) | 0] + rnd(6);
}

function extractStrings(code) {
  const strings = [];
  let out = "";
  let i = 0;
  
  while (i < code.length) {
    const ch = code[i];
    
    if (ch === "[" && i + 1 < code.length && code[i + 1] === "[") {
      let eqCount = 0;
      let j = i + 1;
      while (j + 1 < code.length && code[j + 1] === "=") {
        eqCount++;
        j++;
      }
      if (j + 1 < code.length && code[j + 1] === "[") {
        const endMarker = "]" + "=".repeat(eqCount) + "]";
        const endIdx = code.indexOf(endMarker, j + 2);
        if (endIdx !== -1) {
          const full = code.slice(i, endIdx + endMarker.length);
          strings.push(full);
          out += "___S" + (strings.length - 1) + "___";
          i = endIdx + endMarker.length;
          continue;
        }
      }
    }
    
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      let str = quote;
      
      while (j < code.length) {
        if (code[j] === "\\") {
          str += code[j] + (j + 1 < code.length ? code[j + 1] : "");
          j += 2;
          continue;
        }
        str += code[j];
        if (code[j] === quote) {
          j++;
          break;
        }
        j++;
      }
      
      strings.push(str);
      out += "___S" + (strings.length - 1) + "___";
      i = j;
      continue;
    }
    
    out += ch;
    i++;
  }
  
  return { code: out, strings };
}

function stripComments(code) {
  let result = "";
  let i = 0;
  
  while (i < code.length) {
    if (code[i] === "-" && code[i + 1] === "-") {
      if (code[i + 2] === "[") {
        let eqCount = 0;
        let j = i + 3;
        while (j < code.length && code[j] === "=") {
          eqCount++;
          j++;
        }
        if (j < code.length && code[j] === "[") {
          const endMarker = "]" + "=".repeat(eqCount) + "]";
          const endIdx = code.indexOf(endMarker, j + 1);
          if (endIdx !== -1) {
            i = endIdx + endMarker.length;
            continue;
          }
        }
      }
      i += 2;
      while (i < code.length && code[i] !== "\n") i++;
      continue;
    }
    result += code[i];
    i++;
  }
  
  return result;
}

function renameLocals(code) {
  const map = new Map();
  let counter = 0;
  
  const regex1 = /\blocal\s+([A-Za-z_][A-Za-z0-9_]*)\b/g;
  let match;
  
  while ((match = regex1.exec(code)) !== null) {
    const name = match[1];
    if (!map.has(name) && !RESERVED.has(name) && name.length > 1) {
      map.set(name, ln() + ++counter);
    }
  }
  
  const entries = [...map.entries()].sort((a, b) => b[0].length - a[0].length);
  
  let result = code;
  for (const [oldName, newName] of entries) {
    const pattern = new RegExp("\\b" + oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "g");
    result = result.replace(pattern, newName);
  }
  
  return result;
}

function obfuscateNumbers(code) {
  return code.replace(/\b(\d{2,})\b/g, (match, num) => {
    const n = parseInt(num, 10);
    if (n < 16 || n > 9000) return num;
    
    const r = Math.random();
    if (r < 0.25) return "(" + (n + 3) + "-3)";
    if (r < 0.5) return "(" + (n - 2) + "+2)";
    if (r < 0.7) return "(" + (n * 2) + "//2)";
    return num;
  });
}

function injectJunk(code) {
  const lines = code.split("\n");
  const result = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    result.push(line);
    
    const t = line.trim();
    const unsafe =
      /function\s*$/.test(t) ||
      /then\s*$/.test(t) ||
      /else\s*$/.test(t) ||
      /do\s*$/.test(t) ||
      /repeat\s*$/.test(t) ||
      /,\s*$/.test(t) ||
      /\(\s*$/.test(t) ||
      /\{\s*$/.test(t) ||
      /=\s*$/.test(t) ||
      /and\s*$/.test(t) ||
      /or\s*$/.test(t);
      
    if (t.length > 20 && !unsafe && Math.random() > 0.85) {
      result.push("local " + ln() + "=nil");
    }
  }
  
  return result.join("\n");
}

function encryptStrings(code, strings, level) {
  if (level < 2) {
    let out = code;
    for (let i = strings.length - 1; i >= 0; i--) {
      out = out.split("___S" + i + "___").join(strings[i]);
    }
    return { code: out, decoder: "" };
  }

  const key = crypto.randomBytes(4).toString("hex");
  const decName = ln();

  let decoder =
    "local " + decName + "=function(t,k)\n" +
    "local r,b,x={},0,0\n" +
    "for i=1,#t do b=string.byte(k,(i-1)%#k+1) r[i]=string.char(bit32.bxor(t[i],b)) end\n" +
    "return table.concat(r)\n" +
    "end\n";

  const rebuilt = [];
  
  for (let i = 0; i < strings.length; i++) {
    const raw = strings[i];
    
    if (raw.startsWith("[") || raw.length < 4) {
      rebuilt.push(raw);
      continue;
    }
    
    let content = raw.slice(1, -1);
    try {
      content = content
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "\t")
        .replace(/\\r/g, "\r")
        .replace(/\\\\/g, "\\")
        .replace(/\\'/g, "'")
        .replace(/\\"/g, '"');
    } catch (_) {}

    if (
      content.length > 3000 ||
      /^rbxassetid:\/\//i.test(content) ||
      /^https?:\/\//i.test(content) ||
      /sirius\.menu/i.test(content) ||
      /raw\.githubusercontent/i.test(content)
    ) {
      rebuilt.push(raw);
      continue;
    }

    const keyBytes = Buffer.from(key, "utf8");
    const encrypted = [];
    
    for (let j = 0; j < content.length; j++) {
      encrypted.push(content.charCodeAt(j) ^ keyBytes[j % keyBytes.length]);
    }
    
    const bytesStr = "{" + encrypted.join(",") + "}";
    rebuilt.push(decName + "(" + bytesStr + ',"' + key + '")');
  }

  let out = code;
  for (let i = strings.length - 1; i >= 0; i--) {
    out = out.split("___S" + i + "___").join(rebuilt[i]);
  }
  
  return { code: out, decoder };
}

function minify(code) {
  return code
    .split("\n")
    .map(l => l.replace(/^\s+/, "").replace(/\s+$/, ""))
    .filter((line, i, arr) => {
      if (!line.trim() && i > 0 && !arr[i - 1].trim()) return false;
      return true;
    })
    .join("\n")
    .trim();
}

function buildAntiTamper(mode = "ultra") {
  const checkId = crypto.randomBytes(3).toString("hex");
  const failFunc = `_f${checkId}`;
  const runFunc = `_r${checkId}`;

  const hardstop = mode === "hard"
    ? `error("IKGONAVI: Environment Compromised",0)`
    : `pcall(function()if game:GetService("Players").LocalPlayer then game:GetService("Players").LocalPlayer:Kick("Security")end end)`;

  const checks = [];

  checks.push(`
if _G.lune or _G.lute or _G.wally or _G.rojo or _G.selene or _G.darklua or _G.luau_lsp or _G.remodel or _G.plugin then ${failFunc}("tool") end
`);

  checks.push(`
if _G.process and (_G.process.env or _G.process.platform or _G.process.exit) then ${failFunc}("process") end
if _G.window or _G.document or _G.navigator or _G.location then ${failFunc}("browser") end
if _G.Buffer and _G.Buffer.from then ${failFunc}("nodebuf") end
if _G.__dirname or _G.__filename then ${failFunc}("nodepath") end
`);

  checks.push(`
if type(string)~="table" or type(math)~="table" or type(table)~="table" then ${failFunc}("prim") end
if type(string.byte)~="function" or string.byte("A")~=65 then ${failFunc}("byte") end
if type(math.floor)~="function" or math.floor(3.9)~=3 then ${failFunc}("floor") end
if bit32 and type(bit32.bxor)=="function" and bit32.bxor(85,170)~=255 then ${failFunc}("bxor") end
`);

  checks.push(`
if type(game)==type({}) then ${failFunc}("game_table") end
if type(typeof)=="function" and typeof(game)=="table" then ${failFunc}("typeof_game") end
local ok,mt=pcall(getmetatable,game)
if ok and type(mt)==type({}) then ${failFunc}("mt_game") end
`);

  checks.push(`
local ZERO="00000000-0000-0000-0000-000000000000"
local okJ,jobId=pcall(function()return game.JobId end)
if okJ and jobId==ZERO then ${failFunc}("jobid") end
local okG,gameId=pcall(function()return game.GameId end)
if okG and gameId==8916037983 then ${failFunc}("gameid") end
`);

  checks.push(`
local okPl,Players=pcall(function()return game:GetService("Players")end)
if not okPl or not Players then ${failFunc}("players") end
local LP=Players and Players.LocalPlayer
if not LP then ${failFunc}("lp") end
`);

  checks.push(`
if package and type(package)=="table" and (rawget(package,"lune") or rawget(package,"lute") or rawget(package,"wally") or rawget(package,"rojo")) then ${failFunc}("package") end
`);

  checks.push(`
local okE=pcall(error,"\\0",0)
if okE then ${failFunc}("error") end
`);

  checks.push(`
local w=7
if w~=w or w*0~=0 then ${failFunc}("math") end
`);

  const checkBody = checks.map(c => c.replace(/\s+/g, " ").trim()).join("");

  return `local ${failFunc}=function(r)${hardstop}end local ${runFunc}=function()${checkBody}end;${runFunc}();`;
}

function obfuscateLua(source, level, options) {
  options = options || {};
  let code = String(source || "").trim();
  if (!code) throw new Error("Empty script");

  const extracted = extractStrings(code);
  code = stripComments(extracted.code);
  const strings = extracted.strings;

  if (level >= 1) code = renameLocals(code);
  
  if (level >= 2) {
    code = obfuscateNumbers(code);
    code = injectJunk(code);
  }

  const prot = encryptStrings(code, strings, level);
  code = prot.code;
  const decoder = prot.decoder || "";
  code = minify(code);

  let result = "-- Protected by IKGONAVI Obfuscator v3.0\n";
  
  if (options.antiTamper) {
    result += buildAntiTamper(options.antiTamperMode || "ultra") + "\n";
  }
  
  if (level >= 2 && decoder) {
    result += decoder + "\n";
  }
  
  result += code;
  
  return result;
}

app.post("/api/obfuscate", function (req, res) {
  try {
    const code = req.body && req.body.code;
    const level = req.body && req.body.level;
    const antiTamper = !!(req.body && req.body.antiTamper);
    const antiTamperMode = (req.body && req.body.antiTamperMode) || "ultra";

    if (typeof code !== "string" || !code.trim()) {
      return res.status(400).json({ success: false, error: "No Lua script received." });
    }
    
    if (code.length > 2000000) {
      return res.status(400).json({ success: false, error: "Script too large (max 2MB)." });
    }

    const selectedLevel = Math.max(1, Math.min(3, Number(level) || 2));
    console.log(`[Obfuscate] size=${code.length} level=${selectedLevel} antiTamper=${antiTamper}`);

    const result = obfuscateLua(code, selectedLevel, {
      antiTamper: antiTamper,
      antiTamperMode: antiTamperMode === "hard" ? "hard" : "ultra",
    });

    if (result.length > 2000000) {
      return res.status(400).json({ 
        success: false, 
        error: "Output too large for Roblox (max 2MB). Try Level 1." 
      });
    }

    const hash = crypto.createHash("sha256").update(result).digest("hex").slice(0, 12);

    res.json({
      success: true,
      code: result,
      originalSize: code.length,
      outputSize: result.length,
      level: selectedLevel,
      antiTamper: antiTamper,
      compressionRatio: ((1 - result.length / Math.max(code.length, 1)) * 100).toFixed(2) + "%",
      hash: hash,
    });
  } catch (err) {
    console.error("[Error]", err.message);
    res.status(500).json({ success: false, error: "Error: " + (err.message || "unknown") });
  }
});

app.get("/api/health", function (req, res) {
  res.json({ 
    ok: true, 
    version: "ikgonavi-v3.0-ultra-antitamper", 
    maxSize: "2MB", 
    levels: [1, 2, 3],
    antiTamper: true,
    antiTamperModes: ["ultra", "hard"],
    engines: ["Keyforge", "Luarph", "Aqua", "Anti-Sandbox"]
  });
});

app.get("/", function (req, res) {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use(express.static(path.join(__dirname, "public")));

const server = app.listen(PORT, "0.0.0.0", function () {
  console.log(`\n✓ IKGONAVI Obfuscator v3.0 [ULTRA ANTI-TAMPER] running on port ${PORT}`);
  console.log(`  └─ Engines: Keyforge | Luarph | Aqua | Anti-Sandbox`);
  console.log(`  └─ URL: http://localhost:${PORT}`);
  console.log(`\n`);
});

module.exports = app;
