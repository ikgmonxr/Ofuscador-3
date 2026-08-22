module.exports = function antiTamperLua() {
  return `-- Protect by QyrexObf
local function __d(r) error(tostring(r or "blocked"), 0) end
local function __g()
  local rg,pc,ty = rawget,pcall,type
  -- sandbox
  for _,k in ipairs({"lune","lute","wally","rojo","selene","darklua","lemur","busted","fetch","console","setTimeout","window","document","navigator","__dirname","__filename","localStorage"}) do
    if rg(_G,k)~=nil then __d("sb") end
  end
  if ty(process)=="table" then __d("sb") end
  -- getfenv
  if getfenv then
    if ty(getfenv)~="function" then __d("gf") end
    local ok,e0=pc(getfenv,0)
    if not ok then __d("gf0") end
  end
  -- _G leaks
  for _,k in ipairs({"fenv","_fenv","__fenv","hookenv","scriptenv","rawenv"}) do
    if rg(_G,k)~=nil then __d("lk") end
  end
  -- builtins type
  for _,n in ipairs({"print","loadstring","setmetatable","pairs","pcall","tostring"}) do
    local f=rg(_G,n)
    if f~=nil and ty(f)~="function" then __d("hk") end
  end
  -- getgenv
  if getgenv and debug and debug.getinfo then
    local h=getgenv()
    local mt=getmetatable(h)
    if mt and (mt.__index or mt.__newindex) then __d("gv") end
    local inf=debug.getinfo(getgenv)
    if not inf or inf.what~="C" then __d("gv2") end
    local x="_t"; h[x]=1
    if rawget(h,x)~=1 then __d("gv3") end
    h[x]=nil
  end
  -- roblox
  if not game or not typeof then __d("rb") end
  if game.ClassName~="DataModel" then __d("dm") end
  local ok=pc(function()
    local p=Instance.new("Part"); local _=p.Position; p:Destroy()
  end)
  if not ok then __d("in") end
  ok=pc(function()
    local c=Instance.new("TerrainRegion")
    assert(c:IsA("TerrainRegion"))
  end)
  if not ok then __d("tr") end
  ok=pc(function()
    local w=workspace
    local a=Instance.new("Part"); local b=Instance.new("Part")
    a.Anchored=true;b.Anchored=true;a.Parent=w;b.Parent=w
    local q=OverlapParams.new()
    q.IncludeInstances={a,b}
    local x=w:GetPartBoundsInBox(CFrame.new(),Vector3.new(4,4,4),q)
    q.ExcludeInstances={b}
    local y=w:GetPartBoundsInBox(CFrame.new(),Vector3.new(4,4,4),q)
    local function has(t,i) for _,v in t do if v==i then return true end end return false end
    assert(has(x,a) and has(y,a) and not has(y,b))
    a:Destroy();b:Destroy()
  end)
  if not ok then __d("ov") end
  ok=pc(function()
    local ts=game:GetService("TweenService")
    local o=Instance.new("NumberValue"); o.Value=0; o.Parent=workspace
    local tw=ts:Create(o,TweenInfo.new(1,Enum.EasingStyle.Linear),{Value=1})
    tw:Play(); task.wait(0.5)
    local m=o.Value
    if m<=0 or m>=1 or m<0.3 or m>0.7 then error("tw") end
    tw.Completed:Wait()
    if o.Value~=1 then error("tw2") end
    o:Destroy()
  end)
  if not ok then __d("tw") end
end
__g()
`;
};
