/**
 * QyrexObf - Cifrado + Estable
 */
const express = require("express");
const path = require("path");
const crypto = require("crypto");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "15mb" }));

const RESERVED = new Set([
  "and","break","do","else","elseif","end","false","for","function",
  "goto","if","in","local","nil","not","or","repeat","return","then",
  "true","until","while","_G","_ENV","self","game","workspace","script",
  "require","Instance","Enum","Color3","Vector3","CFrame","TweenInfo",
  "UDim2","UDim","Rect","Region3","Ray","BrickColor","NumberSequence",
  "ColorSequence","NumberRange","PhysicalProperties","Axes","Faces",
  "task","wait","spawn","delay","tick","time","os","math","string",
  "table","pairs","ipairs","next","type","typeof","print","warn","error",
  "pcall","xpcall","select","unpack","rawget","rawset","rawequal","rawlen",
  "setmetatable","getmetatable","coroutine","debug","utf8","bit32",
  "buffer","vector","SharedTable","getfenv","setfenv","loadstring","load",
  "assert","collectgarbage","newproxy","gcinfo","ypcall",
  "settings","UserSettings","stats","UserInputService","Players","RunService",
  "TweenService","HttpService","ReplicatedStorage","Lighting","CoreGui",
  "Workspace","Camera","Mouse","Humanoid","HumanoidRootPart","LocalPlayer",
  "GetService","FindFirstChild","WaitForChild","GetChildren","GetDescendants",
  "IsA","Clone","Destroy","Connect","Disconnect","Fire","Invoke","shared","plugin"
]);

function rnd(len = 5) {
  const c = "abcdefghijkmnopqrstuvwxyz";
  let s = "";
  for (let i = 0; i < len; i++) s += c[(Math.random() * c.length) | 0];
  return s;
}

function varName() {
  return "_" + rnd(4) + rnd(3);
}

function extractStrings(code) {
  const strings = [];
  let out = "";
  let i = 0;

  while (i < code.length) {
    // Long brackets [[...]]
    if (code[i] === "[") {
      let m = i + 1;
      let eqs = "";
      while (m < code.length && code[m] === "=") {
        eqs += "=";
        m++;
      }
      if (m < code.length && code[m] === "[") {
        const endMark = "]" + eqs + "]";
        const endIdx = code.indexOf(endMark, m + 1);
        if (endIdx !== -1) {
          strings.push(code.slice(i, endIdx + endMark.length));
          out += "___S" + (strings.length - 1) + "___";
          i = endIdx + endMark.length;
          continue;
        }
      }
    }

    // "..." o '...'
    if (code[i] === '"' || code[i] === "'") {
      const quote = code[i];
      let j = i + 1;
      let str = quote;
      while (j < code.length) {
        if (code[j] === "\\") {
          str += code[j];
          if (j + 1 < code.length) {
            str += code[j + 1];
            j += 2;
          } else {
            j++;
          }
          continue;
        }
        str += code[j];
        if (code[j] === quote) {
          j++;
          break;
        }
        j++;
      }
      strings.push(str);
      out += "___S" + (strings.length - 1) + "___";
      i = j;
      continue;
    }

    out += code[i];
    i++;
  }
  return { code: out, strings };
}

function stripComments(code) {
  let result = "";
  let i = 0;
  while (i < code.length) {
    if (code[i] === "-" && code[i + 1] === "-") {
      let m = i + 2;
      if (code[m] === "[") {
        let eqs = "";
        m++;
        while (m < code.length && code[m] === "=") {
          eqs += "=";
          m++;
        }
        if (code[m] === "[") {
          const endMark = "]" + eqs + "]";
          const endIdx = code.indexOf(endMark, m + 1);
          if (endIdx !== -1) {
            i = endIdx + endMark.length;
            continue;
          }
        }
      }
      i += 2;
      while (i < code.length && code[i] !== "\n") i++;
      continue;
    }
    result += code[i];
    i++;
  }
  return result;
}

function renameLocals(code) {
  const map = new Map();
  let counter = 0;

  // local nombre
  let re = /\blocal\s+([A-Za-z_][A-Za-z0-9_]*)/g;
  let match;
  while ((match = re.exec(code)) !== null) {
    const name = match[1];
    if (!RESERVED.has(name) && !map.has(name) && name.length > 1) {
      counter++;
      map.set(name, varName() + counter);
    }
  }

  // local a, b, c
  re = /\blocal\s+([A-Za-z_][A-Za-z0-9_]*(?:\s*,\s*[A-Za-z_][A-Za-z0-9_]*)+)/g;
  while ((match = re.exec(code)) !== null) {
    const parts = match[1].split(/\s*,\s*/);
    for (const name of parts) {
      if (!RESERVED.has(name) && !map.has(name) && name.length > 1) {
        counter++;
        map.set(name, varName() + counter);
      }
    }
  }

  // Reemplazar de más largo a más corto
  const entries = [...map.entries()].sort((a, b) => b[0].length - a[0].length);
  let result = code;
  for (const [oldName, newName] of entries) {
    const regex = new RegExp("\\b" + oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "g");
    result = result.replace(regex, newName);
  }
  return result;
}

function protectStrings(code, strings) {
  const key = crypto.randomBytes(5).toString("hex");
  const decName = varName();
  const keyBytes = Buffer.from(key, "utf8");

  // Decoder compacto
  const decoder = `local ${decName}=function(t,k)local r={}for i=1,#t do r[i]=string.char(bit32.bxor(t[i],string.byte(k,(i-1)%#k+1)))end return table.concat(r)end `;

  const rebuilt = [];

  for (let i = 0; i < strings.length; i++) {
    const raw = strings[i];

    // No tocar long strings ni cosas especiales
    if (raw.startsWith("[") || raw.length < 4) {
      rebuilt.push(raw);
      continue;
    }

    let content = raw.slice(1, -1);

    // No cifrar URLs, assets, etc. (evita romper)
    if (
      content.length > 2500 ||
      content.includes("http") ||
      content.includes("rbxassetid") ||
      content.includes("github") ||
      content.includes("sirius")
    ) {
      rebuilt.push(raw);
      continue;
    }

    const bytes = [];
    for (let j = 0; j < content.length; j++) {
      bytes.push(content.charCodeAt(j) ^ keyBytes[j % keyBytes.length]);
    }

    rebuilt.push(`${decName}({${bytes.join(",")}},"${key}")`);
  }

  let out = code;
  for (let i = strings.length - 1; i >= 0; i--) {
    out = out.split("___S" + i + "___").join(rebuilt[i]);
  }

  return decoder + out;
}

function toOneLine(code) {
  return code
    .replace(/\r\n/g, "\n")
    .replace(/\n+/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*([=+\-*/%<>#(){},;.])\s*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function obfuscate(source) {
  let code = String(source || "").trim();
  if (!code) throw new Error("Script vacío");
  if (code.length > 900000) throw new Error("Script demasiado grande");

  // 1. Extraer strings
  const extracted = extractStrings(code);

  // 2. Quitar comentarios
  let processed = stripComments(extracted.code);

  // 3. Renombrar variables
  processed = renameLocals(processed);

  // 4. Cifrar strings
  processed = protectStrings(processed, extracted.strings);

  // 5. Una sola línea
  processed = toOneLine(processed);

  return "-- Protect by QyrexObf\n" + processed;
}

// ================== API ==================
app.post("/api/obfuscate", (req, res) => {
  try {
    const code = req.body?.code;

    if (typeof code !== "string" || !code.trim()) {
      return res.status(400).json({ error: "No se recibió ningún script." });
    }

    console.log("[QyrexObf] size:", code.length);

    const result = obfuscate(code);

    res.json({
      success: true,
      code: result,
      originalSize: code.length,
      outputSize: result.length
    });
  } catch (err) {
    console.error("[Error]", err.message);
    res.status(500).json({ error: err.message || "Error" });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, name: "QyrexObf", mode: "encrypted-clean" });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use(express.static(path.join(__dirname, "public")));

module.exports = app;

if (require.main === module) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log("QyrexObf corriendo en puerto " + PORT);
  });
}
