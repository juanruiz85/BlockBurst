/* Prueba de salas con varios jugadores: abre TRES navegadores reales, crea una sala,
   une a dos invitados con el codigo, empieza la partida y comprueba que los tres
   juegan y que la sala empieza la cuenta atras cuando quedan vacios.
   Uso: node tools/roomtest.js */
'use strict';

var child = require('child_process');
var fs = require('fs');
var path = require('path');
var os = require('os');

var ROOT = path.resolve(path.join(__dirname, '..'));
var OUT = path.join(ROOT, 'docs');
var PORT = 8163;
var GUESTS = Math.max(1, Math.min(2, Number(process.argv[2] || 2)));
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
  this.events = [];
  this.ws = new WebSocket(wsUrl);
  this.ready = new Promise(function (resolve, reject) {
    self.ws.addEventListener('open', function () { resolve(); });
    self.ws.addEventListener('error', function () { reject(new Error('ws')); });
  });
  this.ws.addEventListener('message', function (ev) {
    var m;
    try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (m.method) self.events.push(m);
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
    }, 120000);
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

function launch(port, tag) {
  var profile = path.join(os.tmpdir(), 'bb-room-' + tag + '-' + Date.now());
  return child.spawn(CHROME, [
    '--headless=new', '--hide-scrollbars', '--mute-audio', '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--enable-unsafe-swiftshader',
    '--use-angle=swiftshader', '--window-size=640,420',
    '--remote-debugging-port=' + port, '--user-data-dir=' + profile, 'about:blank'
  ], { stdio: 'ignore' });
}

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

async function openMulti(c, who, url) {
  for (var i = 0; i < 3; i++) {
    await c.send('Page.navigate', { url: 'about:blank' });
    await sleep(500);
    await c.send('Page.navigate', { url: url });
    await sleep(4200 + i * 2000);
    var ok = await c.eval('!!(window.BLITZ && window.BLITZ.debug && document.getElementById("loading").hidden === true)');
    if (ok) { await c.eval('document.querySelector(\'[data-tab="multi"]\').click(); 1'); return true; }
    console.log('  (' + who + ': reintento de carga)');
  }
  throw new Error(who + ': la pagina no arranco');
}

async function poll(c, expr, check, tries, waitMs, label) {
  var last;
  for (var i = 0; i < tries; i++) {
    await sleep(waitMs);
    last = await c.eval(expr);
    if (check(last)) return last;
  }
  throw new Error('no se cumplio: ' + label + ' (ultimo: ' + JSON.stringify(last) + ')');
}

(async function main() {
  if (!CHROME) { console.log('No se encontro Chrome ni Edge.'); process.exit(1); }
  var server = child.spawn(process.execPath, [path.join(__dirname, 'serve.js'), String(PORT)], { stdio: 'ignore' });
  var procs = [launch(9261, 'h'), launch(9262, 'a'), launch(9263, 'b')];
  var fail = [];
  function killTree(pid) {
    if (!pid) return;
    try { child.execSync('taskkill /F /T /PID ' + pid, { stdio: 'ignore' }); } catch (e) { }
  }
  function killStrays() {
    try {
      child.execSync('powershell -NoProfile -ExecutionPolicy Bypass -File "' + path.join(__dirname, 'kill-chrome.ps1') + '"', { stdio: 'ignore' });
    } catch (e) { }
  }
  var cleanup = function () {
    procs.forEach(function (p) { killTree(p.pid); });
    killTree(server.pid);
    killStrays();
  };

  try {
    await sleep(1600);
    var url = 'http://127.0.0.1:' + PORT + '/index.html?lowq=1&bots=2&fps=20';
    var urlGuest = 'http://127.0.0.1:' + PORT + '/index.html?lowq=1&bots=2&fps=3';
    var H = await connect(9261), A = await connect(9262), B = await connect(9263);

    console.log('Abriendo tres navegadores...');
    await openMulti(H, 'anfitrion', url);
    await sleep(1200);
    await openMulti(A, 'invitado 1', urlGuest);
    if (GUESTS > 1) {
      await sleep(1200);
      await openMulti(B, 'invitado 2', urlGuest);
    }
    console.log('  (invitados: ' + GUESTS + ')');

    console.log('El anfitrion crea la sala...');
    await H.eval('document.getElementById("btnCreateRoom").click(); 1');
    var code = await poll(H, '(function(){return window.BLITZ.Net.room;})()', function (v) { return !!v; }, 30, 400, 'codigo de sala');
    console.log('  codigo: ' + code);

    console.log('Los invitados entran con el codigo...');
    for (var i = 0; i < GUESTS; i++) {
      var C = i === 0 ? A : B;
      await C.eval('document.getElementById("roomCodeIn").value = ' + JSON.stringify(code) + '; 1');
      await C.eval('document.getElementById("btnJoinRoom").click(); 1');
    }
    for (var j = 0; j < GUESTS; j++) {
      var D = j === 0 ? A : B;
      await poll(D, 'window.BLITZ.Net.connected', function (v) { return v === true; }, 40, 800, 'invitado ' + (j + 1) + ' conectado');
      console.log('  invitado ' + (j + 1) + ' conectado');
    }

    var count = await poll(H, 'window.BLITZ.Net.playerCount()', function (v) { return v >= GUESTS + 1; }, 20, 700, 'todos en la sala');
    console.log('  jugadores en la sala segun el anfitrion: ' + count);

    console.log('El anfitrion empieza la partida...');
    await H.eval('(function(){var d=document.getElementById("roomDiff");if(d){d.value="facil";d.dispatchEvent(new Event("change"));}return 1;})()');
    await sleep(400);
    await H.eval('document.getElementById("btnStartRoom").click(); 1');

    var hostState = await poll(H, '(function(){var d=window.BLITZ.debug;return JSON.stringify({estado:d.game.state,remotos:Object.keys(d.game.remotes||{}).length,entidades:d.game.entities.length});})()',
      function (v) { return JSON.parse(v).estado === 'playing' && JSON.parse(v).remotos === GUESTS; }, 25, 700, 'anfitrion en partida con ' + GUESTS + ' remotos');
    console.log('  anfitrion: ' + hostState);

    var gA = null;
    for (var k = 0; k < 25; k++) {
      await sleep(800);
      gA = await A.eval('(function(){var d=window.BLITZ.debug;return JSON.stringify({estado:d.game.state,invitado:d.game.netClient,entidadesRed:Object.keys(d.game.netEntities||{}).length,hud:d.game.netHud?d.game.netHud.mode:null});})()');
      var oa = JSON.parse(gA);
      if (oa.estado === 'playing' && oa.entidadesRed >= 3) break;
    }
    console.log('  invitado 1: ' + gA);
    var oa2 = JSON.parse(gA);
    if (!(oa2.estado === 'playing' && oa2.entidadesRed >= 3)) {
      var diag = await A.eval('(function(){var n=window.BLITZ.Net;var l=n.link;return JSON.stringify({room:n.room,host:n.isHost,connected:n.connected,link:!!l,fast:(l&&l.fast)?l.fast.readyState:null,rel:(l&&l.rel)?l.rel.readyState:null,handlers:Object.keys(n.handlers||{}),outbox:(l&&l.outbox)?l.outbox.length:0,recibidos:n.received,enviados:n.stats,netClient:window.BLITZ.debug.game.netClient,estado:window.BLITZ.debug.game.state});})()');
      console.log('  diagnostico invitado 1: ' + diag);
      var hdiag = await H.eval('(function(){var n=window.BLITZ.Net;var out={host:n.isHost,netHost:window.BLITZ.debug.game.netHost,peers:[]};for(var k in n.peers){var p=n.peers[k];out.peers.push({id:k,conn:p.connected,fast:(p.link&&p.link.fast)?p.link.fast.readyState:null,rel:(p.link&&p.link.rel)?p.link.rel.readyState:null});}out.enviados=n.stats;out.recibidos=n.received;out.salto=n.lastSkip;out.errorEnvio=n.lastSendError;out.snapTimer=window.BLITZ.debug.game.netSnapTimer;out.fastHz=n.FAST_HZ;return JSON.stringify(out);})()');
      console.log('  diagnostico anfitrion: ' + hdiag);
      var herrs = H.events.filter(function (e) {
        return e.method === 'Runtime.exceptionThrown' || (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error');
      }).map(function (e) {
        if (e.method === 'Runtime.exceptionThrown') return (e.params.exceptionDetails.exception && e.params.exceptionDetails.exception.description) || e.params.exceptionDetails.text;
        return e.params.args.map(function (x) { return x.value || x.description || x.type; }).join(' ');
      });
      console.log('  errores en el anfitrion: ' + herrs.length);
      herrs.slice(0, 5).forEach(function (x) { console.log('    - ' + String(x).split('\n')[0]); });
      var errs = A.events.filter(function (e) {
        return e.method === 'Runtime.exceptionThrown' || (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error');
      }).map(function (e) {
        if (e.method === 'Runtime.exceptionThrown') return (e.params.exceptionDetails.exception && e.params.exceptionDetails.exception.description) || e.params.exceptionDetails.text;
        return e.params.args.map(function (x) { return x.value || x.description || x.type; }).join(' ');
      });
      console.log('  errores en el invitado 1: ' + errs.length);
      errs.slice(0, 5).forEach(function (x) { console.log('    - ' + String(x).split('\n')[0]); });
      fail.push('el invitado 1 no recibio el mundo');
    }
    var gB = null;
    if (GUESTS > 1) {
      gB = await poll(B, '(function(){var d=window.BLITZ.debug;return JSON.stringify({estado:d.game.state,entidadesRed:Object.keys(d.game.netEntities||{}).length});})()',
        function (v) { var o = JSON.parse(v); return o.estado === 'playing' && o.entidadesRed >= 3; }, 25, 700, 'invitado 2 en partida');
      console.log('  invitado 2: ' + gB);
    }

    var diffApplied = await H.eval('window.BLITZ.debug.game.settings.difficulty');
    console.log('dificultad elegida al crear la partida: ' + diffApplied);
    if (diffApplied !== 'facil') fail.push('la dificultad elegida en la sala no se aplico (quedo en ' + diffApplied + ')');

    await sleep(1500);
    await H.shot(path.join(OUT, 'captura-sala-anfitrion.png'));
    await A.shot(path.join(OUT, 'captura-sala-invitado.png'));

    console.log('Un invitado sale...');
    var leaver = GUESTS > 1 ? B : A;
    await leaver.send('Page.navigate', { url: 'about:blank' });
    await sleep(3000);
    var mid = await H.eval('(function(){var d=window.BLITZ.debug;var n=document.getElementById("roomNote");return JSON.stringify({jugadores:window.BLITZ.Net.playerCount(),remotos:Object.keys(d.game.remotes||{}).length,nota:n?n.textContent:""});})()');
    console.log('  anfitrion con ' + (GUESTS - 1) + ' invitado(s) menos: ' + mid);
    var jm = JSON.parse(mid);
    if (jm.remotos !== GUESTS - 1) fail.push('el anfitrion no retiro al jugador que se fue (remotos=' + jm.remotos + ')');

    if (GUESTS > 1) {
      console.log('  (queda un invitado: la sala NO debe cerrarse)');
      if (/se cerrara en/i.test(jm.nota)) fail.push('la sala empezo a cerrarse con un jugador todavia dentro');
      await A.send('Page.navigate', { url: 'about:blank' });
      await sleep(2500);
    }

    console.log('La sala se vacia: debe empezar la cuenta atras de 1 minuto...');
    var note = await poll(H, '(function(){var n=document.getElementById("roomNote");return n?n.textContent:"";})()',
      function (v) { return /se cerrara en/i.test(String(v)); }, 25, 800, 'cuenta atras de cierre de sala');
    console.log('  aviso del anfitrion: "' + note + '"');

    var after = await H.eval('(function(){var d=window.BLITZ.debug;return JSON.stringify({jugadores:window.BLITZ.Net.playerCount(),remotos:Object.keys(d.game.remotes||{}).length,estado:d.game.state});})()');
    console.log('  anfitrion tras la salida: ' + after);
    var ja = JSON.parse(after);
    if (ja.remotos !== 0) fail.push('el anfitrion no retiro a todos los que se fueron (remotos=' + ja.remotos + ')');
  } catch (err) {
    fail.push(err.message);
  } finally {
    cleanup();
  }

  console.log(fail.length ? ('FALLOS: ' + fail.join(' | ')) : 'Salas verificadas con 3 navegadores: 0 fallos.');
  process.exit(fail.length ? 1 : 0);
})();
