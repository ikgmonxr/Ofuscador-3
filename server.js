const express = require("express");
const path = require("path");
const crypto = require("crypto");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "5mb" }));

/* IKGONAVI DEFINITIVO - Sin load/loadstring */

const RESERVED = new Set([
  "and","break","do","else","elseif","end","false","for","function",
  "goto","if","in","local","nil","not","or","repeat","return","then",
  "true","until","while","_G","_ENV","self","game","workspace","script",
  "require","Instance","Enum","Color3","Vector3","CFrame","TweenInfo",
  "task","wait","spawn","delay","tick","time","os","math","string",
  "table","pairs","ipairs","next","type","typeof","print","warn","error",
  "pcall","xpcall","select","unpack","rawget","rawset","rawequal",
  "setmetatable","getmetatable","coroutine","debug","utf8","bit32"
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

  // Nivel 2: Encriptar strings con XOR
  const key1 = crypto.randomBytes(6).toString("hex");
  const decName = ln();
  
  let decoderCode = "local " + decName + "=(function(k)\n";
  decoderCode += "return function(t)\n";
  decoderCode += "local r={}\n";
  decoderCode += "for i=1,#t do r[i]=string.char(bit32.bxor(t[i],string.byte(k,(i-1)%#k+1))) end\n";
  decoderCode += "return table.concat(r)\n";
  decoderCode += "end\n";
  decoderCode += "end)(\"" + key1 + "\")\n";

  for (let i = 0; i < strings.length; i++) {
    let content = strings[i].slice(1, -1)
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")
      .replace(/\t/g, "\\t")
      .replace(/\r/g, "\\r");

    // XOR encryption simple
    const kb = Buffer.from(String(key1), "utf8");
    let encrypted = [];
    for (let j = 0; j < content.length; j++) {
      encrypted.push(content.charCodeAt(j) ^ kb[j % kb.length]);
    }

    let bytesStr = encrypted.join(",");
    if (bytesStr.length > 1000) {
      const parts = [];
      for (let j = 0; j < encrypted.length; j += 60) {
        parts.push(encrypted.slice(j, j + 60).join(","));
      }
      bytesStr = "{" + parts.map(p => "{" + p + "}").join(",") + "}";
      code = code.replace("___S" + i + "___", decName + "(table.concat([==[" + bytesStr.replace(/\[\[\[/g, "[===[").replace(/\]\]\]/g, "]==]") + "]==], [=[]=]))");
    } else {
      code = code.replace("___S" + i + "___", decName + "({" + bytesStr + "})");
    }
  }

  return { code: code, decoder: decoderCode };
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

  if (level >= 1) {
    code = renameLocals(code);
  }
  
  if (level >= 2) {
    code = obfuscateNumbers(code);
    code = injectJunk(code);
  }

  const prot = protectStrings(code, level);
  code = prot.code;
  const decoder = prot.decoder || "";
  code = minify(code);

  // Construir resultado final
  let result = "-- Ofuscado con IKGONAVI DEFINITIVO\n";
  
  if (level === 1) {
    result += code;
  } else if (level >= 2) {
    result += decoder + "\n" + code;
  }

  return result;
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

    // MÁXIMO NIVEL 2 - Sin load/loadstring
    const selectedLevel = Math.max(1, Math.min(2, Number(level) || 1));
    const result = obfuscateLua(code, selectedLevel);
    
    res.json({
      success: true,
      code: result,
      originalSize: code.length,
      outputSize: result.length,
      level: selectedLevel,
      warning: selectedLevel < Number(level) ? "Nivel reducido a 2 (máximo compatible con Roblox sin load/loadstring)" : ""
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error interno: " + (err.message || "unknown") });
  }
});

app.get("/api/health", function(req, res) {
  res.json({ ok: true, version: "definitivo-no-load" });
});

app.get("/", function(req, res) {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use(express.static(path.join(__dirname, "public")));

module.exports = app;

if (require.main === module) {
  app.listen(PORT, "0.0.0.0", function() {
    console.log("IKGONAVI DEFINITIVO running on port " + PORT);
  });
}
