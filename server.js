const express = require("express");
const path = require("path");
const crypto = require("crypto");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "5mb" }));

/* ──────────────────────────────────────────────
   IKGONAVI — Strong Lua / Roblox Obfuscator
   ────────────────────────────────────────────── */

const RESERVED = new Set([
    "and","break","do","else","elseif","end","false","for","function",
    "goto","if","in","local","nil","not","or","repeat","return","then",
    "true","until","while","_G","_ENV","self","game","workspace","script",
    "require","Instance","Enum","Color3","Vector3","CFrame","TweenInfo",
    "task","wait","spawn","delay","tick","time","os","math","string",
    "table","pairs","ipairs","next","type","typeof","print","warn","error",
    "pcall","xpcall","select","unpack","rawget","rawset","rawequal",
    "setmetatable","getmetatable","coroutine","debug","utf8","bit32"
]);

function randomName(len = 8) {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let s = chars[Math.floor(Math.random() * 52)];
    const all = chars + "0123456789";
    for (let i = 1; i < len; i++) {
        s += all[Math.floor(Math.random() * all.length)];
    }
    return s;
}

function randomHexName() {
    return "_" + crypto.randomBytes(4).toString("hex");
}

function xorEncrypt(str, key) {
    const keyBytes = Buffer.from(key, "utf8");
    const out = [];
    for (let i = 0; i < str.length; i++) {
        out.push(str.charCodeAt(i) ^ keyBytes[i % keyBytes.length]);
    }
    return out;
}

function toLuaTable(arr) {
    return "{" + arr.join(",") + "}";
}

function obfuscateNumbers(code) {
    return code.replace(/\b(\d{2,6})\b/g, (match, num) => {
        const n = parseInt(num, 10);
        if (n < 10 || n > 99999) return match;
        const a = Math.floor(Math.random() * 40) + 5;
        const b = n - a;
        if (Math.random() > 0.5) {
            return `(${a}+${b})`;
        }
        return `(${n * 2}//2)`;
    });
}

function injectJunk(code) {
    const junkSnippets = [
        `local ${randomHexName()}=function()return end;`,
        `local ${randomHexName()}=(${Math.floor(Math.random()*90)+10}~=${Math.floor(Math.random()*90)+10});`,
        `do local ${randomHexName()}=nil end;`,
        `local ${randomHexName()}=typeof and typeof or type;`,
        `;(function()end)();`,
    ];
    const lines = code.split("\n");
    const result = [];
    for (const line of lines) {
        result.push(line);
        if (line.trim() && Math.random() > 0.65) {
            result.push(junkSnippets[Math.floor(Math.random() * junkSnippets.length)]);
        }
    }
    return result.join("\n");
}

function renameLocals(code) {
    const variables = new Map();
    let counter = 0;

    const localRegex = /\blocal\s+([A-Za-z_][A-Za-z0-9_]*(?:\s*,\s*[A-Za-z_][A-Za-z0-9_]*)*)/g;
    let match;
    while ((match = localRegex.exec(code)) !== null) {
        const names = match[1].split(/\s*,\s*/);
        for (const name of names) {
            if (!variables.has(name) && !RESERVED.has(name)) {
                counter++;
                const styles = [
                    () => `_0x${counter.toString(16)}${randomName(3)}`,
                    () => `__${randomHexName().slice(1)}`,
                    () => `L${counter.toString(36)}_${randomName(4)}`,
                    () => randomHexName()
                ];
                variables.set(name, styles[Math.floor(Math.random() * styles.length)]());
            }
        }
    }

    for (const [oldName, newName] of variables) {
        const regex = new RegExp(`\\b${oldName}\\b`, "g");
        code = code.replace(regex, newName);
    }
    return code;
}

function protectStrings(code, level) {
    const strings = [];
    code = code.replace(/(["'])(?:\\.|(?!\1)[\s\S])*?\1/g, (match) => {
        const id = strings.length;
        strings.push(match);
        return `___IKG_STR_${id}___`;
    });

    code = code.replace(/--\[=*\[([\s\S]*?)\]=*\]/g, "");
    code = code.replace(/--[^\n]*/g, "");

    if (level >= 2) {
        const key = crypto.randomBytes(6).toString("hex");
        const decoderName = randomHexName();
        const encryptedTables = [];

        strings.forEach((raw, index) => {
            let content = raw.slice(1, -1);
            content = content
                .replace(/\\n/g, "\n")
                .replace(/\\t/g, "\t")
                .replace(/\\r/g, "\r")
                .replace(/\\"/g, '"')
                .replace(/\\'/g, "'")
                .replace(/\\\\/g, "\\");

            const encrypted = xorEncrypt(content, key);
            encryptedTables.push(toLuaTable(encrypted));
            strings[index] = { encrypted: true, tableIndex: index };
        });

        let decoder = `
local ${decoderName}=(function()
local _k="${key}"
local function _d(t)
local r={}
for i=1,#t do
local b=t[i]
local kb=string.byte(_k,(i-1)%#_k+1)
r[i]=string.char(bit32.bxor(b,kb))
end
return table.concat(r)
end
return _d
end)()
`;

        strings.forEach((s, index) => {
            if (s.encrypted) {
                code = code.replace(
                    `___IKG_STR_${index}___`,
                    `${decoderName}(${encryptedTables[index]})`
                );
            }
        });

        return { code, decoder, key };
    }

    strings.forEach((value, index) => {
        code = code.replace(`___IKG_STR_${index}___`, value);
    });
    return { code, decoder: "", key: null };
}

function wrapExtreme(code, decoder) {
    const key = crypto.randomBytes(8).toString("hex");
    const fullSource = (decoder || "") + "\n" + code;
    const encrypted = xorEncrypt(fullSource, key);
    const table = toLuaTable(encrypted);
    const loaderName = randomHexName();
    const keyName = randomHexName();
    const dataName = randomHexName();

    return `--[[ IKGONAVI EXTREME • ROBLOX HARDENED ]]
local ${keyName}="${key}"
local ${dataName}=${table}
local ${loaderName}=(function()
local function _xor(t,k)
local o={}
for i=1,#t do
o[i]=string.char(bit32.bxor(t[i],string.byte(k,(i-1)%#k+1)))
end
return table.concat(o)
end
local src=_xor(${dataName},${keyName})
local fn,err=loadstring(src)
if not fn then error("IKG integrity fail") end
return fn()
end)()
`;
}

function obfuscateLua(source, level) {
    let code = source.trim();

    const { code: afterStrings, decoder } = protectStrings(code, level);
    code = afterStrings;

    if (level >= 1) {
        code = renameLocals(code);
    }

    if (level >= 2) {
        code = obfuscateNumbers(code);
    }

    if (level >= 2) {
        code = injectJunk(code);
    }

    code = code
        .replace(/[ \t]+/g, " ")
        .replace(/\n\s*\n+/g, "\n")
        .replace(/^\s+/gm, "")
        .trim();

    if (level === 1) {
        code = `-- IKGONAVI BASIC\n${code}`;
    } else if (level === 2) {
        code = `-- IKGONAVI ADVANCED • STRINGS ENCRYPTED\n${decoder}\n${code}`;
    } else if (level >= 3) {
        code = wrapExtreme(code, decoder);
    }

    return code;
}

/* ──────────────────────────────────────────────
   Routes
   ────────────────────────────────────────────── */

app.post("/api/obfuscate", (req, res) => {
    try {
        const { code, level } = req.body;

        if (typeof code !== "string" || !code.trim()) {
            return res.status(400).json({
                error: "No se recibió ningún script Lua."
            });
        }

        if (code.length > 400000) {
            return res.status(400).json({
                error: "Script demasiado grande (máx ~400k caracteres)."
            });
        }

        const selectedLevel = Math.max(1, Math.min(3, Number(level) || 1));
        const result = obfuscateLua(code, selectedLevel);

        res.json({
            success: true,
            code: result,
            originalSize: code.length,
            outputSize: result.length,
            level: selectedLevel
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: "Error interno al ofuscar."
        });
    }
});

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, "0.0.0.0", () => {
    console.log(`IKGONAVI Obfuscator running on port ${PORT}`);
});
