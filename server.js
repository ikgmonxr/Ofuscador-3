const express = require("express");
const path = require("path");
const crypto = require("crypto");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "5mb" }));

/* IKGONAVI v5 ULTRA — Luraph-style + RC4 + Aqua/anti-sandbox anti-tamper */

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
  const p = ["M","o","X","P","Z","Q","B","i","G","E","O","w","Y","C","b","N","v","s","T","D","H","L","c","F","p","R","x","a","e","u","j","k","m","r","t","d","n","f","l","h","W","S","A","I","U","J"];
  const x = p[(Math.random() * p.length) | 0];
  const styles = [
    function() { return x + ((Math.random() * 9) | 0) + String.fromCharCode(97 + ((Math.random() * 26) | 0)); },
    function() { return x + "M"; },
    function() { return x + "8"; },
    function() { return x + rnd(2); },
    function() { return x + ((Math.random() * 99) | 0); }
  ];
  return styles[(Math.random() * styles.length) | 0]();
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

function luraphNum(n) {
  const r = Math.random();
  if (r < 0.4) {
    let h = "0x" + Math.abs(n).toString(16);
    if (h.length > 5 && Math.random() > 0.5) {
      const pos = 3 + ((Math.random() * (h.length - 4)) | 0);
      h = h.slice(0, pos) + "_" + h.slice(pos);
    }
    return (n < 0 ? "-" : "") + h;
  }
  if (r < 0.6 && Math.abs(n) < 512) {
    let b = "0b" + Math.abs(n).toString(2);
    if (b.length > 6 && Math.random() > 0.5) {
      const pos = 3 + ((Math.random() * (b.length - 4)) | 0);
      b = b.slice(0, pos) + "_" + b.slice(pos);
    }
    return (n < 0 ? "-" : "") + b;
  }
  return String(n);
}

function luaByteTable(arr) {
  const parts = [];
  for (let i = 0; i < arr.length; i += 55) {
    parts.push("{" + arr.slice(i, i + 55).map(function(v) { return luraphNum(v); }).join(",") + "}");
  }
  if (parts.length === 1) return parts[0];
  return "((function()local t={}for _,c in ipairs({" + parts.join(",") + "})do for _,v in ipairs(c)do t[#t+1]=v end end return t end)())";
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
      const name = names[ni];
      if (!map.has(name) && !RESERVED.has(name)) {
        c++;
        map.set(name, ln() + c.toString(36));
      }
    }
  }
  map.forEach(function(newN, oldN) {
    code = code.replace(new RegExp("\\b" + oldN + "\\b", "g"), newN);
  });
  return code;
}

function obfuscateNumbers(code) {
  return code.replace(/\b(\d{2,7})\b/g, function(_, num) {
    const n = parseInt(num, 10);
    if (n < 10 || n > 250000) return num;
    const a = ((Math.random() * 40) | 0) + 3;
    const r = Math.random();
    if (r < 0.4) return "(" + luraphNum(a) + "+" + luraphNum(n - a) + ")";
    if (r < 0.7) return "(" + luraphNum(n * 2) + "//" + luraphNum(2) + ")";
    return "((" + luraphNum(a) + "*" + luraphNum(3) + ")+" + luraphNum(n - a * 3) + ")";
  });
}

function injectJunk(code) {
  function junk() {
    const a = ln(), b = ln(), c = ln();
    const opts = [
      "local " + a + "=function(...)return select(" + luraphNum(1) + ",...)end;",
      "do local " + a + "," + b + "=nil,false if " + a + " then " + b + "=true end end;",
      "local " + a + "=(function()return " + luraphNum((Math.random()*80+10)|0) + "~=" + luraphNum((Math.random()*80+10)|0) + " end)();",
      ";(function(" + a + ")local " + b + "=" + a + " return " + b + " end)(nil);",
      "local " + a + "=bit32 and bit32.bxor or function(x)return x end;",
      "for " + a + "=" + luraphNum(1) + "," + luraphNum(0) + " do local " + b + "=" + a + " end;",
      "pcall(function()local " + a + "=0/0 end);",
      "local " + a + "," + b + "," + c + "=" + luraphNum(1) + "," + luraphNum(2) + "," + luraphNum(3) + ";" + a + "=" + b + "+" + c + "-" + c + "-" + b + ";"
    ];
    return opts[(Math.random() * opts.length) | 0];
  }
  const lines = code.split("\n");
  const out = [];
  for (let li = 0; li < lines.length; li++) {
    out.push(lines[li]);
    if (lines[li].trim().length > 5 && Math.random() > 0.42) {
      out.push(junk());
      if (Math.random() > 0.7) out.push(junk());
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
    for (let i = 0; i < strings.length; i++) code = code.replace("___S" + i + "___", strings[i]);
    return { code: code, decoder: "" };
  }
  const key1 = crypto.randomBytes(8).toString("hex");
  const key2 = crypto.randomBytes(6).toString("hex");
  const decName = ln();
  const tables = [];
  for (let i = 0; i < strings.length; i++) {
    let content = strings[i].slice(1, -1)
      .replace(/\\n/g, "\n").replace(/\\t/g, "\t")
      .replace(/\\r/g, "\r").replace(/\\"/g, '"')
      .replace(/\\'/g, "'").replace(/\\\\/g, "\\");
    let enc = xorBytes(content, key1);
    enc = xorBytes(bytesToString(enc), key2);
    tables.push(luaByteTable(enc));
  }
  const decoder = "local " + decName + "=(function()local _a=\"" + key1 + "\" local _b=\"" + key2 + "\" local function _x(t,k)local r={}for i=1,#t do r[i]=string.char(bit32.bxor(t[i],string.byte(k,(i-1)%#k+1)))end return table.concat(r)end return function(t)local s=_x(t,_b)local p={}for i=1,#s do p[i]=string.byte(s,i)end return _x(p,_a)end end)()";
  for (let i = 0; i < strings.length; i++) {
    code = code.replace("___S" + i + "___", decName + "(" + tables[i] + ")");
  }
  return { code: code, decoder: decoder };
}

function buildAntiTamper() {
  return [
    "local function __ikg_kill(r) pcall(function() error('[IKG] '..tostring(r),0) end) while true do end end",
    "do",
    "  if type(string)~='table' or type(math)~='table' or type(table)~='table' then __ikg_kill('P1') end",
    "  if type(string.byte)~='function' or string.byte('A')~=65 then __ikg_kill('P2') end",
    "  if type(math.floor)~='function' or math.floor(3.9)~=3 then __ikg_kill('P3') end",
    "  if type(bit32)~='table' or type(bit32.bxor)~='function' or bit32.bxor(85,170)~=255 then __ikg_kill('P4') end",
    "  if bit32.bxor(0x12345678,0xFFFFFFFF)~=0xEDCBA987 then __ikg_kill('P5') end",
    "  if type(pcall)~='function' or type(xpcall)~='function' then __ikg_kill('P6') end",
    "  local _ok,_a,_b,_c=pcall(function() return 17,nil,29 end)",
    "  if not(_ok and _a==17 and _b==nil and _c==29) then __ikg_kill('P7') end",
    "  if type(game)~='userdata' or type(workspace)~='userdata' then __ikg_kill('G1') end",
    "  if type(typeof)=='function' and typeof(game)=='table' then __ikg_kill('T1') end",
    "  if type(game)==type({}) then __ikg_kill('T2') end",
    "  local ok,mt=pcall(getmetatable,game)",
    "  if ok and type(mt)==type({}) then __ikg_kill('T3') end",
    "  local okJ,jobId=pcall(function() return game.JobId end)",
    "  if okJ and jobId=='00000000-0000-0000-0000-000000000000' then __ikg_kill('S1') end",
    "  local okP,placeId=pcall(function() return game.PlaceId end)",
    "  if okP and placeId==8916037983 then __ikg_kill('S2') end",
    "  local okPl,Players=pcall(function() return game:GetService('Players') end)",
    "  if not okPl or not Players then __ikg_kill('S3') end",
    "  local LP=Players and Players.LocalPlayer",
    "  if not LP then __ikg_kill('S4') end",
    "  if LP then",
    "    local okU,uid=pcall(function() return LP.UserId end)",
    "    if okU and uid==123456789 then __ikg_kill('S5') end",
    "    local okN,nm=pcall(function() return LP.Name end)",
    "    if okN and nm=='vole7vin' then __ikg_kill('S6') end",
    "  end",
    "  for _,k in ipairs({'lune','lute','wally','rojo','selene','darklua','lemur','busted','process','document','navigator','window'}) do",
    "    if rawget(_G,k)~=nil then __ikg_kill('SB:'..k) end",
    "  end",
    "  local okS,Stats=pcall(function() return game:GetService('Stats') end)",
    "  if not okS or not Stats then __ikg_kill('ST1') end",
    "  if type(task)~='table' then __ikg_kill('TS1') end",
    "  if type(Instance)~='table' or type(Instance.new)~='function' then __ikg_kill('IN1') end",
    "end"
  ].join("\n");
}

function buildUltra(full) {
  const k1 = crypto.randomBytes(12).toString("hex");
  const k2 = crypto.randomBytes(10).toString("hex");
  const k3 = crypto.randomBytes(8).toString("hex");
  const rc4Key = Array.from(crypto.randomBytes(16));

  let layer = xorBytes(full, k1);
  layer = rc4(layer, rc4Key);
  layer = xorBytes(bytesToString(layer), k2);

  const PAGE = 48;
  const pages = [];
  for (let i = 0; i < layer.length; i += PAGE) pages.push(layer.slice(i, i + PAGE));

  const vm = ln();
  const names = {
    k1: ln(), k2: ln(), k3: ln(), rk: ln(),
    boot: ln(), x: ln(), acc: ln(), t1: ln(), t2: ln(),
    src: ln(), fn: ln(), p: ln(), i: ln(), S: ln(),
    j: ln(), n: ln()
  };
  const pageNames = pages.map(function() { return ln(); });
  const decoyNames = [ln(), ln(), ln(), ln()];

  let s = "-- Protect by ikgonavi haha\n";
  s += buildAntiTamper() + "\n";
  s += "local " + vm + "=({\n";
  s += "Hk=bit32.lshift,fk=bit32.rrotate,Uk=bit32.lrotate,O=bit32.bxor,u=bit32.band,W=bit32.bnot,Ek=bit32.countlz,B=bit32.countrz,\n";
  s += names.k1 + "=function()return\"" + k1 + "\"end,";
  s += names.k2 + "=function()return\"" + k2 + "\"end,";
  s += names.k3 + "=function()return\"" + k3 + "\"end,";
  s += names.rk + "=function()return{" + rc4Key.join(",") + "}end,\n";

  for (let i = 0; i < pages.length; i++) {
    s += pageNames[i] + "=function()return" + luaByteTable(pages[i]) + "end,";
  }
  s += "\n";
  for (let i = 0; i < decoyNames.length; i++) {
    const fake = [];
    for (let j = 0; j < PAGE; j++) fake.push((Math.random() * 255) | 0);
    s += decoyNames[i] + "=function()return" + luaByteTable(fake) + "end,";
  }
  s += "\n";
  for (let i = 0; i < 12; i++) {
    const n = ln();
    const a = luraphNum(((Math.random() * 0x1ffff) | 0));
    const b = luraphNum(((Math.random() * 0xffff) | 0));
    s += n + "=function(u,A,I)A=(" + a + "+(u.Hk((u.Ek(A or " + b + ")),(I or " + luraphNum(3) + "))));return A;end,";
  }
  s += "\n";
  s += names.boot + "=function(u)\n";
  s += "local " + names.acc + "={}\n";
  for (let i = 0; i < pageNames.length; i++) {
    s += "do local " + names.p + "=u." + pageNames[i] + "() for " + names.i + "=1,#" + names.p + " do " + names.acc + "[#" + names.acc + "+1]=" + names.p + "[" + names.i + "] end end\n";
    if (i % 2 === 0) {
      s += "if(" + luraphNum(0) + "~=" + luraphNum(0) + ")then local d=u." + decoyNames[0] + "() for " + names.i + "=1,#d do " + names.acc + "[#" + names.acc + "+1]=d[" + names.i + "] end end\n";
    }
  }
  s += "local function " + names.x + "(t,k)local o={}for i=1,#t do o[i]=string.char(bit32.bxor(t[i],string.byte(k,(i-1)%#k+1)))end return table.concat(o)end\n";
  s += "local " + names.t1 + "=" + names.x + "(" + names.acc + ",u." + names.k2 + "())\n";
  s += "local p2={}for i=1,#" + names.t1 + " do p2[i]=string.byte(" + names.t1 + ",i)end\n";
  s += "do local key=u." + names.rk + "() local " + names.S + "={} for i=0,255 do " + names.S + "[i]=i end local " + names.j + "=0\n";
  s += "for i=0,255 do " + names.j + "=(" + names.j + "+" + names.S + "[i]+key[(i%#key)+1])%256 " + names.S + "[i]," + names.S + "[" + names.j + "]=" + names.S + "[" + names.j + "]," + names.S + "[i] end\n";
  s += "local i=0 " + names.j + "=0 local out={} for n=1,#p2 do i=(i+1)%256 " + names.j + "=(" + names.j + "+" + names.S + "[i])%256 " + names.S + "[i]," + names.S + "[" + names.j + "]=" + names.S + "[" + names.j + "]," + names.S + "[i] out[n]=bit32.bxor(p2[n]," + names.S + "[(" + names.S + "[i]+" + names.S + "[" + names.j + "])%256]) end p2=out end\n";
  s += "local " + names.src + "=" + names.x + "(p2,u." + names.k1 + "())\n";
  s += "local " + names.fn + "=loadstring(" + names.src + ")\n";
  s += "if not " + names.fn + " then error('IKG::vm') end\n";
  s += "return " + names.fn + "()\n";
  s += "end\n";
  s += "})\n";
  s += "return " + vm + "." + names.boot + "(" + vm + ")\n";
  return s;
}

function minify(code) {
  return code.replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").replace(/^\s+/gm, "").trim();
}

function obfuscateLua(source, level) {
  let code = source.trim();
  const prot = protectStrings(code, level);
  code = prot.code;
  const decoder = prot.decoder || "";
  if (level >= 1) code = renameLocals(code);
  if (level >= 2) {
    code = obfuscateNumbers(code);
    code = injectJunk(code);
  }
  code = minify(code);
  if (level === 1) return "-- IKGONAVI BASIC\n" + code;
  if (level === 2) return "-- IKGONAVI ADVANCED\n" + decoder + "\n" + code;
  return buildUltra((decoder ? decoder + "\n" : "") + code);
}

app.post("/api/obfuscate", function(req, res) {
  try {
    const code = req.body.code;
    const level = req.body.level;
    if (typeof code !== "string" || !code.trim()) {
      return res.status(400).json({ error: "No se recibio ningun script Lua." });
    }
    if (code.length > 280000) {
      return res.status(400).json({ error: "Script demasiado grande." });
    }
    const selectedLevel = Math.max(1, Math.min(3, Number(level) || 1));
    const result = obfuscateLua(code, selectedLevel);
    res.json({ success: true, code: result, originalSize: code.length, outputSize: result.length, level: selectedLevel });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error interno: " + (err.message || "unknown") });
  }
});

app.get("/api/health", function(req, res) {
  res.json({ ok: true, version: "v5-ultra" });
});

app.get("/", function(req, res) {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
app.use(express.static(path.join(__dirname, "public")));
app.listen(PORT, "0.0.0.0", function() {
  console.log("IKGONAVI v5 ULTRA running on port " + PORT);
});
