const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { obfuscate, findLua } = require('./lib/obfuscate');

const app = express();
const PORT = process.env.PORT || 10000;
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true }));
app.use(express.json({ limit: '2mb' }));
app.use('/api/', rateLimit({ windowMs: 60000, max: 20 }));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'QyrexObf', engine: findLua() ? 'prometheus+lua' : 'structured-js', version: '3.0.0' });
});

app.post('/api/obfuscate', (req, res) => {
  try {
    const code = (req.body && (req.body.code || req.body.source)) || '';
    const preset = (req.body && req.body.preset) || 'medium';
    const antiTamper = !(req.body && req.body.antiTamper === false);
    if (!String(code).trim()) return res.status(400).json({ success: false, error: 'code required' });
    const out = obfuscate(code, { preset, antiTamper });
    res.json({
      success: true,
      code: out,
      preset,
      antiTamper,
      brand: 'QyrexObf',
      engine: findLua() ? 'prometheus' : 'structured',
      bytesIn: Buffer.byteLength(String(code)),
      bytesOut: Buffer.byteLength(out)
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message || 'fail' });
  }
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, '0.0.0.0', () => console.log('QyrexObf on', PORT, 'lua=', findLua()));
