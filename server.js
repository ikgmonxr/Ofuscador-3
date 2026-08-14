/**
 * QyrexObf - Single Line Obfuscator
 * Solo 1 nivel (el más estable) + todo en 1 línea
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
  "IsA","Clone","Destroy","Connect","Disconnect","Fire","Invoke"
]);

function rnd(n = 6) {
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

function extractStrings(code) {
  const strings = [];
  let out = "";
  let i = 0;
  while (i < code.length) {
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
    if (code[i] === '"' || code[i] === "'") {
      const q = code[i];
      let j = i + 1;
      let s = q;
      while (j < code.length) {
        if (code[j] === "\\") {
          s += code[j];
          if (j + 1 < code.length) {
            s += code[j + 1];
            j += 2;
          } else j++;
          continue;
        }
        s += code[j];
        if (code[j] === q) {
          j++;
          break;
        }
        j++;
      }
      strings.push(s);
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

  const regex = /\blocal\s+([A-Za-z_][A-Za-z0-9_]*)/g;
  let match;
  while ((match = regex.exec(code)) !== null) {
    const name = match[1];
    if (!map.has(name) && !RESERVED.has(name) && name.length > 1) {
      counter++;
      map.set(name, ln() + counter);
    }
  }

  const multi = /\blocal\s+([A-Za-z_][A-Za-z0-9_]*(?:\s*,\s*[A-Za-z_][A-Za-z0-9_]*)+)/g;
  while ((match = multi.exec(code)) !== null) {
    const parts = match[1].split(/\s*,\s*/);
    for (const name of parts) {
      if (!map.has(name) && !RESERVED.has(name) && name.length > 1) {
        counter++;
        map.set(name, ln() + counter);
      }
    }
  }

  const entries = [...map.entries()].sort((a, b) => b[0].length - a[0].length);
  let result = code;
  for (const [oldName, newName] of entries) {
    const pattern = new RegExp("\\b" + oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "g");
    result = result.replace(pattern, newName);
  }
  return result;
}

function encryptStrings(code, strings) {
  const key = crypto.randomBytes(5).toString("hex");
  const decName = ln();
  const keyBytes = Buffer.from(key, "utf8");

  // Decoder ya en 1 línea
  let decoder = `local ${decName}=function(t,k)local r={}for i=1,#t do local b=string.byte(k,(i-1)%#k+1)r[i]=string.char(bit32.bxor(t[i],b))end return table.concat(r)end `;

  const rebuilt = [];
  for (let i = 0; i < strings.length; i++) {
    const raw = strings[i];

    // No tocar long strings, URLs, asset ids, etc.
    if (raw.startsWith("[") || raw.length < 5) {
      rebuilt.push(raw);
      continue;
    }

    let content = raw.slice(1, -1);
    try {
      content = content
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "\t")
        .replace(/\\r/g, "\r")
        .replace(/\\\\/g, "\\")
        .replace(/\\'/g, "'")
        .replace(/\\"/g, '"');
    } catch (_) {}

    if (
      content.length > 3000 ||
      /^rbxassetid:\/\//i.test(content) ||
      /^https?:\/\//i.test(content) ||
      /sirius\.menu/i.test(content) ||
      /raw\.githubusercontent/i.test(content)
    ) {
      rebuilt.push(raw);
      continue;
    }

    const encrypted = [];
    for (let j = 0; j < content.length; j++) {
      encrypted.push(content.charCodeAt(j) ^ keyBytes[j % keyBytes.length]);
    }
    rebuilt.push(`${decName}({${encrypted.join(",")}},"${key}")`);
  }

  let out = code;
  for (let i = strings.length - 1; i >= 0; i--) {
    out = out.split("___S" + i + "___").join(rebuilt[i]);
  }
  return decoder + out;
}

function toOneLine(code) {
  return code
    .replace(/--\[\[[\s\S]*?\]\]/g, "")
    .replace(/--[^\n]*/g, "")
    .replace(/\r\n|\r|\n/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*([=+\-*/%<>~^#(){},;.])\s*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function obfuscate(source) {
  let code = String(source || "").trim();
  if (!code) throw new Error("Empty script");

  if (code.length > 900000) {
    throw new Error("Script demasiado grande (máximo ~900KB)");
  }

  // 1. Extraer strings
  const extracted = extractStrings(code);
  code = stripComments(extracted.code);

  // 2. Renombrar variables locales
  code = renameLocals(code);

  // 3. Proteger strings + decoder
  code = encryptStrings(code, extracted.strings);

  // 4. Todo a 1 sola línea
  code = toOneLine(code);

  // 5. Comentario final
  return "-- Protect by QyrexObf " + code;
}

// ========== API ==========
app.post("/api/obfuscate", (req, res) => {
  try {
    const code = req.body?.code;

    if (typeof code !== "string" || !code.trim()) {
      return res.status(400).json({ error: "No se recibió ningún script." });
    }

    console.log(`[QyrexObf] size=${code.length}`);

    const result = obfuscate(code);

    res.json({
      success: true,
      code: result,
      originalSize: code.length,
      outputSize: result.length
    });
  } catch (err) {
    console.error("[Error]", err.message);
    res.status(500).json({ error: err.message || "Error desconocido" });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, name: "QyrexObf", mode: "1-line" });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use(express.static(path.join(__dirname, "public")));

module.exports = app;

if (require.main === module) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`QyrexObf corriendo en puerto ${PORT}`);
  });
}
