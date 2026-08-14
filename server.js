const express = require("express");
const path = require("path");
const crypto = require("crypto");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "10mb" }));

/* ════════════════════════════════════════════════════════════════════════════
   LUA UNIVERSAL OBFUSCATOR v1.0
   ════════════════════════════════════════════════════════════════════════════
   Funciona con CUALQUIER Lua:
   - Lua 5.1, 5.2, 5.3, 5.4
   - Luau (Roblox)
   - Sin restricciones de estructura
   ════════════════════════════════════════════════════════════════════════════ */

// Keywords Lua que NUNCA deben renombrarse
const LUA_KEYWORDS = new Set([
  "and","break","do","else","elseif","end","false","for","function",
  "goto","if","in","local","nil","not","or","repeat","return","then",
  "true","until","while","self"
]);

// Funciones Lua estándar (NUNCA renombrar)
const STDLIB_FUNCTIONS = new Set([
  "print","warn","error","type","typeof","tostring","tonumber","assert",
  "pairs","ipairs","next","table","string","math","io","os","debug",
  "pcall","xpcall","select","unpack","pack","getfenv","setfenv",
  "rawget","rawset","rawequal","rawlen","getmetatable","setmetatable",
  "require","module","loadstring","load","dofile","loadfile","compile",
  "bit32","bit","coroutine","string.find","string.match","string.sub",
  "string.char","string.byte","string.format","string.upper","string.lower",
  "table.insert","table.remove","table.concat","table.sort","table.pack",
  "math.abs","math.floor","math.ceil","math.sqrt","math.sin","math.cos",
  "math.tan","math.log","math.exp","math.min","math.max"
]);

// Palabras reservadas en diferentes contextos
const CONTEXTUAL_RESERVED = new Set([
  "_G","_ENV","game","workspace","script","Instance","Enum","Color3",
  "Vector3","CFrame","TweenInfo","task","wait","spawn","delay","tick",
  "time","UserInputService","RunService","Players","LocalPlayer",
  "Character","Humanoid","Module","Globals"
]);

function rnd(n) {
  n = n || 6;
  const a = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const b = a + "0123456789";
  let s = a[(Math.random() * 52) | 0];
  for (let i = 1; i < n; i++) s += b[(Math.random() * b.length) | 0];
  return s;
}

function genName(prefix = "_") {
  const chars = "abcdefghijkmnopqrstuvwxyz";
  return prefix + chars[(Math.random() * chars.length) | 0] + rnd(5);
}

function stripComments(code) {
  // Remover comentarios de bloque: --[=*[ ... ]=*]
  code = code.replace(/--\[=*\[([\s\S]*?)\]=*\]/g, "");
  // Remover comentarios de línea: -- ...
  code = code.replace(/--[^\n]*/g, "");
  return code;
}

/**
 * TOKENIZADOR MEJORADO
 * Identifica correctamente qué es local, global, propiedad, etc.
 */
function tokenizeAndAnalyze(code) {
  // Patrón para encontrar declaraciones locales
  // local var = ... / local var, var2 = ... / local function name()
  const localDeclarations = new Map();
  
  // Buscar: local var = value
  const localVarRegex = /\blocal\s+(?!function\b)([A-Za-z_][A-Za-z0-9_]*)\b/g;
  let match;
  while ((match = localVarRegex.exec(code)) !== null) {
    const varName = match[1];
    if (!LUA_KEYWORDS.has(varName) && !STDLIB_FUNCTIONS.has(varName)) {
      localDeclarations.set(varName, true);
    }
  }
  
  // Buscar: local function name()
  const localFuncRegex = /\blocal\s+function\s+([A-Za-z_][A-Za-z0-9_]*)\b/g;
  while ((match = localFuncRegex.exec(code)) !== null) {
    const funcName = match[1];
    if (!LUA_KEYWORDS.has(funcName) && !STDLIB_FUNCTIONS.has(funcName)) {
      localDeclarations.set(funcName, true);
    }
  }
  
  // Buscar: for var in / for var, var2 in
  const forLoopRegex = /\bfor\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s*,\s*([A-Za-z_][A-Za-z0-9_]*))*\s+in\b/g;
  while ((match = forLoopRegex.exec(code)) !== null) {
    const varName = match[1];
    if (!LUA_KEYWORDS.has(varName) && !STDLIB_FUNCTIONS.has(varName)) {
      localDeclarations.set(varName, true);
    }
    if (match[2]) {
      if (!LUA_KEYWORDS.has(match[2]) && !STDLIB_FUNCTIONS.has(match[2])) {
        localDeclarations.set(match[2], true);
      }
    }
  }
  
  // Buscar: function(param, param2)
  const funcParamRegex = /function\s*\(\s*([^)]*)\s*\)/g;
  while ((match = funcParamRegex.exec(code)) !== null) {
    const params = match[1].split(',').map(p => p.trim());
    for (const param of params) {
      if (param && !LUA_KEYWORDS.has(param) && !STDLIB_FUNCTIONS.has(param)) {
        localDeclarations.set(param, true);
      }
    }
  }
