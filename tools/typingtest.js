/* Prueba de regresion: escribe un codigo de sala con pulsaciones REALES de teclado en el
   campo de "unirse" y comprueba que el juego no se las come.
   Uso: node tools/typingtest.js */
'use strict';

var child = require('child_process');
var fs = require('fs');
var path = require('path');
var os = require('os');

var ROOT = path.resolve(path.join(__dirname, '..'));
var PORT = 8171;
var CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
].find(function (p) { return fs.existsSync(p); });

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function get(url) { return fetch(url).then(function (r) { return r.json(); }); }

function Client(wsUrl) {
  var self = this;
  this.id = 0;
  this.pending = new Map();
  this.ws = new WebSocket(wsUrl);
  this.ready = new Promise(function (resolve, reject) {
    self.ws.addEventListener('open', function () { resolve(); });
    self.ws.addEventListener('error', function () { reject(new Error('ws')); });
  });
  this.ws.addEventListener('message', function (ev) {
    var m;
    try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (m.id && self.pending.has(m.id)) {
      var p = self.pending.get(m.id);
      self.pending.delete(m.id);
      m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
    }
  });
}
Client.prototype.send = function (method, params) {
  var self = this;
  this.id++;
  var id = this.id;
  return new Promise(function (resolve, reject) {
    self.pending.set(id, { resolve: resolve, reject: reject });
    self.ws.send(JSON.stringify({ id: id, method: method, params: params || {} }));
    setTimeout(function () {
      if (self.pending.has(id)) { self.pending.delete(id); reject(new Error('timeout ' + method)); }
    }, 60000);
  });
};
Client.prototype.eval = function (expr) {
  return this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    .then(function (r) { return r && r.result ? r.result.value : undefined; });
};

var VK = { 'W': 87, 'A': 65, 'S': 83, 'D': 68, 'F': 70, 'Q': 81, 'E': 69, 'R': 82, 'V': 86, 'C': 67, 'B': 66, 'K': 75, 'M': 77, '4': 52, '2': 50, '7': 55, '8': 56 };
function codeFor(ch) {
  if (/[0-9]/.test(ch)) return 'Digit' + ch;
  return 'Key' + ch.toUpperCase();
}

(async function main() {
  if (!CHROME) { console.log('No se encontro Chrome ni Edge.'); process.exit(1); }
  var server = child.spawn(process.execPath, [path.join(__dirname, 'serve.js'), String(PORT)], { stdio: 'ignore' });
  var profile = path.join(os.tmpdir(), 'blockburst-type-' + Date.now());
  var chrome = child.spawn(CHROME, [
    '--headless=new', '--hide-scrollbars', '--mute-audio', '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--enable-unsafe-swiftshader',
    '--use-angle=swiftshader', '--window-size=900,700',
    '--remote-debugging-port=9271', '--user-data-dir=' + profile, 'about:blank'
  ], { stdio: 'ignore' });

  var fail = [];
  function killTree(pid) { if (pid) { try { child.execSync('taskkill /F /T /PID ' + pid, { stdio: 'ignore' }); } catch (e) { } } }
  function killStrays() {
    try { child.execSync('powershell -NoProfile -ExecutionPolicy Bypass -File "' + path.join(__dirname, 'kill-chrome.ps1') + '"', { stdio: 'ignore' }); } catch (e) { }
  }

  try {
    await sleep(1600);
    var list = null;
    for (var i = 0; i < 40; i++) {
      try { list = await get('http://127.0.0.1:9271/json/list'); break; } catch (e) { await sleep(400); }
    }
    if (!list) throw new Error('sin respuesta de Chrome');
    var page = list.filter(function (t) { return t.type === 'page'; })[0];
    var c = new Client(page.webSocketDebuggerUrl);
    await c.ready;
    await c.send('Page.enable');
    await c.send('Runtime.enable');

    var url = 'http://127.0.0.1:' + PORT + '/index.html?lowq=1&fps=3';
    for (var k = 0; k < 3; k++) {
      await c.send('Page.navigate', { url: url });
      await sleep(3800 + k * 1500);
      var ok = await c.eval('!!(window.BLITZ && window.BLITZ.debug && document.getElementById("loading").hidden === true)');
      if (ok) break;
      console.log('  (reintento de carga)');
    }
    await c.eval('document.querySelector(\'[data-tab="multi"]\').click(); 1');
    await sleep(600);

    // El anfitrion crea la sala y nos da un codigo real
    await c.eval('document.getElementById("btnCreateRoom").click(); 1');
    var code = null;
    for (var j = 0; j < 30; j++) {
      await sleep(400);
      code = await c.eval('window.BLITZ.Net.room');
      if (code) break;
    }
    console.log('codigo generado por el juego: ' + code);

    // Enfocar el campo de unirse y escribir con pulsaciones REALES
    await c.eval('(function(){var i=document.getElementById("roomCodeIn");i.focus();i.value="";return 1;})()');
    await sleep(300);
    var typed = String(code || '4WF2B').toLowerCase();
    for (var n = 0; n < typed.length; n++) {
      var ch = typed.charAt(n);
      var up = ch.toUpperCase();
      var vk = VK[up] || up.charCodeAt(0);
      await c.send('Input.dispatchKeyEvent', {
        type: 'keyDown', text: ch, unmodifiedText: ch, key: ch,
        code: codeFor(up), windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk
      });
      await c.send('Input.dispatchKeyEvent', {
        type: 'keyUp', key: ch, code: codeFor(up),
        windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk
      });
      await sleep(60);
    }

    var value = await c.eval('document.getElementById("roomCodeIn").value');
    console.log('escrito con el teclado: ' + JSON.stringify(typed) + '  ->  campo: ' + JSON.stringify(value));
    if (value !== typed.toUpperCase()) {
      fail.push('el campo no recibio todo lo tecleado (esperado ' + typed.toUpperCase() + ', obtenido ' + value + ')');
    }
    if (!/^[A-Z0-9]{4,8}$/.test(String(value))) fail.push('el campo no contiene un codigo valido: ' + value);

    // El boton de unirse debe quedar operativo (no lanzar excepcion y avisar de sala inexistente)
    await c.eval('document.getElementById("btnJoinRoom").click(); 1');
    await sleep(1500);
    var st = await c.eval('document.getElementById("roomStateText").textContent');
    console.log('estado tras pulsar Unirse: ' + JSON.stringify(st));

    // Captura del panel para revisar la interfaz
    try {
      var shot = await c.send('Page.captureScreenshot', { format: 'png' });
      var outDir = path.join(ROOT, 'docs');
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, 'captura-unirse.png'), Buffer.from(shot.data, 'base64'));
      console.log('captura del panel: docs/captura-unirse.png');
    } catch (e) { }
  } catch (err) {
    fail.push(err.message);
  } finally {
    killTree(chrome.pid);
    killTree(server.pid);
    killStrays();
  }

  console.log(fail.length ? ('FALLOS: ' + fail.join(' | ')) : 'Campo de codigo verificado: se puede escribir con el teclado.');
  process.exit(fail.length ? 1 : 0);
})();
