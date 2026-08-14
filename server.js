const express = require("express");
const path = require("path");
const crypto = require("crypto");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "5mb" }));

/* ═══════════════════════════════════════════════════════════════
   IKGONAVI v8.1 — SUPER OFUSCADOR (syntax-safe)
   Fix: keys consistentes, orden de transformaciones correcto,
        strings protegidos ANTES de rename/numbers.
   ═══════════════════════════════════════════════════════════════ */

const RESERVED = new Set([
  "and","break","do","else","elseif","end","false","for","function",
  "goto","if","in","local","nil","not","or","repeat","return","then",
  "true","until","while","_G","_ENV","self","game","workspace","script",
  "require","Instance","Enum","Color3","Vector3","CFrame","TweenInfo",
  "task","wait","spawn","delay","tick","time","os","math","string",
  "table","pairs","ipairs","next","type","typeof","print","warn","error",
  "pcall","xpcall","select","unpack","rawget","rawset","rawequal",
  "setmetatable","getmetatable","coroutine","debug","utf8","bit32",
  "SharedTable","buffer","vector","cloneref","getgenv","getrenv","getreg",
  "HttpService","Players","LocalPlayer","GetService"
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

/** XOR string with key string → number[] */
function xorStringToBytes(str, keyStr) {
  const out = [];
  for (let i = 0; i < str.length; i++) {
    out.push(str.charCodeAt(i) ^ keyStr.charCodeAt(i % keyStr.length));
  }
  return out;
}

/** XOR number[] with key string → number[] */
function xorBytesWithKeyStr(arr, keyStr) {
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    out.push(arr[i] ^ keyStr.charCodeAt(i % keyStr.length));
  }
  return out;
}

/** XOR number[] with key number[] → number[] */
function xorBytesWithKeyArr(arr, keyArr) {
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    out.push(arr[i] ^ keyArr[i % keyArr.length]);
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
  for (let i = 0; i < arr.length; i += 80) {
    parts.push(arr.slice(i, i + 80).join(","));
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

/** Extract string literals → placeholders. Returns {code, strings:[{raw,quote}]} */
function extractStrings(code) {
  const strings = [];
  const out = code.replace(/(["'])(?:\\.|(?!\1)[\s\S])*?\1/g, function(match) {
    const id = strings.length;
    strings.push(match);
    return "___S" + id + "___";
  });
  return { code: out, strings: strings };
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
      if (name && !map.has(name) && !RESERVED.has(name) && !/^___S\d+___$/.test(name)) {
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
    // Only replace outside of placeholders
    code = code.replace(new RegExp("\\b" + escaped + "\\b", "g"), newN);
  }
  return code;
}

function obfuscateNumbers(code) {
  // Avoid numbers that are part of placeholders ___S12___
  return code.replace(/\b(\d{2,5})\b/g, function(match, num, offset, full) {
    // skip if inside placeholder
    const before = full.slice(Math.max(0, offset - 4), offset + match.length + 4);
    if (/___S\d+___/.test(before)) return match;
    const n = parseInt(num, 10);
    if (n < 12 || n > 50000) return match;
    const r = Math.random();
    if (r < 0.4) return "(" + (n + 7) + "-7)";
    if (r < 0.75) return "(" + (n * 2) + "//2)";
    return "(" + (n - 1) + "+1)";
  });
}

function injectJunk(code) {
  function junk() {
    const a = ln();
    const opts = [
      "do local " + a + "=nil end",
      "pcall(function() end)",
      "local " + a + "=nil",
      "if (0~=0) then local " + a + "=1 end",
      "for " + a + "=1,0 do end"
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
      /=\s*$/.test(t) ||
      /:\s*$/.test(t);
    if (t.length > 14 && !endsUnsafe && t.indexOf("--") !== 0 && Math.random() > 0.72) {
      out.push(junk());
    }
  }
  return out.join("\n");
}

function buildStringDecoder(strings, level) {
  if (level < 2 || strings.length === 0) {
    return { decoder: "", replace: function(code) {
      for (let i = 0; i < strings.length; i++) {
        code = code.replace("___S" + i + "___", strings[i]);
      }
      return code;
    }};
  }

  const key1 = crypto.randomBytes(8).toString("hex");
  const decName = ln();
  const tables = [];

  for (let i = 0; i < strings.length; i++) {
    const match = strings[i];
    let content = match.slice(1, -1)
      .replace(/\\n/g, "\n").replace(/\\t/g, "\t")
      .replace(/\\r/g, "\r").replace(/\\"/g, '"')
      .replace(/\\'/g, "'").replace(/\\\\/g, "\\")
      .replace(/\\0/g, "\0");
    const enc = xorStringToBytes(content, key1);
    tables.push(luaByteTable(enc));
  }

  const decoder =
    "local " + decName + "=(function()" +
    "local _k=\"" + key1 + "\" " +
    "local function _d(t)" +
    "local r={} " +
    "for i=1,#t do r[i]=string.char(bit32.bxor(t[i],string.byte(_k,(i-1)%#_k+1))) end " +
    "return table.concat(r) end " +
    "return _d end)()\n";

  return {
    decoder: decoder,
    replace: function(code) {
      for (let i = 0; i < strings.length; i++) {
        code = code.replace("___S" + i + "___", decName + "(" + tables[i] + ")");
      }
      return code;
    }
  };
}

/* ───────────── CAPA 1: ANTI-TAMPER ───────────── */
function buildAntiTamper(level) {
  if (level < 2) return "";

  const n = {
    term: ln(), pcall: ln(), tostring: ln(), type: ln(), clock: ln(),
    strikes: ln(), hooks: ln(), env: ln(), sandbox: ln(), timing: ln()
  };

  let s = "do\n";
  s += "local " + n.pcall + "=pcall\n";
  s += "local " + n.tostring + "=tostring\n";
  s += "local " + n.type + "=type\n";
  s += "local " + n.clock + "=(os and os.clock) or tick or function()return 0 end\n";
  s += "local " + n.strikes + "=0\n";

  s += "local function " + n.term + "()\n";
  s += n.pcall + "(function()error('[Runtime Error] Exception 0x'.. " + n.tostring + "((" + n.clock + "()*1000)//1),0)end)\n";
  s += "while true do end\n";
  s += "end\n";

  s += "local function " + n.hooks + "()\n";
  s += "local funcs={'print','warn','loadstring','load','setmetatable','getmetatable','pairs','ipairs','next','rawget','rawset','pcall','xpcall','typeof','tostring','tonumber'}\n";
  s += "for i=1,#funcs do\n";
  s += "local f=rawget(_G,funcs[i]) or (getfenv and rawget(getfenv(0),funcs[i]))\n";
  s += "if f then\n";
  s += "if " + n.type + "(f)~='function' then " + n.term + "() end\n";
  s += "local s=" + n.tostring + "(f)\n";
  s += "if not (string.find(s,'builtin') or string.find(s,'0x') or string.find(s,'function:')) then " + n.term + "() end\n";
  s += "end end\n";
  s += "if bit32 and bit32.bxor(0x55,0xAA)~=0xFF then " + n.term + "() end\n";
  s += "end\n";

  s += "local function " + n.env + "()\n";
  s += "local bad={'lune','lute','wally','rojo','selene','darklua','lemur','busted','process','document','navigator','window','spy','hookfunction','getgc','getreg','getrenv','debug','newcclosure','checkcaller','islclosure','isexecutorclosure','Drawing','syn','fluxus','krnl','scriptware','electron','delta','hydrogen','codex','arceus','solara','wave','macsploit'}\n";
  s += "local g=(getgenv and getgenv()) or _G\n";
  s += "for i=1,#bad do if rawget(g,bad[i]) or rawget(_G,bad[i]) then " + n.term + "() end end\n";
  s += "if " + n.type + "(string)~='table' or " + n.type + "(math)~='table' or " + n.type + "(table)~='table' then " + n.term + "() end\n";
  s += "if " + n.type + "(pcall)~='function' or " + n.type + "(xpcall)~='function' then " + n.term + "() end\n";
  s += "end\n";

  s += "local function " + n.sandbox + "()\n";
  s += "local ok,g=" + n.pcall + "(function()return game end)\n";
  s += "if not ok or g==nil then return end\n";
  s += "local ok2,tg=" + n.pcall + "(function()return typeof(g) end)\n";
  s += "if ok2 and tg=='table' then " + n.term + "() end\n";
  s += "local ok3,pid=" + n.pcall + "(function()return g.PlaceId end)\n";
  s += "if ok3 and (pid==0 or pid==1 or pid==1234 or pid==999999) then " + n.term + "() end\n";
  s += "local ok4,jid=" + n.pcall + "(function()return g.JobId end)\n";
  s += "if ok4 and (jid=='' or jid=='00000000-0000-0000-0000-000000000000' or #tostring(jid)<5) then " + n.term + "() end\n";
  s += "local ok5,uid=" + n.pcall + "(function()return g.Players and g.Players.LocalPlayer and g.Players.LocalPlayer.UserId end)\n";
  s += "if ok5 and (uid==0 or uid==1 or uid==-1) then " + n.term + "() end\n";
  s += "end\n";

  s += "local function " + n.timing + "(fn)\n";
  s += "local t0=" + n.clock + "()\n";
  s += "local ok,res=" + n.pcall + "(fn)\n";
  s += "local t1=" + n.clock + "()\n";
  s += "if (t1-t0)>0.35 then " + n.strikes + "=" + n.strikes + "+1 if " + n.strikes + ">=3 then " + n.term + "() end else " + n.strikes + "=0 end\n";
  s += "if not ok then error(res,0) end\n";
  s += "return res\n";
  s += "end\n";

  s += n.pcall + "(" + n.hooks + ")\n";
  s += n.pcall + "(" + n.env + ")\n";
  if (level >= 3) {
    s += n.pcall + "(" + n.sandbox + ")\n";
    s += n.timing + "(function() local x=0 for i=1,40 do x=x+i end return x end)\n";
  }

  s += n.pcall + "(function()\n";
  s += "local env=getfenv and getfenv(0) or _ENV\n";
  s += "if " + n.type + "(env)=='table' then local mt=getmetatable(env) or {} mt.__metatable='Locked' setmetatable(env,mt) end\n";
  s += "end)\n";
  s += "end\n";

  return s;
}

/* ───────────── EXTREME: multi-chunk with CONSISTENT keys ───────────── */
function buildUltra(full) {
  // All keys as strings for XOR stages (consistent encrypt/decrypt)
  const k1 = crypto.randomBytes(12).toString("hex");
  const k3 = crypto.randomBytes(10).toString("hex");
  // RC4 key as byte array
  const k2 = Array.from(crypto.randomBytes(16));

  // Encrypt: XOR(k1) → RC4(k2) → XOR(k3)   all operating on number[]
  let layer = xorStringToBytes(full, k1);
  layer = rc4(layer, k2);
  layer = xorBytesWithKeyStr(layer, k3);

  const PAGE = 20 + ((Math.random() * 14) | 0);
  const pages = [];
  for (let i = 0; i < layer.length; i += PAGE) {
    pages.push(layer.slice(i, i + PAGE));
  }

  const n = {
    pages: ln(), key1: ln(), key2: ln(), key3: ln(),
    xor: ln(), rc4: ln(), acc: ln(), tmp: ln(), src: ln(),
    fn: ln(), i: ln(), p: ln(), out: ln()
  };

  let s = "-- IKGONAVI v8.1 | Extreme multi-chunk\n";
  s += buildAntiTamper(3);

  s += "if not bit32 then bit32=bit or {} if not bit32.bxor then function bit32.bxor(a,b) local p,c=1,0 while a>0 and b>0 do local ra,rb=a%2,b%2 if ra~=rb then c=c+p end a,b,p=(a-ra)/2,(b-rb)/2,p*2 end if a<b then a=b end while a>0 do local ra=a%2 if ra>0 then c=c+p end a,p=(a-ra)/2,p*2 end return c end end end\n";

  s += "local " + n.key1 + "=\"" + k1 + "\"\n";
  s += "local " + n.key3 + "=\"" + k3 + "\"\n";
  s += "local " + n.key2 + "={" + k2.join(",") + "}\n";

  s += "local " + n.pages + "={\n";
  for (let i = 0; i < pages.length; i++) {
    s += luaByteTable(pages[i]) + (i < pages.length - 1 ? "," : "") + "\n";
  }
  s += "}\n";

  // xor(byteArray, keyString) → string
  s += "local function " + n.xor + "(t,k)\n";
  s += "local r={}\n";
  s += "for i=1,#t do r[i]=string.char(bit32.bxor(t[i],string.byte(k,(i-1)%#k+1))) end\n";
  s += "return table.concat(r)\n";
  s += "end\n";

  // xor to bytes (for intermediate)
  s += "local function " + n.xor + "B(t,k)\n";
  s += "local r={}\n";
  s += "for i=1,#t do r[i]=bit32.bxor(t[i],string.byte(k,(i-1)%#k+1)) end\n";
  s += "return r\n";
  s += "end\n";

  s += "local function " + n.rc4 + "(data,key)\n";
  s += "local S={} for i=0,255 do S[i]=i end\n";
  s += "local j=0 for i=0,255 do j=(j+S[i]+key[(i%#key)+1])%256 S[i],S[j]=S[j],S[i] end\n";
  s += "local i,j=0,0 local out={} for k=1,#data do i=(i+1)%256 j=(j+S[i])%256 S[i],S[j]=S[j],S[i] out[k]=bit32.bxor(data[k],S[(S[i]+S[j])%256]) end\n";
  s += "return out\n";
  s += "end\n";

  // Join
  s += "local " + n.acc + "={}\n";
  s += "for _," + n.p + " in ipairs(" + n.pages + ") do\n";
  s += "for " + n.i + "=1,#" + n.p + " do " + n.acc + "[#" + n.acc + "+1]=" + n.p + "[" + n.i + "] end\n";
  s += "end\n";

  // Decrypt pipeline (inverse): XOR(k3) → RC4(k2) → XOR(k1)
  s += "local " + n.out + "=" + n.xor + "B(" + n.acc + "," + n.key3 + ")\n";
  s += n.out + "=" + n.rc4 + "(" + n.out + "," + n.key2 + ")\n";
  s += "local " + n.src + "=" + n.xor + "(" + n.out + "," + n.key1 + ")\n";

  s += "if type(" + n.xor + ")~='function' or type(" + n.rc4 + ")~='function' then while true do end end\n";

  s += "local __ls=loadstring or load\n";
  s += "if type(__ls)~='function' then error('IKG: loadstring not available',0) end\n";
  s += "local " + n.fn + ",__err=__ls(" + n.src + ")\n";
  s += "if not " + n.fn + " then error('IKG load failed: '..tostring(__err),0) end\n";
  s += "return " + n.fn + "()\n";

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

/**
 * Orden CORRECTO:
 * 1. strip comments
 * 2. extract strings → placeholders (para que rename/numbers no toquen literales)
 * 3. rename / numbers / junk
 * 4. reinsert encrypted strings (o originales)
 * 5. extreme wrap si level 3
 */
function obfuscateLua(source, level) {
  let code = source.trim();
  code = stripComments(code);

  // 1) Extraer strings ANTES de cualquier otra transformación
  const extracted = extractStrings(code);
  code = extracted.code;
  const strings = extracted.strings;

  // 2) Transformaciones sobre código sin strings
  if (level >= 1) code = renameLocals(code);
  if (level >= 2) {
    code = obfuscateNumbers(code);
    if (level === 2) code = injectJunk(code);
  }

  // 3) Decoder + reinsertar
  const strProt = buildStringDecoder(strings, level);
  code = strProt.replace(code);
  code = minify(code);

  if (level === 1) {
    return "-- IKGONAVI v8.1 | Basic\n" + code;
  }
  if (level === 2) {
    return "-- IKGONAVI v8.1 | Advanced\n" + buildAntiTamper(2) + (strProt.decoder || "") + code;
  }

  // Extreme
  const payload = (strProt.decoder || "") + code;
  return buildUltra(payload);
}

/* ───────────── API ───────────── */
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
      level: selectedLevel,
      version: "v8.1-safe"
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error interno: " + (err.message || "unknown") });
  }
});

app.get("/api/health", function(req, res) {
  res.json({ ok: true, version: "v8.1-safe" });
});

app.get("/", function(req, res) {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use(express.static(path.join(__dirname, "public")));

module.exports = app;
module.exports.obfuscateLua = obfuscateLua;

if (require.main === module) {
  app.listen(PORT, "0.0.0.0", function() {
    console.log("IKGONAVI v8.1 SAFE running on port " + PORT);
  });
}
