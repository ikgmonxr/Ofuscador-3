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

// Genera nombres extremadamente confusos (_0x0O1I_)
function ultraConfusingName(length = 12) {
  const chars = "01O1I_";
  let res = "_0x";
  for (let i = 0; i < length; i++) {
    res += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return res;
}

// 1. Extraer Cadenas y Limpiar Comentarios
function extractStrings(code) {
  let strings = [];
  let cleanCode = "";
  let i = 0;

  while (i < code.length) {
    if (code.substr(i, 4) === "--[[") {
      i += 4;
      while (i < code.length && code.substr(i, 2) !== "]]") i++;
      i += 2;
      continue;
    }
    if (code.substr(i, 2) === "--") {
      while (i < code.length && code[i] !== "\n") i++;
      continue;
    }
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
      const placeholder = `__HARDCORE_STR_${strings.length}__`;
      strings.push(strVal);
      cleanCode += placeholder;
      continue;
    }
    cleanCode += code[i];
    i++;
  }
  return { cleanCode, strings };
}

// 2. Encriptado XOR + Byte Table para Strings
function encodeStrings(strings) {
  const xorKey = Math.floor(Math.random() * 200) + 25;
  const encodedStrings = strings.map(s => {
    let raw = s;
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
      raw = raw.slice(1, -1);
    }
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

  const v_key = ultraConfusingName();
  const v_dec = ultraConfusingName();
  const v_tbl = ultraConfusingName();

  const decoderHeader = `
local ${v_key} = ${xorKey}
local function ${v_dec}(${v_tbl})
  local _c = {}
  for _i = 1, #${v_tbl} do
    local _b = ${v_tbl}[_i]
    if bit32 and bit32.bxor then
      _c[_i] = string.char(bit32.bxor(_b, ${v_key}))
    else
      _c[_i] = string.char((_b + ${v_key}) % 256)
    end
  end
  return table.concat(_c)
end
`;
  return { encodedStrings, decoderHeader, v_dec };
}

// 3. Renombrado de Variables con Identificadores Homóglifos
function obfuscateVariables(code) {
  const varMap = new Map();
  const regex = /\blocal\s+([A-Za-z_][A-Za-z0-9_]*)/g;
  let match;

  while ((match = regex.exec(code)) !== null) {
    const varName = match[1];
    if (!varMap.has(varName) && !RESERVED.has(varName) && !varName.startsWith("__HARDCORE_STR_")) {
      varMap.set(varName, ultraConfusingName());
    }
  }

  let result = code;
  const sorted = Array.from(varMap.entries()).sort((a, b) => b[0].length - a[0].length);

  for (const [oldName, newName] of sorted) {
    const pattern = new RegExp("(?<![.\\w])" + oldName + "(?![\\w])", "g");
    result = result.replace(pattern, newName);
  }
  return result;
}

// 4. Ofuscación de Números en Expresiones Álgebraicas Operativas
function obfuscateNumbersComplex(code) {
  return code.replace(/(?<!__HARDCORE_STR_\d*)(?<!\w)\b([1-9]\d{0,4})\b(?!\w)/g, (match, num) => {
    const n = parseInt(num);
    if (n < 2 || n > 60000) return num;
    const k1 = Math.floor(Math.random() * 20) + 2;
    const k2 = Math.floor(Math.random() * 100) + 10;
    return `(((${n * k1} + ${k2}) - ${k2}) / ${k1})`;
  });
}

// 5. Control Flow Flattening Engine (Aplanamiento de Flujo)
function flattenControlFlow(code) {
  const lines = code.split("\n").filter(l => l.trim().length > 0);
  if (lines.length < 3) return code; // No aplanar scripts microscópicos

  const stateVar = ultraConfusingName();
  const stateTableVar = ultraConfusingName();
  
  // Asignar IDs aleatorios a cada bloque de línea
  let blocks = lines.map((line, index) => ({
    id: (index + 1) * 17 + Math.floor(Math.random() * 5),
    code: line
  }));

  // Mezclar el orden de las líneas visualmente en el switch
  let shuffledBlocks = [...blocks].sort(() => Math.random() - 0.5);

  let switchCases = shuffledBlocks.map((block, idx) => {
    const currentBlockIndex = blocks.findIndex(b => b.id === block.id);
    const nextBlock = blocks[currentBlockIndex + 1];
    const nextState = nextBlock ? nextBlock.id : 0;

    return `
    if ${stateVar} == ${block.id} then
      ${block.code}
      ${stateVar} = ${nextState}
    end`;
  }).join("\n");

  const startState = blocks[0].id;

  return `
local ${stateVar} = ${startState}
while ${stateVar} ~= 0 do
  repeat
    ${switchCases}
  until true
end
`;
}

// Anti-Tamper & Anti-Decompiler Silencioso
const HARDCORE_ANTI_DEBUG = `
local function _validate_env()
  if _G.Decompiler or _G.unhook-metamethod or _G.saveinstance then return false end
  local p_ok, p_res = pcall(function() return getgenv and getgenv().hookfunction end)
  if p_ok and p_res then return false end
  return true
end
if not _validate_env() then return end
`;

function obfuscateEngine(code, level) {
  const { cleanCode, strings } = extractStrings(code);
  let processed = cleanCode;

  // Paso 1: Reemplazar variables por nombres ultra confusos
  processed = obfuscateVariables(processed);

  // Paso 2: Aplanamiento de control flow (Flattening)
  if (level >= 2) {
    try {
      processed = flattenControlFlow(processed);
    } catch (e) {
      console.warn("Control flow flattening skipped due to syntax structure");
    }
  }

  // Paso 3: Ofuscación Matemática
  processed = obfuscateNumbersComplex(processed);

  // Paso 4: Reinyectar Cadenas Encriptadas
  const { encodedStrings, decoderHeader, v_dec } = encodeStrings(strings);
  for (let i = 0; i < encodedStrings.length; i++) {
    const placeholder = `__HARDCORE_STR_${i}__`;
    processed = processed.replaceAll(placeholder, `${v_dec}(${encodedStrings[i]})`);
  }

  return HARDCORE_ANTI_DEBUG + "\n" + decoderHeader + "\n" + processed;
}

app.post("/api/obfuscate", (req, res) => {
  try {
    const { code, level } = req.body;

    if (!code || typeof code !== "string") {
      return res.status(400).json({ error: "No script provided" });
    }

    const selectedLevel = Math.max(1, Math.min(2, Number(level) || 2));
    const output = obfuscateEngine(code, selectedLevel);

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
  res.json({ ok: true, engine: "Hardcore VM-Flattening Obfuscator" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[HARDCORE OBFUSCATOR ENGINE] Active on port ${PORT}`);
});
