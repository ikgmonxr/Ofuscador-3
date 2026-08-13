const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "5mb" }));
app.use(express.static(path.join(__dirname, "public")));

function randomName(index) {
    return `_${index.toString(36)}x`;
}

function obfuscateLua(source, level) {
    let code = source;

    // Conservamos strings para no romper código accidentalmente.
    const strings = [];

    code = code.replace(
        /(["'])(?:\\.|(?!\1).)*\1/g,
        match => {
            const id = strings.length;
            strings.push(match);
            return `__STRING_${id}__`;
        }
    );

    // Quitar comentarios de línea.
    code = code.replace(/--(?!\[).*$/gm, "");

    // Renombrar locales.
    if (level >= 1) {
        const variables = new Map();
        let count = 0;

        code = code.replace(
            /\blocal\s+([A-Za-z_][A-Za-z0-9_]*)/g,
            (full, name) => {
                if (!variables.has(name)) {
                    count++;
                    variables.set(name, randomName(count));
                }

                return `local ${variables.get(name)}`;
            }
        );

        for (const [oldName, newName] of variables) {
            const regex = new RegExp(`\\b${oldName}\\b`, "g");
            code = code.replace(regex, newName);
        }
    }

    // Compactar.
    if (level >= 1) {
        code = code
            .replace(/[ \t]+/g, " ")
            .replace(/\n\s*\n/g, "\n")
            .trim();
    }

    // Restaurar strings.
    strings.forEach((value, index) => {
        code = code.replaceAll(`__STRING_${index}__`, value);
    });

    // Capa visual adicional.
    if (level >= 2) {
        const header = `-- IKGONAVI OBFUSCATED
-- Protection level: ${level}
`;

        code = header + code;
    }

    // Inserta una pequeña cantidad de código señuelo.
    if (level >= 3) {
        code =
`-- IKGONAVI EXTREME
local __ikg_a = 17
local __ikg_b = 29
local __ikg_c = (__ikg_a * 3) - (__ikg_b - 4)

${code}`;
    }

    return code;
}

app.post("/api/obfuscate", (req, res) => {
    try {
        const { code, level } = req.body;

        if (typeof code !== "string" || !code.trim()) {
            return res.status(400).json({
                error: "Pega un script Lua primero."
            });
        }

        const selectedLevel = Math.max(
            1,
            Math.min(3, Number(level) || 1)
        );

        const result = obfuscateLua(code, selectedLevel);

        res.json({
            success: true,
            code: result,
            originalSize: code.length,
            outputSize: result.length
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: "No se pudo procesar el script."
        });
    }
});

app.get("*", (_, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
    console.log(`IKGONAVI running on port ${PORT}`);
});
