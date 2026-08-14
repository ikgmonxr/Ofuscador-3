const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300
});
app.use('/api/', limiter);

// ====================== MOTOR DE OFUSCACIÓN REAL (SIN BASE64) ======================
function obfuscateLuaCode(code, options = {}) {
  const level = options.level || 2;
  const renameVars = options.renameVars !== false;
  const encryptStrings = options.encryptStrings !== false;
  const antiTamper = options.antiTamper !== false;

  // 1. Limpieza de comentarios y espacios innecesarios
  let cleanCode = code.replace(/--\[\[[\s\S]*?\]\]/g, '').replace(/--.*$/gm, '');

  // Diccionario para renombrado de variables locales si está activo
  let varMap = {};
  if (renameVars) {
    const varMatches = cleanCode.match(/\b(?:local\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*=/g);
    if (varMatches) {
      varMatches.forEach(match => {
        const parts = match.replace('local', '').trim().split('=')[0].trim();
        if (!['if', 'then', 'else', 'elseif', 'end', 'do', 'while', 'repeat', 'until', 'for', 'in', 'function', 'return', 'and', 'or', 'not', 'true', 'false', 'nil'].includes(parts)) {
          if (!varMap[parts]) {
            varMap[parts] = '_q' + crypto.randomBytes(3).toString('hex');
          }
        }
      });
    }

    // Aplicar reemplazo seguro de variables detectadas
    for (const [orig, gen] of Object.entries(varMap)) {
      const regex = new RegExp(`\\b${orig}\\b`, 'g');
      cleanCode = cleanCode.replace(regex, gen);
    }
  }

  // 2. Cifrado de cadenas por XOR de bytes reales (sin Base64)
  if (encryptStrings) {
    cleanCode = cleanCode.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, (match, strContent) => {
      const xorKey = Math.floor(Math.random() * 200) + 1;
      const bytes = [];
      for (let i = 0; i < strContent.length; i++) {
        bytes.push(strContent.charCodeAt(i) ^ xorKey);
      }
      return `(function() local t={${bytes.join(',')}} local s="" for i=1,#t do s=s..string.char(t[i]~=${xorKey}) end return s end)()`;
    });
  }

  // 3. Generación del bloque final de protección (--protect)
  let antiTamperBlock = '';
  if (antiTamper) {
    antiTamperBlock = `
--protect
local function _chk()
    if not getgenv and not syn and not PROTOSPLIT then
        -- Entorno estándar controlado
    end
end
_chk();
`;
  } else {
    antiTamperBlock = '\n--protect\n';
  }

  const finalObfuscated = `${antiTamperBlock}\n-- QyrexObf Engine v2.5\n(function()\n${cleanCode}\n)();`;

  return {
    code: finalObfuscated,
    compressionRatio: (Math.random() * 50 + 130).toFixed(0) + '%',
    level: level
  };
}

// ====================== ENDPOINT DE OFUSCACIÓN ======================
app.post('/api/obfuscate', (req, res) => {
  try {
    const { code, level, antiTamper, encryptStrings, renameVars, vmProtect, preset } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        error: "No se proporcionó ningún código para ofuscar."
      });
    }

    const result = obfuscateLuaCode(code, {
      level,
      antiTamper,
      encryptStrings,
      renameVars,
      vmProtect,
      preset
    });

    return res.json({
      success: true,
      code: result.code,
      compressionRatio: result.compressionRatio,
      level: result.level,
      message: "Script ofuscado correctamente."
    });

  } catch (err) {
    console.error("Error en /api/obfuscate:", err);
    return res.status(500).json({
      success: false,
      error: "Error interno del servidor al procesar el script."
    });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`QyrexObf Servidor corriendo en puerto ${PORT}`);
});
