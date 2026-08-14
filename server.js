/**
 * QyrexObf - Ultra Clean (máxima compatibilidad)
 * Prioridad: que NO dé errores
 */
const express = require("express");
const path = require("path");
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

function makeName(n) {
  const chars = "abcdefghijkmnopqrstuvwxyz";
  let s = "_";
  for (let i = 0; i < 6; i++) {
    s += chars[(Math.random() * chars.length) | 0];
  }
  return s + n;
}

function stripComments(code) {
  let result = "";
  let i = 0;
  while (i < code.length) {
    // --[[ ... ]]
    if (code[i] === "-" && code[i+1] === "-" && code[i+2] === "[") {
      let m = i + 3;
      let eqs = "";
      while (m < code.length && code[m] === "=") {
        eqs += "=";
        m++;
      }
      if (code[m] === "[") {
        const end = "]" + eqs + "]";
        const idx = code.indexOf(end, m + 1);
        if (idx !== -1) {
          i = idx + end.length;
          continue;
        }
      }
    }
    // -- comentario normal
    if (code[i] === "-" && code[i+1] === "-") {
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
  let id = 0;

  // local x
  let re = /\blocal\s+([A-Za-z_][A-Za-z0-9_]*)/g;
  let m;
  while ((m = re.exec(code)) !== null) {
    const name = m[1];
    if (!RESERVED.has(name) && !map.has(name) && name.length > 1) {
      id++;
      map.set(name, makeName(id));
    }
  }

  // local a, b, c
  re = /\blocal\s+([A-Za-z_][A-Za-z0-9_]*(?:\s*,\s*[A-Za-z_][A-Za-z0-9_]*)+)/g;
  while ((m = re.exec(code)) !== null) {
    const parts = m[1].split(/\s*,\s*/);
    for (const name of parts) {
      if (!RESERVED.has(name) && !map.has(name) && name.length > 1) {
        id++;
        map.set(name, makeName(id));
      }
    }
  }

  // Reemplazar de más largo a más corto (importante)
  const sorted = [...map.entries()].sort((a, b) => b[0].length - a[0].length);
  let result = code;
  for (const [oldName, newName] of sorted) {
    const regex = new RegExp("\\b" + oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "g");
    result = result.replace(regex, newName);
  }
  return result;
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

  if (code.length > 950000) {
    throw new Error("Script demasiado grande");
  }

  // 1. Quitar comentarios
  code = stripComments(code);

  // 2. Renombrar variables (solo esto)
  code = renameLocals(code);

  // 3. Una sola línea
  code = toOneLine(code);

  // Resultado limpio
  return "-- Protect by QyrexObf\n" + code;
}

// ========== RUTAS ==========
app.post("/api/obfuscate", (req, res) => {
  try {
    const code = req.body && req.body.code;

    if (typeof code !== "string" || !code.trim()) {
      return res.status(400).json({ error: "No se recibió ningún script." });
    }

    console.log("[QyrexObf] size =", code.length);

    const result = obfuscate(code);

    res.json({
      success: true,
      code: result,
      originalSize: code.length,
      outputSize: result.length
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Error" });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, name: "QyrexObf Clean" });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use(express.static(path.join(__dirname, "public")));

module.exports = app;

if (require.main === module) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log("QyrexObf Clean corriendo en puerto " + PORT);
  });
}
