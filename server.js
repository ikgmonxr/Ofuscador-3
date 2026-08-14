function obfuscate(source, options = {}) {
  const code = String(source || "").trim();
  if (!code) throw new Error("Script vacío");

  // ========== LISTA DE EXCLUSIÓN ==========
  const NEVER_RENAME = new Set([
    // Keywords Lua
    "and","break","do","else","elseif","end","false","for","function","goto",
    "if","in","local","nil","not","or","repeat","return","then","true","until","while",
    "continue","export","type",

    // Globales / entorno
    "game","workspace","script","plugin","shared","_G","_ENV","self",
    "type","typeof","pairs","ipairs","next","pcall","xpcall","print","warn","error",
    "require","select","unpack","rawget","rawset","rawequal","rawlen",
    "setmetatable","getmetatable","getfenv","setfenv",
    "string","table","math","bit32","coroutine","utf8","os","debug","buffer","vector",
    "tick","wait","spawn","delay","time","task",

    // Servicios y objetos Roblox
    "Players","RunService","UserInputService","TweenService","HttpService",
    "ReplicatedStorage","ServerStorage","ServerScriptService","StarterGui","StarterPack",
    "Lighting","CoreGui","Workspace","Camera","Mouse","Teams","SoundService","Chat",
    "LocalPlayer","Humanoid","HumanoidRootPart","Character","PlayerGui","Backpack",
    "GetService","FindFirstChild","FindFirstChildOfClass","FindFirstChildWhichIsA",
    "WaitForChild","GetChildren","GetDescendants","IsA","Clone","Destroy",
    "Connect","Disconnect","Fire","Invoke","FireServer","InvokeServer",
    "Instance","Enum","Color3","Vector3","Vector2","CFrame","UDim","UDim2",
    "TweenInfo","BrickColor","Ray","Region3","NumberSequence","ColorSequence",
    "NumberRange","PhysicalProperties","Axes","Faces","Rect"
  ]);

  const tokens = tokenize(code);
  const encryptStrings = options.encryptStrings !== false;

  // ========== 1. Detectar solo variables local ==========
  const renameMap = new Map();
  let counter = 0;

  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type === "keyword" && tokens[i].value === "local") {
      let j = i + 1;
      while (j < tokens.length) {
        if (tokens[j].type === "identifier") {
          const name = tokens[j].value;

          // No renombrar si está en la lista de exclusión
          if (
            name.length > 1 &&
            !NEVER_RENAME.has(name) &&
            !renameMap.has(name)
          ) {
            counter++;
            renameMap.set(name, "_l" + counter.toString(36) + crypto.randomBytes(2).toString("hex"));
          }
          j++;

          // local a, b, c
          if (j < tokens.length && tokens[j].type === "symbol" && tokens[j].value === ",") {
            j++;
            continue;
          }
          break;
        } else {
          break;
        }
      }
    }
  }

  // ========== 2. Aplicar rename (IGNORAR si viene después de . o :) ==========
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];

    if (t.type === "identifier" && renameMap.has(t.value)) {
      const prev = i > 0 ? tokens[i - 1] : null;

      // Si el token anterior es "." o ":", es una propiedad → NO renombrar
      const isProperty =
        prev &&
        prev.type === "symbol" &&
        (prev.value === "." || prev.value === ":");

      if (!isProperty) {
        t.value = renameMap.get(t.value);
      }
    }
  }

  // ========== 3. Cifrado de strings (opcional y seguro) ==========
  const key = crypto.randomBytes(3);
  const decName = "_d" + crypto.randomBytes(2).toString("hex");
  const keyArr = [...key].join(",");

  let body = "";
  let prevText = "";

  for (const t of tokens) {
    let cur = t.value;

    if (encryptStrings && t.type === "string") {
      const decoded = decodeShortString(t.value);

      if (
        decoded &&
        decoded.length > 0 &&
        decoded.length <= 220 &&
        !/https?:\/\//i.test(decoded) &&
        !/rbxassetid/i.test(decoded)
      ) {
        const bytes = [...Buffer.from(decoded, "utf8")].map(
          (b, idx) => b ^ key[idx % key.length]
        );
        cur = `${decName}({${bytes.join(",")}})`;
      }
    }

    // Espacio necesario entre palabras
    const needSpace =
      (isWordEnd(prevText) && isWordStart(cur)) ||
      (prevText.endsWith("-") && cur.startsWith("-"));

    if (needSpace) body += " ";
    body += cur;
    prevText = cur;
  }

  const decoder = encryptStrings
    ? `local ${decName}=function(t)local k={${keyArr}}local r={}for i=1,#t do r[i]=string.char(bit32.bxor(t[i],k[(i-1)%#k+1]))end return table.concat(r)end;`
    : "";

  const result = `-- Protect by QyrexObf\n${decoder}${body}`;

  return {
    code: result,
    originalSize: code.length,
    outputSize: result.length,
    hash: require("crypto").createHash("sha256").update(result).digest("hex").slice(0, 12)
  };
}
