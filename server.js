const express = require("express");
const path = require("path");
const crypto = require("crypto");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "50mb" }));

const RESERVED = new Set([
  "and","break","do","else","elseif","end","false","for","function","goto","if","in",
  "local","nil","not","or","repeat","return","then","true","until","while","_G","_ENV",
  "self","game","workspace","script","require","Instance","Enum","Color3","Vector3","CFrame",
  "TweenInfo","task","wait","spawn","delay","tick","time","os","math","string","table",
  "pairs","ipairs","next","type","typeof","print","warn","error","pcall","xpcall","select",
  "unpack","rawget","rawset","rawequal","setmetatable","getmetatable","coroutine","debug",
  "utf8","bit32","getgenv","setgenv","hookmetamethod","checkcaller","Drawing"
]);

function randomName(length = 10) {
  let result = "_";
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function stripAllComments(code) {
  let result = "";
  let i = 0;
  
  while (i < code.length) {
    // String detection
    if ((code[i] === '"' || code[i] === "'") && (i === 0 || code[i-1] !== "\\")) {
      const quote = code[i];
      result += code[i];
      i++;
      while (i < code.length) {
        result += code[i];
        if (code[i] === quote && code[i-1] !== "\\") {
          i++;
          break;
        }
        i++;
      }
    }
    // Multiline comment
    else if (code.substr(i, 4) === "--[[") {
      i += 4;
      while (i < code.length - 1) {
        if (code.substr(i, 2) === "]]") {
          i += 2;
          break;
        }
        i++;
      }
    }
    // Single line comment
    else if (code.substr(i, 2) === "--") {
      while (i < code.length && code[i] !== "\n") {
        i++;
      }
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
  const varMap = new Map();
  let counter = 0;

  // Find all local variable declarations
  const regex = /\blocal\s+([A-Za-z_][A-Za-z0-9_]*)/g;
  let match;
  
  while ((match = regex.exec(code)) !== null) {
    const varName = match[1];
    if (!varMap.has(varName) && !RESERVED.has(varName)) {
      varMap.set(varName, randomName());
      counter++;
    }
  }

  // Replace variables (longest first to avoid partial replacements)
  let result = code;
  const entries = Array.from(varMap.entries()).sort((a, b) => b[0].length - a[0].length);
  
  for (const [oldName, newName] of entries) {
    const pattern = new RegExp("\\b" + oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "g");
    result = result.replace(pattern, newName);
  }

  return result;
}

function obfuscateNumbers(code) {
  return code.replace(/\b([1-9]\d{1,5})\b/g, (match, num) => {
    const n = parseInt(num);
    if (n < 2 || n > 100000) return num;
    if (Math.random() < 0.5) {
      return `(${n + 1}-1)`;
    }
    return num;
  });
}

function minifyCode(code) {
  // Remove extra whitespace and empty lines
  return code
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join("\n");
}

function obfuscate(code, level) {
  console.log(`Processing: ${code.length} bytes, Level ${level}`);
  
  // Always strip comments
  code = stripAllComments(code);

  if (level >= 1) {
    // Rename variables
    code = renameVariables(code);
  }

  if (level >= 2) {
    // Obfuscate numbers
    code = obfuscateNumbers(code);
    // Minify
    code = minifyCode(code);
  }

  return code;
}

app.post("/api/obfuscate", (req, res) => {
  try {
    const { code, level } = req.body;

    if (!code || typeof code !== "string") {
      return res.status(400).json({ error: "No script provided" });
    }

    if (code.length > 50000000) { // 50MB limit
      return res.status(400).json({ error: "Script too large" });
    }

    const selectedLevel = Math.max(1, Math.min(2, Number(level) || 1));
    const output = obfuscate(code, selectedLevel);

    res.json({
      success: true,
      code: output,
      inputSize: code.length,
      outputSize: output.length,
      level: selectedLevel
    });

  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, version: "simple-v1" });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use(express.static(path.join(__dirname, "public")));

module.exports = app;

if (require.main === module) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[OBFUSCATOR] Port ${PORT}`);
  });
}
