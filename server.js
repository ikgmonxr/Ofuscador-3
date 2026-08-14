/**
 * QyrexObf - Strong + Stable (1 Line)
 * Difícil de desofuscar + menos errores
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

function rnd(n = 6) {
  const c = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let s = c[(Math.random() * 52) | 0];
  for (let i = 1; i < n; i++) s += c[(Math.random() * 52) | 0];
  return s;
}

function ln() {
  return "_" + rnd(5) + rnd(3);
}

function extractStrings(code) {
  const strings = [];
  let out = "";
  let i = 0;

  while (i < code.length) {
    // Long string [[ ]]
    if (code[i] === "[") {
      let m = i + 1;
      let eqs = "";
      while (m < code.length && code[m] === "=") { eqs += "="; m++; }
      if (m < code.length && code[m] === "[") {
        const endMark = "]" + eqs + "]";
        const endIdx = code.indexOf(endMark, m + 1);
        if (endIdx !== -1) {
          strings.push(code.slice(i, endIdx + endMark.length));
          out += `___S${strings.length - 1}___`;
          i = endIdx + endMark.length;
          continue;
        }
      }
    }

    // Normal string " " o ' '
    if (code[i] === '"' || code[i] === "'") {
      const q = code[i];
      let j = i + 1;
      let s = q;
      while (j < code.length) {
        if (code[j] === "\\") {
          s += code[j];
          if (j + 1 < code.length) { s += code[j + 1]; j += 2; }
          else j++;
          continue;
        }
        s += code[j];
        if (code[j] === q) { j++; break; }
        j++;
      }
      strings.push(s);
      out += `___S${strings.length - 1}___`;
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
        while (m < code.length && code[m] === "=") { eqs += "="; m++; }
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

  const single = /\blocal\s+([A-Za-z_][A-Za-z0-9_]*)/g;
  let match;
  while ((match = single.exec(code)) !== null) {
    const name = match[1];
    if (!RESERVED.has(name) && !map.has(name) && name.length > 1) {
      counter++;
      map.set(name, ln() + counter);
    }
  }

  const multi = /\blocal\s+([A-Za-z_][A-Za-z0-9_]*(?:\s*,\s*[A-Za-z_][A-Za-z0-9_]*)+)/g;
  while ((match = multi.exec(code)) !== null) {
    for (const name of match[1].split(/\s*,\s*/)) {
      if (!RESERVED.has(name) && !map.has(name) && name.length > 1) {
        counter++;
        map.set(name, ln() + counter);
      }
    }
  }

  const entries = [...map.entries()].sort((a, b) => b[0].length - a[0].length);
  let result = code;
  for (const [oldName, newName] of entries) {
    const re = new RegExp(`\\b${oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
    result = result.replace(re, newName);
  }
  return result;
}

function protectStrings(code, strings) {
  const key = crypto.randomBytes(6).toString("hex");
  const dec = ln();
  const keyBytes = Buffer.from(key, "utf8");

  // Decoder compacto (1 línea)
  const decoder = `local ${dec}=function(t,k)local r={}for i=1,#t do r[i]=string.char(bit32.bxor(t[i],string.byte(k,(i-1)%#k+1)))end return table.concat(r)end `;

  const rebuilt = [];
  for (let i = 0; i < strings.length; i++) {
    const raw = strings[i];

    // No tocar long strings ni URLs/assets
    if (raw.startsWith("[") || raw.length < 4) {
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
      content.length > 2800 ||
      /^rbxassetid:\/\//i.test(content) ||
      /^https?:\/\//i.test(content) ||
      /sirius\.menu/i.test(content) ||
      /raw\.githubusercontent/i.test(content)
    ) {
      rebuilt.push(raw);
      continue;
    }

    const bytes = [];
    for (let j = 0; j < content.length; j++) {
      bytes.push(content.charCodeAt(j) ^ keyBytes[j % keyBytes.length]);
    }
    rebuilt.push(`${dec}({${bytes.join(",")}},"${key}")`);
  }

  let out = code;
  for (let i = strings.length - 1; i >= 0; i--) {
    out = out.split(`___S${i}___`).join(rebuilt[i]);
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
  if (code.length > 900000) throw new Error("Script demasiado grande (máx ~900KB)");

  // 1. Extraer strings
  const { code: withoutStrings, strings } = extractStrings(code);

  // 2. Quitar comentarios
  let processed = stripComments(withoutStrings);

  // 3. Renombrar variables
  processed = renameLocals(processed);

  // 4. Cifrar strings (esto es lo que dificulta desofuscar)
  processed = protectStrings(processed, strings);

  // 5. Todo a 1 línea
  processed = toOneLine(processed);

  // Resultado final
  return "-- Protect by QyrexObf\n" + processed;
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
  res.json({ ok: true, name: "QyrexObf", mode: "strong-stable" });
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
