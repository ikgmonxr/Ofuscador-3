const express = require("express");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const MAX_SCRIPT_SIZE = 280000;

app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false, limit: "2mb" }));

function isIdentStart(ch) {
    return !!ch && /[A-Za-z_]/.test(ch);
}

function isIdentPart(ch) {
    return !!ch && /[A-Za-z0-9_]/.test(ch);
}

function isDigit(ch) {
    return !!ch && /[0-9]/.test(ch);
}

function isSpace(ch) {
    return !!ch && /\s/.test(ch);
}

const LUA_KEYWORDS = new Set([
    "and", "break", "do", "else", "elseif", "end",
    "false", "for", "function", "goto", "if", "in",
    "local", "nil", "not", "or", "repeat", "return",
    "then", "true", "until", "while"
]);

function isKeyword(word) {
    return LUA_KEYWORDS.has(word);
}

/*
 * Tokenizador Lua/Luau.
 * Mantiene strings y comentarios separados para evitar
 * modificar accidentalmente su contenido.
 */
function tokenizeLua(source) {
    const tokens = [];
    let i = 0;

    function readLongBracket(start) {
        if (source[start] !== "[") {
            return null;
        }

        let j = start + 1;
        let equals = 0;

        while (source[j] === "=") {
            equals++;
            j++;
        }

        if (source[j] !== "[") {
            return null;
        }

        const close = "]" + "=".repeat(equals) + "]";
        const end = source.indexOf(close, j + 1);

        if (end === -1) {
            return {
                value: source.slice(start),
                end: source.length
            };
        }

        return {
            value: source.slice(start, end + close.length),
            end: end + close.length
        };
    }

    while (i < source.length) {
        const c = source[i];
        const n = source[i + 1];

        /*
         * Whitespace
         */
        if (isSpace(c)) {
            const start = i++;

            while (i < source.length && isSpace(source[i])) {
                i++;
            }

            tokens.push({
                type: "ws",
                value: source.slice(start, i)
            });

            continue;
        }

        /*
         * Comments
         */
        if (c === "-" && n === "-") {
            const long = readLongBracket(i + 2);

            if (long) {
                tokens.push({
                    type: "comment",
                    value: source.slice(i, long.end)
                });

                i = long.end;
                continue;
            }

            const start = i;

            i += 2;

            while (
                i < source.length &&
                source[i] !== "\n" &&
                source[i] !== "\r"
            ) {
                i++;
            }

            tokens.push({
                type: "comment",
                value: source.slice(start, i)
            });

            continue;
        }

        /*
         * Long strings
         */
        if (c === "[") {
            const long = readLongBracket(i);

            if (long) {
                tokens.push({
                    type: "string",
                    value: long.value
                });

                i = long.end;
                continue;
            }
        }

        /*
         * Normal strings
         */
        if (c === "'" || c === '"') {
            const quote = c;
            const start = i++;

            let escaped = false;

            while (i < source.length) {
                const ch = source[i++];

                if (escaped) {
                    escaped = false;
                    continue;
                }

                if (ch === "\\") {
                    escaped = true;
                    continue;
                }

                if (ch === quote) {
                    break;
                }
            }

            tokens.push({
                type: "string",
                value: source.slice(start, i)
            });

            continue;
        }

        /*
         * Identifiers
         */
        if (isIdentStart(c)) {
            const start = i++;

            while (
                i < source.length &&
                isIdentPart(source[i])
            ) {
                i++;
            }

            const value = source.slice(start, i);

            tokens.push({
                type: isKeyword(value)
                    ? "keyword"
                    : "identifier",
                value
            });

            continue;
        }

        /*
         * Numbers
         */
        if (isDigit(c) || (c === "." && isDigit(n))) {
            const start = i++;

            while (i < source.length) {
                const ch = source[i];

                if (/[A-Za-z0-9._]/.test(ch)) {
                    i++;
                    continue;
                }

                if (
                    (ch === "+" || ch === "-") &&
                    /[eEpP]/.test(source[i - 1] || "")
                ) {
                    i++;
                    continue;
                }

                break;
            }

            tokens.push({
                type: "number",
                value: source.slice(start, i)
            });

            continue;
        }

        /*
         * Operadores
         */
        const three = source.slice(i, i + 3);
        const two = source.slice(i, i + 2);

        if (
            three === "..." ||
            two === "==" ||
            two === "~=" ||
            two === "<=" ||
            two === ">=" ||
            two === ".." ||
            two === "::" ||
            two === "->"
        ) {
            tokens.push({
                type: "symbol",
                value: three.length === 3 ? three : two
            });

            i += three.length === 3 ? 3 : 2;
            continue;
        }

        tokens.push({
            type: "symbol",
            value: c
        });

        i++;
    }

    return tokens;
}

/*
 * Elimina comentarios sin tocar strings.
 */
function stripComments(tokens) {
    return tokens
        .filter(token => token.type !== "comment")
        .map(token => token.value)
        .join("");
}

/*
 * Compacta el código.
 */
function normalizeWhitespace(tokens) {
    let output = "";

    for (const token of tokens) {
        if (token.type === "comment") {
            continue;
        }

        if (token.type === "ws") {
            if (/\r?\n/.test(token.value)) {
                output += "\n";
            } else if (
                output &&
                !/[ \n]$/.test(output)
            ) {
                output += " ";
            }

            continue;
        }

        output += token.value;
    }

    return output
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n[ \t]+/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

/*
 * Renombrado conservador de variables locales.
 *
 * No modifica:
 * - strings
 * - comentarios
 * - propiedades obj.foo
 * - globals arbitrarios
 */
function renameLocals(tokens) {
    const reserved = new Set([
        "self",
        "script",
        "game",
        "workspace",
        "shared",
        "_G",
        "_ENV"
    ]);

    const renameMap = new Map();
    let counter = 0;

    function nextName() {
        const alphabet = "abcdefghijklmnopqrstuvwxyz";

        let n = counter++;
        let result = "";

        do {
            result =
                alphabet[n % alphabet.length] +
                result;

            n = Math.floor(n / alphabet.length) - 1;
        } while (n >= 0);

        return "_" + result;
    }

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];

        if (
            token.type !== "keyword" ||
            token.value !== "local"
        ) {
            continue;
        }

        let j = i + 1;

        while (
            j < tokens.length &&
            tokens[j].type === "ws"
        ) {
            j++;
        }

        /*
         * local function foo()
         */
        if (
            tokens[j] &&
            tokens[j].type === "keyword" &&
            tokens[j].value === "function"
        ) {
            j++;

            while (
                j < tokens.length &&
                tokens[j].type === "ws"
            ) {
                j++;
            }

            if (
                tokens[j] &&
                tokens[j].type === "identifier" &&
                !reserved.has(tokens[j].value)
            ) {
                const original = tokens[j].value;

                if (!renameMap.has(original)) {
                    renameMap.set(
                        original,
                        nextName()
                    );
                }
            }

            continue;
        }

        /*
         * local a, b, c = ...
         */
        while (j < tokens.length) {
            while (
                j < tokens.length &&
                tokens[j].type === "ws"
            ) {
                j++;
            }

            const current = tokens[j];

            if (
                !current ||
                current.type !== "identifier"
            ) {
                break;
            }

            if (!reserved.has(current.value)) {
                if (!renameMap.has(current.value)) {
                    renameMap.set(
                        current.value,
                        nextName()
                    );
                }
            }

            j++;

            while (
                j < tokens.length &&
                tokens[j].type === "ws"
            ) {
                j++;
            }

            if (
                !tokens[j] ||
                tokens[j].value !== ","
            ) {
                break;
            }

            j++;
        }
    }

    if (!renameMap.size) {
        return tokens;
    }

    return tokens.map((token, index) => {
        if (token.type !== "identifier") {
            return token;
        }

        const replacement =
            renameMap.get(token.value);

        if (!replacement) {
            return token;
        }

        /*
         * Nunca renombrar:
         * obj.foo
         */
        let previous = index - 1;

        while (
            previous >= 0 &&
            tokens[previous].type === "ws"
        ) {
            previous--;
        }

        if (
            tokens[previous] &&
            tokens[previous].value === "."
        ) {
            return token;
        }

        return {
            ...token,
            value: replacement
        };
    });
}

function randomIdentifier() {
    return "__" +
        crypto.randomBytes(6).toString("hex");
}

function bytesToLuaString(bytes) {
    const chunks = [];

    for (let i = 0; i < bytes.length; i += 32) {
        const part = bytes.subarray(
            i,
            i + 32
        );

        chunks.push(
            part
                .toString("hex")
                .match(/.{1,2}/g)
                .map(hex => "\\x" + hex)
                .join("")
        );
    }

    return chunks.join("");
}

/*
 * Nivel 3:
 * convierte el código a bytes UTF-8 y aplica XOR.
 *
 * Así no se rompe UTF-8.
 */
function buildProtectedLoader(source) {
    const key = crypto.randomBytes(24);

    const input = Buffer.from(
        source,
        "utf8"
    );

    const encrypted = Buffer.alloc(
        input.length
    );

    for (let i = 0; i < input.length; i++) {
        encrypted[i] =
            input[i] ^
            key[i % key.length];
    }

    const keyLua =
        bytesToLuaString(key);

    const dataLua =
        bytesToLuaString(encrypted);

    const keyName = randomIdentifier();
    const dataName = randomIdentifier();
    const decodeName = randomIdentifier();
    const loadName = randomIdentifier();

    return `-- Protected by IKGONAVI
local ${keyName}="${keyLua}"
local ${dataName}="${dataLua}"

local function ${decodeName}(d,k)
    local out={}

    for i=1,#d do
        local a=string.byte(d,i)
        local b=string.byte(
            k,
            ((i-1)%#k)+1
        )

        out[i]=string.char(
            bit32.bxor(a,b)
        )
    end

    return table.concat(out)
end

local ${loadName}=loadstring or load

if type(${loadName})~="function" then
    error(
        "IKG: loadstring/load is not available",
        0
    )
end

local __source=${decodeName}(
    ${dataName},
    ${keyName}
)

local __fn,__err=${loadName}(
    __source
)

if type(__fn)~="function" then
    error(
        "IKG load failed: "..tostring(__err),
        0
    )
end

return __fn()
`;
}

function obfuscateLua(source, level) {
    if (typeof source !== "string") {
        throw new TypeError(
            "El código debe ser texto."
        );
    }

    const tokens =
        tokenizeLua(source);

    let transformed =
        tokens;

    if (level >= 2) {
        transformed =
            renameLocals(transformed);
    }

    const clean =
        normalizeWhitespace(
            transformed
        );

    if (level <= 1) {
        return (
            "-- Protected by IKGONAVI\n" +
            clean
        );
    }

    if (level === 2) {
        return (
            "-- Protected by IKGONAVI\n" +
            clean
        );
    }

    return buildProtectedLoader(
        clean
    );
}

function validateRequestCode(code) {
    if (
        typeof code !== "string" ||
        !code.trim()
    ) {
        return "No se recibió ningún script Lua.";
    }

    if (
        code.length >
        MAX_SCRIPT_SIZE
    ) {
        return (
            "Script demasiado grande. " +
            "Máximo: " +
            MAX_SCRIPT_SIZE +
            " caracteres."
        );
    }

    return null;
}

/*
 * POST /api/obfuscate
 */
app.post(
    "/api/obfuscate",
    (req, res) => {
        try {
            const code =
                req.body?.code;

            const levelRaw =
                Number(
                    req.body?.level ?? 1
                );

            const validationError =
                validateRequestCode(code);

            if (validationError) {
                return res.status(400).json({
                    success: false,
                    error: validationError
                });
            }

            if (
                !Number.isFinite(levelRaw)
            ) {
                return res.status(400).json({
                    success: false,
                    error:
                        "El nivel debe ser " +
                        "un número entre 1 y 3."
                });
            }

            const level =
                Math.max(
                    1,
                    Math.min(
                        3,
                        Math.trunc(levelRaw)
                    )
                );

            const result =
                obfuscateLua(
                    code,
                    level
                );

            return res.json({
                success: true,
                code: result,
                originalSize:
                    Buffer.byteLength(
                        code,
                        "utf8"
                    ),
                outputSize:
                    Buffer.byteLength(
                        result,
                        "utf8"
                    ),
                level
            });

        } catch (error) {
            console.error(
                "[obfuscate]",
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    "Error interno: " +
                    (
                        error?.message ||
                        "unknown"
                    )
            });
        }
    }
);

/*
 * GET /api/health
 */
app.get(
    "/api/health",
    (_req, res) => {
        res.json({
            ok: true,
            version: "v8-stable",
            maxScriptSize:
                MAX_SCRIPT_SIZE
        });
    }
);

/*
 * Página principal
 */
app.get(
    "/",
    (_req, res) => {
        res.sendFile(
            path.join(
                __dirname,
                "public",
                "index.html"
            )
        );
    }
);

/*
 * Archivos públicos
 */
app.use(
    express.static(
        path.join(
            __dirname,
            "public"
        )
    )
);

/*
 * JSON inválido
 */
app.use(
    (err, _req, res, _next) => {
        if (
            err instanceof SyntaxError &&
            "body" in err
        ) {
            return res.status(400).json({
                success: false,
                error: "JSON inválido."
            });
        }

        console.error(
            "[server]",
            err
        );

        return res.status(500).json({
            success: false,
            error:
                "Error interno del servidor."
        });
    }
);

if (require.main === module) {
    app.listen(
        PORT,
        "0.0.0.0",
        () => {
            console.log(
                `IKGONAVI v8 STABLE ` +
                `running on port ${PORT}`
            );
        }
    );
}

module.exports = app;
