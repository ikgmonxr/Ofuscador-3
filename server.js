"use strict";

const express = require("express");
const path = require("path");

const app = express();

const PORT = Number(process.env.PORT) || 3000;
const MAX_CODE_SIZE = 300000;

app.disable("x-powered-by");

app.use(
    express.json({
        limit: "2mb"
    })
);

app.use(
    express.urlencoded({
        extended: false,
        limit: "2mb"
    })
);

/* =========================================================
   LUA / LUAU TOKENIZER
   ========================================================= */

const KEYWORDS = new Set([
    "and",
    "break",
    "do",
    "else",
    "elseif",
    "end",
    "false",
    "for",
    "function",
    "goto",
    "if",
    "in",
    "local",
    "nil",
    "not",
    "or",
    "repeat",
    "return",
    "then",
    "true",
    "until",
    "while"
]);

function isIdentifierStart(char) {
    return !!char && /[A-Za-z_]/.test(char);
}

function isIdentifierPart(char) {
    return !!char && /[A-Za-z0-9_]/.test(char);
}

function isDigit(char) {
    return !!char && /[0-9]/.test(char);
}

function isWhitespace(char) {
    return !!char && /\s/.test(char);
}

/*
 * Lee strings largas:
 *
 * [[ texto ]]
 * [=[ texto ]=]
 * [==[ texto ]==]
 */
function readLongString(source, start) {
    if (source[start] !== "[") {
        return null;
    }

    let i = start + 1;
    let equals = 0;

    while (source[i] === "=") {
        equals++;
        i++;
    }

    if (source[i] !== "[") {
        return null;
    }

    const closing =
        "]" +
        "=".repeat(equals) +
        "]";

    const end =
        source.indexOf(
            closing,
            i + 1
        );

    if (end === -1) {
        return {
            value: source.slice(start),
            end: source.length
        };
    }

    return {
        value: source.slice(
            start,
            end + closing.length
        ),
        end:
            end +
            closing.length
    };
}

/*
 * Tokeniza sin modificar contenido.
 */
function tokenizeLua(source) {
    const tokens = [];

    let i = 0;

    while (i < source.length) {
        const c = source[i];
        const n = source[i + 1];

        /* ---------------------------------------------
           whitespace
        --------------------------------------------- */

        if (isWhitespace(c)) {
            const start = i;

            i++;

            while (
                i < source.length &&
                isWhitespace(source[i])
            ) {
                i++;
            }

            tokens.push({
                type: "whitespace",
                value: source.slice(start, i)
            });

            continue;
        }

        /* ---------------------------------------------
           comments
        --------------------------------------------- */

        if (
            c === "-" &&
            n === "-"
        ) {
            const long =
                readLongString(
                    source,
                    i + 2
                );

            if (long) {
                tokens.push({
                    type: "comment",
                    value:
                        source.slice(
                            i,
                            long.end
                        )
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
                value:
                    source.slice(
                        start,
                        i
                    )
            });

            continue;
        }

        /* ---------------------------------------------
           long strings
        --------------------------------------------- */

        if (c === "[") {
            const long =
                readLongString(
                    source,
                    i
                );

            if (long) {
                tokens.push({
                    type: "string",
                    value: long.value
                });

                i = long.end;

                continue;
            }
        }

        /* ---------------------------------------------
           normal strings
        --------------------------------------------- */

        if (
            c === "'" ||
            c === '"'
        ) {
            const quote = c;
            const start = i;

            i++;

            let escaped = false;

            while (i < source.length) {
                const ch = source[i];

                i++;

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
                value:
                    source.slice(
                        start,
                        i
                    )
            });

            continue;
        }

        /* ---------------------------------------------
           identifiers
        --------------------------------------------- */

        if (isIdentifierStart(c)) {
            const start = i;

            i++;

            while (
                i < source.length &&
                isIdentifierPart(
                    source[i]
                )
            ) {
                i++;
            }

            const value =
                source.slice(
                    start,
                    i
                );

            tokens.push({
                type: KEYWORDS.has(value)
                    ? "keyword"
                    : "identifier",
                value
            });

            continue;
        }

        /* ---------------------------------------------
           numbers
        --------------------------------------------- */

        if (
            isDigit(c) ||
            (
                c === "." &&
                isDigit(n)
            )
        ) {
            const start = i;

            i++;

            while (i < source.length) {
                const ch =
                    source[i];

                if (
                    /[A-Za-z0-9._]/.test(
                        ch
                    )
                ) {
                    i++;
                    continue;
                }

                /*
                 * exponent signs
                 */
                if (
                    (
                        ch === "+" ||
                        ch === "-"
                    ) &&
                    /[eEpP]/.test(
                        source[i - 1] ||
                        ""
                    )
                ) {
                    i++;
                    continue;
                }

                break;
            }

            tokens.push({
                type: "number",
                value:
                    source.slice(
                        start,
                        i
                    )
            });

            continue;
        }

        /* ---------------------------------------------
           multi-character operators
        --------------------------------------------- */

        const three =
            source.slice(
                i,
                i + 3
            );

        const two =
            source.slice(
                i,
                i + 2
            );

        if (three === "...") {
            tokens.push({
                type: "symbol",
                value: "..."
            });

            i += 3;

            continue;
        }

        const twoOperators = new Set([
            "==",
            "~=",
            "<=",
            ">=",
            "..",
            "::",
            "->"
        ]);

        if (
            twoOperators.has(two)
        ) {
            tokens.push({
                type: "symbol",
                value: two
            });

            i += 2;

            continue;
        }

        /* ---------------------------------------------
           single symbol
        --------------------------------------------- */

        tokens.push({
            type: "symbol",
            value: c
        });

        i++;
    }

    return tokens;
}

/* =========================================================
   SAFE MINIFIER
   ========================================================= */

function minifyTokens(tokens) {
    let output = "";

    let previous = null;

    for (const token of tokens) {
        if (
            token.type === "comment"
        ) {
            continue;
        }

        if (
            token.type === "whitespace"
        ) {
            /*
             * No necesitamos conservar
             * espacios alrededor de símbolos.
             *
             * Pero entre dos identificadores/números
             * sí debemos dejar separación.
             */
            const next =
                tokens[
                    tokens.indexOf(token) + 1
                ];

            if (
                previous &&
                next &&
                (
                    (
                        previous.type ===
                        "identifier"
                    ) ||
                    (
                        previous.type ===
                        "keyword"
                    ) ||
                    (
                        previous.type ===
                        "number"
                    )
                ) &&
                (
                    (
                        next.type ===
                        "identifier"
                    ) ||
                    (
                        next.type ===
                        "keyword"
                    ) ||
                    (
                        next.type ===
                        "number"
                    )
                )
            ) {
                output += " ";
            }

            continue;
        }

        output += token.value;

        previous = token;
    }

    return output.trim();
}

/* =========================================================
   SAFE COMMENT REMOVER
   ========================================================= */

function removeComments(source) {
    const tokens =
        tokenizeLua(source);

    return tokens
        .filter(
            token =>
                token.type !==
                "comment"
        )
        .map(
            token =>
                token.value
        )
        .join("");
}

/* =========================================================
   SAFE STRING PRESERVATION
   ========================================================= */

/*
 * Esta función NO cifra ni reconstruye strings.
 *
 * Es intencional:
 * reconstruir strings en runtime puede cambiar:
 *
 * - encoding
 * - escapes
 * - rendimiento
 * - comportamiento de Roblox
 */

function preserveStrings(source) {
    return source;
}

/* =========================================================
   SAFE NUMBER PRESERVATION
   ========================================================= */

/*
 * NO modifica números.
 *
 * El obfuscador anterior cambiaba:
 *
 * 100 -> (107-7)
 *
 * Eso no aporta suficiente protección para justificar
 * el riesgo de alterar expresiones de Luau.
 */

function preserveNumbers(source) {
    return source;
}

/* =========================================================
   SAFE OBFUSCATION
   ========================================================= */

function obfuscateLua(source, level) {
    if (
        typeof source !== "string"
    ) {
        throw new TypeError(
            "El código debe ser texto."
        );
    }

    /*
     * Nivel 1:
     * solamente elimina comentarios.
     */

    let code =
        removeComments(
            source
        );

    /*
     * Nivel 2:
     * preserva exactamente la semántica.
     *
     * No modifica:
     * - locals
     * - globals
     * - propiedades
     * - strings
     * - números
     */

    if (level >= 2) {
        code =
            preserveStrings(
                code
            );

        code =
            preserveNumbers(
                code
            );
    }

    /*
     * Nivel 3:
     * minificación segura.
     *
     * No usa loadstring.
     * No usa RC4.
     * No usa XOR runtime.
     * No cambia el entorno de Roblox.
     */

    if (level >= 3) {
        const tokens =
            tokenizeLua(
                code
            );

        code =
            minifyTokens(
                tokens
            );
    }

    return (
        "-- IKGONAVI PROTECTED\n" +
        code
    );
}

/* =========================================================
   VALIDATION
   ========================================================= */

function validateCode(code) {
    if (
        typeof code !== "string"
    ) {
        return "El código debe ser texto.";
    }

    if (!code.trim()) {
        return "No se recibió ningún script Lua/Luau.";
    }

    if (
        Buffer.byteLength(
            code,
            "utf8"
        ) > MAX_CODE_SIZE
    ) {
        return (
            "El script es demasiado grande. " +
            "Máximo permitido: " +
            MAX_CODE_SIZE +
            " bytes."
        );
    }

    return null;
}

/* =========================================================
   API
   ========================================================= */

app.post(
    "/api/obfuscate",
    (req, res) => {
        try {
            const code =
                req.body?.code;

            const requestedLevel =
                Number(
                    req.body?.level ?? 1
                );

            const validation =
                validateCode(
                    code
                );

            if (validation) {
                return res
                    .status(400)
                    .json({
                        success: false,
                        error: validation
                    });
            }

            if (
                !Number.isFinite(
                    requestedLevel
                )
            ) {
                return res
                    .status(400)
                    .json({
                        success: false,
                        error:
                            "El nivel debe ser 1, 2 o 3."
                    });
            }

            const level =
                Math.max(
                    1,
                    Math.min(
                        3,
                        Math.trunc(
                            requestedLevel
                        )
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
                level,

                originalSize:
                    Buffer.byteLength(
                        code,
                        "utf8"
                    ),

                outputSize:
                    Buffer.byteLength(
                        result,
                        "utf8"
                    )
            });
        } catch (error) {
            console.error(
                "[IKGONAVI]",
                error
            );

            return res
                .status(500)
                .json({
                    success: false,
                    error:
                        "Error interno: " +
                        (
                            error.message ||
                            "unknown"
                        )
                });
        }
    }
);

/* =========================================================
   HEALTH
   ========================================================= */

app.get(
    "/api/health",
    (_req, res) => {
        res.json({
            success: true,
            ok: true,
            name: "IKGONAVI",
            version: "8.0.0",
            status: "online"
        });
    }
);

/* =========================================================
   FRONTEND
   ========================================================= */

const publicDir =
    path.join(
        __dirname,
        "public"
    );

app.use(
    express.static(
        publicDir
    )
);

app.get(
    "/",
    (_req, res) => {
        res.sendFile(
            path.join(
                publicDir,
                "index.html"
            )
        );
    }
);

/* =========================================================
   INVALID JSON
   ========================================================= */

app.use(
    (
        error,
        _req,
        res,
        _next
    ) => {
        if (
            error instanceof
            SyntaxError
        ) {
            return res
                .status(400)
                .json({
                    success: false,
                    error:
                        "JSON inválido."
                });
        }

        console.error(
            error
        );

        return res
            .status(500)
            .json({
                success: false,
                error:
                    "Error interno del servidor."
            });
    }
);

/* =========================================================
   START
   ========================================================= */

if (
    require.main === module
) {
    app.listen(
        PORT,
        "0.0.0.0",
        () => {
            console.log("");
            console.log(
                "================================"
            );
            console.log(
                "        IKGONAVI v8"
            );
            console.log(
                "        SERVER ONLINE"
            );
            console.log(
                "================================"
            );
            console.log(
                "Port: " + PORT
            );
            console.log(
                "API: /api/obfuscate"
            );
            console.log("");
        }
    );
}

module.exports = app;
