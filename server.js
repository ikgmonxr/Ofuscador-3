const express = require("express");
const path = require("path");
const crypto = require("crypto");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "50mb" }));

/* OBFUSCADOR DEFINITIVO - Exploits Grandes Sin Romper */

const RESERVED = new Set([
  "and","break","do","else","elseif","end","false","for","function","goto","if","in",
  "local","nil","not","or","repeat","return","then","true","until","while","_G","_ENV",
  "self","game","workspace","script","require","Instance","Enum","Color3","Vector3","CFrame",
  "TweenInfo","task","wait","spawn","delay","tick","time","os","math","string","table",
  "pairs","ipairs","next","type","typeof","print","warn","error","pcall","xpcall","select",
  "unpack","rawget","rawset","rawequal","setmetatable","getmetatable","coroutine","debug",
  "utf8","bit32","getgenv","setgenv","hookmetamethod","checkcaller","Drawing","windui"
]);

function rnd(n) {
  n = n || 8;
  const a = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const b = a + "0123456789";
  let s = a[(Math.random() * 52) | 0];
  for (let i = 1; i < n; i++) s += b[(Math.random() * b.length) | 0];
  return s;
}

function safeVarName() {
  return "_" + rnd(12);
}

function stripComments(code) {
  let result = "";
  let i = 0;
  
  while (i < code.length) {
    // Detectar strings
    if (code[i] === '"' || code[i] === "'") {
      const quote = code[i];
      result += quote;
      i++;
      while (i < code.length) {
        if (code[i] === "\\") {
          result += code[i];
          if (i + 1 < code.length) {
            result += code[i + 1];
            i += 2;
          } else i++;
        } else if (code[i] === quote) {
          result += quote;
          i++;
          break;
        } else {
          result += code[i];
          i++;
        }
      }
    }
    // Multiline comments --[[...]]
    else if (code[i] === "-" && code[i+1] === "-" && code[i+2] === "[" && code[i+3] === "[") {
      let j = i + 4;
      while (j < code.length - 1) {
        if (code[j] === "]" && code[j+1] === "]") {
          i = j + 2;
          break;
        }
        j++;
      }
      if (j >= code.length - 1) i = code.length;
    }
    // Single line comments
    else if (code[i] === "-" && code[i+1] === "-") {
      while (i < code.length && code[i] !== "\n") i++;
      if (code[i] === "\n") {
        result += "\n";
        i++;
      }
    }
    else {
      result += code[i];
      i++;
    }
  }
  return result;
}

function renameVariables(code) {
  const map = new Map();
  let counter = 0;

  // Find all local declarations
  const pattern = /\blocal\s+([A-Za-z_][A-Za-z0-9_]*)/g;
  let match;
  while ((match = pattern.exec(code)) !== null) {
    const name = match[1];
    if (!map.has(name) && !RESERVED.has(name)) {
      counter++;
      map.set(name, safeVarName());
    }
  }

  // Replace in order of length (longest first to avoid partial replacements)
  let result = code;
  const entries = [...map.entries()].sort((a, b) => b[0].length - a[0].length);

  for (const [oldName, newName] of entries) {
    const regex = new RegExp("\\b" + oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "g");
    result = result.replace(regex, newName);
  }

  return result;
}

function obfuscateNumbers(code) {
  return code.replace(/\b(\d{2,6})\b/g, (match, num) => {
    const n = parseInt(num, 10);
    if (n < 10 || n > 100000) return num;
    const r = Math.random();
    if (r < 0.3) return `(${n + Math.floor(Math.random() * 10)}-${Math.floor(Math.random() * 10)})`;
    if (r < 0.6) return `(${n * 2}//2)`;
    return num;
  });
}

function injectNoise(code) {
  const lines = code.split("\n");
  const result = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    result.push(line);

    const trimmed = line.trim();
    const endsUnsafe = /function\s*$|then\s*$|else\s*$|do\s*$|repeat\s*$|,\s*$|\(\s*$|\{\s*$|=\s*$/.test(trimmed);
    const isComment = trimmed.startsWith("--");

    if (trimmed.length > 10 && !endsUnsafe && !isComment && Math.random() > 0.8) {
      const varName = safeVarName();
      result.push(`local ${varName}=nil`);
    }
  }

  return result.join("\n");
}

function encryptStrings(code) {
  const strings = [];
  let idx = 0;

  // Extract all strings
  code = code.replace(/(["'])(?:\\.|(?!\1)[\s\S])*?\1/g, (match) => {
    strings.push(match);
    return `__STR_${idx++}__`;
  });

  // Strip comments AFTER extracting strings
  code = stripComments(code);

  // Create decoder function
  const key = crypto.randomBytes(16).toString("hex");
  const keyBytes = Buffer.from(key, "utf8");
  const decoderName = safeVarName();

  let decoder = `local ${decoderName}={}\n`;
  decoder += `function ${decoderName}:dec(t,k)\n`;
  decoder += `local r={}\n`;
  decoder += `for i=1,#t do\n`;
  decoder += `r[i]=string.char(bit32.bxor(t[i],string.byte(k,(i-1)%#k+1)))\n`;
  decoder += `end\n`;
  decoder += `return table.concat(r)\n`;
  decoder += `end\n`;

  // Encrypt and replace strings
  for (let i = 0; i < strings.length; i++) {
    const str = strings[i].slice(1, -1)
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")
      .replace(/\t/g, "\\t")
      .replace(/\r/g, "\\r");

    const encrypted = [];
    for (let j = 0; j < str.length; j++) {
      encrypted.push(str.charCodeAt(j) ^ keyBytes[j % keyBytes.length]);
    }

    const table = `{${encrypted.join(",")}}`;
    code = code.replace(`__STR_${i}__`, `${decoderName}:dec(${table},"${key}")`);
  }

  return { code, decoder };
}

function minify(code) {
  return code
    .split("\n")
    .map(l => l.replace(/[ \t]+$/g, ""))
    .filter((l, i, a) => !(l.trim() === "" && i > 0 && a[i-1].trim() === ""))
    .join("\n")
    .trim();
}

function obfuscateExploit(source, level) {
  console.log(`[Process] Input: ${source.length} bytes, Level: ${level}`);
  
  let code = source.trim();

  // Level 1: Basic
  if (level >= 1) {
    code = renameVariables(code);
  }

  // Level 2: Aggressive
  if (level >= 2) {
    code = obfuscateNumbers(code);
    code = injectNoise(code);
  }

  // Encrypt strings for level 2+
  let decoder = "";
  if (level >= 2) {
    const enc = encryptStrings(code);
    code = enc.code;
    decoder = enc.decoder;
  } else {
    code = stripComments(code);
  }

  code = minify(code);

  let result = "-- Ofuscado para Exploit\n";
  if (decoder) {
    result += decoder + "\n";
  }
  result += code;

  console.log(`[Process] Output: ${result.length} bytes`);
  return result;
}

app.post("/api/obfuscate", (req, res) => {
  try {
    const { code, level } = req.body;

    if (!code || typeof code !== "string") {
      return res.status(400).json({ error: "No code provided" });
    }

    if (code.length > 5000000) { // 5MB
      return res.status(400).json({ error: "Script too large (max 5MB)" });
    }

    const selectedLevel = Math.max(1, Math.min(2, Number(level) || 1));
    const result = obfuscateExploit(code, selectedLevel);

    res.json({
      success: true,
      code: result,
      inputSize: code.length,
      outputSize: result.length,
      level: selectedLevel
    });

  } catch (err) {
    console.error("[ERROR]", err);
    res.status(500).json({ error: `Error: ${err.message}` });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, version: "exploit-obfuscator-v1", maxSize: "5MB" });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use(express.static(path.join(__dirname, "public")));

module.exports = app;

if (require.main === module) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\n[OBFUSCATOR] Running on port ${PORT}`);
    console.log(`[SUPPORT] Scripts up to 5MB`);
    console.log(`[MODE] Exploit Obfuscator v1\n`);
  });
}
