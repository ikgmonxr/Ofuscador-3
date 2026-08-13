const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

function obfuscateLua(source, level) {
    let code = source;

    // Eliminar comentarios simples
    code = code.replace(/--(?!\[\[).*$/gm, "");

    // Renombrar variables locales
    const names = {};
    let counter = 0;

    code = code.replace(
        /\blocal\s+([A-Za-z_][A-Za-z0-9_]*)/g,
        (match, name) => {
            if (!names[name]) {
                counter++;
                names[name] = `_v${counter.toString(36)}`;
            }

            return `local ${names[name]}`;
        }
    );

    for (const [oldName, newName] of Object.entries(names)) {
        code = code.replace(
            new RegExp(`\\b${oldName}\\b`, "g"),
            newName
        );
    }

    // Ocultar algunas cadenas
    if (level >= 2) {
        code = code.replace(/(["'])(.*?)\1/g, (_, quote, text) => {
            if (!text.length) return `""`;

            const bytes = [...text]
                .map(c => c.charCodeAt(0))
                .join(",");

            return `string.char(${bytes})`;
        });
    }

    // Compactación
    code = code
        .replace(/\s+/g, " ")
        .replace(/\s*([=(),{};])\s*/g, "$1")
        .trim();

    // Capa adicional sencilla
    if (level >= 3) {
        const encoded = Buffer.from(code).toString("base64");

        return `-- Protected Lua
local __data="${encoded}"
local __chars="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

local function __decode(data)
    local out={}
    local buffer=0
    local bits=0

    for i=1,#data do
        local c=data:sub(i,i)
        local p=__chars:find(c,1,true)

        if p then
            buffer=buffer*64+(p-1)
            bits=bits+6

            if bits>=8 then
                bits=bits-8
                local b=math.floor(buffer/(2^bits))%256
                out[#out+1]=string.char(b)
            end
        end
    end

    return table.concat(out)
end

local __source=__decode(__data)

local __load=loadstring or load
local __fn=__load(__source)

if __fn then
    return __fn()
end`;
    }

    return code;
}

app.post("/api/obfuscate", (req, res) => {
    try {
        const { code, level } = req.body;

        if (!code || typeof code !== "string") {
            return res.status(400).json({
                error: "Código Lua inválido."
            });
        }

        const selectedLevel = Math.min(
            3,
            Math.max(1, Number(level) || 1)
        );

        const result = obfuscateLua(code, selectedLevel);

        res.json({
            success: true,
            code: result
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: "Error procesando el script."
        });
    }
});

app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
    console.log(`Lua Obfuscator running on port ${PORT}`);
});
