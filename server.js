const express = require("express");
const path = require("path");
const crypto = require("crypto");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "5mb" }));

/* ============================================================
   IKGONAVI v4 — LURAPH-STYLE HARDENED
   Multi-function VM-like • Hex/bin • bit32 • Staged decode
   ============================================================ */

const RESERVED = new Set([
    "and","break","do","else","elseif","end","false","for","function",
    "goto","if","in","local","nil","not","or","repeat","return","then",
    "true","until","while","_G","_ENV","self","game","workspace","script",
    "require","Instance","Enum","Color3","Vector3","CFrame","TweenInfo",
    "task","wait","spawn","delay","tick","time","os","math","string",
    "table","pairs","ipairs","next","type","typeof","print","warn","error",
    "pcall","xpcall","select","unpack","rawget","rawset","rawequal",
    "setmetatable","getmetatable","coroutine","debug","utf8","bit32",
    "SharedTable","buffer","vector"
]);

function rnd(n) {
    n = n || 6;
    const a = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const b = a + "0123456789";
    let s = a[(Math.random() * 52) | 0];
    for (let i = 1; i < n; i++) s += b[(Math.random() * b.length) | 0];
    return s;
}

function luraphName() {
    const prefixes = ["M","o","X","P","Z","Q","B","i","G","E","O","w","Y","C","b","N","v","s","T","D","H","L","c","F","p","R","x","a","e","u","j","k","m","r","t","d","n","f","l","h","W","S","A","I","U","J"];
    const p = prefixes[(Math.random() * prefixes.length) | 0];
    const styles = [
        function() { return p + ((Math.random() * 9) | 0) + String.fromCharCode(97 + ((Math.random() * 26) | 0)); },
        function() { return p + "M"; },
        function() { return p + "8"; },
        function() { return p + rnd(2); },
        function() { return p + ((Math.random() * 99) | 0); }
    ];
    return styles[(Math.random() * styles.length) | 0]();
}

function xorBytes(str, key) {
    const kb = Buffer.from(key, "utf8");
    const out = [];
    for (let i = 0; i < str.length; i++) {
        out.push(str.charCodeAt(i) ^ kb[i % kb.length]);
    }
    return out;
}

function luraphNum(n) {
    const r = Math.random();
    if (r < 0.35) {
        let h = "0x" + Math.abs(n).toString(16);
        if (h.length > 5 && Math.random() > 0.5) {
            const pos = 3 + ((Math.random() * (h.length - 4)) | 0);
            h = h.slice(0, pos) + "_" + h.slice(pos);
        }
        return (n < 0 ? "-" : "") + h;
    }
    if (r < 0.55 && Math.abs(n) < 512) {
        let b = "0b" + Math.abs(n).toString(2);
        if (b.length > 6 && Math.random() > 0.6) {
            const pos = 3 + ((Math.random() * (b.length - 4)) | 0);
            b = b.slice(0, pos) + "_" + b.slice(pos);
        }
        return (n < 0 ? "-" : "") + b;
    }
    return String(n);
}

function luaByteTable(arr) {
    const parts = [];
    for (let i = 0; i < arr.length; i += 60) {
        const chunk = arr.slice(i, i + 60).map(function(v) { return luraphNum(v); }).join(",");
        parts.push("{" + chunk + "}");
    }
    if (parts.length === 1) return parts[0];
    return "((function()local t={}for _,c in ipairs({" + parts.join(",") + "})do for _,v in ipairs(c)do t[#t+1]=v end end return t end)())";
}

function stripComments(code) {
    code = code.replace(/--\[=*\[([\s\S]*?)\]=*\]/g, "");
    code = code.replace(/--[^\n]*/g, "");
    return code;
}

function renameLocals(code) {
    const map = new Map();
    let c = 0;
    const re = /\blocal\s+([A-Za-z_][A-Za-z0-9_]*(?:\s*,\s*[A-Za-z_][A-Za-z0-9_]*)*)/g;
    let m;
    while ((m = re.exec(code)) !== null) {
        const names = m[1].split(/\s*,\s*/);
        for (let ni = 0; ni < names.length; ni++) {
            const name = names[ni];
            if (!map.has(name) && !RESERVED.has(name)) {
                c++;
                map.set(name, luraphName() + c.toString(36));
            }
        }
    }
    map.forEach(function(newN, oldN) {
        code = code.replace(new RegExp("\\b" + oldN + "\\b", "g"), newN);
    });
    return code;
}

function obfuscateNumbers(code) {
    return code.replace(/\b(\d{2,7})\b/g, function(_, num) {
        const n = parseInt(num, 10);
        if (n < 10 || n > 250000) return num;
        const a = ((Math.random() * 40) | 0) + 3;
        const b = n - a;
        const r = Math.random();
        if (r < 0.4) return "(" + luraphNum(a) + "+" + luraphNum(b) + ")";
        if (r < 0.7) return "(" + luraphNum(n * 2) + "//" + luraphNum(2) + ")";
        return "((" + luraphNum(a) + "*" + luraphNum(3) + ")+" + luraphNum(n - a * 3) + ")";
    });
}

function injectJunk(code) {
    function junk() {
        const a = luraphName(), b = luraphName(), c = luraphName();
        const opts = [
            "local " + a + "=function(...)return select(" + luraphNum(1) + ",...)end;",
            "do local " + a + "," + b + "=nil,false if " + a + " then " + b + "=true end end;",
            "local " + a + "=(function()return " + luraphNum((Math.random()*80+10)|0) + "~=" + luraphNum((Math.random()*80+10)|0) + " end)();",
            ";(function(" + a + ")local " + b + "=" + a + " return " + b + " end)(nil);",
            "local " + a + "=bit32 and bit32.bxor or function(x)return x end;",
            "for " + a + "=" + luraphNum(1) + "," + luraphNum(0) + " do local " + b + "=" + a + " end;",
            "local " + a + "={};setmetatable(" + a + ",{__index=function()return end});",
            "pcall(function()local " + a + "=0/0 end);",
            "local " + a + "," + b + "," + c + "=" + luraphNum(1) + "," + luraphNum(2) + "," + luraphNum(3) + ";" + a + "=" + b + "+" + c + "-" + c + "-" + b + ";"
        ];
        return opts[(Math.random() * opts.length) | 0];
    }
    const lines = code.split("\n");
    const out = [];
    for (let li = 0; li < lines.length; li++) {
        const line = lines[li];
        out.push(line);
        if (line.trim().length > 5 && Math.random() > 0.4) {
            out.push(junk());
            if (Math.random() > 0.65) out.push(junk());
        }
    }
    return out.join("\n");
}

function protectStrings(code, level) {
    const strings = [];
    code = code.replace(/(["'])(?:\\.|(?!\1)[\s\S])*?\1/g, function(match) {
        const id = strings.length;
        strings.push(match);
        return "___S" + id + "___";
    });
    code = stripComments(code);

    if (level < 2) {
        for (let i = 0; i < strings.length; i++) {
            code = code.replace("___S" + i + "___", strings[i]);
        }
        return { code: code, decoder: "" };
    }

    const key1 = crypto.randomBytes(8).toString("hex");
    const key2 = crypto.randomBytes(6).toString("hex");
    const decName = luraphName();
    const tables = [];

    for (let i = 0; i < strings.length; i++) {
        const raw = strings[i];
        let content = raw.slice(1, -1)
            .replace(/\\n/g, "\n").replace(/\\t/g, "\t")
            .replace(/\\r/g, "\r").replace(/\\"/g, '"')
            .replace(/\\'/g, "'").replace(/\\\\/g, "\\");
        let enc = xorBytes(content, key1);
        const asStr = String.fromCharCode.apply(null, enc);
        enc = xorBytes(asStr, key2);
        tables.push(luaByteTable(enc));
        strings[i] = true;
    }

    const decoder = "local " + decName + "=(function()local _a=\"" + key1 + "\" local _b=\"" + key2 + "\" local function _x(t,k)local r={} for i=1,#t do r[i]=string.char(bit32.bxor(t[i],string.byte(k,(i-1)%#k+1))) end return table.concat(r) end return function(t) local s=_x(t,_b) local p={} for i=1,#s do p[i]=string.byte(s,i) end return _x(p,_a) end end)()";

    for (let i = 0; i < strings.length; i++) {
        if (strings[i]) {
            code = code.replace("___S" + i + "___", decName + "(" + tables[i] + ")");
        }
    }
    return { code: code, decoder: decoder };
}

function buildLuraph(full) {
    const k1 = crypto.randomBytes(10).toString("hex");
    const k2 = crypto.randomBytes(8).toString("hex");
    const k3 = crypto.randomBytes(6).toString("hex");

    let layer = xorBytes(full, k1);
    layer = xorBytes(String.fromCharCode.apply(null, layer), k2);
    layer = xorBytes(String.fromCharCode.apply(null, layer), k3);

    const PAGE = 55;
    const realPages = [];
    for (let i = 0; i < layer.length; i += PAGE) {
        realPages.push(layer.slice(i, i + PAGE));
    }

    const vm = luraphName();
    const names = {
        k1: luraphName(), k2: luraphName(), k3: luraphName(),
        boot: luraphName(), x: luraphName(), acc: luraphName(),
        t1: luraphName(), t2: luraphName(),
        src: luraphName(), fn: luraphName(), p: luraphName(),
        i: luraphName()
    };
    const pageNames = realPages.map(function() { return luraphName(); });
    const decoyNames = [];
    for (let d = 0; d < 4; d++) decoyNames.push(luraphName());

    let s = "--[[ IKGONAVI v4 • LURAPH-STYLE HARDENED ]]\n";
    s += "local " + vm + "=(\n";

    s += "Hk=bit32.lshift,";
    s += "fk=bit32.rrotate,";
    s += "Uk=bit32.lrotate,";
    s += "O=bit32.bxor,";
    s += "u=bit32.band,";
    s += "W=bit32.bnot,";
    s += "Ek=bit32.countlz,";
    s += "B=bit32.countrz,";
    s += "b=bit32.rrotate,";
    s += "F=bit32.lrotate,\n";

    s += names.k1 + "=function()return\"" + k1 + "\"end,";
    s += names.k2 + "=function()return\"" + k2 + "\"end,";
    s += names.k3 + "=function()return\"" + k3 + "\"end,\n";

    for (let idx = 0; idx < realPages.length; idx++) {
        s += pageNames[idx] + "=function()return" + luaByteTable(realPages[idx]) + "end,";
    }
    s += "\n";

    for (let idx = 0; idx < decoyNames.length; idx++) {
        const fake = [];
        for (let j = 0; j < PAGE; j++) fake.push((Math.random() * 255) | 0);
        s += decoyNames[idx] + "=function()return" + luaByteTable(fake) + "end,";
    }
    s += "\n";

    for (let i = 0; i < 16; i++) {
        const n = luraphName();
        const a = luraphNum(((Math.random() * 0x1ffff) | 0));
        const b = luraphNum(((Math.random() * 0xffff) | 0));
        s += n + "=function(u,A,I)A=(" + a + "+(u.Hk((u.Ek(A or " + b + ")),(I or " + luraphNum(3) + "))));return A;end,";
    }
    s += "\n";

    s += names.boot + "=function(u)\n";
    s += "local " + names.acc + "={}\n";
    for (let idx = 0; idx < pageNames.length; idx++) {
        s += "do local " + names.p + "=u." + pageNames[idx] + "() for " + names.i + "=1,#" + names.p + " do " + names.acc + "[#" + names.acc + "+1]=" + names.p + "[" + names.i + "] end end\n";
        if (idx % 2 === 0 && decoyNames[0]) {
            s += "if(" + luraphNum(0) + "~=" + luraphNum(0) + ")then local d=u." + decoyNames[0] + "() for " + names.i + "=1,#d do " + names.acc + "[#" + names.acc + "+1]=d[" + names.i + "] end end\n";
        }
    }

    s += "local function " + names.x + "(t,k)local o={}for i=1,#t do o[i]=string.char(bit32.bxor(t[i],string.byte(k,(i-1)%#k+1)))end return table.concat(o)end\n";
    s += "local " + names.t1 + "=" + names.x + "(" + names.acc + ",u." + names.k3 + "())\n";
    s += "local p2={}for i=1,#" + names.t1 + " do p2[i]=string.byte(" + names.t1 + ",i)end\n";
    s += "local " + names.t2 + "=" + names.x + "(p2,u." + names.k2 + "())\n";
    s += "local p3={}for i=1,#" + names.t2 + " do p3[i]=string.byte(" + names.t2 + ",i)end\n";
    s += "local " + names.src + "=" + names.x + "(p3,u." + names.k1 + "())\n";
    s += "local " + names.fn + "=loadstring(" + names.src + ")\n";
    s += "if not " + names.fn + " then error(\"IKG::vm_fail\")end\n";
    s += "return " + names.fn + "()\n";
    s += "end\n";
    s += "})\n";
    s += "return " + vm + "." + names.boot + "(" + vm + ")\n";

    return s;
}

function minify(code) {
    return code
        .replace(/[ \t]+/g, " ")
        .replace(/\n\s*\n+/g, "\n")
        .replace(/^\s+/gm, "")
        .trim();
}

function obfuscateLua(source, level) {
    let code = source.trim();
    const prot = protectStrings(code, level);
    code = prot.code;
    const decoder = prot.decoder;

    if (level >= 1) code = renameLocals(code);
    if (level >= 2) {
        code = obfuscateNumbers(code);
        code = injectJunk(code);
    }
    code = minify(code);

    if (level === 1) return "-- IKGONAVI BASIC\n" + code;
    if (level === 2) return "-- IKGONAVI ADVANCED\n" + decoder + "\n" + code;
    return buildLuraph((decoder || "") + "\n" + code);
}

app.post("/api/obfuscate", function(req, res) {
    try {
        const code = req.body.code;
        const level = req.body.level;
        if (typeof code !== "string" || !code.trim()) {
            return res.status(400).json({ error: "No se recibio ningun script Lua." });
        }
        if (code.length > 300000) {
            return res.status(400).json({ error: "Script demasiado grande." });
        }
        const selectedLevel = Math.max(1, Math.min(3, Number(level) || 1));
        const result = obfuscateLua(code, selectedLevel);
        res.json({
            success: true,
            code: result,
            originalSize: code.length,
            outputSize: result.length,
            level: selectedLevel
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error interno al ofuscar: " + (err.message || "unknown") });
    }
});

app.get("/", function(req, res) {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, "0.0.0.0", function() {
    console.log("IKGONAVI v4 LURAPH-STYLE running on port " + PORT);
});
