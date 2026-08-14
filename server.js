const express = require("express");
const path = require("path");
const crypto = require("crypto");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "10mb" }));

/* IKGONAVI MEJORADO - Big Scripts Support */

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

function stripCommentsImproved(code) {
  let result = "";
  let i = 0;
  while (i < code.length) {
    // Detectar strings
    if (code[i] === '"' || code[i] === "'") {
      const quote = code[i];
      result += code[i];
      i++;
      while (i < code.length) {
        if (code[i] === "\\") {
          result += code[i];
          if (i + 1 < code.length) {
            result += code[i + 1];
            i += 2;
          } else {
            i++;
          }
        } else if (code[i] === quote) {
          result += code[i];
          i++;
          break;
        } else {
          result += code[i];
          i++;
        }
      }
    }
    // Detectar comentarios multilinea
    else if (code[i] === "-" && code[i + 1] === "-" && code[i + 2] === "[") {
      let bracketCount = 0;
      let j = i + 3;
      while (j < code.length && code[j] === "=") {
        bracketCount++;
        j++;
      }
      if (code[j] === "[") {
        // Es comentario multilinea
        j++;
        let endStr = "]" + "=".repeat(bracketCount) + "]";
        while (j < code.length) {
          if (code.substr(j, endStr.length) === endStr) {
            i = j + endStr.length;
            break;
          }
          j++;
        }
        if (j >= code.length) i = code.length;
      } else {
        result += code[i];
        i++;
      }
    }
    // Detectar comentarios de línea
    else if (code[i] === "-" && code[i + 1] === "-") {
      i += 2;
      while (i < code.length && code[i] !== "\n") i++;
      if (i < code.length && code[i] === "\n") {
        result += "\n";
        i++;
      }
    } else {
      result += code[i];
      i++;
    }
  }
  return result;
}

function renameLocalsImproved(code) {
  const map = new Map();
  let counter = 0;

  // Buscar todos los nombres de variables locales
  const regex = /\blocal\s+([A-Za-z_][A-Za-z0-9_]*)/g;
  let match;
  while ((match = regex.exec(code)) !== null) {
    const name = match[1];
    if (!map.has(name) && !RESERVED.has(name)) {
      counter++;
      map.set(name, ln() + counter);
    }
  }

  // Reemplazar en orden de longitud descendente (para evitar reemplazos parciales)
  const entries = [...map.entries()].sort((a, b) => b[0].length - a[0].length);
  
  let result = code;
  for (const [oldName, newName] of entries) {
    // Usar regex word boundary para reemplazos exactos
    const pattern = new RegExp("\\b" + oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "g");
    result = result.replace(pattern, newName);
  }

  return result;
}

function obfuscateNumbersImproved(code) {
  return code.replace(/\b(\d{2,5})\b/g, (match, num) => {
    const n = parseInt(num, 10);
    if (n < 12 || n > 50000) return num;
    if (Math.random() < 0.35) return "(" + (n + 7) + "-7)";
    if (Math.random() < 0.4) return "(" + (n * 2) + "//2)";
    return num;
  });
}

function injectJunkImproved(code) {
  const lines = code.split("\n");
  const result = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    result.push(line);

    const trimmed = line.trim();
    const endsUnsafe =
      /function\s*$/.test(trimmed) ||
      /then\s*$/.test(trimmed) ||
      /else\s*$/.test(trimmed) ||
      /do\s*$/.test(trimmed) ||
      /repeat\s*$/.test(trimmed) ||
      /,\s*$/.test(trimmed) ||
      /\(\s*$/.test(trimmed) ||
      /\{\s*$/.test(trimmed) ||
      /=\s*$/.test(trimmed);

    if (trimmed.length > 15 && !endsUnsafe && !trimmed.startsWith("--") && Math.random() > 0.75) {
      const varName = ln();
      result.push("local " + varName + "=nil");
    }
  }

  return result.join("\n");
}

function protectStringsImproved(code, level) {
  const strings = [];
  let stringId = 0;

  // Extraer strings de forma más robusta
  code = code.replace(/(["'])(?:\\.|(?!\1)[\s\S])*?\1/g, (match) => {
    strings.push(match);
    return "___STR_" + (stringId++) + "___";
  });

  code = stripCommentsImproved(code);

  if (level < 2) {
    // Nivel 1: Solo restaurar
    for (let i = 0; i < strings.length; i++) {
      code = code.replace("___STR_" + i + "___", strings[i]);
    }
    return { code, decoder: "" };
  }

  // Nivel 2: Encripción XOR simple pero segura
  const key = crypto.randomBytes(8).toString("hex");
  const decName = ln();
  const keyBytes = Buffer.from(key, "utf8");

  let decoderCode = "local " + decName + "=function(t,k)\n";
  decoderCode += "local r={}\n";
  decoderCode += "for i=1,#t do\n";
  decoderCode += "local b=string.byte(k,(i-1)%#k+1)\n";
  decoderCode += "r[i]=string.char(bit32.bxor(t[i],b))\n";
  decoderCode += "end\n";
  decoderCode += "return table.concat(r)\n";
  decoderCode += "end\n";

  for (let i = 0; i < strings.length; i++) {
    const strContent = strings[i].slice(1, -1)
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")
      .replace(/\t/g, "\\t");

    const encrypted = [];
    for (let j = 0; j < strContent.length; j++) {
      encrypted.push(strContent.charCodeAt(j) ^ keyBytes[j % keyBytes.length]);
    }

    // Construir tabla de bytes segura
    const bytesStr = "{" + encrypted.join(",") + "}";
    const decCall = decName + "(" + bytesStr + ",\"" + key + "\")";
    code = code.replace("___STR_" + i + "___", decCall);
  }

  return { code, decoder: decoderCode };
}

function minifyImproved(code) {
  return code
    .split("\n")
    .map(line => line.replace(/[ \t]+$/g, ""))
    .filter((line, i, arr) => {
      if (line.trim() === "" && i > 0 && arr[i - 1].trim() === "") return false;
      return true;
    })
    .join("\n")
    .trim();
}

function obfuscateLuaImproved(source, level) {
  let code = source.trim();

  // Strip comments (pero preservar estructura)
  code = stripCommentsImproved(code);

  // Nivel 1+: Renombrar variables
  if (level >= 1) {
    code = renameLocalsImproved(code);
  }

  // Nivel 2: Ofuscación adicional
  if (level >= 2) {
    code = obfuscateNumbersImproved(code);
    code = injectJunkImproved(code);
  }

  // Proteger strings
  const prot = protectStringsImproved(code, level);
  code = prot.code;
  const decoder = prot.decoder || "";

  // Minificar
  code = minifyImproved(code);

  // Construir resultado
  let result = "-- Ofuscado con IKGONAVI MEJORADO\n";

  if (level >= 2) {
    result += decoder + "\n";
  }

  result += code;
  return result;
}

app.post("/api/obfuscate", function(req, res) {
  try {
    const code = req.body && req.body.code;
    const level = req.body && req.body.level;

    if (typeof code !== "string" || !code.trim()) {
      return res.status(400).json({ error: "No se recibió ningún script Lua." });
    }

    // Aumentar límite para scripts grandes
    if (code.length > 500000) {
      return res.status(400).json({ error: "Script demasiado grande (máx 500KB)." });
    }

    const selectedLevel = Math.max(1, Math.min(2, Number(level) || 1));
    
    console.log(`[Obfuscate] Size: ${code.length} bytes, Level: ${selectedLevel}`);
    
    const result = obfuscateLuaImproved(code, selectedLevel);

    res.json({
      success: true,
      code: result,
      originalSize: code.length,
      outputSize: result.length,
      level: selectedLevel,
      compressionRatio: ((1 - result.length / code.length) * 100).toFixed(2) + "%"
    });

  } catch (err) {
    console.error("[Error]", err);
    res.status(500).json({ error: "Error procesando: " + (err.message || "unknown") });
  }
});

app.get("/api/health", function(req, res) {
  res.json({ ok: true, version: "mejorado-bigscripts", maxSize: "500KB" });
});

app.get("/", function(req, res) {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use(express.static(path.join(__dirname, "public")));

module.exports = app;

if (require.main === module) {
  app.listen(PORT, "0.0.0.0", function() {
    console.log("IKGONAVI MEJORADO running on port " + PORT);
    console.log("Soporta scripts hasta 500KB");
  });
}
