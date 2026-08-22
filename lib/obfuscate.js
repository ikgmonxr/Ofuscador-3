const crypto = require('crypto');
const antiTamperLua = require('./antitamper');

const rand = (a,b)=>a+Math.floor(Math.random()*(b-a+1));
const rbytes = n => crypto.randomBytes(n);
const ident = (n=6)=>{let s='_';const c='Il1O0o';for(let i=0;i<n;i++)s+=c[rand(0,c.length-1)];return s+rand(10,99)};

function xorBuf(buf,key){
  const o=Buffer.alloc(buf.length);
  for(let i=0;i<buf.length;i++) o[i]=buf[i]^key[i%key.length];
  return o;
}

function layerStringEnc(code){
  // encrypt long string literals only
  const strings=[];
  const out=String(code).replace(/"(?:\\.|[^"\\])*"/g,(m)=>{
    if(m.length<6||m.length>180) return m;
    const inner=m.slice(1,-1);
    if(!/[A-Za-z]{2,}/.test(inner)) return m;
    const id=strings.length;
    strings.push(inner);
    return '__Q['+id+']';
  });
  if(!strings.length) return code;
  const k=rand(20,200);
  const pool=strings.map(s=>{
    const b=Buffer.from(s,'utf8');
    const a=[];
    for(let i=0;i<b.length;i++) a.push(b[i]^k^(i%17));
    return '{'+a.join(',')+'}';
  });
  return [
    'local __K='+k,
    'local __P={'+pool.join(',')+'}',
    'local __Q={}',
    'for i=1,#__P do local t=__P[i] local o={}',
    '  for j=1,#t do o[j]=string.char(bit32.bxor(t[j],__K,((j-1)%17))) end',
    '  __Q[i-1]=table.concat(o)',
    'end',
    out
  ].join('\n');
}

function layerRC4(code){
  const key=rbytes(16);
  const data=Buffer.from(String(code),'utf8');
  const S=Buffer.alloc(256); for(let i=0;i<256;i++) S[i]=i;
  let j=0;
  for(let i=0;i<256;i++){ j=(j+S[i]+key[i%key.length])&255; const t=S[i];S[i]=S[j];S[j]=t; }
  let ii=0; j=0;
  const out=Buffer.alloc(data.length);
  for(let n=0;n<data.length;n++){
    ii=(ii+1)&255; j=(j+S[ii])&255;
    const t=S[ii];S[ii]=S[j];S[j]=t;
    out[n]=data[n]^S[(S[ii]+S[j])&255];
  }
  return [
    'local function __R(d,k)',
    ' local S={} for i=0,255 do S[i]=i end local j=0',
    ' for i=0,255 do j=(j+S[i]+k[(i%#k)+1])%256 S[i],S[j]=S[j],S[i] end',
    ' local i=0;j=0;local o={}',
    ' for n=1,#d do i=(i+1)%256;j=(j+S[i])%256;S[i],S[j]=S[j],S[i]',
    '  o[n]=string.char(bit32.bxor(d[n],S[(S[i]+S[j])%256])) end',
    ' return table.concat(o) end',
    'local __rk={'+[...key].join(',')+'}',
    'local __rc={'+[...out].join(',')+'}',
    'return (loadstring or load)(__R(__rc,__rk))()'
  ].join('\n');
}

function layerXorB64(code,layers){
  let data=Buffer.from(String(code),'utf8');
  const keys=[];
  for(let i=0;i<layers;i++){
    const key=rbytes(12+(i%10));
    keys.push(key);
    data=xorBuf(data,key);
    data=Buffer.from(data.toString('base64'),'utf8');
  }
  const keyLits=keys.map(k=>'{'+[...k].join(',')+'}').join(',');
  const payload=data.toString('utf8').replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\r/g,'');
  return [
    'local _k={'+keyLits+'}',
    'local _d="'+payload+'"',
    'local function _xb(s,key) local t={} for i=1,#s do t[i]=string.char(bit32.bxor(string.byte(s,i),key[((i-1)%#key)+1])) end return table.concat(t) end',
    'local function _b64(data)',
    " local b='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'",
    " data=string.gsub(data,'[^'..b..'=]','')",
    " return (data:gsub('.',function(x) if x=='=' then return '' end local r,f='',(b:find(x)-1) for i=6,1,-1 do r=r..(f%2^i-f%2^(i-1)>0 and '1' or '0') end return r end):gsub('%d%d%d?%d?%d?%d?%d?%d?',function(x) if #x~=8 then return '' end local c=0 for i=1,8 do c=c+(x:sub(i,i)=='1' and 2^(8-i) or 0) end return string.char(c) end))",
    'end',
    'for i='+layers+',1,-1 do _d=_b64(_d); _d=_xb(_d,_k[i]) end',
    'return (loadstring or load)(_d)()'
  ].join('\n');
}

function junk(){
  const a=ident(5),b=ident(4),c=rand(1000,99999);
  return 'do local '+a+'='+c+' local '+b+'='+a+'*0 if '+b+'~=0 then return end end';
}

function wrap(code){
  const n=ident(7);
  return 'local function '+n+'(...)\n'+code+'\nend\nreturn '+n+'(...)';
}

function obfuscate(source, opts={}){
  const preset=(opts.preset||'maximum').toLowerCase();
  const withAnti=opts.antiTamper!==false;
  let code=String(source||'');
  if(!code.trim()) throw new Error('Empty code');
  if(code.length>700000) throw new Error('Code too large');

  // ALWAYS pack everything useful but keep executable
  if(withAnti) code = antiTamperLua()+'\n'+code;

  // string encryption
  try{ code=layerStringEnc(code);}catch{}

  code = junk()+'\n'+wrap(code)+'\n'+junk();

  let layers=6;
  if(preset==='light') layers=3;
  if(preset==='normal') layers=5;
  if(preset==='heavy') layers=6;
  if(preset==='maximum') layers=7;

  // XOR+B64 core
  code=layerXorB64(code, layers);

  // RC4 shell always except light
  if(preset!=='light'){
    code=layerRC4(code);
  }

  // final XOR shell for heavy/max
  if(preset==='heavy'||preset==='maximum'){
    code=layerXorB64(code, 2);
  }

  return '-- Protect by QyrexObf\n-- preset='+preset+'\n'+code;
}

module.exports={obfuscate};
