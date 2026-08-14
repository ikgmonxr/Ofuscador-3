const express = require("express");
const path = require("path");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "50mb" }));

const RESERVED = new Set([
  "and","break","do","else","elseif","end","false","for","function","goto","if","in",
  "local","nil","not","or","repeat","return","then","true","until","while","_G","_ENV",
  "self","game","workspace","script","require","Instance","Enum","Color3","Vector3","CFrame",
  "task","wait","spawn","delay","tick","time","os","math","string","table","pairs","ipairs"
]);

function randomName() {
  let result = "_";
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (let i = 0; i < 10; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function stripComments(code) {
  let result = "";
  let i = 0;
  
  while (i < code.length) {
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

function renameVars(code) {
  const map = new Map();
  const regex = /\blocal\s+([A-Za-z_][A-Za-z0-9_]*)/g;
  let match;
  
  while ((match = regex.exec(code)) !== null) {
    const name = match[1];
    if (!map.has(name) && !RESERVED.has(name)) {
      map.set(name, randomName());
    }
  }

  let result = code;
  const entries = Array.from(map.entries()).sort((a, b) => b[0].length - a[0].length);
  
  for (const [old, newName] of entries) {
    const p = new RegExp("\\b" + old.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "g");
    result = result.replace(p, newName);
  }

  return result;
}

function obfuscateNums(code) {
  return code.replace(/\b([1-9]\d{1,5})\b/g, (match, num) => {
    const n = parseInt(num);
    if (n < 2 || n > 100000) return num;
    if (Math.random() < 0.5) {
      return `(${n + 1}-1)`;
    }
    return num;
  });
}

function minify(code) {
  return code
    .split("\n")
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .join("\n");
}

function obfuscate(code, level) {
  code = stripComments(code);

  if (level >= 1) {
    code = renameVars(code);
  }

  if (level >= 2) {
    code = obfuscateNums(code);
    code = minify(code);
  }

  return code;
}

app.post("/api/obfuscate", (req, res) => {
  try {
    const { code, level } = req.body;

    if (!code || typeof code !== "string") {
      return res.status(400).json({ error: "No script" });
    }

    if (code.length > 50000000) {
      return res.status(400).json({ error: "Too large" });
    }

    const lv = Math.max(1, Math.min(2, Number(level) || 1));
    const out = obfuscate(code, lv);

    res.json({
      success: true,
      code: out,
      inputSize: code.length,
      outputSize: out.length,
      level: lv
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Running on port ${PORT}`);
});
