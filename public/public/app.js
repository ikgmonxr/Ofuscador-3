const express = require('express');
const expressWs = require('express-ws');
const path = require('path');
const cors = require('cors');

const app = express();
expressWs(app);

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Servir la carpeta web
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// MOTOR DE OFUSCACIÓN EN EL SERVIDOR
// ==========================================
function obfuscateLua(code) {
    if (!code || code.trim() === '') return '';

    // Convertir código Lua a bytes encodeados en Hexadecimal
    const bytes = Array.from(Buffer.from(code, 'utf-8'));
    const hexArray = bytes.map(b => `\\x${b.toString(16).padStart(2, '0')}`).join('');
    
    // Generación de variables aleatorias estilo Lua
    const var1 = "_" + Math.random().toString(36).substring(2, 9);
    const var2 = "_" + Math.random().toString(36).substring(2, 9);
    const var3 = "_" + Math.random().toString(36).substring(2, 9);

    // Template del cargador y desempaquetador dinámico Lua
    const obfuscatedTemplate = `--[[
    [ OBFUSCATED BY IKGOFORGE BUILDER ]
    Protected Lua Script - Authorized Executions Only
--]]
local ${var1} = "${hexArray}"
local ${var2} = {}
for ${var3} in ${var1}:gmatch("\\x(%x%x)") do
    table.insert(${var2}, string.char(tonumber(${var3}, 16)))
end
local _exec = loadstring or load
_exec(table.concat(${var2}))()`;

    return obfuscatedTemplate;
}

// Endpoint para recibir el código y devolverlo ofuscado
app.post('/api/obfuscate', (req, res) => {
    try {
        const { code } = req.body;
        if (!code) {
            return res.status(400).json({ error: 'No se envió código para ofuscar.' });
        }

        const obfuscated = obfuscateLua(code);
        return res.json({ success: true, result: obfuscated });
    } catch (err) {
        return res.status(500).json({ error: 'Error interno al procesar el script.' });
    }
});

// Inicialización
app.listen(PORT, () => {
    console.log(`=================================`);
    console.log(`🚀 Servidor ejecutándose en: http://localhost:${PORT}`);
    console.log(`=================================`);
});
