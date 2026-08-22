const crypto = require('crypto');
const antiTamperLua = require('./antitamper');

function randBytes(n) { return crypto.randomBytes(n); }
function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
function randIdent(len) {
  const chars = 'Il1O0o';
  let s = '_';
  for (let i = 0; i < len; i++) s += chars[randInt(0, chars.length - 1)];
  return s + randInt(10, 99);
}

function xorBuf(buf, key) {
  const out = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = buf[i] ^ key[i % key.length];
  return out;
}

function layerXorB64(code, layers = 5) {
  let data = Buffer.from(String(code), 'utf8');
  const keys = [];
  for (let i = 0; i < layers; i++) {
    const key = randBytes(16 + (i % 8));
    keys.push(key);
    data = xorBuf(data, key);
    data = Buffer.from(data.toString('base64'), 'utf8');
  }
  const keyLits = keys.map(k => '{' + [...k].join(',') + '}').join(',');
  const payload = data.toString('utf8').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r/g, '');
  const lines = [
    'local _k={' + keyLits + '}',
    'local _d="' + payload + '"',
    'local function _xb(s,key)',
    '  local t={}',
    '  for i=1,#s do t[i]=string.char(bit32.bxor(string.byte(s,i), key[((i-1)%#key)+1])) end',
    '  return table.concat(t)',
    'end',
    'local function _b64(data)',
    "  local b='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'",
    "  data=string.gsub(data,'[^'..b..'=]','')",
    "  return (data:gsub('.',function(x)",
    "    if x=='=' then return '' end",
    "    local r,f='',(b:find(x)-1)",
    "    for i=6,1,-1 do r=r..(f%2^i - f%2^(i-1) > 0 and '1' or '0') end",
    '    return r',
    "  end):gsub('%d%d%d?%d?%d?%d?%d?%d?',function(x)",
    "    if #x~=8 then return '' end",
    '    local c=0',
    "    for i=1,8 do c=c+(x:sub(i,i)=='1' and 2^(8-i) or 0) end",
    '    return string.char(c)',
    '  end))',
    'end',
    'for i=' + layers + ',1,-1 do',
    '  _d=_b64(_d)',
    '  _d=_xb(_d,_k[i])',
    'end',
    'return (loadstring or load)(_d)()'
  ];
  return lines.join('\n');
}

function layerStringPool(code) {
  const strings = [];
  const replaced = String(code).replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, (m) => {
    if (m.length < 4 || m.length > 200) return m;
    const inner = m.slice(1, -1);
    if (!/[a-zA-Z]{3,}/.test(inner)) return m;
    const id = strings.length;
    strings.push(inner);
    return '__S[' + id + ']';
  });
  if (!strings.length) return code;
  const encKey = randInt(17, 230);
  const enc = strings.map(s => {
    const b = Buffer.from(s, 'utf8');
    const arr = [];
    for (let i = 0; i < b.length; i++) arr.push(b[i] ^ encKey ^ (i % 13));
    return '{' + arr.join(',') + '}';
  });
  const poolName = randIdent(6);
  const keyName = randIdent(4);
  return [
    'local ' + keyName + '=' + encKey,
    'local ' + poolName + '={' + enc.join(',') + '}',
    'local __S={}',
    'for i=1,#' + poolName + ' do',
    '  local t=' + poolName + '[i]; local o={}',
    '  for j=1,#t do o[j]=string.char(bit32.bxor(t[j],' + keyName + ',((j-1)%13))) end',
    '  __S[i-1]=table.concat(o)',
    'end',
    replaced
  ].join('\n');
}

function junkBlock() {
  const a = randIdent(5), b = randIdent(5), c = randInt(1000, 99999);
  return [
    'do local ' + a + '=' + c + ' local ' + b + '=' + a + '*0',
    '  if ' + b + ' ~= 0 then while true do end end',
    'end'
  ].join('\n');
}

function wrapFunction(code) {
  const n = randIdent(7);
  return 'local function ' + n + '(...)\n' + code + '\nend\nreturn ' + n + '(...)';
}

function obfuscate(source, opts = {}) {
  const preset = (opts.preset || 'normal').toLowerCase();
  const withAnti = opts.antiTamper !== false;
  let code = String(source || '');
  if (!code.trim()) throw new Error('Empty code');
  if (code.length > 1200000) throw new Error('Code too large (max ~1.2MB)');

  if (withAnti) {
    code = antiTamperLua() + '\n' + code;
  }

  let layers = 5;
  if (preset === 'light') layers = 3;
  if (preset === 'heavy') layers = 7;
  if (preset === 'maximum') layers = 8;

  if (preset !== 'light') {
    try { code = layerStringPool(code); } catch (e) {}
    code = junkBlock() + '\n' + code + '\n' + junkBlock();
  }

  code = wrapFunction(code);
  code = layerXorB64(code, layers);

  if (preset === 'maximum') {
    code = layerXorB64(code, 3);
  }

  const header = '-- Protect by QyrexObf\n-- preset=' + preset + ' layers=' + layers + ' anti=' + (withAnti ? '1' : '0') + '\n';
  return header + code;
}

module.exports = { obfuscate };
