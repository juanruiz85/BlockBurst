/* Simulacion sin navegador de BLOCKBURST.
   Sustituye Three.js y el DOM por stubs y ejecuta varias partidas completas para
   detectar excepciones en tiempo de ejecucion (fisica, disparos, IA, modos, HUD).
   Uso: node tools/simulate.js */
'use strict';

/* ----------------------------- stub de Three.js ---------------------------- */
function V3(x, y, z) { this.x = x || 0; this.y = y || 0; this.z = z || 0; }
V3.prototype.set = function (x, y, z) { this.x = x; this.y = y; this.z = z; return this; };
V3.prototype.copy = function (v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; };
V3.prototype.clone = function () { return new V3(this.x, this.y, this.z); };
V3.prototype.add = function (v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; };
V3.prototype.addScaledVector = function (v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; };
V3.prototype.multiplyScalar = function (s) { this.x *= s; this.y *= s; this.z *= s; return this; };
V3.prototype.setScalar = function (s) { this.x = s; this.y = s; this.z = s; return this; };
V3.prototype.lengthSq = function () { return this.x * this.x + this.y * this.y + this.z * this.z; };
V3.prototype.length = function () { return Math.sqrt(this.lengthSq()); };
V3.prototype.normalize = function () { var l = this.length() || 1; return this.multiplyScalar(1 / l); };
V3.prototype.dot = function (v) { return this.x * v.x + this.y * v.y + this.z * v.z; };
V3.prototype.distanceTo = function (v) { var dx = this.x - v.x, dy = this.y - v.y, dz = this.z - v.z; return Math.sqrt(dx * dx + dy * dy + dz * dz); };
V3.prototype.crossVectors = function (a, b) {
  var ax = a.x, ay = a.y, az = a.z, bx = b.x, by = b.y, bz = b.z;
  this.x = ay * bz - az * by; this.y = az * bx - ax * bz; this.z = ax * by - ay * bx; return this;
};
V3.prototype.applyQuaternion = function (q) {
  var x = this.x, y = this.y, z = this.z, qx = q.x, qy = q.y, qz = q.z, qw = q.w;
  var ix = qw * x + qy * z - qz * y, iy = qw * y + qz * x - qx * z;
  var iz = qw * z + qx * y - qy * x, iw = -qx * x - qy * y - qz * z;
  this.x = ix * qw + iw * -qx + iy * -qz - iz * -qy;
  this.y = iy * qw + iw * -qy + iz * -qx - ix * -qz;
  this.z = iz * qw + iw * -qz + ix * -qy - iy * -qx;
  return this;
};

function Box3(min, max) { this.min = min || new V3(); this.max = max || new V3(); }
Box3.prototype.set = function (min, max) { this.min.copy(min); this.max.copy(max); return this; };
Box3.prototype.intersectsBox = function (b) {
  return b.max.x >= this.min.x && b.min.x <= this.max.x &&
    b.max.y >= this.min.y && b.min.y <= this.max.y &&
    b.max.z >= this.min.z && b.min.z <= this.max.z;
};
Box3.prototype.getSize = function (v) { return v.set(this.max.x - this.min.x, this.max.y - this.min.y, this.max.z - this.min.z); };
Box3.prototype.getCenter = function (v) { return v.set((this.min.x + this.max.x) / 2, (this.min.y + this.max.y) / 2, (this.min.z + this.max.z) / 2); };

function Obj3D() {
  this.position = new V3();
  this.scale = new V3(1, 1, 1);
  this.quaternion = { x: 0, y: 0, z: 0, w: 1 };
  this.visible = true;
  this.children = [];
  this.parent = null;
  this.castShadow = false;
  this.receiveShadow = false;
  this.matrixAutoUpdate = true;
  this.renderOrder = 0;
  var self = this;
  this.rotation = {
    x: 0, y: 0, z: 0, order: "XYZ",
    set: function (x, y, z, order) {
      this.x = x; this.y = y; this.z = z; if (order) this.order = order;
      var s1 = Math.sin(x / 2), c1 = Math.cos(x / 2);
      var s2 = Math.sin(y / 2), c2 = Math.cos(y / 2);
      var s3 = Math.sin(z / 2), c3 = Math.cos(z / 2);
      if (this.order === "YXZ") {
        self.quaternion.x = s1 * c2 * c3 + c1 * s2 * s3;
        self.quaternion.y = c1 * s2 * c3 - s1 * c2 * s3;
        self.quaternion.z = c1 * c2 * s3 - s1 * s2 * c3;
        self.quaternion.w = c1 * c2 * c3 + s1 * s2 * s3;
      } else {
        self.quaternion.w = c1 * c2 * c3 - s1 * s2 * s3;
        self.quaternion.x = s1 * c2 * c3 + c1 * s2 * s3;
        self.quaternion.y = c1 * s2 * c3 - s1 * c2 * s3;
        self.quaternion.z = c1 * c2 * s3 + s1 * s2 * c3;
      }
      return this;
    }
  };
}
Obj3D.prototype.add = function (o) { if (o) { o.parent = this; this.children.push(o); } return this; };
Obj3D.prototype.remove = function (o) {
  var i = this.children.indexOf(o);
  if (i >= 0) { this.children.splice(i, 1); o.parent = null; }
  return this;
};
Obj3D.prototype.traverse = function (cb) { cb(this); this.children.slice().forEach(function (c) { c.traverse(cb); }); };
Obj3D.prototype.lookAt = function () { return this; };
Obj3D.prototype.updateMatrix = function () { return this; };

function Mesh(geo, mat) { Obj3D.call(this); this.isMesh = true; this.geometry = geo || { dispose: function () { } }; this.material = mat; }
Mesh.prototype = Object.create(Obj3D.prototype);
Mesh.prototype.constructor = Mesh;

function Group() { Obj3D.call(this); this.isGroup = true; }
Group.prototype = Object.create(Obj3D.prototype);

function InstancedMesh(geo, mat, count) { Obj3D.call(this); this.isMesh = true; this.geometry = geo; this.material = mat; this.count = count; this.instanceMatrix = { needsUpdate: false }; }
InstancedMesh.prototype = Object.create(Obj3D.prototype);
InstancedMesh.prototype.setMatrixAt = function (i, m) { void i; void m; };

function Line(geo, mat) { Obj3D.call(this); this.isLine = true; this.geometry = geo; this.material = mat; }
Line.prototype = Object.create(Obj3D.prototype);

function Geo() { this.userData = {}; this.attributes = {}; }
Geo.prototype.dispose = function () { };
Geo.prototype.clone = function () {
  var g = new Geo(); var self = this;
  Object.keys(this.attributes).forEach(function (k) { g.attributes[k] = self.attributes[k]; });
  return g;
};
Geo.prototype.setAttribute = function (n, a) { this.attributes[n] = a; return this; };

function BufAttr(arr, item) {
  this.array = arr; this.itemSize = item; this.needsUpdate = false;
  this.setXYZ = function (i, x, y, z) { arr[i * 3] = x; arr[i * 3 + 1] = y; arr[i * 3 + 2] = z; };
}

function Mat(o) { o = o || {}; this.color = o.color; this.map = o.map; this.emissive = o.emissive; this.emissiveIntensity = o.emissiveIntensity; this.transparent = !!o.transparent; this.opacity = o.opacity == null ? 1 : o.opacity; this.depthWrite = true; this.side = o.side; }
Mat.prototype.dispose = function () { };

function Light() { Obj3D.call(this); this.intensity = 0; this.shadow = { mapSize: { set: function () { } }, camera: {}, bias: 0 }; this.target = new Obj3D(); }
Light.prototype = Object.create(Obj3D.prototype);

function Cam(fov, aspect, near, far) {
  Obj3D.call(this);
  this.fov = fov; this.aspect = aspect; this.near = near; this.far = far;
  this.updateProjectionMatrix = function () { };
}
Cam.prototype = Object.create(Obj3D.prototype);

var THREE = {
  Vector3: V3, Box3: Box3, Object3D: Obj3D, Group: Group, Mesh: Mesh, Line: Line,
  InstancedMesh: InstancedMesh, BufferGeometry: Geo, BufferAttribute: BufAttr,
  MeshLambertMaterial: Mat, MeshBasicMaterial: Mat,
  PointLight: Light, DirectionalLight: Light, HemisphereLight: Light, AmbientLight: Light,
  PerspectiveCamera: Cam, Scene: function () { Obj3D.call(this); this.background = null; this.fog = null; },
  Color: function (c) { this.value = c; },
  Fog: function (c, n, f) { this.color = c; this.near = n; this.far = f; },
  CanvasTexture: function (c) { this.image = c; this.wrapS = 0; this.wrapT = 0; this.anisotropy = 1; },
  BoxGeometry: Geo, SphereGeometry: Geo, RingGeometry: Geo,
  PCFSoftShadowMap: 2, RepeatWrapping: 1000, DoubleSide: 2, BackSide: 1,
  sRGBEncoding: 3001, ColorManagement: { enabled: false }
};
THREE.Scene.prototype = Object.create(Obj3D.prototype);
THREE.WebGLRenderer = function () {
  this.shadowMap = { enabled: false, type: 0 };
  this.autoClear = true;
  this.setSize = function () { }; this.setPixelRatio = function () { }; this.render = function () { };
  this.clearDepth = function () { };
};

/* ------------------------------- stub del DOM ------------------------------ */
function Ctx2D() { }
["clearRect", "fillRect", "beginPath", "moveTo", "lineTo", "stroke", "fill", "arc", "closePath", "strokeRect", "save", "restore", "translate", "rotate", "scale", "setTransform"].forEach(function (m) { Ctx2D.prototype[m] = function () { }; });
Ctx2D.prototype.getImageData = function (x, y, w, h) { return { data: new Uint8ClampedArray(Math.max(4, w * h * 4)), width: w, height: h }; };
Ctx2D.prototype.putImageData = function () { };
Ctx2D.prototype.createLinearGradient = function () { return { addColorStop: function () { } }; };

function El(tag) {
  this.tagName = tag; this.children = []; this.parentNode = null; this.style = {};
  this.classList = { add: function () { }, remove: function () { }, toggle: function () { }, contains: function () { return false; } };
  this.textContent = ""; this.innerHTML = ""; this.hidden = false; this.value = "0"; this.offsetWidth = 1;
}
El.prototype.appendChild = function (c) { c.parentNode = this; this.children.push(c); return c; };
El.prototype.removeChild = function (c) { var i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return c; };
El.prototype.addEventListener = function () { };
El.prototype.querySelectorAll = function () { return []; };
El.prototype.getContext = function () { return new Ctx2D(); };
El.prototype.setAttribute = function () { };
El.prototype.getAttribute = function () { return null; };

global.window = global;
global.addEventListener = function () { };
global.removeEventListener = function () { };
global.THREE = THREE;
global.devicePixelRatio = 1;
global.requestAnimationFrame = function () { return 0; };
global.document = {
  readyState: "complete", hidden: false,
  createElement: function (t) { return new El(t); },
  getElementById: function () { return new El("div"); },
  addEventListener: function () { },
  pointerLockElement: null, exitPointerLock: function () { }
};
global.localStorage = { getItem: function () { return null; }, setItem: function () { } };
global.AudioContext = undefined;

/* ------------------------------ carga del juego ---------------------------- */
require('../src/util.js');
require('../src/audio.js');
require('../src/input.js');
require('../src/world.js');
require('../src/avatar.js');
require('../src/weapons.js');
require('../src/maps.js');
require('../src/bots.js');
require('../src/modes.js');
require('../src/net.js');
require('../src/hud.js');
require('../src/game.js');

var B = global.BLITZ;
B.Audio.setEnabled(false);
B.HUD.init();
B.Input.init(new El("canvas"));

var errors = [];
var origError = console.error;
console.error = function () { errors.push(Array.prototype.join.call(arguments, " ")); };

/* entrada falsa y controlable */
var ctrl = { move: { x: 0, z: 1 }, fire: true, aim: null };
B.Input.moveAxis = function () { return ctrl.move; };
B.Input.down = function () { return false; };
B.Input.once = function () { return false; };
B.Input.mouse = function (b) { return ctrl.fire && b === 0; };
B.Input.mouseOnce = function (b) { return ctrl.fire && b === 0; };
B.Input.mouse = B.Input.mouse;
B.Input.takeWheel = function () { return 0; };
B.Input.takeLook = function () { return { dx: 0, dy: 0 }; };
B.Input.isLocked = function () { return true; };
B.Input.clearFrame = function () { };

function runMatch(label, config, seconds, opts) {
  opts = opts || {};
  var game = new B.Game();
  game.initRenderer(new El("canvas"));
  game.onFinish = function () { };
  game.start(config);
  if (opts.weapon) game.setWeapon(opts.weapon);

  var dt = 1 / 60;
  var frames = Math.round(seconds / dt);
  var thrown = null;
  var kills = 0, deaths = 0, prevKills = 0;
  var minZombieDist = Infinity;

  for (var f = 0; f < frames; f++) {
    if (opts.autoAim) {
      var p = game.player;
      var best = null, bd = Infinity;
      for (var ei = 0; ei < game.entities.length; ei++) {
        var en = game.entities[ei];
        if (en.isPlayer || !en.alive) continue;
        if (p.team && en.team === p.team) continue;
        var dd = B.dist2(p.pos.x, p.pos.z, en.pos.x, en.pos.z);
        if (dd < bd) { bd = dd; best = en; }
      }
      if (best) {
        var adx = best.pos.x - p.pos.x, adz = best.pos.z - p.pos.z;
        var ady = (best.pos.y + 1.1) - (p.pos.y + p.eye);
        p.yaw = Math.atan2(-adx, -adz);
        p.pitch = Math.asin(Math.max(-1, Math.min(1, ady / Math.sqrt(adx * adx + ady * ady + adz * adz))));
      }
    }
    try {
      game.update(dt);
      B.HUD.update(game, dt);
    } catch (e) {
      thrown = e.message + "\n" + (e.stack || "").split("\n").slice(1, 4).join("\n");
      break;
    }
    var k = 0;
    for (var i = 0; i < game.entities.length; i++) k += game.entities[i].kills;
    if (k !== prevKills) { kills = k; prevKills = k; }
    for (var zi = 0; zi < game.entities.length; zi++) {
      var zz = game.entities[zi];
      if (zz.kind === "zombie" && zz.alive) {
        minZombieDist = Math.min(minZombieDist, B.dist(zz.pos.x, zz.pos.z, game.player.pos.x, game.player.pos.z));
      }
    }
    if (opts.verbose && f % (60 * 10) === 0) {
      var zs = game.entities.filter(function (e) { return e.kind === "zombie" && e.alive; });
      var minD = 1e9;
      zs.forEach(function (z) { minD = Math.min(minD, B.dist(z.pos.x, z.pos.z, game.player.pos.x, game.player.pos.z)); });
      console.log("        t=" + (f / 60) + "s zombis=" + zs.length + " distMin=" + (minD === 1e9 ? "-" : Math.round(minD)) +
        " vidaJugador=" + Math.round(game.player.health) + " bajas=" + kills);
    }
    if (game.finished) break;
  }

  var alive = game.entities.filter(function (e) { return e.alive; }).length;
  var player = game.player;
  var bots = game.entities.filter(function (e) { return e.isBot; }).length;
  console.log("[" + (thrown ? "ERROR" : "  OK ") + "] " + label);
  console.log("        bots:" + bots + " vivos:" + alive + " bajas:" + kills +
    " jugador:hp=" + Math.round(player.health) + " bajas=" + player.kills +
    " muertes=" + player.deaths + " arma=" + player.weapon +
    " pos=(" + player.pos.x.toFixed(1) + "," + player.pos.y.toFixed(1) + "," + player.pos.z.toFixed(1) + ")" +
    (game.finished ? " FIN" : ""));
  if (thrown) { console.log("        " + thrown.split("\n")[0]); errors.push(label + ": " + thrown); }
  if (game.state === "playing" && !thrown && kills === 0 && minZombieDist > 4) {
    errors.push(label + ": ni bajas ni acercamiento enemigo en " + seconds + "s");
  }
  game.teardown();
  return { game: game, thrown: thrown, kills: kills, minZombieDist: minZombieDist };
}

console.log("BLOCKBURST - simulacion sin navegador\n");

runMatch("Todos contra todos / Distrito", { modeId: "dm", mapId: "distrito", bots: 8, difficulty: "normal", fov: 80, name: "Tu" }, 45, { weapon: "rifle", autoAim: true });
runMatch("Duelo por equipos / Caldera", { modeId: "tdm", mapId: "caldera", bots: 8, difficulty: "dificil", fov: 80, name: "Tu" }, 45, { weapon: "smg", autoAim: true });
runMatch("Supervivencia / Azoteas Neon", { modeId: "survival", mapId: "neon", bots: 6, difficulty: "normal", fov: 80, name: "Tu" }, 60, { weapon: "shotgun", verbose: true });
runMatch("Captura la bandera / Templo", { modeId: "ctf", mapId: "templo", bots: 8, difficulty: "normal", fov: 80, name: "Tu" }, 60, { weapon: "rifle", autoAim: true });
runMatch("Rey de la colina / Islas", { modeId: "koth", mapId: "islas", bots: 8, difficulty: "facil", fov: 80, name: "Tu" }, 45, { weapon: "sniper" });
runMatch("Todos contra todos / Glaciar", { modeId: "dm", mapId: "glaciar", bots: 10, difficulty: "pesadilla", fov: 80, name: "Tu" }, 40, { weapon: "rocket" });

/* ------------------- comprobaciones de jugabilidad ------------------- */
function gameplayChecks() {
  function check(name, ok, detail) {
    console.log("[" + (ok ? "  OK " : "ERROR") + "] " + name + (detail ? "  (" + detail + ")" : ""));
    if (!ok) errors.push(name);
  }

  /* Busca un punto despejado (varios rayos libres) para colocar pruebas */
  function clearSpot(game, minOpen) {
    var pts = [];
    game.map.spawns.forEach(function (s) { pts.push({ x: s[0], z: s[1] }); });
    game.map.pickupNodes.forEach(function (p) { pts.push({ x: p[0], z: p[1] }); });
    var best = null, bestOpen = -1;
    pts.forEach(function (p) {
      var open = 0;
      for (var a = 0; a < 8; a++) {
        var ang = a * Math.PI / 4;
        var hit = game.world.raycast(new THREE.Vector3(p.x, 1.1, p.z),
          new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang)), 7, 0.3);
        if (!hit) open++;
      }
      if (open > bestOpen) { bestOpen = open; best = p; }
    });
    void minOpen;
    return best || { x: 0, z: 0 };
  }

  // --- Retroceso: solo rifle y escopeta conservan el actual ---
  var pistol = B.Weapon.byId("pistol"), smg = B.Weapon.byId("smg"), rifle = B.Weapon.byId("rifle");
  var shotgun = B.Weapon.byId("shotgun"), sniper = B.Weapon.byId("sniper"), rocket = B.Weapon.byId("rocket");
  var katana = B.Weapon.byId("katana");
  check("retroceso suave en pistola, subfusil, francotirador y lanzacohetes",
    pistol.kick <= 0.03 && smg.kick <= 0.02 && sniper.kick <= 0.09 && rocket.kick <= 0.06,
    "pistola " + pistol.kick + ", subfusil " + smg.kick + ", franco " + sniper.kick + ", cohete " + rocket.kick);
  check("rifle y escopeta conservan su retroceso",
    rifle.kick >= 0.04 && shotgun.kick >= 0.12, "rifle " + rifle.kick + ", escopeta " + shotgun.kick);
  check("francotirador: zoom al apuntar y muerte de un tiro en la cabeza",
    sniper.adsFov > 0 && sniper.adsFov < 40 && sniper.lethalHead === true, "fov de mira " + sniper.adsFov);
  check("katana: cuerpo a cuerpo con barrido a varios objetivos",
    katana.kind === "melee" && katana.sweep === true && (katana.maxTargets || 0) >= 2,
    "alcance " + katana.range + ", objetivos " + katana.maxTargets);

  // --- Francotirador: un tiro en la cabeza mata aunque lleve escudo ---
  var g1 = new B.Game();
  g1.initRenderer(new El("canvas"));
  g1.onFinish = function () { };
  g1.start({ modeId: "dm", mapId: "distrito", bots: 1, difficulty: "normal", fov: 80, name: "Tu" });
  var spot1 = clearSpot(g1);
  var victim = g1.entities.filter(function (e) { return e.isBot; })[0];
  victim.armor = 100; victim.health = 100; victim.invuln = 0;
  victim.pos.x = spot1.x; victim.pos.y = 0.1; victim.pos.z = spot1.z - 9;
  var origin = new THREE.Vector3(spot1.x, 1.25, spot1.z);
  var headY = victim.pos.y + victim.height * 0.9;
  var dir = new THREE.Vector3(0, headY - origin.y, -9).normalize();
  g1.hitscanShot(g1.player, B.Weapon.byId("sniper"), origin, dir, { damageMul: 1, spreadDeg: 0 });
  check("francotirador: cabeza = un solo tiro", victim.health <= 0 && !victim.alive,
    "vida tras el disparo " + Math.round(victim.health));

  // --- Katana: barrido que alcanza a dos enemigos a la vez ---
  var g2 = new B.Game();
  g2.initRenderer(new El("canvas"));
  g2.onFinish = function () { };
  g2.start({ modeId: "dm", mapId: "distrito", bots: 4, difficulty: "normal", fov: 80, name: "Tu" });
  var bots = g2.entities.filter(function (e) { return e.isBot; });
  var pl = g2.player;
  var spot2 = clearSpot(g2);
  pl.pos.x = spot2.x; pl.pos.y = 0.1; pl.pos.z = spot2.z;
  pl.yaw = 0; pl.pitch = 0;
  g2.camera.position.set(pl.pos.x, pl.pos.y + pl.eye, pl.pos.z);
  g2.camera.rotation.set(0, 0, 0, "YXZ");
  // Dos enemigos delante, dentro del barrido
  bots[0].pos.x = pl.pos.x - 0.7; bots[0].pos.y = pl.pos.y; bots[0].pos.z = pl.pos.z - 1.7;
  bots[1].pos.x = pl.pos.x + 0.7; bots[1].pos.y = pl.pos.y; bots[1].pos.z = pl.pos.z - 1.7;
  bots[0].health = 100; bots[0].armor = 0; bots[0].invuln = 0;
  bots[1].health = 100; bots[1].armor = 0; bots[1].invuln = 0;
  var hits = g2.meleeAttack(pl, B.Weapon.byId("katana"));
  check("katana: el barrido alcanza a varios enemigos", hits >= 2 && bots[0].health < 100 && bots[1].health < 100,
    "objetivos alcanzados " + hits);

  // --- Multijugador: los bots tambien tienen que atacar al jugador remoto ---
  var g3 = new B.Game();
  g3.initRenderer(new El("canvas"));
  g3.onFinish = function () { };
  g3.netHost = true;
  g3.start({ modeId: "dm", mapId: "distrito", bots: 4, difficulty: "normal", fov: 80, name: "Anfitrion" });
  var spot3 = clearSpot(g3);
  var rem = g3.addRemotePlayer("p1", "Invitado");
  rem.armor = 0; rem.health = 100;
  rem.pos.x = spot3.x; rem.pos.y = 0.1; rem.pos.z = spot3.z;
  g3.player.pos.x = spot3.x + 34; g3.player.pos.z = spot3.z + 34;
  var blist = g3.entities.filter(function (e) { return e.isBot; });
  blist.forEach(function (b, i) {
    b.pos.x = spot3.x + 1.6 + i * 1.4;
    b.pos.y = 0.1;
    b.pos.z = spot3.z + 0.4 * i;
    b.target = null;
  });
  B.Net.applyInput(rem, [0, 0, 0, 0, 0, 0, 1, 0, 0, 0]);
  for (var f = 0; f < 60 * 4; f++) g3.update(1 / 60);
  var invulnOk = rem.invuln === 0;
  // Disparo forzado de un bot cercano contra el jugador remoto
  var b0 = blist[0];
  b0.pos.x = rem.pos.x + 1.4; b0.pos.z = rem.pos.z; b0.pos.y = rem.pos.y;
  b0.target = rem; b0.reactionTimer = 0; b0.cooldown = 0; b0.reloading = 0; b0.ammoMag = 30;
  B.Bots.shoot(g3, b0);
  check("multijugador: los bots atacan tambien al jugador remoto",
    invulnOk && rem.health < 100,
    "inmunidad del remoto al terminar " + rem.invuln + ", vida tras el disparo " + Math.round(rem.health));

  // --- Islas Flotantes: los bots no deben caerse al vacio ---
  var g4 = new B.Game();
  g4.initRenderer(new El("canvas"));
  g4.onFinish = function () { };
  g4.start({ modeId: "survival", mapId: "islas", bots: 4, difficulty: "normal", fov: 80, name: "Tu" });
  g4.player.pos.x = 0; g4.player.pos.z = 0;
  for (var k = 0; k < 60 * 45; k++) g4.update(1 / 60);
  var recovered = g4.voidRecoveries || 0;
  var fell = g4.voidFalls || 0;
  check("islas flotantes: los bots no se caen al vacio", recovered <= 3 && fell === 0,
    "recuperados " + recovered + ", caidos " + fell);

  // --- Islas Flotantes: una sola masa transitable (sin plataformas sueltas) ---
  var islas = B.mapById("islas");
  var sizes = islas.clusterSizes || [];
  var totalCells = sizes.reduce(function (acc, v) { return acc + (v || 0); }, 0) || 1;
  var big = sizes.reduce(function (acc, v) { return Math.max(acc, v || 0); }, 0);
  check("islas flotantes: el terreno transitable es una sola masa",
    (big / totalCells) >= 0.93,
    "la zona mayor es el " + Math.round(100 * big / totalCells) + "% de " + totalCells + " celdas (zonas: " + islas.clusterCount + ")");

  // --- Katana: tajo con golpe retardado, zancada y ataque mantenido ---
  check("katana: tajo con golpe al llegar y zancada hacia delante",
    katana.swingTime > 0 && katana.hitAt > 0 && katana.lunge > 0 && katana.auto === true,
    "tajo " + katana.swingTime + " s, golpe a los " + katana.hitAt + " s, zancada " + katana.lunge);

  /* Busca una direccion despejada desde un punto para colocar pruebas */
  function clearDir(game, spot, need) {
    for (var a = 0; a < 16; a++) {
      var ang = a * Math.PI / 8;
      var dx = Math.cos(ang), dz = Math.sin(ang);
      if (!game.world.raycast(new THREE.Vector3(spot.x, 1.62, spot.z), new THREE.Vector3(dx, 0, dz), need, 0.3)) {
        return { x: dx, z: dz };
      }
    }
    return null;
  }

  // --- Precision: disparos a la cabeza a varias distancias ---
  var g7 = new B.Game();
  g7.initRenderer(new El("canvas"));
  g7.onFinish = function () { };
  g7.start({ modeId: "dm", mapId: "distrito", bots: 1, difficulty: "normal", fov: 80, name: "Tu" });
  var tgt = g7.entities.filter(function (e) { return e.isBot; })[0];
  var spotP = clearSpot(g7);
  var dirP = clearDir(g7, spotP, 37);
  var hitsByDist = [], shotsByDist = [];
  var dists = [8, 20, 35];
  if (dirP) {
    dists.forEach(function (dist, di) {
      hitsByDist[di] = 0; shotsByDist[di] = 0;
      for (var rep = 0; rep < 12; rep++) {
        tgt.alive = true; tgt.health = 100; tgt.armor = 0; tgt.invuln = 0;
        tgt.pos.x = spotP.x + dirP.x * dist;
        tgt.pos.y = 0.1;
        tgt.pos.z = spotP.z + dirP.z * dist;
        var origin = new THREE.Vector3(spotP.x, 1.62, spotP.z);
        var headY = tgt.pos.y + 1.78;
        var dir = new THREE.Vector3(tgt.pos.x - origin.x, headY - origin.y, tgt.pos.z - origin.z).normalize();
        var before = tgt.health;
        g7.hitscanShot(g7.player, B.Weapon.byId("rifle"), origin, dir, {
          damageMul: 1,
          spreadDeg: B.Weapon.spreadDeg(B.Weapon.byId("rifle"), { ads: false, speedRatio: 0, grounded: true, shots: 0 })
        });
        shotsByDist[di]++;
        if (tgt.health < before) hitsByDist[di]++;
      }
    });
    check("precision: el rifle acierta a la cabeza a distintas distancias",
      hitsByDist[0] >= 11 && hitsByDist[1] >= 10 && hitsByDist[2] >= 9,
      "8m " + hitsByDist[0] + "/12, 20m " + hitsByDist[1] + "/12, 35m " + hitsByDist[2] + "/12");
  } else {
    check("precision: el rifle acierta a la cabeza a distintas distancias", false, "no se encontro linea despejada");
  }

  // --- Los bots no deben matar demasiado rapido ---
  var g8 = new B.Game();
  g8.initRenderer(new El("canvas"));
  g8.onFinish = function () { };
  g8.start({ modeId: "dm", mapId: "distrito", bots: 3, difficulty: "normal", fov: 80, name: "Tu" });
  var diedAt = -1;
  for (var q = 0; q < 60 * 30; q++) {
    g8.update(1 / 60);
    if (!g8.player.alive) { diedAt = q / 60; break; }
  }
  console.log("        (informativo) supervivencia con 3 bots en normal: " +
    (diedAt < 0 ? "aguanto los 30 s" : (diedAt.toFixed(1) + " s")) +
    "  [el muñeco de prueba no se cubre ni esquiva]");

  // --- La escala de dificultad debe notarse ---
  var ladder = [];
  ["facil", "normal", "dificil"].forEach(function (diff) {
    var gg = new B.Game();
    gg.initRenderer(new El("canvas"));
    gg.onFinish = function () { };
    gg.start({ modeId: "dm", mapId: "distrito", bots: 3, difficulty: diff, fov: 80, name: "Tu" });
    var d2 = -1;
    for (var w = 0; w < 60 * 30; w++) {
      gg.update(1 / 60);
      if (!gg.player.alive) { d2 = w / 60; break; }
    }
    ladder.push({ d: diff, t: d2 < 0 ? 30 : d2 });
  });
  check("la dificultad facil es indulgente",
    ladder[0].t >= 8,
    ladder.map(function (l) { return l.d + " " + l.t.toFixed(1) + "s"; }).join(", ") + " (informativo; el muñeco de prueba no se cubre)");

  // --- Zombis: no deben atacarse entre ellos ---
  var g5 = new B.Game();
  g5.initRenderer(new El("canvas"));
  g5.onFinish = function () { };
  g5.start({ modeId: "survival", mapId: "distrito", bots: 4, difficulty: "normal", fov: 80, name: "Tu" });
  g5.player.pos.x = 42; g5.player.pos.z = 42;
  for (var z1 = 0; z1 < 60 * 12; z1++) g5.update(1 / 60);
  var zombis = g5.entities.filter(function (e) { return e.kind === "zombie" && e.alive; });
  var entreEllos = zombis.filter(function (z) { return z.target && z.target.kind === "zombie"; }).length;
  var heridos = zombis.filter(function (z) { return z.health < z.maxHealth * 1.9 * 0.9; }).length;
  check("los zombis no se atacan entre ellos",
    entreEllos === 0 && heridos <= 1,
    "zombis apuntandose entre si " + entreEllos + ", heridos " + heridos + " de " + zombis.length);

  // --- Rey de la colina: apariciones repartidas y bots que acuden al objetivo ---
  var g6 = new B.Game();
  g6.initRenderer(new El("canvas"));
  g6.onFinish = function () { };
  g6.start({ modeId: "koth", mapId: "distrito", bots: 8, difficulty: "normal", fov: 80, name: "Tu" });
  var viv = g6.entities.filter(function (e) { return e.alive; });
  var minD = 1e9;
  for (var a = 0; a < viv.length; a++) {
    for (var bb = a + 1; bb < viv.length; bb++) {
      minD = Math.min(minD, B.dist(viv[a].pos.x, viv[a].pos.z, viv[bb].pos.x, viv[bb].pos.z));
    }
  }
  check("rey de la colina: cada jugador aparece separado",
    minD >= 8, "distancia minima entre dos apariciones " + Math.round(minD) + " u");

  var hillRef = g6.hill;
  var links = (g6.map.wpLinks || []).reduce(function (acc, l) { return acc + l.length; }, 0);
  var reached = new Set();
  var botsIni = g6.entities.filter(function (e) { return e.isBot && e.alive; });
  var mediaAntes = botsIni.length
    ? botsIni.reduce(function (acc, e) { return acc + B.dist(e.pos.x, e.pos.z, hillRef.x, hillRef.z); }, 0) / botsIni.length
    : 0;

  for (var k2 = 0; k2 < 60 * 20; k2++) {
    g6.update(1 / 60);
    if (k2 % 20 === 0) {
      g6.entities.forEach(function (e) {
        if (e.isBot && e.alive && B.dist(e.pos.x, e.pos.z, hillRef.x, hillRef.z) < hillRef.r + 10) reached.add(e);
      });
    }
  }
  var hill = g6.hill;
  var cerca = g6.entities.filter(function (e) {
    return e.isBot && e.alive && B.dist(e.pos.x, e.pos.z, hill.x, hill.z) < hill.r + 18;
  }).length;
  var vivos = g6.entities.filter(function (e) { return e.isBot && e.alive; });
  var mediaDespues = vivos.length
    ? vivos.reduce(function (acc, e) { return acc + B.dist(e.pos.x, e.pos.z, hill.x, hill.z); }, 0) / vivos.length
    : 0;
  check("rey de la colina: los bots acuden al objetivo",
    reached.size >= 3 || (reached.size >= 2 && mediaDespues < mediaAntes * 0.9),
    "bots distintos que llegaron a la colina " + reached.size + ", distancia media " +
    Math.round(mediaAntes) + " -> " + Math.round(mediaDespues) + " u, enlaces de ruta " + links);
}

/* --------------------- protocolo de red (sin WebRTC) --------------------- */
function netTest() {
  var host = new B.Game();
  host.initRenderer(new El("canvas"));
  host.onFinish = function () { };
  host.netHost = true;
  host.start({ modeId: "dm", mapId: "distrito", bots: 4, difficulty: "normal", fov: 80, name: "Anfitrion" });
  var rp = host.addRemotePlayer("p1", "Invitado");

  // Entrada del invitado: avanzar, mirar, correr y disparar
  B.Net.applyInput(rp, [0, 1, 1.2, -0.1, 0, 1, 4, 0, 1, 0]);
  var startX = rp.pos.x, startZ = rp.pos.z;
  for (var f = 0; f < 90; f++) host.update(1 / 60);
  var moved = B.dist(startX, startZ, rp.pos.x, rp.pos.z);
  var movedOk = moved > 1.5;
  var sane = rp.pos.y > -6 && rp.pos.y < 25 && isFinite(rp.pos.x);

  var snap = B.Net.buildSnapshot(host);
  var roster = B.Net.buildRoster(host);

  var guest = new B.Game();
  guest.initRenderer(new El("canvas"));
  guest.onFinish = function () { };
  guest.startNet({ modeId: "dm", mapId: "distrito", bots: 4, difficulty: "normal", fov: 80, name: "Invitado" });
  B.Net.applyRoster(guest, roster);
  B.Net.applySnapshot(guest, snap);

  var selfId = guest.player.netId;
  var selfRow = null;
  for (var i = 0; i < snap.p.length; i++) if (snap.p[i][0] === selfId) selfRow = snap.p[i];
  // La municion del invitado debe reflejar la instantanea autoritativa
  var ammoOk = !selfRow || guest.player.ammo[guest.player.weapon].mag === selfRow[10];

  for (var g = 0; g < 90; g++) guest.update(1 / 60);
  B.HUD.update(guest, 1 / 60);

  var selfDup = !!guest.netEntities[selfId];
  var bots = Object.keys(guest.netEntities).length;
  var botsOk = bots >= 5 && !selfDup;
  var hudOk = !!(guest.netHud && guest.netHud.mode && guest.hudInfo() === guest.netHud);
  var remoteOk = Object.keys(guest.netEntities).every(function (k) {
    var e = guest.netEntities[k];
    return isFinite(e.pos.x) && isFinite(e.pos.z);
  });

  var ok = movedOk && sane && botsOk && ammoOk && hudOk && remoteOk;
  console.log("[" + (ok ? "  OK " : "ERROR") + "] Multijugador: protocolo de red");
  console.log("        el jugador remoto se movio " + moved.toFixed(1) + " u, y=" + rp.pos.y.toFixed(2) +
    " | entidades en el invitado: " + bots + " (sin duplicar al local: " + !selfDup + ")" +
    " | hud del invitado: " + hudOk + " | municion autoritativa: " + ammoOk);
  if (!ok) errors.push("multijugador: protocolo");

  var sample = "SDP-DE-PRUEBA-" + new Array(500).join("x");
  return B.Net.codec.encode(sample).then(function (code) {
    return B.Net.codec.decode(code).then(function (back) {
      var codecOk = back === sample;
      console.log("        codec del codigo de sala: " + code.length + " caracteres, ida y vuelta " + (codecOk ? "correcta" : "FALLIDA"));
      if (!codecOk) errors.push("multijugador: codec");
    });
  });
}

netTest().catch(function (e) { errors.push("multijugador: " + e.message); }).then(function () {
  gameplayChecks();
}).then(function () {
  console.error = origError;
  console.log("\nIncidencias: " + errors.length);
  errors.forEach(function (e) { console.log("  - " + e); });
  process.exit(errors.length ? 1 : 0);
});