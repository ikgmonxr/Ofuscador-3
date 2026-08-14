const express = require("express");
const path = require("path");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "50mb" }));

// Habilitar la carpeta pública para servir el index.html
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

function randomName(length = 12) {
  let result = "_0x";
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function stripCommentsAndExtractStrings(code) {
  let cleanCode = "";
  let strings = [];
  let i = 0;

  while (i < code.length) {
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
    } else if (code.substr(i, 2) === "[[") {
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
    } else if (code.substr(i, 4) === "--[[") {
      i += 4;
      while (i < code.length - 1) {
        if (code.substr(i, 2) === "]]") {
          i += 2;
          break;
        }
        i++;
      }
    } else if (code.substr(i, 2) === "--") {
      while (i < code.length && code[i] !== "\n") {
        i++;
      }
      if (code[i] === "\n") {
        cleanCode += "\n";
        i++;
      }
    } else {
      cleanCode += code[i];
      i++;
    }
  }

  return { cleanCode, strings };
}

function encodeStrings(strings) {
  const xorKey = Math.floor(Math.random() * 250) + 1;
  const encodedStrings = strings.map(s => {
    let raw = s;
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
      raw = raw.slice(1, -1);
    } else if (raw.startsWith("[[") && raw.endsWith("]]")) {
      raw = raw.slice(2, -2);
    }
    const bytes = [];
    for (let i = 0; i < raw.length; i++) {
      bytes.push(raw.charCodeAt(i) ^ xorKey);
    }
    return `{${bytes.join(",")}}`;
  });

  const decoderHeader = `
local _decKey = ${xorKey}
local function _decStr(tbl)
  local charTbl = {}
  for i = 1, #tbl do
    charTbl[i] = string.char(bit32.bxor(tbl[i], _decKey))
  end
  return table.concat(charTbl)
end
`;
  return { encodedStrings, decoderHeader };
}

function renameVariables(code) {
  const varMap = new Map();
  const regex = /\blocal\s+([A-Za-z_][A-Za-z0-9_]*)/g;
  let match;

  while ((match = regex.exec(code)) !== null) {
    const varName = match[1];
    if (!varMap.has(varName) && !RESERVED.has(varName)) {
      varMap.set(varName, randomName());
    }
  }

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
    const offset = Math.floor(Math.random() * 50) + 1;
    return `((${n + offset} - ${offset}))`;
  });
}

function minifyCode(code) {
  return code
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join("\n");
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

  const { cleanCode, strings } = stripCommentsAndExtractStrings(code);
  let processedCode = cleanCode;

  if (level >= 1) {
    processedCode = renameVariables(processedCode);
  }

  if (level >= 2) {
    processedCode = obfuscateNumbers(processedCode);
    processedCode = minifyCode(processedCode);
  }

  const { encodedStrings, decoderHeader } = encodeStrings(strings);

  for (let i = 0; i < encodedStrings.length; i++) {
    const placeholder = `__STR_PLACEHOLDER_${i}__`;
    processedCode = processedCode.replace(placeholder, `_decStr(${encodedStrings[i]})`);
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
