const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "5mb" }));

function obfuscateLua(source, level) {
    let code = source;

    // Guardar strings para evitar modificarlos accidentalmente
    const strings = [];

    code = code.replace(
        /(["'])(?:\\.|(?!\1)[\s\S])*?\1/g,
        (match) => {
            const id = strings.length;
            strings.push(match);
            return `___IKG_STRING_${id}___`;
        }
    );

    // Quitar comentarios simples
    code = code.replace(/--(?!\[=*\[).*$/gm, "");

    // Renombrar variables declaradas como local
    if (level >= 1) {
        const variables = new Map();
        let counter = 0;

        const localRegex =
            /\blocal\s+([A-Za-z_][A-Za-z0-9_]*)/g;

        let match;

        while ((match = localRegex.exec(code)) !== null) {
            const name = match[1];

            if (
                !variables.has(name) &&
                ![
                    "game",
                    "workspace",
                    "script",
                    "require"
                ].includes(name)
            ) {
                counter++;
                variables.set(
                    name,
                    `_Ikg${counter.toString(36)}`
                );
            }
        }

        for (const [oldName, newName] of variables) {
            const regex = new RegExp(
                `\\b${oldName}\\b`,
                "g"
            );

            code = code.replace(regex, newName);
        }
    }

    // Compactar
    code = code
        .replace(/[ \t]+/g, " ")
        .replace(/\n\s*\n/g, "\n")
        .trim();

    // Restaurar strings
    strings.forEach((value, index) => {
        code = code.replace(
            `___IKG_STRING_${index}___`,
            value
        );
    });

    // Nivel Advanced
    if (level >= 2) {
        code =
`-- IKGONAVI PROTECTED
-- Level: ADVANCED

${code}`;
    }

    // Nivel Extreme
    if (level >= 3) {
        code =
`-- IKGONAVI EXTREME PROTECTION

local __IKG_A = 0x17
local __IKG_B = 0x2A
local __IKG_C = (__IKG_A * 7) + __IKG_B

${code}`;
    }

    return code;
}

app.post("/api/obfuscate", (req, res) => {
    try {
        const { code, level } = req.body;

        if (
            typeof code !== "string" ||
            !code.trim()
        ) {
            return res.status(400).json({
                error: "No se recibió ningún script Lua."
            });
        }

        const selectedLevel = Math.max(
            1,
            Math.min(3, Number(level) || 1)
        );

        const result = obfuscateLua(
            code,
            selectedLevel
        );

        res.json({
            success: true,
            code: result,
            originalSize: code.length,
            outputSize: result.length
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: "Error interno al ofuscar."
        });
    }
});

// Servir la página
app.get("/", (req, res) => {
    res.sendFile(
        path.join(__dirname, "public", "index.html")
    );
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(
        `IKGONAVI Obfuscator running on port ${PORT}`
    );
});
