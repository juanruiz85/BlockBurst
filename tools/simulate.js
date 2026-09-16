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
  PCFSoftShadowMap: 2, RepeatWrapping: 1000, DoubleSide: 2
};
THREE.Scene.prototype = Object.create(Obj3D.prototype);
THREE.WebGLRenderer = function () {
  this.shadowMap = { enabled: false, type: 0 };
  this.setSize = function () { }; this.setPixelRatio = function () { }; this.render = function () { };
};

/* ------------------------------- stub del DOM ------------------------------ */
function Ctx2D() { }
["clearRect", "fillRect", "beginPath", "moveTo", "lineTo", "stroke", "fill", "arc", "closePath", "strokeRect", "save", "restore", "translate", "rotate", "scale", "setTransform"].forEach(function (m) { Ctx2D.prototype[m] = function () { }; });
Ctx2D.prototype.getImageData = function (x, y, w, h) { return { data: new Uint8ClampedArray(Math.max(4, w * h * 4)), width: w, height: h }; };
Ctx2D.prototype.putImageData = function () { };

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
  if (game.state === "playing" && !thrown && kills === 0) errors.push(label + ": no hubo ninguna baja en " + seconds + "s");
  game.teardown();
  return { game: game, thrown: thrown, kills: kills };
}

console.log("BLOCKBURST - simulacion sin navegador\n");

runMatch("Todos contra todos / Distrito", { modeId: "dm", mapId: "distrito", bots: 8, difficulty: "normal", fov: 80, name: "Tu" }, 45, { weapon: "rifle", autoAim: true });
runMatch("Duelo por equipos / Caldera", { modeId: "tdm", mapId: "caldera", bots: 8, difficulty: "dificil", fov: 80, name: "Tu" }, 45, { weapon: "smg", autoAim: true });
runMatch("Supervivencia / Azoteas Neon", { modeId: "survival", mapId: "neon", bots: 6, difficulty: "normal", fov: 80, name: "Tu" }, 60, { weapon: "shotgun" });
runMatch("Captura la bandera / Templo", { modeId: "ctf", mapId: "templo", bots: 8, difficulty: "normal", fov: 80, name: "Tu" }, 60, { weapon: "rifle", autoAim: true });
runMatch("Rey de la colina / Islas", { modeId: "koth", mapId: "islas", bots: 8, difficulty: "facil", fov: 80, name: "Tu" }, 45, { weapon: "sniper" });
runMatch("Todos contra todos / Glaciar", { modeId: "dm", mapId: "glaciar", bots: 10, difficulty: "pesadilla", fov: 80, name: "Tu" }, 40, { weapon: "rocket" });

console.error = origError;
console.log("\nIncidencias: " + errors.length);
errors.forEach(function (e) { console.log("  - " + e); });
process.exit(errors.length ? 1 : 0);
