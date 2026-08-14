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

// Aumentamos los límites a 100mb para asegurar que scripts gigantes no den error de payload
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

app.use(express.static(path.join(__dirname, 'public')));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500 // Subimos un poco el límite por las peticiones de Roblox
});
app.use('/api/', limiter);

// ====================== DATA ======================
function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      const initial = {
        scripts: [],
        keys: [],
        visits: [],
        totalVisits: 0
      };
      fs.writeFileSync(DATA_FILE, JSON.stringify(initial));
      return initial;
    }
    const fileContent = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(fileContent);
  } catch (err) {
    console.error("Error al leer data.json:", err);
    return { scripts: [], keys: [], visits: [], totalVisits: 0 };
  }
}

function saveData(data) {
  try {
    // Usamos stringify sin espacios (null, 2) si el archivo pesa mucho para ahorrar espacio y evitar lag
    fs.writeFileSync(DATA_FILE, JSON.stringify(data));
  } catch (err) {
    console.error("Error al guardar data.json:", err);
  }
}

// ====================== API DE SCRIPTS (protegida) ======================
function isBrowser(req) {
  const ua = (req.headers['user-agent'] || '').toLowerCase();
  return ua.includes('mozilla') || ua.includes('chrome') || ua.includes('safari') || ua.includes('firefox') || ua.includes('edge');
}

app.get('/api/script/:id', (req, res) => {
  // Bloquear navegadores
  if (isBrowser(req)) {
    return res.status(403).json({
      error: "Endpoint bloqueado",
      message: "Este endpoint solo puede ser usado por ejecutores autorizados. QyrexApi"
    });
  }

  const data = loadData();
  const script = data.scripts.find(s => s.id === req.params.id);
  if (!script) return res.status(404).json({ error: "Script no encontrado" });

  const key = req.headers['x-api-key'] || req.query.key;
  if (!key || !data.keys.find(k => k.key === key && k.active)) {
    return res.status(401).json({ error: "API Key inválida o expirada" });
  }

  // Contar visita de forma segura
  script.visits = (script.visits || 0) + 1;
  data.totalVisits = (data.totalVisits || 0) + 1;
  data.visits.push({
    scriptId: script.id,
    time: new Date().toISOString(),
    key: key.slice(0, 8) + "..."
  });
  if (data.visits.length > 200) data.visits = data.visits.slice(-200); // Reducido para evitar saturar el JSON
  saveData(data);

  // Enviar texto plano optimizado para Roblox
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(script.code);
});

// ====================== DASHBOARD - SCRIPTS ======================
app.get('/api/admin/scripts', (req, res) => {
  const data = loadData();
  res.json(data.scripts);
});

app.post('/api/admin/scripts', (req, res) => {
  const data = loadData();
  const id = crypto.randomBytes(4).toString('hex');
  const newScript = {
    id,
    name: req.body.name || "Nuevo Script",
    description: req.body.description || "",
    code: req.body.code || "",
    visits: 0,
    createdAt: new Date().toISOString()
  };
  data.scripts.push(newScript);
  saveData(data);
  res.json(newScript);
});

app.put('/api/admin/scripts/:id', (req, res) => {
  const data = loadData();
  const script = data.scripts.find(s => s.id === req.params.id);
  if (!script) return res.status(404).json({ error: "No encontrado" });

  script.name = req.body.name ?? script.name;
  script.description = req.body.description ?? script.description;
  script.code = req.body.code ?? script.code;
  saveData(data);
  res.json(script);
});

app.delete('/api/admin/scripts/:id', (req, res) => {
  const data = loadData();
  data.scripts = data.scripts.filter(s => s.id !== req.params.id);
  saveData(data);
  res.json({ success: true });
});

// ====================== KEYS ======================
app.get('/api/admin/keys', (req, res) => {
  const data = loadData();
  res.json(data.keys);
});

app.post('/api/admin/keys', (req, res) => {
  const data = loadData();
  const key = "QYREXAPI-" + crypto.randomBytes(8).toString('hex').toUpperCase();
  const newKey = {
    key,
    active: true,
    createdAt: new Date().toISOString(),
    note: req.body.note || "Generada desde QyrexApi"
  };
  data.keys.push(newKey);
  saveData(data);
  res.json(newKey);
});

app.delete('/api/admin/keys/:key', (req, res) => {
  const data = loadData();
  data.keys = data.keys.filter(k => k.key !== req.params.key);
  saveData(data);
  res.json({ success: true });
});

// ====================== STATS ======================
app.get('/api/admin/stats', (req, res) => {
  const data = loadData();
  res.json({
    totalScripts: data.scripts.length,
    totalKeys: data.keys.length,
    activeKeys: data.keys.filter(k => k.active).length,
    totalVisits: data.totalVisits || 0,
    recentVisits: data.visits.slice(-30).reverse()
  });
});

// ====================== FRONTEND ======================
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`QyrexApi corriendo en puerto ${PORT}`);
});
