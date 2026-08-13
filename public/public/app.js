const input = document.getElementById("input");
const output = document.getElementById("output");

const level = document.getElementById("level");
const button = document.getElementById("obfuscate");

const copy = document.getElementById("copy");
const clear = document.getElementById("clear");

const inputInfo = document.getElementById("inputInfo");
const outputInfo = document.getElementById("outputInfo");
const resultStatus = document.getElementById("resultStatus");

function updateCounters() {
    inputInfo.textContent =
        `${input.value.length.toLocaleString()} characters`;

    outputInfo.textContent =
        `${output.value.length.toLocaleString()} characters`;
}

input.addEventListener("input", updateCounters);

clear.addEventListener("click", () => {
    input.value = "";
    output.value = "";

    resultStatus.textContent = "READY";

    updateCounters();
});

button.addEventListener("click", async () => {

    if (!input.value.trim()) {
        resultStatus.textContent = "NO INPUT";
        input.focus();
        return;
    }

    button.disabled = true;
    button.innerHTML = "<span>◌</span> PROCESSING...";
    resultStatus.textContent = "PROCESSING";

    try {

        const response = await fetch("/api/obfuscate", {
            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                code: input.value,
                level: Number(level.value)
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Server error");
        }

        output.value = data.code;

        resultStatus.textContent = "PROTECTED";

        updateCounters();

    } catch (error) {

        resultStatus.textContent = "ERROR";

        alert(error.message);

    } finally {

        button.disabled = false;
        button.innerHTML = "<span>✦</span> OBFUSCATE";
    }
});

copy.addEventListener("click", async () => {

    if (!output.value) {
        return;
    }

    try {

        await navigator.clipboard.writeText(output.value);

        copy.textContent = "COPIED ✓";

        setTimeout(() => {
            copy.textContent = "COPY";
        }, 1500);

    } catch {
        output.select();
        document.execCommand("copy");
    }
});

updateCounters();
