/* Captura de pantalla del juego en Chrome headless mediante CDP.
   Arranca el servidor local, abre Chrome, hace varias capturas y recoge los errores
   de consola y las excepciones del navegador. Uso: node tools/screenshot.js */
'use strict';

var child = require('child_process');
var fs = require('fs');
var path = require('path');
var os = require('os');

var ROOT = path.resolve(path.join(__dirname, '..'));
var OUT = path.join(ROOT, 'docs');
var PORT = 8137;
var CDP_PORT = 9223;

var CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
].find(function (p) { return fs.existsSync(p); });

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function get(url) { return fetch(url).then(function (r) { return r.json(); }); }

/* ------------------------------- cliente CDP ------------------------------ */
function Client(wsUrl) {
  var self = this;
  this.id = 0;
  this.pending = new Map();
  this.events = [];
  this.ws = new WebSocket(wsUrl);
  this.ready = new Promise(function (resolve, reject) {
    self.ws.addEventListener('open', function () { resolve(); });
    self.ws.addEventListener('error', function (e) { reject(new Error('ws error: ' + (e.message || ''))); });
  });
  this.ws.addEventListener('message', function (ev) {
    var msg;
    try { msg = JSON.parse(ev.data); } catch (e) { return; }
    if (msg.id && self.pending.has(msg.id)) {
      var p = self.pending.get(msg.id);
      self.pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message));
      else p.resolve(msg.result);
    } else if (msg.method) {
      self.events.push(msg);
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
    }, 90000);
  });
};
Client.prototype.evaluate = function (expr) {
  return this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
};
Client.prototype.shot = function (file, quality) {
  var self = this;
  return this.send('Page.captureScreenshot', quality ? { format: 'jpeg', quality: quality } : { format: 'png' })
    .then(function (r) {
      fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
      return fs.statSync(file).size;
    });
};

/* --------------------------------- principal ------------------------------- */
(async function main() {
  if (!CHROME) {
    console.log('No se encontro Chrome ni Edge.');
    process.exit(1);
  }
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

  var server = child.spawn(process.execPath, [path.join(__dirname, 'serve.js'), String(PORT)], { stdio: 'ignore' });
  var profile = path.join(os.tmpdir(), 'blockburst-chrome-' + Date.now());
  var chrome = child.spawn(CHROME, [
    '--headless=new',
    '--hide-scrollbars',
    '--mute-audio',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--enable-unsafe-swiftshader',
    '--use-angle=swiftshader',
    '--window-size=1600,900',
    '--remote-debugging-port=' + CDP_PORT,
    '--user-data-dir=' + profile,
    'about:blank'
  ], { stdio: 'ignore' });

  var cleanup = function () {
    function killTree(pid) {
      if (!pid) return;
      try { child.execSync('taskkill /F /T /PID ' + pid, { stdio: 'ignore' }); } catch (e) { }
    }
    function killStrays() {
      try {
        child.execSync('powershell -NoProfile -ExecutionPolicy Bypass -File "' + path.join(__dirname, 'kill-chrome.ps1') + '"', { stdio: 'ignore' });
      } catch (e) { }
    }
    killTree(chrome.pid);
    killTree(server.pid);
    killStrays();
  };

  try {
    await sleep(1500);
    var targets = null;
    for (var i = 0; i < 40; i++) {
      try { targets = await get('http://127.0.0.1:' + CDP_PORT + '/json/list'); break; }
      catch (e) { await sleep(400); }
    }
    if (!targets) throw new Error('Chrome no respondio en el puerto de depuracion');
    var page = targets.filter(function (t) { return t.type === 'page'; })[0];
    if (!page) throw new Error('sin pestana de pagina');

    var client = new Client(page.webSocketDebuggerUrl);
    await client.ready;
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Log.enable');

    var shots = [];

    /* Navega liberando antes el contexto WebGL y verifica que la pagina arranco.
       SwiftShader agota buferes si se encadenan varias cargas pesadas en la misma pestana. */
    async function goto(url, waitMs, readyExpr) {
      for (var attempt = 0; attempt < 3; attempt++) {
        await client.send('Page.navigate', { url: 'about:blank' });
        await sleep(500);
        await client.send('Page.navigate', { url: url });
        await sleep(waitMs + attempt * 1500);
        var r = await client.evaluate('(function(){try{return !!(' + readyExpr + ');}catch(e){return false;}})()');
        if (r && r.result && r.result.value === true) { client.events.length = 0; return true; }
        console.log('  (reintento ' + (attempt + 1) + ' de carga)');
      }
      throw new Error('la pagina no arranco: ' + url);
    }

    /* Modo archivo unico: node tools/screenshot.js dist/BlockBurst.html */
    var singlePage = process.argv[2];
    if (singlePage) {
      var target = /^https?:/i.test(String(singlePage))
        ? String(singlePage)
        : ('http://127.0.0.1:' + PORT + '/' + String(singlePage).replace(/\\/g, '/').replace(/^\.?\//, ''));
      var isRemote = /^https?:/i.test(target);
      await goto(target, 5000,
        'window.BLITZ && window.BLITZ.debug && document.getElementById("loading").hidden && document.querySelectorAll("#menuBody .card").length > 0');
      shots.push({ name: 'captura-archivo-unico.png', size: await client.shot(path.join(OUT, 'captura-archivo-unico.png')) });
      var d1 = await client.evaluate('(function(){var d=window.BLITZ&&window.BLITZ.debug;if(!d)return "sin debug";return JSON.stringify({estado:d.game.state,mapas:(window.BLITZ.MAPS||[]).length,modos:(window.BLITZ.MODES||[]).length,armas:(window.BLITZ.WEAPONS||[]).length,p2p:typeof RTCPeerConnection,menu:!document.getElementById("menu").hidden});})()');
      console.log('Captura generada:');
      shots.forEach(function (s) { console.log('  ' + s.name + '  ' + Math.round(s.size / 1024) + ' KB'); });
      console.log('Diagnostico de ' + target + ': ' + (d1 && d1.result ? d1.result.value : JSON.stringify(d1)));
      var errs1 = client.events.filter(function (e) {
        return e.method === 'Runtime.exceptionThrown' ||
          (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error') ||
          (e.method === 'Log.entryAdded' && e.params.entry.level === 'error');
      });
      console.log('Errores de consola/excepciones: ' + errs1.length);
      client.ws.close();
      return;
    }

    /* 1. Menu principal */
    await goto('http://127.0.0.1:' + PORT + '/index.html', 2600,
      'document.getElementById("loading").hidden && document.querySelectorAll("#menuBody .card").length > 0');
    shots.push({ name: 'captura-menu.png', size: await client.shot(path.join(OUT, 'captura-menu.png')) });

    /* 2. Partida: todos contra todos en tercera persona, con bots cerca */
    await goto('http://127.0.0.1:' + PORT + '/index.html?auto=dm&map=distrito&bots=10&third=1', 4200,
      'window.BLITZ.debug && window.BLITZ.debug.game.state === "playing"');
    await client.evaluate('(function(){var g=window.BLITZ.debug.game,p=g.player;' +
      'p.alive=true;p.invuln=99999;p.health=100;p.armor=60;p.thirdPerson=true;p.cameraDist=9;' +
      'p.pos.x=-4;p.pos.y=1.2;p.pos.z=-4;p.yaw=2.35;p.pitch=-0.07;' +
      'g.entities.filter(function(e){return e.isBot&&e.alive;}).slice(0,4).forEach(function(e,i){' +
      'e.pos.x=p.pos.x+[-7,7,-9,9][i];e.pos.z=p.pos.z+[6,5,-6,-5][i];e.pos.y=0.2;e.health=100;e.alive=true;});return 1;})()');
    await sleep(1000);
    shots.push({ name: 'captura-partida.png', size: await client.shot(path.join(OUT, 'captura-partida.png')) });

    /* 2b. Primer plano del personaje de bloques */
    await client.evaluate('(function(){var g=window.BLITZ.debug.game,p=g.player;p.cameraDist=3.4;p.pitch=0.05;p.yaw=0.6;return 1;})()');
    await sleep(800);
    shots.push({ name: 'captura-personaje.png', size: await client.shot(path.join(OUT, 'captura-personaje.png')) });

    /* 3. Supervivencia */
    await goto('http://127.0.0.1:' + PORT + '/index.html?auto=survival&map=neon&bots=6&third=1', 6000,
      'window.BLITZ.debug && window.BLITZ.debug.game.state === "playing"');
    await client.evaluate('(function(){var g=window.BLITZ.debug.game,p=g.player;' +
      'p.alive=true;p.invuln=99999;p.health=88;p.armor=40;p.thirdPerson=true;p.cameraDist=8;' +
      'p.pos.x=0;p.pos.y=1.2;p.pos.z=12;p.yaw=3.14;p.pitch=-0.05;' +
      'g.entities.filter(function(e){return e.isBot&&e.alive;}).slice(0,4).forEach(function(e,i){' +
      'e.pos.x=p.pos.x+[-6,6,-3,3][i];e.pos.z=p.pos.z-7-i*2;e.pos.y=0.2;});return 1;})()');
    await sleep(1000);
    shots.push({ name: 'captura-supervivencia.png', size: await client.shot(path.join(OUT, 'captura-supervivencia.png')) });

    /* 4. Vista interior con arma y reticula */
    await goto('http://127.0.0.1:' + PORT + '/index.html?auto=ctf&map=templo&bots=8', 4500,
      'window.BLITZ.debug && window.BLITZ.debug.game.state === "playing"');
    await client.evaluate('(function(){var g=window.BLITZ.debug.game,p=g.player;' +
      'p.alive=true;p.invuln=99999;p.health=64;p.armor=50;p.thirdPerson=false;' +
      'p.pos.x=-2;p.pos.y=1.2;p.pos.z=20;p.yaw=3.05;p.pitch=-0.02;return 1;})()');
    await sleep(1200);
    shots.push({ name: 'captura-primera-persona.png', size: await client.shot(path.join(OUT, 'captura-primera-persona.png')) });

    /* 4b. Katana: modelo y pose de barrido */
    await client.evaluate('(function(){var g=window.BLITZ.debug.game;g.setWeapon("katana");window.BLITZ.Input.mouse=function(b){return b===0;};var p=g.player;if(!window.__keep){window.__keep=setInterval(function(){p.alive=true;p.invuln=99999;p.health=100;},200);}p.thirdPerson=false;return 1;})()');
    await sleep(1800);
    shots.push({ name: 'captura-katana.png', size: await client.shot(path.join(OUT, 'captura-katana.png')) });

    /* 5. Francotirador con la mira puesta: zoom y reticula del visor */
    await client.evaluate('(function(){var g=window.BLITZ.debug.game;g.setWeapon("sniper");window.BLITZ.Input.mouse=function(b){return b===2;};var p=g.player;if(!window.__keep){window.__keep=setInterval(function(){p.alive=true;p.invuln=99999;p.health=100;},200);}p.thirdPerson=false;return 1;})()');
    await sleep(2600);
    shots.push({ name: 'captura-francotirador.png', size: await client.shot(path.join(OUT, 'captura-francotirador.png')) });

    /* 6. Islas Flotantes: pasarelas que conectan todo el terreno */
    await goto('http://127.0.0.1:' + PORT + '/index.html?auto=survival&map=islas&bots=6&third=1', 6000,
      'window.BLITZ.debug && window.BLITZ.debug.game.state === "playing"');
    await client.evaluate('(function(){var g=window.BLITZ.debug.game,p=g.player;' +
      'p.alive=true;p.invuln=99999;p.thirdPerson=true;p.cameraDist=26;p.pos.x=0;p.pos.y=14;p.pos.z=30;' +
      'p.yaw=3.14;p.pitch=-0.5;window.BLITZ.Input.mouse=function(){return false;};return 1;})()');
    await sleep(1600);
    shots.push({ name: 'captura-islas.png', size: await client.shot(path.join(OUT, 'captura-islas.png')) });

    /* Diagnostico del navegador */
    var diag = await client.evaluate('(function(){var d=window.BLITZ&&window.BLITZ.debug;if(!d)return "sin debug";var g=d.game;var v=g.vmRoot;return JSON.stringify({modo:g.mode.id,mapa:g.map.id,estado:g.state,entidades:g.entities.length,vivos:g.entities.filter(function(e){return e.alive;}).length,hud:!document.getElementById("hud").hidden,armaVisible:!!(v&&v.visible),piezasArma:v?v.children.length:0});})()');
    var errs = client.events.filter(function (e) {
      return e.method === 'Runtime.exceptionThrown' ||
        (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error') ||
        (e.method === 'Log.entryAdded' && e.params.entry.level === 'error');
    }).map(function (e) {
      if (e.method === 'Runtime.exceptionThrown') return (e.params.exceptionDetails.exception && e.params.exceptionDetails.exception.description) || e.params.exceptionDetails.text;
      if (e.method === 'Runtime.consoleAPICalled') return e.params.args.map(function (a) { return a.value || a.description || a.type; }).join(' ');
      return e.params.entry.text;
    });

    console.log('Capturas generadas:');
    shots.forEach(function (s) { console.log('  ' + s.name + '  ' + Math.round(s.size / 1024) + ' KB'); });
    console.log('Diagnostico final: ' + (diag && diag.result ? diag.result.value : JSON.stringify(diag)));
    console.log('Errores de consola/excepciones: ' + errs.length);
    errs.slice(0, 12).forEach(function (m) { console.log('  - ' + String(m).split('\n')[0]); });
    client.ws.close();
  } catch (err) {
    console.log('ERROR: ' + err.message);
    process.exitCode = 1;
  } finally {
    cleanup();
  }
})();
