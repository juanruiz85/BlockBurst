/* Prueba de extremo a extremo del multijugador: abre dos navegadores reales, hace el
   intercambio de codigos con la interfaz real y comprueba que se conectan y que el
   invitado recibe el mundo. Uso: node tools/nettest.js */
'use strict';

var child = require('child_process');
var fs = require('fs');
var path = require('path');
var os = require('os');

var ROOT = path.resolve(path.join(__dirname, '..'));
var OUT = path.join(ROOT, 'docs');
var PORT = 8151;
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
Client.prototype.shot = function (file) {
  return this.send('Page.captureScreenshot', { format: 'png' })
    .then(function (r) { fs.writeFileSync(file, Buffer.from(r.data, 'base64')); return fs.statSync(file).size; });
};

async function connect(port) {
  var list = null;
  for (var i = 0; i < 40; i++) {
    try { list = await get('http://127.0.0.1:' + port + '/json/list'); break; }
    catch (e) { await sleep(400); }
  }
  if (!list) throw new Error('sin respuesta en el puerto ' + port);
  var page = list.filter(function (t) { return t.type === 'page'; })[0];
  var c = new Client(page.webSocketDebuggerUrl);
  await c.ready;
  await c.send('Page.enable');
  await c.send('Runtime.enable');
  return c;
}

function launch(port, tag) {
  var profile = path.join(os.tmpdir(), 'blockburst-net-' + tag + '-' + Date.now());
  return child.spawn(CHROME, [
    '--headless=new', '--hide-scrollbars', '--mute-audio', '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--enable-unsafe-swiftshader',
    '--use-angle=swiftshader', '--window-size=1280,720',
    '--remote-debugging-port=' + port, '--user-data-dir=' + profile, 'about:blank'
  ], { stdio: 'ignore' });
}

(async function main() {
  if (!CHROME) { console.log('No se encontro Chrome ni Edge.'); process.exit(1); }
  var server = child.spawn(process.execPath, [path.join(__dirname, 'serve.js'), String(PORT)], { stdio: 'ignore' });
  var a = launch(9251, 'a'), b = launch(9252, 'b');
  var fail = [];
  var cleanup = function () {
    [a, b].forEach(function (p) { try { p.kill(); } catch (e) { } });
    try { server.kill(); } catch (e) { }
  };

  try {
    await sleep(1500);
    var A = await connect(9251), B = await connect(9252);
    var url = 'http://127.0.0.1:' + PORT + '/index.html';

    async function openMenu(c, who) {
      for (var i = 0; i < 3; i++) {
        await c.send('Page.navigate', { url: 'about:blank' });
        await sleep(500);
        await c.send('Page.navigate', { url: url });
        await sleep(3200 + i * 1500);
        var ok = await c.eval('!!(window.BLITZ && window.BLITZ.debug && document.getElementById("loading").hidden === true)');
        if (ok) { await c.eval('document.querySelector(\'[data-tab="multi"]\').click(); 1'); return true; }
        console.log('  (' + who + ': reintento de carga)');
      }
      throw new Error(who + ': la pagina no arranco');
    }

    console.log('Abriendo los dos navegadores...');
    await openMenu(A, 'anfitrion');
    await openMenu(B, 'invitado');

    console.log('Anfitrion: creando la sala...');
    await A.eval('document.getElementById("btnHost").click(); 1');
    var code = null;
    for (var i = 0; i < 30; i++) {
      await sleep(400);
      code = await A.eval('document.getElementById("netHostCode").value');
      if (code && code.length > 20) break;
    }
    if (!code) throw new Error('el anfitrion no genero el codigo de sala');
    console.log('  codigo de sala: ' + code.length + ' caracteres');

    console.log('Invitado: generando la respuesta...');
    await B.eval('document.getElementById("netOffer").value = ' + JSON.stringify(code) + '; 1');
    await B.eval('document.getElementById("btnJoin").click(); 1');
    var reply = null;
    for (var j = 0; j < 30; j++) {
      await sleep(400);
      reply = await B.eval('document.getElementById("netReply").value');
      if (reply && reply.length > 20) break;
    }
    if (!reply) throw new Error('el invitado no genero la respuesta');
    console.log('  respuesta: ' + reply.length + ' caracteres');

    console.log('Anfitrion: aceptando la respuesta...');
    await A.eval('document.getElementById("netAnswer").value = ' + JSON.stringify(reply) + '; 1');
    await A.eval('document.getElementById("btnHostConnect").click(); 1');

    await sleep(2500);
    var sg = '';
    for (var k = 0; k < 22; k++) {
      await sleep(1000);
      sg = await B.eval('(function(){var n=window.BLITZ.Net;var l=n.link;return JSON.stringify({conectado:n.connected,rol:n.role,fast:!!(l&&l.fast),rel:!!(l&&l.rel),pc:(l&&l.pc)?l.pc.connectionState:null,ice:(l&&l.pc)?l.pc.iceConnectionState:null,error:n.lastError,ui:document.getElementById("netStateText").textContent,estado:window.BLITZ.debug.game.state});})()');
      if (JSON.parse(sg).conectado) break;
    }
    console.log('Invitado (diagnostico): ' + sg);
    var sa = await A.eval('(function(){var d=window.BLITZ.debug;return JSON.stringify({conectado:window.BLITZ.Net.connected,estado:d.game.state,anfitrion:d.game.netHost,entidades:d.game.entities.length,remoto:!!d.game.remotePlayer});})()');
    var sb = await B.eval('(function(){var d=window.BLITZ.debug;return JSON.stringify({conectado:window.BLITZ.Net.connected,estado:d.game.state,invitado:d.game.netClient,entidades:d.game.entities.length,entidadesRed:Object.keys(d.game.netEntities).length,hud:d.game.netHud?d.game.netHud.mode:null,ping:window.BLITZ.Net.ping});})()');
    console.log('Anfitrion: ' + sa);
    console.log('Invitado:  ' + sb);

    var ja = JSON.parse(sa), jb = JSON.parse(sb);
    if (!ja.conectado) fail.push('el anfitrion no quedo conectado');
    if (!jb.conectado) fail.push('el invitado no quedo conectado');
    if (!ja.remoto) fail.push('el anfitrion no creo al jugador remoto');
    if (jb.estado !== 'playing') fail.push('el invitado no entro en partida (' + jb.estado + ')');
    if (!(jb.entidadesRed >= 5)) fail.push('el invitado no recibio las entidades del anfitrion (' + jb.entidadesRed + ')');
    if (!jb.hud) fail.push('el invitado no recibio el estado del modo');

    await sleep(2000);
    await A.shot(path.join(OUT, 'captura-multijugador-anfitrion.png'));
    await B.shot(path.join(OUT, 'captura-multijugador-invitado.png'));
    console.log('Capturas: docs/captura-multijugador-anfitrion.png, docs/captura-multijugador-invitado.png');
  } catch (err) {
    fail.push(err.message);
  } finally {
    cleanup();
  }

  console.log(fail.length ? ('FALLOS: ' + fail.join(' | ')) : 'Multijugador verificado de extremo a extremo: 0 fallos.');
  process.exit(fail.length ? 1 : 0);
})();
