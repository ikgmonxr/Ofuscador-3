<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>QyrexObf</title>
<style>
* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 20px;
  background: #1a1a1a;
  color: #fff;
  font-family: Consolas, monospace;
}
.container {
  max-width: 1200px;
  margin: 0 auto;
}
h1 {
  text-align: center;
  margin-top: 0;
  color: #0ff;
}
.toolbar {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
  justify-content: center;
  flex-wrap: wrap;
}
select, button {
  padding: 8px 15px;
  background: #333;
  color: #fff;
  border: 1px solid #555;
  border-radius: 3px;
  cursor: pointer;
  font-family: Consolas, monospace;
  font-size: 12px;
}
button:hover { background: #444; }
button:disabled { opacity: 0.5; cursor: wait; }
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 20px;
}
.panel {
  display: flex;
  flex-direction: column;
  border: 1px solid #444;
  background: #222;
}
.panel-title {
  padding: 10px;
  background: #333;
  border-bottom: 1px solid #444;
  font-weight: bold;
}
textarea {
  flex: 1;
  padding: 10px;
  background: #1a1a1a;
  color: #0f0;
  border: none;
  font-family: Consolas, monospace;
  font-size: 12px;
  resize: none;
  min-height: 400px;
}
.info {
  padding: 8px;
  background: #2a2a2a;
  border-top: 1px solid #444;
  font-size: 11px;
  color: #888;
  display: flex;
  justify-content: space-between;
}
.status {
  text-align: center;
  margin-top: 10px;
  font-size: 12px;
  color: #888;
  min-height: 20px;
}
.status.success { color: #0f0; }
.status.error { color: #f00; }
@media (max-width: 800px) {
  .grid { grid-template-columns: 1fr; }
}
</style>
</head>
<body>

<div class="container">
  <h1>QyrexObf</h1>

  <div class="toolbar">
    <select id="level">
      <option value="1" selected>Level 1 - Rename (Recomendado scripts grandes)</option>
      <option value="2">Level 2 - Rename + Strings</option>
    </select>
    <button onclick="doObfuscate()">OBFUSCATE</button>
  </div>

  <div class="grid">
    <div class="panel">
      <div class="panel-title">INPUT</div>
      <textarea id="input" placeholder="Pega tu script aquí..."></textarea>
      <div class="info">
        <span id="inputInfo">0 bytes</span>
        <button onclick="clearInput()" style="padding: 3px 8px; font-size: 11px;">Clear</button>
      </div>
    </div>

    <div class="panel">
      <div class="panel-title">OUTPUT (1 línea)</div>
      <textarea id="output" readonly placeholder="Resultado en 1 línea..."></textarea>
      <div class="info">
        <span id="outputInfo">0 bytes</span>
        <button onclick="copyOutput()" style="padding: 3px 8px; font-size: 11px;">Copy</button>
      </div>
    </div>
  </div>

  <div class="status" id="status">Ready</div>
</div>

<script>
const input = document.getElementById('input');
const output = document.getElementById('output');
const inputInfo = document.getElementById('inputInfo');
const outputInfo = document.getElementById('outputInfo');
const status = document.getElementById('status');

input.addEventListener('input', () => {
  inputInfo.textContent = input.value.length + ' bytes';
});

function doObfuscate() {
  if (!input.value.trim()) {
    status.textContent = 'Error: Pega un script primero';
    status.className = 'status error';
    return;
  }

  const btn = event.target;
  btn.disabled = true;
  btn.textContent = 'Processing...';

  const level = document.getElementById('level').value;

  fetch('/api/obfuscate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: input.value,
      level: parseInt(level)
    })
  })
  .then(r => r.json())
  .then(data => {
    if (data.success) {
      output.value = data.code;
      outputInfo.textContent = data.outputSize + ' bytes';
      status.textContent = '✓ Listo (1 línea) - Protect by QyrexObf';
      status.className = 'status success';
    } else {
      status.textContent = 'Error: ' + data.error;
      status.className = 'status error';
    }
  })
  .catch(e => {
    status.textContent = 'Error: ' + e.message;
    status.className = 'status error';
  })
  .finally(() => {
    btn.disabled = false;
    btn.textContent = 'OBFUSCATE';
  });
}

function copyOutput() {
  if (!output.value) return;
  navigator.clipboard.writeText(output.value).then(() => {
    status.textContent = '✓ Copiado';
    status.className = 'status success';
  });
}

function clearInput() {
  input.value = '';
  inputInfo.textContent = '0 bytes';
}
</script>

</body>
</html>
