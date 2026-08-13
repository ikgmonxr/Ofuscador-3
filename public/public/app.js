const input = document.getElementById("input");
const output = document.getElementById("output");
const level = document.getElementById("level");
const obfuscate = document.getElementById("obfuscate");
const copy = document.getElementById("copy");

obfuscate.addEventListener("click", async () => {

    if (!input.value.trim()) {
        alert("Pega un script Lua primero.");
        return;
    }

    obfuscate.disabled = true;
    obfuscate.textContent = "OBFUSCATING...";

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
            throw new Error(data.error || "Error");
        }

        output.value = data.code;

    } catch (error) {
        alert(error.message);
    }

    obfuscate.disabled = false;
    obfuscate.textContent = "OBFUSCATE";
});

copy.addEventListener("click", async () => {

    if (!output.value) return;

    await navigator.clipboard.writeText(output.value);

    copy.textContent = "COPIED!";

    setTimeout(() => {
        copy.textContent = "COPIAR";
    }, 1200);
});
