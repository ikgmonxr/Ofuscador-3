"use strict";

const inputCode =
    document.getElementById(
        "inputCode"
    );

const outputCode =
    document.getElementById(
        "outputCode"
    );

const protectBtn =
    document.getElementById(
        "protectBtn"
    );

const protectText =
    document.getElementById(
        "protectText"
    );

const spinner =
    document.getElementById(
        "spinner"
    );

const clearBtn =
    document.getElementById(
        "clearBtn"
    );

const copyBtn =
    document.getElementById(
        "copyBtn"
    );

const inputSize =
    document.getElementById(
        "inputSize"
    );

const outputSize =
    document.getElementById(
        "outputSize"
    );

const message =
    document.getElementById(
        "message"
    );

const status =
    document.getElementById(
        "status"
    );

const levelButtons =
    document.querySelectorAll(
        ".level"
    );

let selectedLevel = 1;


/* =========================================================
   HELPERS
   ========================================================= */

function updateSize() {
    inputSize.textContent =
        `${inputCode.value.length.toLocaleString()} caracteres`;

    outputSize.textContent =
        `${outputCode.value.length.toLocaleString()} caracteres`;
}

function setMessage(
    text,
    type = ""
) {
    message.textContent = text;

    message.className =
        "message " + type;
}

function setLoading(
    loading
) {
    protectBtn.disabled =
        loading;

    spinner.classList.toggle(
        "hidden",
        !loading
    );

    protectText.textContent =
        loading
            ? "PROCESANDO..."
            : "PROTEGER";
}


/* =========================================================
   LEVEL SELECTOR
   ========================================================= */

levelButtons.forEach(
    button => {
        button.addEventListener(
            "click",
            () => {
                levelButtons.forEach(
                    item =>
                        item.classList.remove(
                            "active"
                        )
                );

                button.classList.add(
                    "active"
                );

                selectedLevel =
                    Number(
                        button.dataset.level
                    );

                setMessage("");
            }
        );
    }
);


/* =========================================================
   INPUT
   ========================================================= */

inputCode.addEventListener(
    "input",
    updateSize
);


/* =========================================================
   CLEAR
   ========================================================= */

clearBtn.addEventListener(
    "click",
    () => {
        inputCode.value = "";
        outputCode.value = "";

        updateSize();

        setMessage("");

        inputCode.focus();
    }
);


/* =========================================================
   COPY
   ========================================================= */

copyBtn.addEventListener(
    "click",
    async () => {
        const text =
            outputCode.value;

        if (!text) {
            setMessage(
                "No hay código para copiar.",
                "error"
            );

            return;
        }

        try {
            await navigator.clipboard.writeText(
                text
            );

            setMessage(
                "Código copiado.",
                "success"
            );

            setTimeout(
                () => setMessage(""),
                1800
            );
        } catch {
            outputCode.focus();
            outputCode.select();

            document.execCommand(
                "copy"
            );

            setMessage(
                "Código copiado.",
                "success"
            );
        }
    }
);


/* =========================================================
   PROTECT
   ========================================================= */

protectBtn.addEventListener(
    "click",
    async () => {
        const code =
            inputCode.value;

        if (!code.trim()) {
            setMessage(
                "Pega un script Lua/Luau primero.",
                "error"
            );

            inputCode.focus();

            return;
        }

        setLoading(true);

        setMessage(
            "Procesando..."
        );

        try {
            const response =
                await fetch(
                    "/api/obfuscate",
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body:
                            JSON.stringify({
                                code,
                                level:
                                    selectedLevel
                            })
                    }
                );

            let data;

            try {
                data =
                    await response.json();
            } catch {
                throw new Error(
                    "El servidor devolvió una respuesta inválida."
                );
            }

            if (
                !response.ok ||
                !data.success
            ) {
                throw new Error(
                    data.error ||
                    "No se pudo proteger el código."
                );
            }

            outputCode.value =
                data.code || "";

            updateSize();

            setMessage(
                `Protegido correctamente · nivel ${data.level}`,
                "success"
            );

        } catch (error) {
            console.error(
                error
            );

            setMessage(
                error.message ||
                "Error de conexión.",
                "error"
            );

        } finally {
            setLoading(false);
        }
    }
);


/* =========================================================
   HEALTH CHECK
   ========================================================= */

async function checkServer() {
    try {
        const response =
            await fetch(
                "/api/health",
                {
                    cache: "no-store"
                }
            );

        if (!response.ok) {
            throw new Error();
        }

        const data =
            await response.json();

        if (data.ok) {
            status.innerHTML =
                `
                <span class="status-dot"></span>
                ONLINE
                `;

            return;
        }

        throw new Error();

    } catch {
        status.innerHTML =
            `
            <span
                class="status-dot"
                style="
                    background:#ff6969;
                    box-shadow:0 0 10px rgba(255,105,105,.6)
                "
            ></span>
            OFFLINE
            `;
    }
}


/* =========================================================
   TAB KEY
   ========================================================= */

inputCode.addEventListener(
    "keydown",
    event => {
        if (
            event.key === "Tab"
        ) {
            event.preventDefault();

            const start =
                inputCode.selectionStart;

            const end =
                inputCode.selectionEnd;

            inputCode.value =
                inputCode.value.slice(
                    0,
                    start
                ) +
                "    " +
                inputCode.value.slice(
                    end
                );

            inputCode.selectionStart =
                inputCode.selectionEnd =
                    start + 4;

            updateSize();
        }
    }
);


/* =========================================================
   INITIAL
   ========================================================= */

updateSize();

checkServer();
