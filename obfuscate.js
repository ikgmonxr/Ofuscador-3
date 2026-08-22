const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const antiTamperLua = require('./antitamper');

const LUA_CANDIDATES = ['lua5.1', 'lua51', 'luajit', 'lua'];
function findLua() {
  for (const c of LUA_CANDIDATES) {
    const r = spawnSync(c, ['-v'], { encoding: 'utf8' });
    if (r.status === 0 || (r.stderr && /Lua/i.test(r.stderr))) return c;
  }
  return null;
}

function mapPreset(p) {
  p = (p || 'medium').toLowerCase();
  if (p === 'light' || p === 'weak') return 'Weak';
  if (p === 'heavy' || p === 'strong' || p === 'maximum') return 'Strong';
  return 'Medium';
}

function runPrometheus(code, preset) {
  const lua = findLua();
  if (!lua) return null;
  const root = path.join(__dirname, '..', 'prometheus');
  const run = path.join(root, 'run.lua');
  if (!fs.existsSync(run)) return null;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qyrexobf-'));
  const infile = path.join(dir, 'in.lua');
  const outfile = path.join(dir, 'out.lua');
  try {
    fs.writeFileSync(infile, code, 'utf8');
    const r = spawnSync(lua, [run, mapPreset(preset), infile, outfile], {
      encoding: 'utf8',
      timeout: 45000,
      cwd: root,
      maxBuffer: 20 * 1024 * 1024
    });
    if (r.status !== 0) {
      console.error('prometheus fail', r.stderr || r.stdout);
      return null;
    }
    if (!fs.existsSync(outfile)) return null;
    return fs.readFileSync(outfile, 'utf8');
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

// ---- Structured JS fallback (real transforms, not whole-file cipher) ----
function rand(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
function ident(n = 8) {
  const a = 'Il'; let s = '_';
  for (let i = 0; i < n; i++) s += a[rand(0, 1)] + String(rand(0, 9));
  return s;
}

function encryptStrings(code) {
  const pool = [];
  const out = String(code).replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, (m) => {
    if (m.length < 4 || m.length > 120) return m;
    const q = m[0];
    let inner;
    try { inner = JSON.parse(q === '"' ? m : '"' + m.slice(1, -1).replace(/"/g, '\\"') + '"'); }
    catch { return m; }
    if (typeof inner !== 'string' || !/[A-Za-z]/.test(inner)) return m;
    const id = pool.length;
    pool.push(inner);
    return `__S[${id}]`;
  });
  if (!pool.length) return code;
  const key = rand(30, 200);
  const enc = pool.map((s) => {
    const b = Buffer.from(s, 'utf8');
    const arr = [];
    for (let i = 0; i < b.length; i++) arr.push(b[i] ^ key ^ ((i * 7) % 251));
    return `{${arr.join(',')}}`;
  });
  return [
    `local __SK=${key}`,
    `local __SP={${enc.join(',')}}`,
    `local __S={}`,
    `for i=1,#__SP do local t=__SP[i] local o={}`,
    ` for j=1,#t do o[j]=string.char(bit32.bxor(t[j],__SK,((j-1)*7)%251)) end`,
    ` __S[i-1]=table.concat(o) end`,
    out
  ].join('\n');
}

function numbersToExpr(code) {
  return String(code).replace(/\b(\d{2,6})\b/g, (m, n) => {
    const v = Number(n);
    if (v < 10 || v > 99999) return m;
    if (Math.random() > 0.45) return m;
    const a = rand(1, v - 1);
    return `(${a}+${v - a})`;
  });
}

function renameLocals(code) {
  // rename simple local names
  const map = new Map();
  return String(code).replace(/\blocal\s+([a-zA-Z_][a-zA-Z0-9_]*)\b/g, (full, name) => {
    if (['function', 'nil', 'true', 'false', 'and', 'or', 'not'].includes(name)) return full;
    if (!map.has(name)) map.set(name, ident(6));
    return 'local ' + map.get(name);
  }).replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g, (name) => map.get(name) || name);
}

function junk() {
  const a = ident(5), b = ident(5), n = rand(100, 9999);
  return `do local ${a}=${n} local ${b}=${a}- ${a} if ${b}~=0 then return end end`;
}

function wrapFn(code) {
  const n = ident(7);
  return `local function ${n}(...)\n${code}\nend\nreturn ${n}(...)`;
}

function structuredFallback(code) {
  let c = code;
  try { c = encryptStrings(c); } catch {}
  try { c = numbersToExpr(c); } catch {}
  try { c = renameLocals(c); } catch {}
  c = junk() + '\n' + wrapFn(c) + '\n' + junk();
  return '-- Protect by QyrexObf (structured)\n' + c;
}

function obfuscate(source, opts = {}) {
  const preset = (opts.preset || 'medium').toLowerCase();
  const withAnti = opts.antiTamper !== false;
  let code = String(source || '');
  if (!code.trim()) throw new Error('Empty code');
  if (code.length > 900000) throw new Error('Code too large');

  if (withAnti) code = antiTamperLua() + '\n' + code;

  // Prefer Prometheus (Vmify, EncryptStrings, ConstantArray, AntiTamper, NumbersToExpressions)
  const prom = runPrometheus(code, preset);
  if (prom && prom.length > 20) {
    return prom.startsWith('-- Protect') ? prom : ('-- Protect by QyrexObf\n' + prom);
  }

  // Fallback structured transforms
  return structuredFallback(code);
}

module.exports = { obfuscate, findLua };
