local function script_path()
  local str = debug.getinfo(2, "S").source:sub(2)
  return str:match("(.*[/%\\])") or "./"
end
package.path = script_path() .. "src/?.lua;" .. package.path
local Prometheus = require("prometheus")
local Presets = require("presets")
local presetName = arg[1] or "Medium"
local infile, outfile = arg[2], arg[3]
if not infile or not outfile then
  io.stderr:write("usage: lua run.lua <Weak|Medium|Strong> <in> <out>\n")
  os.exit(1)
end
local f = assert(io.open(infile, "rb"))
local code = f:read("*a"); f:close()
local preset = Presets[presetName] or Presets.Medium
local pipeline = Prometheus.Pipeline:fromConfig(preset)
local out = pipeline:apply(code)
local o = assert(io.open(outfile, "wb"))
o:write("-- Protect by QyrexObf\n")
o:write(out)
o:close()
print("OK")
