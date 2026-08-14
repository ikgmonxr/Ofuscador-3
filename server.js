function obfuscate(source, options = {}) {
  const code = String(source || "").trim();
  if (!code) throw new Error("Script vacío");

  const tokens = tokenize(code);
  const encryptStrings = options.encryptStrings !== false;

  // 1. Detectar nombres declarados con local
  const renameMap = new Map();
  let counter = 0;

  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type === "keyword" && tokens[i].value === "local") {
      let j = i + 1;
      while (j < tokens.length) {
        if (tokens[j].type === "identifier") {
          const name = tokens[j].value;
          if (name.length > 1 && !renameMap.has(name)) {
            counter++;
            renameMap.set(name, makeLocalName(counter));
          }
          j++;
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

  // 2. Aplicar rename SOLO si NO es una propiedad (no viene después de . o :)
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === "identifier" && renameMap.has(t.value)) {
      // Mirar el token anterior
      const prev = i > 0 ? tokens[i - 1] : null;
      const isProperty =
        prev &&
        prev.type === "symbol" &&
        (prev.value === "." || prev.value === ":");

      if (!isProperty) {
        t.value = renameMap.get(t.value);
      }
    }
  }

  // 3. Cifrado de strings (seguro)
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
    hash: crypto.createHash("sha256").update(result).digest("hex").slice(0, 12)
  };
}
