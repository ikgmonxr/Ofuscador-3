// Combined anti-sandbox / anti-tamper (Lua payload)
module.exports = function antiTamperLua() {
  return `-- Protect by QyrexObf | AntiTamper
local function __qx_die(m) error(m or "dtc", 0) end
local function __qx_gate()
  -- sandbox / tooling globals
  local bad = {
    "lune","lute","wally","rojo","selene","darklua","luau_lsp","remodel","tarmac","stylua",
    "lemur","busted","luaunit","telescope","plugin","fetch","console","setTimeout","setInterval",
    "Buffer","AbortController","AbortSignal","clearInterval","clearTimeout","Request","Response",
    "TextDecoder","TextEncoder","dofile","loadfile","atob","btoa","FormData","Blob","File",
    "URLSearchParams","Event","CustomEvent","structuredClone","__dirname","__filename",
    "alert","confirm","prompt","navigator","location","history","window","document",
    "XMLHttpRequest","WebSocket","EventTarget","MessageChannel","BroadcastChannel",
    "queueMicrotask","reportError","DOMException","requestAnimationFrame","cancelAnimationFrame",
    "matchMedia","postMessage","Worker","SharedWorker","ServiceWorker","IndexedDB",
    "localStorage","sessionStorage","caches","Cache","CacheStorage"
  }
  for i=1,#bad do
    if rawget(_G, bad[i]) ~= nil then __qx_die("sandbox") end
  end
  if type(process)=="table" and process.env then __qx_die("sandbox") end
  if type(process)=="table" and process.platform then __qx_die("sandbox") end

  -- getgenv integrity
  do
    local ok = true
    local b = getgenv
    local c = debug
    local d = c and c.getinfo
    local e = c and (c.getupvalue or c.getupvalues)
    local f = getmetatable
    local g = iscclosure
    if not b or not d then ok = false else
      local h = b()
      if f(h) and (f(h).__index or f(h).__newindex or f(h).__metatable) then ok = false end
      local k = d(b)
      if not k or k.what ~= "C" or k.source ~= "=[C]" then ok = false end
      if g and not g(b) then ok = false end
      if e then
        local l,m = pcall(e,b,1)
        if l and m ~= nil then ok = false end
      end
      local x="_t"; h[x]=1
      if rawget(h,x)~=1 then ok=false end
      h[x]=nil
    end
    if not ok then __qx_die("genv") end
  end

  -- TerrainRegion
  do
    local success = pcall(function()
      local c = Instance.new("TerrainRegion")
      assert(typeof(c)=="Instance")
      assert(c.ClassName=="TerrainRegion")
      assert(c:IsA("TerrainRegion"))
      local part = Instance.new("Part")
      local _ = part.Position
      part:Destroy()
    end)
    if not success then __qx_die("terrain") end
  end

  -- DataModel
  if game.ClassName ~= "DataModel" then __qx_die("datamodel") end

  -- OverlapParams Include/Exclude
  do
    local w = workspace
    local a = Instance.new("Part"); local b = Instance.new("Part")
    a.Anchored=true; b.Anchored=true
    a.CFrame=CFrame.new(); b.CFrame=CFrame.new()
    a.Parent=w; b.Parent=w
    local q = OverlapParams.new()
    q.IncludeInstances={a,b}
    local x = w:GetPartBoundsInBox(CFrame.new(), Vector3.new(4,4,4), q)
    q.ExcludeInstances={b}
    local y = w:GetPartBoundsInBox(CFrame.new(), Vector3.new(4,4,4), q)
    q.IncludeInstances={}
    local z = w:GetPartBoundsInBox(CFrame.new(), Vector3.new(4,4,4), q)
    local function has(t,inst)
      for _,v in t do if v==inst then return true end end
      return false
    end
    local ok = has(x,a) and has(x,b) and has(y,a) and not has(y,b) and #z==0
    a:Destroy(); b:Destroy()
    if not ok then __qx_die("overlap") end
  end

  -- Tween mid-value
  do
    local ok = pcall(function()
      local ts = game:GetService("TweenService")
      local obj = Instance.new("NumberValue")
      obj.Value=0; obj.Parent=workspace
      local tw = ts:Create(obj, TweenInfo.new(1, Enum.EasingStyle.Linear, Enum.EasingDirection.In), {Value=1})
      tw:Play(); task.wait(0.5)
      local mid = obj.Value
      if mid<=0 or mid>=1 or mid<0.3 or mid>0.7 then error("dtc") end
      tw.Completed:Wait()
      if obj.Value ~= 1 then error("dtc") end
      obj:Destroy()
    end)
    if not ok then __qx_die("tween") end
  end
end
__qx_gate()
`;
};
