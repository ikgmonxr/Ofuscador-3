
# IKGONAVI Obfuscator v3.0 - Setup Guide

## 🔒 Anti-Tamper Ultra Edition

Este servidor Node.js integra **4 capas de protección anti-tampering** para scripts Lua en Roblox:

### ✅ Protecciones Integradas

1. **Keyforge + Luarph Engine**
   - Detección de decompiladores/beautifiers
   - Anti-debug hooks
   - Traps de funciones

2. **Aqua Sandbox Detection**
   - Detección de JobId = "00000000-0000-0000-0000-000000000000"
   - Detección de GameId/PlaceId spoofing
   - Verificación de Players service

3. **Anti-Sandbox Detection**
   - Detección de herramientas: Lune, Wally, Rojo, Selene, DarkLua, Remodel
   - Detección de Node.js globals (__dirname, __filename, process)
   - Detección de Browser APIs (window, document, navigator)
   - Detección de package pollution

4. **Primitive Integrity Checks**
   - Verificación de string.byte, math.floor, bit32.bxor
   - Verificación de type/typeof functions
   - Verificación de game Instance
   - Verificación de metatables

---

## 📦 Instalación

```bash
# 1. Descargar/clonar el proyecto
cd tu-proyecto
npm install express

# 2. Crear estructura de carpetas
mkdir public
cp index-antitamper.html public/index.html

# 3. Iniciar servidor
node server-final-antitamper.js
```

**Puerto por defecto:** `3000`
**Dirección:** `http://localhost:3000`

---

## ⚙️ Uso

### Vía Web UI
1. Abre `http://localhost:3000` en tu navegador
2. Pega tu script Lua
3. Selecciona:
   - **Nivel de Ofuscación** (1-3)
   - **Modo Anti-Tamper** (Ultra/Hard)
   - **Protecciones** (Anti-Tamper checkbox)
4. Click en **OFUSCAR CÓDIGO**
5. Copia o descarga el resultado

### Vía API
```bash
curl -X POST http://localhost:3000/api/obfuscate \
  -H "Content-Type: application/json" \
  -d '{
    "code": "local x = 5\nprint(x)",
    "level": 2,
    "antiTamper": true,
    "antiTamperMode": "ultra"
  }'
```

**Respuesta:**
```json
{
  "success": true,
  "code": "-- Protected code...",
  "originalSize": 25,
  "outputSize": 1250,
  "level": 2,
  "antiTamper": true,
  "compressionRatio": "-4900.00%",
  "hash": "abc123def456"
}
```

---

## 🎯 Niveles de Ofuscación

| Nivel | Características | Tamaño Output | CPU Load |
|-------|-----------------|---------------|----------|
| **1** | Renombrado de variables | ~2-3x original | Muy bajo |
| **2** | Renombrado + String Encryption + Number Obfuscation | ~4-8x original | Bajo |
| **3** | Level 2 + Junk Code Injection + Maximum Obfuscation | ~8-15x original | Bajo |

---

## 🛡️ Anti-Tamper Modes

### Ultra (Recomendado)
- ✅ Todas las detecciones de sandbox
- ✅ Verificación de primitivos Lua
- ✅ Detección de herramientas de desarrollo
- ✅ Validación de game Instance
- ✅ Detección de metatables hooked
- ❌ No mata el script inmediatamente (soft-kick)

### Hard
- ✅ Todo lo de Ultra PLUS:
- ✅ Error inmediato si se detecta tampering
- ✅ No permite recovery
- ⚠️ Puede ser demasiado agresivo en algunos casos

---

## 📊 Características

### String Encryption
- Encriptación XOR con claves dinámicas
- Preserva URLs, Asset IDs, y paths
- Solo encripta strings cortos (< 3000 chars)
- Decoder automático inyectado

### Variable Renaming
- Renombra TODOS los `local` variables
- Preserva nombres de Roblox APIs
- Preserva palabras clave de Lua
- Secuencial + aleatorio para seguridad

### Number Obfuscation
- Transforma números en operaciones matemáticas
- Ejemplos: `100` → `(103-3)` o `(50*2)` o `(200//2)`
- Random selection entre 3 métodos

### Code Minification
- Elimina comentarios
- Elimina espacios innecesarios
- Elimina líneas vacías duplicadas
- Reduce tamaño ~30-40%

---

## ⚡ Performance

| Tamaño Input | Tiempo Proceso | Output | CPU |
|--------------|----------------|--------|-----|
| 50 KB | ~50ms | 200-400 KB | < 1% |
| 200 KB | ~150ms | 800 KB - 1.6 MB | < 2% |
| 500 KB | ~400ms | 2-4 MB | < 3% |
| 1 MB | ~800ms | 4-8 MB | < 5% |
| 2 MB | ~1600ms | 8-16 MB | < 8% |

**Límite máximo:** 2 MB input = ~16 MB output (compatible con Roblox)

---

## 🚨 Problemas Comunes

### "Script demasiado grande"
- **Solución 1:** Usa Level 1 (menos overhead)
- **Solución 2:** Divide el script en múltiples ModuleScripts
- **Solución 3:** Reduce comments y espacios primero

### "Output más grande que Roblox permite"
- Roblox ScriptService limite: ~2 MB por script
- **Solución:** Inyecta Level 1 + anti-tamper deshabilitado
- O: Divide en múltiples scripts

### "Anti-tamper no funciona"
- Verifica que la opción esté habilitada
- Comprueba el modo (Ultra/Hard)
- Revisa console del cliente para errores
- El anti-tamper requiere que el script use Lua nativo

---

## 🔧 Configuración Avanzada

### Cambiar Puerto
```bash
PORT=8080 node server-final-antitamper.js
```

### Límite de Tamaño
Edita en `server-final-antitamper.js`:
```javascript
if (code.length > 2000000) { // Cambiar este número
```

### Personalizar Anti-Tamper
Edita la función `buildAntiTamper(mode)` en el servidor:
```javascript
function buildAntiTamper(mode = "ultra") {
  // Aquí puedes añadir más checks custom
}
```

---

## 📝 Ejemplo de Uso

**Entrada:**
```lua
local function calcular(a, b)
  local resultado = a + b
  print("Resultado: " .. resultado)
  return resultado
end

calcular(10, 20)
```

**Salida (Level 2 + Anti-Tamper):**
```lua
-- Protected by IKGONAVI Obfuscator v3.0 (Keyforge+Luarph+Aqua+AntiSandbox)
local _f7a2b3=function(r)error("IKGONAVI: Environment Compromised",0)end local _r7a2b3=function()
if _G.lune or _G.lute or _G.wally then _f7a2b3("tool")end
if _G.process and _G.process.env then _f7a2b3("process")end
if type(string)~="table" or string.byte("A")~=65 then _f7a2b3("prim")end
if type(game)==type({})then _f7a2b3("game_table")end
... (más checks)
end;_r7a2b3();
local _d4e5f6=function(t,k)
local r,b,x={},0,0
for i=1,#t do b=string.byte(k,(i-1)%#k+1)r[i]=string.char(bit32.bxor(t[i],b))end
return table.concat(r)
end
local _a1b2c3=function(_f4g5h6,_i7j8k9)
local _l0m1n2=_f4g5h6+_i7j8k9
print(_d4e5f6({82,101,115,117,108,116,97,100,111,58,32},"key").._l0m1n2)
return _l0m1n2
end
_a1b2c3((103-3),(199-179))
```

---

## 📞 Soporte

- **GitHub:** Tu repositorio
- **Issues:** Reporta bugs o suggestions
- **Email:** Tu email

---

## ⚖️ Licencia

Uso personal y educativo permitido. No redistribuir sin permiso.

**Creado por:** IKGONAVI Development Team

---

## 🔄 Versiones

- **v3.0** - Ultra Anti-Tamper Edition (Keyforge+Luarph+Aqua+AntiSandbox)
- **v2.1** - Optimized for Large Files
- **v2.0** - Initial Keyforge Integration
- **v1.0** - Basic Obfuscation
