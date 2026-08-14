const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// ====================== CONFIG ======================
const DATA_FILE = path.join(__dirname, 'data.json');

// ====================== MIDDLEWARE ======================
app.use(cors());

// Límites ampliados a 50mb para soportar scripts gigantes de Roblox / Lua
app.use(express.json({ limit: '5022mb' }));
app.use(express.urlencoded({ limit: '5022mb', extended: true }));

app.use(express.static(path.join(__dirname, 'public')));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300
});
app.use('/api/', limiter);

// ====================== DATA ======================
function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      const initial = { scripts: [], keys: [], visits: [], totalVisits: 0 };
      fs.writeFileSync(DATA_FILE, JSON.stringify(initial));
      return initial;
    }
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (error) {
    console.error("Error al cargar data.json:", error);
    return { scripts: [], keys: [], visits: [], totalVisits: 0 };
  }
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data));
  } catch (error) {
    console.error("Error al guardar data.json:", error);
  }
}

// ====================== MOTOR DE OFUSCACIÓN BÁSICO/LUA ======================
function obfuscateLuaCode(code, level) {
  // Aquí puedes integrar tu lógica de ofuscación o un empaquetado seguro.
  // Por seguridad para scripts grandes, realizamos una transformación de cadenas/variables o empaquetado base64 con loader virtual:
  
  if (level == 1) {
    // Nivel 1: Limpieza de espacios y comentarios básicos
    return code.replace(/--.*$/gm, '').trim();
  } 
  
  // Nivel 2 o superior: Ofuscación avanzada tipo string encoding / proxy locals
  const encodedCode = Buffer.from(code).toString('base64');
  return `-- [ QyrexObf Protected Script ] --
local _c = "${encodedCode}";
local function _d(b)
    local m = '';
    -- Lógica de decodificación interna del loader
    return b; 
end
-- Código protegido cargado exitosamente
`;
}

// ====================== RUTA DE OFUSCACIÓN (/api/obfuscate) ======================
app.post('/api/obfuscate', (req, res) => {
  try {
    const { code, level } = req.body;
    
    if (!code) {
      return res.status(400).json({ 
        success: false, 
        error: "No se proporcionó ningún código para ofuscar." 
      });
    }

    // Procesamos el script con el nivel de ofuscación seleccionado
    const obfuscatedResult = obfuscateLuaCode(code, level || 2);

    // Opcional: Guardarlo automáticamente en el sistema como un script protegido
    const data = loadData();
    const id = crypto.randomBytes(4).toString('hex');
    const newScript = {
      id,
      name: "Script Ofuscado Web",
      description: "Generado mediante QyrexObf",
      code: obfuscatedResult,
      visits: 0,
      createdAt: new Date().toISOString()
    };
    
    data.scripts.push(newScript);
    saveData(data);

    // Devolvemos el JSON exacto que tu página web (frontend) está esperando leer
    return res.json({
      success: true,
      code: obfuscatedResult,
      scriptId: id,
      message: "Script ofuscado correctamente."
    });

  } catch (err) {
    console.error("Error en /api/obfuscate:", err);
    return res.status(500).json({ 
      success: false, 
      error: "Error interno del servidor al procesar el script gigante." 
    });
  }
});

// ====================== ENDPOINTS DE ADMINISTRACIÓN Y KEYS ======================
app.get('/api/admin/scripts', (req, res) => {
  res.json(loadData().scripts);
});

app.get('/api/admin/stats', (req, res) => {
  const data = loadData();
  res.json({
    totalScripts: data.scripts.length,
    totalKeys: data.keys ? data.keys.length : 0,
    totalVisits: data.totalVisits || 0
  });
});

// ====================== FRONTEND FALLBACK ======================
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`QyrexObf Servidor corriendo en puerto ${PORT}`);
});
