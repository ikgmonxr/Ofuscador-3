const express = require("express");
const path = require("path");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "50mb" }));
app.use(express.static(path.join(__dirname, "public")));

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
  let result = "_0x";
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// 1. Extracción segura de cadenas y remoción de comentarios
function extractStringsAndStripComments(code) {
  let strings = [];
  let cleanCode = "";
  let i = 0;

  while (i < code.length) {
    // Comentarios multilínea --[[ ... ]]
    if (code.substr(i, 4) === "--[[") {
      i += 4;
      while (i < code.length && code.substr(i, 2) !== "]]") {
        i++;
      }
      i += 2;
      continue;
    }

    // Comentarios simples --
    if (code.substr(i, 2) === "--") {
      while (i < code.length && code[i] !== "\n") {
        i++;
      }
      continue;
    }

    // Cadenas con comillas dobles, simples o bloques [[ ]]
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
      const placeholder = `__STR_${strings.length}__`;
      strings.push(strVal);
      cleanCode += placeholder;
      continue;
    }

    if (code.substr(i, 2) === "[[") {
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
      const placeholder = `__STR_${strings.length}__`;
      strings.push(strVal);
      cleanCode += placeholder;
      continue;
    }

    cleanCode += code[i];
    i++;
  }

  return { cleanCode, strings };
}

// 2. Codificación XOR de cadenas con fallback de compatibilidad
function encodeStrings(strings) {
  const xorKey = Math.floor(Math.random() * 200) + 20;
  const encodedStrings = strings.map(s => {
    let raw = s;
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
      raw = raw.slice(1, -1);
    } else if (raw.startsWith("[[") && raw.endsWith("]]")) {
      raw = raw.slice(2, -2);
    }

    // Reemplazo manual de secuencias de escape comunes
    raw = raw
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .replace(/\\\\/g, "\\");

    const bytes = [];
    for (let i = 0; i < raw.length; i++) {
      bytes.push(raw.charCodeAt(i) ^ xorKey);
    }
    return `{${bytes.join(",")}}`;
  });

  const decoderHeader = `
local _decKey = ${xorKey}
local function _bxor(a, b)
  if bit32 and bit32.bxor then return bit32.bxor(a, b) end
  local res, p = 0, 1
  while a > 0 or b > 0 do
    local ra, rb = a % 2, b % 2
    if ra ~= rb then res = res + p end
    a, b, p = math.floor(a / 2), math.floor(b / 2), p * 2
  end
  return res
end
local function _decStr(tbl)
  local charTbl = {}
  for i = 1, #tbl do
    charTbl[i] = string.char(_bxor(tbl[i], _decKey))
  end
  return table.concat(charTbl)
end
`;
  return { encodedStrings, decoderHeader };
}

// 3. Renombrado seguro de variables de ámbito local
function renameVariables(code) {
  const varMap = new Map();
  const regex = /\blocal\s+([A-Za-z_][A-Za-z0-9_]*)/g;
  let match;

  while ((match = regex.exec(code)) !== null) {
    const varName = match[1];
    if (!varMap.has(varName) && !RESERVED.has(varName) && !varName.startsWith("__STR_")) {
      varMap.set(varName, randomName());
    }
  }

  let result = code;
  const sortedVars = Array.from(varMap.entries()).sort((a, b) => b[0].length - a[0].length);

  for (const [oldName, newName] of sortedVars) {
    const pattern = new RegExp("(?<![.\\w])" + oldName + "(?![\\w])", "g");
    result = result.replace(pattern, newName);
  }

  return result;
}

// 4. Ofuscación segura de constantes numéricas
function obfuscateNumbers(code) {
  return code.replace(/(?<!__STR_\d*)(?<!\w)\b([1-9]\d{0,4})\b(?!\w)/g, (match, num) => {
    const n = parseInt(num);
    if (n < 2 || n > 50000) return num;
    const offset = Math.floor(Math.random() * 30) + 5;
    return `((${n + offset} - ${offset}))`;
  });
}

const DTC_ANTI_TAMPER_HEADER = `
local function _dtc_check()
	if _G.lune ~= nil or _G.lute ~= nil or _G.wally ~= nil or _G.rojo ~= nil or _G.selene ~= nil or _G.darklua ~= nil then return true end
	if _G.process and (_G.process.env or _G.process.platform or _G.process.argv) then return true end
	if _G.window ~= nil or _G.document ~= nil or _G.globalThis ~= nil then return true end
	if _G.game == nil or _G.workspace == nil then return true end
	if not pcall(function() return game:GetService("HttpService") end) then return true end
	local s, e = pcall(function() return Instance.new("Part").Name end)
	if not s or e ~= "Part" then return true end
	if getrawmetatable and getrawmetatable(game).__metatable ~= getmetatable(game) then return true end
	return false
end
if _dtc_check() then
	print("Security Violation: Unauthorized Runtime Detected.")
	return
end
`;

function obfuscate(code, level) {
  console.log(`Processing: ${code.length} bytes, Level ${level}`);

  const { cleanCode, strings } = extractStringsAndStripComments(code);
  let processedCode = cleanCode;

  if (level >= 1) {
    processedCode = renameVariables(processedCode);
  }

  if (level >= 2) {
    processedCode = obfuscateNumbers(processedCode);
  }

  const { encodedStrings, decoderHeader } = encodeStrings(strings);

  for (let i = 0; i < encodedStrings.length; i++) {
    const placeholder = `__STR_${i}__`;
    processedCode = processedCode.replaceAll(placeholder, `_decStr(${encodedStrings[i]})`);
  }

  return DTC_ANTI_TAMPER_HEADER + "\n" + decoderHeader + "\n" + processedCode;
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
  res.json({ ok: true, version: "v3-pro-antitamper" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[OBFUSCATOR PRO ENGINE] Active on port ${PORT}`);
});
