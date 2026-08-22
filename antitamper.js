module.exports = function antiTamperLua() {
  return `-- QyrexObf AntiTamper
local function __d(r) error(tostring(r or "blocked"), 0) end
local function __g()
  local rg,pc,ty=rawget,pcall,type
  for _,k in ipairs({"lune","lute","wally","rojo","selene","darklua","lemur","fetch","console","window","document","navigator","__dirname","localStorage"}) do
    if rg(_G,k)~=nil then __d("sb") end
  end
  if ty(process)=="table" then __d("sb") end
  if getfenv and ty(getfenv)~="function" then __d("gf") end
  for _,k in ipairs({"fenv","_fenv","hookenv","scriptenv"}) do if rg(_G,k)~=nil then __d("lk") end end
  for _,n in ipairs({"print","loadstring","setmetatable","pcall"}) do
    local f=rg(_G,n); if f~=nil and ty(f)~="function" then __d("hk") end
  end
  if getgenv and debug and debug.getinfo then
    local h=getgenv(); local mt=getmetatable(h)
    if mt and (mt.__index or mt.__newindex) then __d("gv") end
    local inf=debug.getinfo(getgenv)
    if not inf or inf.what~="C" then __d("gv2") end
  end
  if not game or not typeof or game.ClassName~="DataModel" then __d("rb") end
  local ok=pc(function() local p=Instance.new("Part"); p:Destroy() end)
  if not ok then __d("in") end
end
__g()
`;
};
