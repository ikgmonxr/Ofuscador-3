const express = require("express");
const path = require("path");
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
  "utf8","bit32","getgenv","setgenv","hookmetamethod","checkcaller","Drawing",
  // Miembros y servicios comunes de Roblox
  "Players","LocalPlayer","Workspace","Lighting","ReplicatedStorage","ServerScriptService","ServerStorage",
  "StarterGui","StarterPack","StarterPlayer","SoundService","TweenService","UserInputService",
  "RunService","HttpService","TeleportService","MarketplaceService","ContextActionService",
  "GuiService","Debris","CoreGui","VRService","PathfindingService","Character","Humanoid"
]);

function randomName(length = 10) {
  let result = "_";
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Extrae cadenas de texto para protegerlas y elimina comentarios
function stripCommentsAndExtractStrings(code) {
  let cleanCode = "";
  let strings = [];
  let i = 0;

  while (i < code.length) {
    // Cadenas de texto simples o dobles
    if (code[i] === '"' || code[i] === "'") {
      const quote = code[i];
      let strVal = quote;
      i++;
      while (i < code.length) {
        strVal += code[i];
        if (code[i] === quote && code[i - 1] !== "\\") {
          i++;
          break;
        }
        i++;
      }
      const placeholder = `__STR_PLACEHOLDER_${strings.length}__`;
      strings.push(strVal);
      cleanCode += placeholder;
    }
    // Cadenas multilínea [[...]]
    else if (code.substr(i, 2) === "[[") {
      let strVal = "[[";
      i += 2;
      while (i < code.length) {
        strVal += code[i];
        if (code.substr(i, 2) === "]]") {
          strVal += "]";
          i += 2;
          break;
        }
        i++;
      }
      const placeholder = `__STR_PLACEHOLDER_${strings.length}__`;
      strings.push(strVal);
      cleanCode += placeholder;
    }
    // Comentario multilínea --[[...]]
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
    // Comentario de una línea --...
    else if (code.substr(i, 2) === "--") {
      while (i < code.length && code[i] !== "\n") {
        i++;
      }
      if (code[i] === "\n") {
        cleanCode += "\n";
        i++;
      }
    }
    else {
      cleanCode += code[i];
      i++;
    }
  }

  return { cleanCode, strings };
}

// Restaura los textos originales usando replaceAll
function restoreStrings(code, strings) {
  for (let i = 0; i < strings.length; i++) {
    const placeholder = `__STR_PLACEHOLDER_${i}__`;
    code = code.replaceAll(placeholder, strings[i]);
  }
  return code;
}

function renameVariables(code) {
  const varMap = new Map();

  // Buscar declaraciones locales
  const regex = /\blocal\s+([A-Za-z_][A-Za-z0-9_]*)/g;
  let match;

  while ((match = regex.exec(code)) !== null) {
    const varName = match[1];
    if (!varMap.has(varName) && !RESERVED.has(varName)) {
      varMap.set(varName, randomName());
    }
  }

  // Reemplazar variables (ordenadas por longitud para evitar reemplazos parciales)
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
  return code
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join("\n");
}

function obfuscate(code, level) {
  console.log(`Processing: ${code.length} bytes, Level ${level}`);

  // 1. Ocultar cadenas de texto y limpiar comentarios
  const { cleanCode, strings } = stripCommentsAndExtractStrings(code);
  let processedCode = cleanCode;

  // 2. Renombrar variables
  if (level >= 1) {
    processedCode = renameVariables(processedCode);
  }

  // 3. Ofuscar números y minificar
  if (level >= 2) {
    processedCode = obfuscateNumbers(processedCode);
    processedCode = minifyCode(processedCode);
  }

  // 4. Restaurar las cadenas de texto originales
  processedCode = restoreStrings(processedCode, strings);

  return processedCode;
}

app.post("/api/obfuscate", (req, res) => {
  try {
    const { code, level } = req.body;

    if (!code || typeof code !== "string") {
      return res.status(400).json({ error: "No script provided" });
    }

    if (code.length > 50000000) {
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
  res.json({ ok: true, version: "simple-v3" });
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
