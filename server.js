const express = require("express");
const path = require("path");
const crypto = require("crypto");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "5mb" }));

/* IKGONAVI v7 — FIXED for Roblox compatibility */

const RESERVED = new Set([
  "and","break","do","else","elseif","end","false","for","function",
  "goto","if","in","local","nil","not","or","repeat","return","then",
  "true","until","while","_G","_ENV","self","game","workspace","script",
  "require","Instance","Enum","Color3","Vector3","CFrame","TweenInfo",
  "task","wait","spawn","delay","tick","time","os","math","string",
  "table","pairs","ipairs","next","type","typeof","print","warn","error",
  "pcall","xpcall","select","unpack","rawget","rawset","rawequal",
  "setmetatable","getmetatable","coroutine","debug","utf8","bit32",
  "SharedTable","buffer","vector"
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
  return "_" + p[(Math.random() * p.length) | 0] + rnd(5);
}

function xorBytes(str, key) {
  const kb = Buffer.from(String(key), "utf8");
  const out = [];
  for (let i = 0; i < str.length; i++) out.push(str.charCodeAt(i) ^ kb[i % kb.length]);
  return out;
}

function bytesToString(arr) {
  const CHUNK = 8192;
  let out = "";
  for (let i = 0; i < arr.length; i += CHUNK) {
    out += String.fromCharCode.apply(null, arr.slice(i, i + CHUNK));
  }
  return out;
}

function rc4(data, keyBytes) {
  const S = [];
  for (let i = 0; i < 256; i++) S[i] = i;
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + S[i] + keyBytes[i % keyBytes.length]) % 256;
    const t = S[i]; S[i] = S[j]; S[j] = t;
  }
  let i = 0; j = 0;
  const out = [];
  for (let n = 0; n < data.length; n++) {
    i = (i + 1) % 256;
    j = (j + S[i]) % 256;
    const t = S[i]; S[i] = S[j]; S[j] = t;
    out.push(data[n] ^ S[(S[i] + S[j]) % 256]);
  }
  return out;
}

function luaByteTable(arr) {
  const parts = [];
  for (let i = 0; i < arr.length; i += 70) {
    parts.push(arr.slice(i, i + 70).join(","));
  }
  if (parts.length === 1) return "{" + parts[0] + "}";
  return "(function()local t={}for _,c in ipairs({" +
    parts.map(function(p) { return "{" + p + "}"; }).join(",") +
    "})do for _,v in ipairs(c)do t[#t+1]=v end end return t end)()";
}

function stripComments(code) {
  code = code.replace(/--\[=*\[([\s\S]*?)\]=*\]/g, "");
  code = code.replace(/--[^\n]*/g, "");
  return code;
}

function renameLocals(code) {
  const map = new Map();
  let c = 0;
  const re = /\blocal\s+([A-Za-z_][A-Za-z0-9_]*(?:\s*,\s*[A-Za-z_][A-Za-z0-9_]*)*)/g;
  let m;
  while ((m = re.exec(code)) !== null) {
    const names = m[1].split(/\s*,\s*/);
    for (let ni = 0; ni < names.length; ni++) {
      const name = names[ni].trim();
      if (name && !map.has(name) && !RESERVED.has(name)) {
        c++;
        map.set(name, ln() + c);
      }
    }
  }
  const entries = [...map.entries()].sort(function(a, b) { return b[0].length - a[0].length; });
  for (let ei = 0; ei < entries.length; ei++) {
    const oldN = entries[ei][0];
    const newN = entries[ei][1];
    const escaped = oldN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    code = code.replace(new RegExp("\\b" + escaped + "\\b", "g"), newN);
  }
  return code;
}

function obfuscateNumbers(code) {
  return code.replace(/\b(\d{2,5})\b/g, function(_, num) {
    const n = parseInt(num, 10);
    if (n < 12 || n > 50000) return num;
    if (Math.random() < 0.4) return "(" + (n + 7) + "-7)";
    if (Math.random() < 0.5) return "(" + (n * 2) + "//2)";
    return num;
  });
}

function injectJunk(code) {
  function junk() {
    const a = ln();
    const opts = [
      "do local " + a + "=nil end",
      "pcall(function() end)",
      "local " + a + "=nil"
    ];
    return opts[(Math.random() * opts.length) | 0];
  }
  const lines = code.split("\n");
  const out = [];
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    out.push(line);
    const t = line.trim();
    const endsUnsafe =
      /function\s*$/.test(t) ||
      /then\s*$/.test(t) ||
      /else\s*$/.test(t) ||
      /do\s*$/.test(t) ||
      /repeat\s*$/.test(t) ||
      /,\s*$/.test(t) ||
      /\(\s*$/.test(t) ||
      /\{\s*$/.test(t) ||
      /=\s*$/.test(t);
    if (t.length > 12 && !endsUnsafe && t.indexOf("--") !== 0 && Math.random() > 0.7) {
      out.push(junk());
    }
  }
  return out.join("\n");
}

function protectStrings(code, level) {
  const strings = [];
  code = code.replace(/(["'])(?:\\.|(?!\1)[\s\S])*?\1/g, function(match) {
    const id = strings.length;
    strings.push(match);
    return "___S" + id + "___";
  });
  code = stripComments(code);
  if (level < 2) {
    for (let i = 0; i < strings.length; i++) {
      code = code.replace("___S" + i + "___", strings[i]);
    }
    return { code: code, decoder: "" };
  }
  const key1 = crypto.randomBytes(6).toString("hex");
  const decName = ln();
  const tables = [];
  for (let i = 0; i < strings.length; i++) {
    let content = strings[i].slice(1, -1)
      .replace(/\\n/g, "\n").replace(/\\t/g, "\t")
      .replace(/\\r/g, "\r").replace(/\\"/g, '"')
      .replace(/\\'/g, "'").replace(/\\\\/g, "\\");
    const enc = xorBytes(content, key1);
    tables.push(luaByteTable(enc));
  }
  const decoder =
    "local " + decName + "=(function()" +
    "local _k=\"" + key1 + "\" " +
    "local function _d(t)" +
    "local r={} " +
    "for i=1,#t do r[i]=string.char(bit32.bxor(t[i],string.byte(_k,(i-1)%#_k+1))) end " +
    "return table.concat(r) end " +
    "return _d end)()";
  for (let i = 0; i < strings.length; i++) {
    code = code.replace("___S" + i + "___", decName + "(" + tables[i] + ")");
  }
  return { code: code, decoder: decoder };
}

function buildAntiTamper() {
  return [
    "local function __verify() ",
    "  if type(string)~='table'or type(math)~='table'then return false end ",
    "  if type(string.byte)~='function'then return false end ",
    "  if type(bit32)~='table'or type(bit32.bxor)~='function'then return false end ",
    "  return true ",
    "end ",
    "if not __verify()then error('Runtime check failed',0)end"
  ].join("\n");
}

function buildUltraFixed(full) {
  const k1 = crypto.randomBytes(10).toString("hex");
  const k2 = crypto.randomBytes(8).toString("hex");
  const rc4Key = Array.from(crypto.randomBytes(12));

  let layer = xorBytes(full, k1);
  layer = rc4(layer, rc4Key);
  layer = xorBytes(bytesToString(layer), k2);

  const PAGE = 90;
  const pages = [];
  for (let i = 0; i < layer.length; i += PAGE) {
    pages.push(layer.slice(i, i + PAGE));
  }

  const n = {
    pages: ln(), key1: ln(), key2: ln(), rk: ln(),
    xor: ln(), acc: ln(), tmp: ln(), src: ln(), fn: ln(),
    S: ln(), i: ln(), j: ln(), p: ln(), out: ln(), dec: ln(), ok: ln()
  };

  let s = "-- IKGONAVI v7 FIXED\n";
  s += "local " + n.ok + " = pcall(function() " + buildAntiTamper() + " end)\n";
  s += "if not " + n.ok + " then error('Verificación fallida',0) end\n";
  s += "local " + n.key1 + "=\"" + k1 + "\"\n";
  s += "local " + n.key2 + "=\"" + k2 + "\"\n";
  s += "local " + n.rk + "={" + rc4Key.join(",") + "}\n";
  s += "local " + n.pages + "={\n";
  for (let i = 0; i < pages.length; i++) {
    s += luaByteTable(pages[i]) + (i < pages.length - 1 ? "," : "") + "\n";
  }
  s += "}\n";

  s += "local function " + n.xor + "(t,k)\n";
  s += "local r={}\n";
  s += "for i=1,#t do r[i]=string.char(bit32.bxor(t[i],string.byte(k,(i-1)%#k+1))) end\n";
  s += "return table.concat(r)\n";
  s += "end\n";

  s += "local " + n.acc + "={}\n";
  s += "for _," + n.p + " in ipairs(" + n.pages + ") do\n";
  s += "for " + n.i + "=1,#" + n.p + " do " + n.acc + "[#" + n.acc + "+1]=" + n.p + "[" + n.i + "] end\n";
  s += "end\n";

  s += "local " + n.tmp + "=" + n.xor + "(" + n.acc + "," + n.key2 + ")\n";
  s += "local " + n.out + "={}\n";
  s += "for " + n.i + "=1,#" + n.tmp + " do " + n.out + "[" + n.i + "]=string.byte(" + n.tmp + "," + n.i + ") end\n";

  s += "do\n";
  s += "local " + n.S + "={}\n";
  s += "for " + n.i + "=0,255 do " + n.S + "[" + n.i + "]=" + n.i + " end\n";
  s += "local " + n.j + "=0\n";
  s += "for " + n.i + "=0,255 do\n";
  s += n.j + "=(" + n.j + "+" + n.S + "[" + n.i + "]+" + n.rk + "[(" + n.i + "%#" + n.rk + ")+1])%256\n";
  s += n.S + "[" + n.i + "]," + n.S + "[" + n.j + "]=" + n.S + "[" + n.j + "]," + n.S + "[" + n.i + "]\n";
  s += "end\n";
  s += n.i + "=0 " + n.j + "=0\n";
  s += "local " + n.dec + "={}\n";
  s += "for idx=1,#" + n.out + " do\n";
  s += n.i + "=(" + n.i + "+1)%256\n";
  s += n.j + "=(" + n.j + "+" + n.S + "[" + n.i + "])%256\n";
  s += n.S + "[" + n.i + "]," + n.S + "[" + n.j + "]=" + n.S + "[" + n.j + "]," + n.S + "[" + n.i + "]\n";
  s += n.dec + "[idx]=bit32.bxor(" + n.out + "[idx]," + n.S + "[(" + n.S + "[" + n.i + "]+" + n.S + "[" + n.j + "])%256])\n";
  s += "end\n";
  s += n.out + "=" + n.dec + "\n";
  s += "end\n";

  s += "local " + n.src + "=" + n.xor + "(" + n.out + "," + n.key1 + ")\n";
  s += "if type(load) == 'function' then\n";
  s += "  local " + n.fn + ",__err=load(" + n.src + ")\n";
  s += "  if " + n.fn + " then return " + n.fn + "() else error('Load failed: '..tostring(__err),0) end\n";
  s += "else\n";
  s += "  error('load() not available',0)\n";
  s += "end\n";
  return s;
}

function minify(code) {
  return code
    .split("\n")
    .map(function(l) { return l.replace(/[ \t]+$/g, ""); })
    .filter(function(l, i, arr) {
      if (l.trim() === "" && i > 0 && arr[i - 1].trim() === "") return false;
      return true;
    })
    .join("\n")
    .trim();
}

function obfuscateLua(source, level) {
  let code = source.trim();
  code = stripComments(code);

  if (level >= 1) code = renameLocals(code);
  if (level >= 2) {
    code = obfuscateNumbers(code);
    if (level === 2) code = injectJunk(code);
  }

  const prot = protectStrings(code, level);
  code = prot.code;
  const decoder = prot.decoder || "";
  code = minify(code);

  if (level === 1) {
    return "-- Protect by IKGONAVI\n" + code;
  }
  if (level === 2) {
    return "-- Protect by IKGONAVI\n" + (decoder ? decoder + "\n" : "") + code;
  }
  const payload = (decoder ? decoder + "\n" : "") + code;
  return buildUltraFixed(payload);
}

app.post("/api/obfuscate", function(req, res) {
  try {
    const code = req.body && req.body.code;
    const level = req.body && req.body.level;
    if (typeof code !== "string" || !code.trim()) {
      return res.status(400).json({ error: "No se recibio ningun script Lua." });
    }
    if (code.length > 280000) {
      return res.status(400).json({ error: "Script demasiado grande." });
    }
    const selectedLevel = Math.max(1, Math.min(3, Number(level) || 1));
    const result = obfuscateLua(code, selectedLevel);
    res.json({
      success: true,
      code: result,
      originalSize: code.length,
      outputSize: result.length,
      level: selectedLevel
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error interno: " + (err.message || "unknown") });
  }
});

app.get("/api/health", function(req, res) {
  res.json({ ok: true, version: "v7-fixed" });
});

app.get("/", function(req, res) {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use(express.static(path.join(__dirname, "public")));

module.exports = app;

if (require.main === module) {
  app.listen(PORT, "0.0.0.0", function() {
    console.log("IKGONAVI v7 FIXED running on port " + PORT);
  });
}
