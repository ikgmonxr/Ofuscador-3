/**
 * Express Obfuscator Server — Keyforge / Luarph / Anti-Tamper Engine
 */
const express = require("express");
const path = require("path");
const crypto = require("crypto");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "12mb" }));

const RESERVED = new Set([
  "and","break","do","else","elseif","end","false","for","function",
  "goto","if","in","local","nil","not","or","repeat","return","then",
  "true","until","while","_G","_ENV","self","game","workspace","script",
  "require","Instance","Enum","Color3","Vector3","CFrame","TweenInfo",
  "UDim2","UDim","Rect","Region3","Ray","BrickColor","NumberSequence",
  "ColorSequence","NumberRange","PhysicalProperties","Axes","Faces",
  "task","wait","spawn","delay","tick","time","os","math","string",
  "table","pairs","ipairs","next","type","typeof","print","warn","error",
  "pcall","xpcall","select","unpack","rawget","rawset","rawequal","rawlen",
  "setmetatable","getmetatable","coroutine","debug","utf8","bit32",
  "buffer","vector","SharedTable","getfenv","setfenv","loadstring","load",
  "assert","collectgarbage","newproxy","gcinfo","ypcall",
  "settings","UserSettings","stats","UserInputService","Players","RunService",
  "TweenService","HttpService","ReplicatedStorage","Lighting","CoreGui",
  "Workspace","Camera","Mouse","Humanoid","HumanoidRootPart","LocalPlayer",
  "GetService","FindFirstChild","WaitForChild","GetChildren","GetDescendants",
  "IsA","Clone","Destroy","Connect","Disconnect","Fire","Invoke"
]);

function rnd(n) {
  n = n || 6;
  const a = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const b = a + "0123456789";
  let s = a[(Math.random() * 52) | 0];
  for (let i = 1; i < n; i++) s += b[(Math.random() * b.length) | 0];
  return s;
}

function ln() {
  const p = "abcdefghijkmnopqrstuvwxyz";
  return "_" + p[(Math.random() * p.length) | 0] + rnd(6);
}

function extractStrings(code) {
  const strings = [];
  let out = "";
  let i = 0;
  while (i < code.length) {
    if (code[i] === "[") {
      let m = i + 1;
      let eqs = "";
      while (m < code.length && code[m] === "=") {
        eqs += "=";
        m++;
      }
      if (m < code.length && code[m] === "[") {
        const endMark = "]" + eqs + "]";
        const endIdx = code.indexOf(endMark, m + 1);
        if (endIdx !== -1) {
          const full = code.slice(i, endIdx + endMark.length);
          const id = strings.length;
          strings.push(full);
          out += "___S" + id + "___";
          i = endIdx + endMark.length;
          continue;
        }
      }
    }
    if (code[i] === '"' || code[i] === "'") {
      const q = code[i];
      let j = i + 1;
      let s = q;
      while (j < code.length) {
        if (code[j] === "\\") {
          s += code[j];
          if (j + 1 < code.length) {
            s += code[j + 1];
            j += 2;
          } else j++;
          continue;
        }
        s += code[j];
        if (code[j] === q) {
          j++;
          break;
        }
        j++;
      }
      const id = strings.length;
      strings.push(s);
      out += "___S" + id + "___";
      i = j;
      continue;
    }
    out += code[i];
    i++;
  }
  return { code: out, strings };
}

function stripComments(code) {
  let result = "";
  let i = 0;
  while (i < code.length) {
    if (code[i] === "-" && code[i + 1] === "-") {
      let m = i + 2;
      if (code[m] === "[") {
        let eqs = "";
        m++;
        while (m < code.length && code[m] === "=") {
          eqs += "=";
          m++;
        }
        if (code[m] === "[") {
          const endMark = "]" + eqs + "]";
          const endIdx = code.indexOf(endMark, m + 1);
          if (endIdx !== -1) {
            i = endIdx + endMark.length;
            continue;
          }
        }
      }
      i += 2;
      while (i < code.length && code[i] !== "\n") i++;
      continue;
    }
    result += code[i];
    i++;
  }
  return result;
}

function renameLocals(code) {
  const map = new Map();
  let counter = 0;
  const regex = /\blocal\s+([A-Za-z_][A-Za-z0-9_]*)/g;
  let match;
  while ((match = regex.exec(code)) !== null) {
    const name = match[1];
    if (!map.has(name) && !RESERVED.has(name) && name.length > 1) {
      counter++;
      map.set(name, ln() + String(counter));
    }
  }
  const multi = /\blocal\s+([A-Za-z_][A-Za-z0-9_]*(?:\s*,\s*[A-Za-z_][A-Za-z0-9_]*)+)/g;
  while ((match = multi.exec(code)) !== null) {
    const parts = match[1].split(/\s*,\s*/);
    for (const name of parts) {
      if (!map.has(name) && !RESERVED.has(name) && name.length > 1) {
        counter++;
        map.set(name, ln() + String(counter));
      }
    }
  }
  const entries = [...map.entries()].sort((a, b) => b[0].length - a[0].length);
  let result = code;
  for (const [oldName, newName] of entries) {
    const pattern = new RegExp("\\b" + oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "g");
    result = result.replace(pattern, newName);
  }
  return result;
}

function obfuscateNumbers(code) {
  return code.replace(/\b(\d{2,4})\b/g, (match, num) => {
    const n = parseInt(num, 10);
    if (n < 16 || n > 9000) return num;
    const r = Math.random();
    if (r < 0.25) return "(" + (n + 3) + "-3)";
    if (r < 0.45) return "(" + (n - 2) + "+2)";
    if (r < 0.6) return "(" + n * 2 + "//2)";
    return num;
  });
}

function injectJunk(code) {
  const lines = code.split("\n");
  const result = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    result.push(line);
    const t = line.trim();
    const unsafe =
      /function\s*$/.test(t) ||
      /then\s*$/.test(t) ||
      /else\s*$/.test(t) ||
      /do\s*$/.test(t) ||
      /repeat\s*$/.test(t) ||
      /,\s*$/.test(t) ||
      /\(\s*$/.test(t) ||
      /\{\s*$/.test(t) ||
      /=\s*$/.test(t) ||
      /\.\.\s*$/.test(t) ||
      /and\s*$/.test(t) ||
      /or\s*$/.test(t);
    if (t.length > 20 && !unsafe && Math.random() > 0.82) {
      result.push("local " + ln() + "=(nil);");
    }
  }
  return result.join("\n");
}

function encryptStrings(code, strings, level) {
  if (level < 2) {
    let out = code;
    for (let i = strings.length - 1; i >= 0; i--) {
      out = out.split("___S" + i + "___").join(strings[i]);
    }
    return { code: out, decoder: "" };
  }

  const key = crypto.randomBytes(6).toString("hex");
  const decName = ln();
  const keyBytes = Buffer.from(key, "utf8");

  let decoder =
    "local " +
    decName +
    "=function(t,k)\n" +
    "local r={}\n" +
    "for i=1,#t do\n" +
    "local b=string.byte(k,(i-1)%#k+1)\n" +
    "r[i]=string.char(bit32.bxor(t[i],b))\n" +
    "end\n" +
    "return table.concat(r)\n" +
    "end\n";

  const rebuilt = [];
  for (let i = 0; i < strings.length; i++) {
    const raw = strings[i];
    if (raw.startsWith("[") || raw.length < 4) {
      rebuilt.push(raw);
      continue;
    }
    let content = raw.slice(1, -1);
    try {
      content = content
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "\t")
        .replace(/\\r/g, "\r")
        .replace(/\\\\/g, "\\")
        .replace(/\\'/g, "'")
        .replace(/\\"/g, '"');
    } catch (_) {}

    if (
      content.length > 4000 ||
      /^rbxassetid:\/\//i.test(content) ||
      /^https?:\/\//i.test(content) ||
      /sirius\.menu/i.test(content) ||
      /raw\.githubusercontent/i.test(content) ||
      /^[A-Za-z0-9_\-]{3,40}$/.test(content) && content.length < 24
    ) {
      rebuilt.push(raw);
      continue;
    }

    const encrypted = [];
    for (let j = 0; j < content.length; j++) {
      encrypted.push(content.charCodeAt(j) ^ keyBytes[j % keyBytes.length]);
    }
    const bytesStr = "{" + encrypted.join(",") + "}";
    rebuilt.push(decName + "(" + bytesStr + ',"' + key + '")');
  }

  let out = code;
  for (let i = strings.length - 1; i >= 0; i--) {
    out = out.split("___S" + i + "___").join(rebuilt[i]);
  }
  return { code: out, decoder };
}

function minify(code) {
  return code
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/g, ""))
    .filter((line, i, arr) => {
      if (line.trim() === "" && i > 0 && arr[i - 1].trim() === "") return false;
      return true;
    })
    .join("\n")
    .trim();
}

function buildAntiTamper(mode) {
  const hard = mode === "hard";
  const stop = hard
    ? 'error("Environment blocked",0)'
    : 'pcall(function() local p=game:GetService("Players").LocalPlayer if p then p:Kick("Security") end end)';

  return `
do
	local function __fail(r)
		` + stop + `
	end

	local function __keyforge_luraph_check()
		local p = { [1642754488]=25, [3105969070]=50, [48342080]=50, [793184576]=25 }
		local q, r = getfenv(), next
		local t = nil
		while true do
			t, Value = r(q, t)
			if t == nil then break end
			if type(t) == 'string' and #t < 20 then
				local u, v, w, x = 2166136261, { string.byte(t, 1, -1) }, r
				while true do
					local y
					x, y = r(v, x)
					if x == nil then break end
					local z = bit32.bxor(u, y)
					if z >= 134217728 then
						local A = z % 65536
						local B, C = (z - A) / 65536, A * 403
						u = (B * 403 + A * 256) % 65536 * 65536 + C
					else
						u = z * 16777619 % 4294967296
					end
				end
			end
		end
	end
	pcall(__keyforge_luraph_check)

	if type(string)~="table" or type(math)~="table" or type(table)~="table" then __fail("prim") end
	if type(string.byte)~="function" or string.byte("A")~=65 then __fail("byte") end
	if type(math.floor)~="function" or math.floor(3.9)~=3 or math.floor(math.pi)~=3 then __fail("floor") end
	if bit32 and type(bit32.bxor)=="function" and bit32.bxor(85,170)~=255 then __fail("bxor") end
	if type(game)==type({}) then __fail("game_table") end
	if type(typeof)=="function" and typeof(game)=="table" then __fail("typeof_game") end
	do local ok,mt=pcall(getmetatable,game) if ok and type(mt)==type({}) then __fail("mt_game") end end
	local ZERO="00000000-0000-0000-0000-000000000000"
	local okJ,jobId=pcall(function() return game.JobId end)
	if okJ and jobId==ZERO then __fail("jobid") end
	local okP,placeId=pcall(function() return game.PlaceId end)
	if okP and placeId==8916037983 then __fail("place") end
	local okG,gameId=pcall(function() return game.GameId end)
	if okG and gameId==8916037983 then __fail("gameid") end
	local okPl,Players=pcall(function() return game:GetService("Players") end)
	if not okPl or not Players then __fail("players") end
	local LP=Players and Players.LocalPlayer
	if not LP then __fail("lp") end
	if LP then
		local okU,uid=pcall(function() return LP.UserId end)
		if okU and uid==123456789 then __fail("uid") end
		local okN,nm=pcall(function() return LP.Name end)
		if okN and nm=="vole7vin" then __fail("name") end
	end
	local okS,Stats=pcall(function() return game:GetService("Stats") end)
	if okS and Stats then
		local okNet,Net=pcall(function() return Stats.Network end)
		if okNet and Net then
			local okSSI,SSI=pcall(function() return Net.ServerStatsItem end)
			if okSSI and SSI then
				local okDP,DP=pcall(function() return SSI["Data Ping"] end)
				if okDP and DP then
					local okPV,pv=pcall(function() return DP:GetValue() end)
					if okPV and (pv==nil or pv=="" or tonumber(pv)==0 or math.floor(tonumber(pv) or 0)==0) then
						__fail("pingval")
					end
				end
			end
		end
	end
	pcall(function()
		local CG=game:GetService("CoreGui")
		if CG and not CG:FindFirstChild("RobloxGui") then __fail("robloxgui") end
	end)
	if _G.lune or _G.lute or _G.wally or _G.rojo or _G.selene or _G.darklua then __fail("tool") end
	if _G.process and (_G.process.env or _G.process.platform or _G.process.exit) then __fail("process") end
	if _G.window or _G.document or _G.navigator or _G.localStorage then __fail("browser") end
	if _G.Buffer and _G.Buffer.from then __fail("nodebuf") end
	if _G.__dirname or _G.__filename then __fail("nodepath") end
	pcall(function()
		if package and type(package)=="table" and (rawget(package,"lune") or rawget(package,"lute") or rawget(package,"wally")) then
			__fail("package")
		end
	end)
end
`.trim();
}

function obfuscateLua(source, level, options) {
  options = options || {};
  let code = String(source || "").trim();
  if (!code) throw new Error("Empty script");

  const extracted = extractStrings(code);
  code = stripComments(extracted.code);
  const strings = extracted.strings;

  if (level >= 1) code = renameLocals(code);
  if (level >= 2) {
    code = obfuscateNumbers(code);
    code = injectJunk(code);
  }

  const prot = encryptStrings(code, strings, level);
  code = prot.code;
  const decoder = prot.decoder || "";
  code = minify(code);

  let result = "-- Protect by QyrexObf\n";
  if (options.antiTamper) {
    result += buildAntiTamper(options.antiTamperMode || "soft") + "\n";
  }
  if (level >= 2 && decoder) result += decoder + "\n";
  result += code;
  return result;
}

app.post("/api/obfuscate", function (req, res) {
  try {
    const code = req.body && req.body.code;
    const level = req.body && req.body.level;
    const antiTamper = !!(req.body && req.body.antiTamper);
    const antiTamperMode = (req.body && req.body.antiTamperMode) || "soft";

    if (typeof code !== "string" || !code.trim()) {
      return res.status(400).json({ error: "No se recibio ningun script Lua." });
    }
    if (code.length > 600000) {
      return res.status(400).json({ error: "Script demasiado grande (max ~600KB)." });
    }

    const selectedLevel = Math.max(1, Math.min(3, Number(level) || 2));

    const result = obfuscateLua(code, selectedLevel, {
      antiTamper: antiTamper,
      antiTamperMode: antiTamperMode === "hard" ? "hard" : "soft",
    });

    res.json({
      success: true,
      code: result,
      originalSize: code.length,
      outputSize: result.length,
      level: selectedLevel,
      antiTamper: antiTamper,
      compressionRatio: ((1 - result.length / Math.max(code.length, 1)) * 100).toFixed(2) + "%",
    });
  } catch (err) {
    console.error("[Error]", err);
    res.status(500).json({ error: "Error procesando: " + (err.message || "unknown") });
  }
});

app.get("/api/health", function (req, res) {
  res.json({ ok: true, version: "v2-antitamper-keyforge", maxSize: "600KB", levels: [1, 2, 3], antiTamper: true });
});

app.get("/", function (req, res) {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use(express.static(path.join(__dirname, "public")));

module.exports = app;

if (require.main === module) {
  app.listen(PORT, "0.0.0.0", function () {
    console.log("Obfuscator Server listening on port " + PORT);
  });
}
