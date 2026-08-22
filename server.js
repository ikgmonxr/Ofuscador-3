const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { obfuscate } = require('./lib/obfuscate');

const app = express();
const PORT = process.env.PORT || 10000;

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true }));
app.use(express.json({ limit: '2mb' }));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { success: false, error: 'Rate limit: max 30/min' }
});
app.use('/api/', limiter);

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'QyrexObf', version: '2.0.0' });
});

app.post('/api/obfuscate', (req, res) => {
  try {
    const code = (req.body && (req.body.code || req.body.source)) || '';
    const preset = (req.body && req.body.preset) || 'normal';
    const antiTamper = req.body && req.body.antiTamper === false ? false : true;
    if (!String(code).trim()) {
      return res.status(400).json({ success: false, error: 'code required' });
    }
    const out = obfuscate(code, { preset, antiTamper });
    res.json({
      success: true,
      code: out,
      preset,
      antiTamper,
      brand: 'QyrexObf',
      bytesIn: Buffer.byteLength(String(code)),
      bytesOut: Buffer.byteLength(out)
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message || 'Obfuscation failed' });
  }
});

// Alias compatible with older clients
app.post('/obfuscate', (req, res) => {
  req.url = '/api/obfuscate';
  app._router.handle(req, res, () => {});
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('QyrexObf listening on 0.0.0.0:' + PORT);
});
