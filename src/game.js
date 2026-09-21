/* BLOCKBURST - nucleo del juego: bucle, fisica, combate, objetivos y camara */
(function () {
  'use strict';
  var B = (window.BLITZ = window.BLITZ || {});

  var PLAYER_HEIGHT = 1.9;
  var PLAYER_EYE = 1.62;
  var PLAYER_RADIUS = 0.42;

  function rayAABB(ox, oy, oz, dx, dy, dz, minX, minY, minZ, maxX, maxY, maxZ) {
    var t0 = 0, t1 = Infinity;
    var o = [ox, oy, oz], d = [dx, dy, dz], mn = [minX, minY, minZ], mx = [maxX, maxY, maxZ];
    for (var a = 0; a < 3; a++) {
      if (Math.abs(d[a]) < 1e-8) {
        if (o[a] < mn[a] || o[a] > mx[a]) return -1;
        continue;
      }
      var inv = 1 / d[a];
      var ta = (mn[a] - o[a]) * inv, tb = (mx[a] - o[a]) * inv;
      if (ta > tb) { var tmp = ta; ta = tb; tb = tmp; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) return -1;
    }
    return t0;
  }

  var _right = new THREE.Vector3();
  var _up = new THREE.Vector3();
  var WORLD_UP = new THREE.Vector3(0, 1, 0);

  function applySpread(dir, deg) {
    if (!deg) return dir;
    var r = B.rad(deg);
    _right.crossVectors(dir, WORLD_UP);
    if (_right.lengthSq() < 1e-6) _right.set(1, 0, 0);
    _right.normalize();
    _up.crossVectors(_right, dir).normalize();
    var ox = B.rand(-1, 1) * r, oy = B.rand(-1, 1) * r;
    dir.addScaledVector(_right, Math.tan(ox)).addScaledVector(_up, Math.tan(oy)).normalize();
    return dir;
  }

  function Game() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(80, 1, 0.06, 700);
    this.scene.add(this.camera);
    // Escena superpuesta para el arma en primera persona: nunca queda oculta
    this.viewScene = new THREE.Scene();
    this.viewCamera = new THREE.PerspectiveCamera(62, 1, 0.01, 20);
    this.viewScene.add(new THREE.AmbientLight(new THREE.Color("#ffffff"), 0.8));
    var vlight = new THREE.DirectionalLight(new THREE.Color("#ffffff"), 0.9);
    vlight.position.set(-0.5, 1, 0.9);
    this.viewScene.add(vlight);
    this.renderer = null;
    this.state = "menu";
    this.entities = [];
    this.effects = [];
    this.pickups = [];
    this.projectiles = [];
    this.tracers = [];
    this.tracerPool = [];
    this.barrels = [];
    // Multijugador
    this.netHost = false;
    this.netClient = false;
    this.netEntities = {};
    this.netEvents = [];
    this.netHud = null;
    this.nextNetId = 100;
    this.netSnapTimer = 0;
    this.netRosterTimer = 0;
    this.netInputTimer = 0;
    this.netInputAxis = { x: 0, z: 0 };
    this.remotes = {};
    this.nextGuestId = 1;
    this.elapsed = 0;
    this.world = null;
    this.map = null;
    this.mode = null;
    this.modeObj = null;
    this.scores = { red: 0, blue: 0 };
    this.finished = false;
    this.shake = 0;
    this.hitPause = 0;
    this.settings = {
      bots: 8, difficulty: "normal", fov: 80, sens: 1.0, volume: 0.7,
      quality: { shadows: false, pixelRatio: 1, name: "medio" }
    };
    this.onFinish = null;
    this.muzzle = null;
  }

  Game.prototype.initRenderer = function (canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: "high-performance" });
    if (THREE.ColorManagement) THREE.ColorManagement.enabled = true;
    if (THREE.sRGBEncoding !== undefined) this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.applyQuality();
  };

  Game.prototype.applyQuality = function () {
    if (!this.renderer) return;
    var q = this.settings.quality;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
    this.renderer.shadowMap.enabled = !!q.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.viewCamera.aspect = this.camera.aspect;
    this.viewCamera.updateProjectionMatrix();
  };

  Game.prototype.resize = function () {
    if (!this.renderer) return;
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.viewCamera.aspect = this.camera.aspect;
    this.viewCamera.updateProjectionMatrix();
  };

  /* ------------------------------- arranque ------------------------------- */
  Game.prototype.start = function (config) {
    this.teardown();
    this.settings.bots = config.bots;
    this.settings.difficulty = config.difficulty;
    this.settings.fov = config.fov;
    this.camera.fov = config.fov;
    this.camera.updateProjectionMatrix();

    this.map = B.mapById(config.mapId);
    this.mode = B.modeById(config.modeId);
    this.modeObj = null;
    this.elapsed = 0; this.finished = false; this.shake = 0;
    this.scores = { red: 0, blue: 0 };
    this.wave = 0; this.waveTimer = 3; this.waveActive = false;

    this.world = new B.World(this.scene, this.map, this.settings.quality);
    this.buildTracerPool();
    this.spawnBarrels();
    this.buildPlayer(config.name);

    this.entities = [this.player];
    this.player.netId = this.netClient ? 1 : 0;
    this.nextNetId = 100;
    this.nextGuestId = 1;
    this.remotes = {};
    if (this.netClient) {
      // En el invitado los bots y las reglas llegan desde el anfitrion
      this.modeObj = null;
    } else {
      this.mode.setup(this);
    }

    this.state = "playing";
    B.HUD.setPlaying(true);
    this.netBanner(this.map.name.toUpperCase(), 2.6, this.mode.name);
    B.Audio.resume();
  };

  Game.prototype.teardown = function () {
    if (this.world) { this.world.dispose(); this.world = null; }
    this.entities.forEach(function (e) {
      if (e.group) { if (e.group.parent) e.group.parent.remove(e.group); if (e.isPlayer && e.avatarGroup) e.avatarGroup.visible = false; }
      if (e.isBot && e.avatar) {
        e.avatar.group.traverse(function (o) { if (o.isMesh) o.geometry.dispose(); });
        if (e.avatar.group.parent) e.avatar.group.parent.remove(e.avatar.group);
      }
    });
    this.effects.forEach(function (fx) { if (fx.obj && fx.obj.parent) fx.obj.parent.remove(fx.obj); });
    this.pickups.forEach(function (p) { if (p.mesh.parent) p.mesh.parent.remove(p.mesh); });
    this.projectiles.forEach(function (p) { if (p.mesh.parent) p.mesh.parent.remove(p.mesh); });
    this.tracerPool.forEach(function (t) { if (t.mesh.parent) t.mesh.parent.remove(t.mesh); t.mesh.geometry.dispose(); });
    this.entities = []; this.effects = []; this.pickups = []; this.projectiles = [];
    this.tracerPool = []; this.tracers = [];
    this.barrels = [];
    this.netEntities = {}; this.netEvents = []; this.netHud = null; this.remotes = {};
    if (this.playerAvatar && this.playerAvatar.group.parent) this.playerAvatar.group.parent.remove(this.playerAvatar.group);
    this.player = null;
  };

  Game.prototype.buildPlayer = function (name) {
    var self = this;
    var p = {
      isPlayer: true, isBot: false, name: name || "Tu", team: this.mode.teams ? "red" : null,
      pos: { x: 0, y: 0.05, z: 0 }, vel: { x: 0, y: 0, z: 0 },
      yaw: 0, pitch: 0, radius: PLAYER_RADIUS, height: PLAYER_HEIGHT, eye: PLAYER_EYE,
      health: 100, maxHealth: 100, armor: 0, alive: true, grounded: true, jumpCooldown: 0,
      weapon: "pistol", ammo: {}, cooldown: 0, reloading: 0, shots: 0, shotTimer: 0,
      kills: 0, deaths: 0, score: 0, respawnTimer: 0, invuln: 1.5, carrying: null,
      moveSpeed: 6.3, runMul: 1.42, crouchMul: 0.5, adss: false, adsTimer: 0,
      thirdPerson: false, cameraDist: 4.6, bob: 0, recoil: 0, recoilVel: 0,
      lookDX: 0, lookDY: 0, groundedTimer: 0, goldTimer: 0
    };
    B.WEAPONS.forEach(function (w) {
      p.ammo[w.id] = { mag: w.mag, reserve: w.reserve };
    });
    p.ammo.pistol.reserve = 999;
    this.player = p;

    var sp = B.Bots.spawnPointFor(this, null);
    p.pos.x = sp[0]; p.pos.z = sp[1]; p.pos.y = (sp[2] || 0) + 0.06;
    // Evita aparecer dentro de un bloque
    for (var i = 0; i < 24 && this.world.pointSolid(p.pos.x, p.pos.y + 0.5, p.pos.z); i++) {
      var s2 = this.map.spawns[i % this.map.spawns.length];
      p.pos.x = s2[0]; p.pos.z = s2[1]; p.pos.y = (s2[2] || 0) + 0.06;
    }

    // Avatar (tercera persona)
    this.playerAvatar = B.Avatar.build({
      team: p.team,
      shirt: p.team === "blue" ? "#4b8dff" : "#ff7a1a",
      pants: "#2b3444",
      skin: "#e8b98a",
      hat: "cap",
      mood: "happy"
    });
    this.playerAvatar.group.visible = false;
    this.scene.add(this.playerAvatar.group);

    // Viewmodel
    this.buildViewmodel();
    this.spawnPickups();
  };

  Game.prototype.buildViewmodel = function () {
    if (this.vmRoot && this.vmRoot.parent) this.vmRoot.parent.remove(this.vmRoot);
    this.vmRoot = new THREE.Group();
    this.vmRoot.position.set(0.3, -0.28, -0.62);
    this.viewScene.add(this.vmRoot);

    this.muzzleFlash = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22),
      new THREE.MeshBasicMaterial({ color: "#ffe6a0", transparent: true, opacity: 0.95 }));
    this.muzzleFlash.visible = false;
    this.viewScene.add(this.muzzleFlash);

    this.muzzleLight = new THREE.PointLight("#ffd27a", 0, 9);
    this.viewScene.add(this.muzzleLight);

    this.setWeapon(this.player.weapon, true);
  };

  Game.prototype.setWeapon = function (id, silent) {
    var def = B.Weapon.byId(id);
    if (this.vmGroup && this.vmRoot) this.vmRoot.remove(this.vmGroup);
    this.vmGroup = B.Weapon.buildViewmodel(id).group;
    this.vmRoot.add(this.vmGroup);
    this.player.weapon = id;
    this.player.reloading = 0;
    this.camera.fov = this.settings.fov;
    this.camera.updateProjectionMatrix();
    if (!silent) B.Audio.ui();
  };

  Game.prototype.buildTracerPool = function () {
    var self = this;
    for (var i = 0; i < 56; i++) {
      var geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
      var mat = new THREE.MeshBasicMaterial({ color: "#ffe08a", transparent: true, opacity: 0.9 });
      var line = new THREE.Line(geo, mat);
      line.frustumCulled = false;
      line.visible = false;
      self.scene.add(line);
      self.tracerPool.push({ mesh: line, life: 0 });
    }
  };

  Game.prototype.tracer = function (from, to) {
    var t = this.tracerPool.find(function (x) { return x.life <= 0; });
    if (!t) t = this.tracerPool[0];
    var pos = t.mesh.geometry.attributes.position;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    t.mesh.visible = true;
    t.mesh.material.opacity = 0.85;
    t.life = 0.06;
    this.tracers.push(t);
  };

  /* ------------------------------- entidades ------------------------------ */
  Game.prototype.spawnBots = function (count, team, kind) {
    for (var i = 0; i < count; i++) {
      var bot = B.Bots.create(this, { team: team, kind: kind, difficulty: this.settings.difficulty });
      bot.netId = this.nextNetId++;
      this.entities.push(bot);
    }
  };

  Game.prototype.enemiesOf = function (ent) {
    var out = [];
    for (var i = 0; i < this.entities.length; i++) {
      var e = this.entities[i];
      if (e === ent || !e.alive) continue;
      if (ent.team && e.team === ent.team) continue;
      out.push(e);
    }
    return out;
  };

  /* ------------------------------ movimiento ------------------------------ */
  var _box = new THREE.Box3();
  var _v1 = new THREE.Vector3();
  var _v2 = new THREE.Vector3();

  Game.prototype.collides = function (ent) {
    _box.min.set(ent.pos.x - ent.radius, ent.pos.y + 0.02, ent.pos.z - ent.radius);
    _box.max.set(ent.pos.x + ent.radius, ent.pos.y + ent.height, ent.pos.z + ent.radius);
    return !!this.world.boxHits(_box);
  };

  Game.prototype.onGround = function (ent) {
    _box.min.set(ent.pos.x - ent.radius * 0.9, ent.pos.y - 0.14, ent.pos.z - ent.radius * 0.9);
    _box.max.set(ent.pos.x + ent.radius * 0.9, ent.pos.y + 0.05, ent.pos.z + ent.radius * 0.9);
    if (this.world.boxHits(_box)) return true;
    var ry = this.world.rampHeightAt(ent.pos.x, ent.pos.z);
    return ry != null && Math.abs(ent.pos.y - ry) < 0.16;
  };

  Game.prototype.moveCombatant = function (ent, vx, vz, dt, jump) {
    var map = this.map;
    ent.vel.x = vx; ent.vel.z = vz;

    if (jump && ent.grounded && (ent.jumpCooldown || 0) <= 0) {
      ent.vel.y = map.jump;
      ent.grounded = false; ent.jumpCooldown = 0.3;
      if (ent.isPlayer) B.Audio.jump();
    }
    ent.jumpCooldown = Math.max(0, (ent.jumpCooldown || 0) - dt);
    ent.vel.y -= map.gravity * dt;
    if (ent.vel.y < -60) ent.vel.y = -60;

    var wasGround = ent.grounded;

    // X
    ent.pos.x += ent.vel.x * dt;
    if (this.collides(ent)) {
      var upX = this.tryStep(ent);
      if (!upX) { ent.pos.x -= ent.vel.x * dt; }
    }
    // Z
    ent.pos.z += ent.vel.z * dt;
    if (this.collides(ent)) {
      var upZ = this.tryStep(ent);
      if (!upZ) { ent.pos.z -= ent.vel.z * dt; }
    }
    // Y
    ent.pos.y += ent.vel.y * dt;
    if (this.collides(ent)) {
      if (ent.vel.y <= 0) {
        ent.grounded = true;
        if (!wasGround && ent.isPlayer) B.Audio.land();
      }
      ent.pos.y -= ent.vel.y * dt;
      ent.vel.y = 0;
    }
    // rampas
    var ry = this.world.rampHeightAt(ent.pos.x, ent.pos.z);
    if (ry != null) {
      if (ent.pos.y < ry && ry - ent.pos.y < 1.4) {
        ent.pos.y = ry; if (ent.vel.y < 0) ent.vel.y = 0;
        ent.grounded = true;
      } else if (ent.pos.y >= ry - 0.16 && ent.pos.y <= ry + 0.16 && ent.vel.y <= 0) {
        ent.grounded = true;
      }
    } else if (!this.collides(ent)) {
      ent.grounded = this.onGround(ent);
    }

    // limites duros del mapa
    var b = this.world.bounds;
    if (map.ground !== false) {
      ent.pos.x = B.clamp(ent.pos.x, b.minX + 0.8, b.maxX - 0.8);
      ent.pos.z = B.clamp(ent.pos.z, b.minZ + 0.8, b.maxZ - 0.8);
    }

    if (ent.group) { ent.group.position.set(ent.pos.x, ent.pos.y, ent.pos.z); }
  };

  Game.prototype.tryStep = function (ent) {
    if (!ent.grounded) return false;
    var y0 = ent.pos.y;
    ent.pos.y = y0 + 0.62;
    if (!this.collides(ent)) return true;
    ent.pos.y = y0;
    return false;
  };

  Game.prototype.probeObstacle = function (ent, dx, dz) {
    var len = Math.hypot(dx, dz);
    if (len < 0.01) return { blocked: false };
    var nx = dx / len, nz = dz / len;
    var o = new THREE.Vector3(ent.pos.x, ent.pos.y + 0.95, ent.pos.z);
    var hit = this.world.raycast(o, new THREE.Vector3(nx, 0, nz), 2.1, 0.35);
    if (!hit) return { blocked: false };
    var left = this.world.raycast(o, new THREE.Vector3(-nz, 0, nx), 2.3, 0.35);
    var right = this.world.raycast(o, new THREE.Vector3(nz, 0, -nx), 2.3, 0.35);
    var turn = (!left && right) ? -1.0 : (!right && left) ? 1.0 : (Math.random() < 0.5 ? 0.95 : -0.95);
    var lowWall = !this.world.pointSolid(ent.pos.x, ent.pos.y + 1.7, ent.pos.z);
    return { blocked: true, turn: turn, jump: lowWall && Math.random() < 0.5 };
  };

  /* -------------------------------- disparo ------------------------------- */
  Game.prototype.muzzleWorld = function (shooter) {
    if (shooter.isPlayer) {
      var v = new THREE.Vector3(0, 0, -0.6).applyQuaternion(this.camera.quaternion);
      return new THREE.Vector3(this.camera.position.x + v.x, this.camera.position.y + v.y, this.camera.position.z + v.z);
    }
    return new THREE.Vector3(shooter.pos.x, shooter.pos.y + shooter.eye, shooter.pos.z);
  };

  Game.prototype.rayEntities = function (shooter, origin, dir, maxT) {
    var best = null, bestT = maxT;
    for (var i = 0; i < this.entities.length; i++) {
      var e = this.entities[i];
      if (e === shooter || !e.alive || e.invuln > 0) continue;
      if (shooter.team && e.team === shooter.team && !this.friendlyFire) continue;
      var r = e.radius + 0.06, h = e.height;
      var bt = rayAABB(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z,
        e.pos.x - r, e.pos.y + 0.1, e.pos.z - r, e.pos.x + r, e.pos.y + h * 0.8, e.pos.z + r);
      var ht = rayAABB(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z,
        e.pos.x - 0.3, e.pos.y + h * 0.8, e.pos.z - 0.3, e.pos.x + 0.3, e.pos.y + h + 0.14, e.pos.z + 0.3);
      var useT = -1, head = false;
      if (bt >= 0 && (ht < 0 || bt <= ht)) { useT = bt; head = false; }
      else if (ht >= 0) { useT = ht; head = true; }
      if (useT >= 0 && useT < bestT) { bestT = useT; best = { entity: e, t: useT, head: head }; }
    }
    return best;
  };

  Game.prototype.hitscanShot = function (shooter, def, origin, dir, opts) {
    opts = opts || {};
    var mul = opts.damageMul == null ? 1 : opts.damageMul;
    var pellets = def.pellets || 1;
    var range = def.range || 100;
    var muzzle = this.muzzleWorld(shooter);
    var killed = false, hitAny = false;

    for (var p = 0; p < pellets; p++) {
      var d = dir.clone().normalize();
      if (opts.spreadDeg) applySpread(d, opts.spreadDeg);
      else if (pellets > 1) applySpread(d, def.spread * 0.6);

      var wHit = this.world.raycast(origin, d, range, 0.2);
      var maxT = wHit ? wHit.dist : range;
      var eHit = this.rayEntities(shooter, origin, d, maxT);
      var bHit = this.rayBarrels(origin, d, maxT);
      var endPoint;

      if (bHit && (!eHit || bHit.t < eHit.t)) {
        endPoint = new THREE.Vector3(origin.x + d.x * bHit.t, origin.y + d.y * bHit.t, origin.z + d.z * bHit.t);
        this.damageBarrel(bHit.barrel, def.damage * mul, shooter);
        hitAny = true;
        this.spawnImpact(endPoint, "#ffb347");
      } else if (eHit) {
        endPoint = new THREE.Vector3(origin.x + d.x * eHit.t, origin.y + d.y * eHit.t, origin.z + d.z * eHit.t);
        var dist = eHit.t;
        var f = 1;
        if (def.falloffStart != null && dist > def.falloffStart) {
          var t = B.clamp((dist - def.falloffStart) / Math.max(0.001, def.falloffEnd - def.falloffStart), 0, 1);
          f = B.lerp(1, def.falloffMin == null ? 0.5 : def.falloffMin, t);
        }
        var dmg = def.damage * f * mul * (eHit.head ? (def.headMul || 1) : 1);
        if (eHit.head && def.lethalHead) dmg = 1000000;   // el francotirador mata de un tiro en la cabeza
        this.dealDamage(eHit.entity, dmg, shooter, { headshot: eHit.head, weapon: def.name });
        hitAny = true;
        this.spawnImpact(endPoint, "#ff5252");
      } else if (wHit) {
        endPoint = wHit.point;
        this.spawnImpact(endPoint, "#ffd27a");
      } else {
        endPoint = new THREE.Vector3(origin.x + d.x * range, origin.y + d.y * range, origin.z + d.z * range);
      }
      if (opts.tracer !== false && shooter.isPlayer) this.tracer(muzzle, endPoint);
    }
    return { hitAny: hitAny, killed: killed };
  };

  /* Barrido cuerpo a cuerpo: alcanza a varios enemigos dentro del cono frontal */
  Game.prototype.meleeAttack = function (shooter, def) {
    var origin = shooter.isPlayer
      ? new THREE.Vector3(this.camera.position.x, this.camera.position.y, this.camera.position.z)
      : new THREE.Vector3(shooter.pos.x, shooter.pos.y + shooter.eye, shooter.pos.z);
    var dir = shooter.isPlayer
      ? new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion)
      : this.dirFromYawPitch(shooter.yaw, shooter.pitch || 0);
    var cosArc = Math.cos((def.arc || 1.1) * 0.5);
    var hits = 0;
    var maxTargets = def.maxTargets || 3;

    for (var i = 0; i < this.entities.length; i++) {
      var e = this.entities[i];
      if (e === shooter || !e.alive || e.invuln > 0) continue;
      if (shooter.team && e.team === shooter.team) continue;
      var dx = e.pos.x - origin.x, dz = e.pos.z - origin.z;
      var dy = (e.pos.y + 0.9) - origin.y;
      var horiz = Math.hypot(dx, dz);
      if (horiz > def.range || Math.abs(dy) > 2.4) continue;
      var dot = horiz > 0.001 ? (dx * dir.x + dz * dir.z) / horiz : 1;
      if (dot < cosArc) continue;
      var falloff = 1 - 0.35 * (horiz / def.range);
      this.dealDamage(e, def.damage * falloff, shooter, { weapon: def.name });
      hits++;
      if (hits >= maxTargets) break;
    }

    // Los barriles tambien se pueden rebanar
    for (var k = 0; k < this.barrels.length; k++) {
      var b = this.barrels[k];
      if (!b.alive) continue;
      var bx = b.x - origin.x, bz = b.z - origin.z;
      var bh = Math.hypot(bx, bz);
      if (bh > def.range) continue;
      var bdot = bh > 0.001 ? (bx * dir.x + bz * dir.z) / bh : 1;
      if (bdot < cosArc) continue;
      this.damageBarrel(b, def.damage, shooter);
    }
    return hits;
  };

  /* Hueco transitable delante (para saltar) o -1 si no hay suelo alcanzable */
  Game.prototype.gapAhead = function (ent, dx, dz) {
    var maxGap = 3.4;
    var gap = 0;
    for (var d = 1.0; d <= maxGap + 1.2; d += 0.4) {
      var x = ent.pos.x + dx * d, z = ent.pos.z + dz * d;
      var solid = false;
      if (this.world.rampHeightAt(x, z) != null) solid = true;
      else {
        for (var dy = 0.5; dy <= 1.5; dy += 0.5) {
          if (this.world.pointSolid(x, ent.pos.y - dy, z)) { solid = true; break; }
        }
      }
      if (solid) return gap;
      gap += 0.4;
    }
    return -1;
  };

  /* Punto al que deben acudir los bots en los modos con objetivo */
  Game.prototype.objectivePoint = function () {
    var m = this.mode;
    if (!m) return null;
    if (m.id === "koth" && this.hill) return { x: this.hill.x, z: this.hill.z, r: this.hill.r };
    if (m.id === "ctf" && this.flags) {
      var enemy = this.player.team === "blue" ? "red" : "blue";
      var f = this.flags[enemy];
      if (f && f.mesh) return { x: f.mesh.position.x, z: f.mesh.position.z, r: 3 };
    }
    return null;
  };

  /* Evita que un bot camine hacia el vacio (islas flotantes y bordes) */
  Game.prototype.ledgeAhead = function (ent, dx, dz) {
    var x = ent.pos.x + dx * 1.25;
    var z = ent.pos.z + dz * 1.25;
    if (this.world.rampHeightAt(x, z) != null) return false;
    for (var d = 0.35; d <= 1.8; d += 0.35) {
      if (this.world.pointSolid(x, ent.pos.y - d, z)) return false;
    }
    return true;
  };

  Game.prototype.spawnImpact = function (point, color) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16),
      new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 1 }));
    m.position.copy(point);
    this.scene.add(m);
    this.effects.push({ obj: m, ttl: 0.2, life: 0.2, kind: "impact" });
  };

  Game.prototype.spawnDeathBurst = function (ent) {
    var self = this;
    var base = B.World.material(ent.avatar ? ent.avatar.shirt : "#ff7a1a");
    for (var i = 0; i < 9; i++) {
      var sz = B.rand(0.14, 0.3);
      var m = new THREE.Mesh(new THREE.BoxGeometry(sz, sz, sz), base);
      m.position.set(ent.pos.x, ent.pos.y + 1.0, ent.pos.z);
      this.scene.add(m);
      this.effects.push({
        obj: m, ttl: 1.1, life: 1.1, kind: "chunk",
        vel: new THREE.Vector3(B.rand(-4, 4), B.rand(3, 8), B.rand(-4, 4)), spin: B.rand(-8, 8)
      });
    }
    var ball = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8),
      new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.5 }));
    ball.position.set(ent.pos.x, ent.pos.y + 1, ent.pos.z);
    this.scene.add(ball);
    this.effects.push({ obj: ball, ttl: 0.28, life: 0.28, kind: "flash" });
  };

  Game.prototype.explode = function (point, def, owner) {
    var self = this;
    B.Audio.explode();
    this.shake = Math.max(this.shake, 0.85);
    var ball = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10),
      new THREE.MeshBasicMaterial({ color: "#ffb347", transparent: true, opacity: 0.85 }));
    ball.position.copy(point);
    this.scene.add(ball);
    this.effects.push({ obj: ball, ttl: 0.45, life: 0.45, kind: "explosion", max: (def.splash || 5) });
    var light = new THREE.PointLight("#ffa040", 3.5, 22);
    light.position.copy(point);
    this.scene.add(light);
    this.effects.push({ obj: light, ttl: 0.4, life: 0.4, kind: "light", light: true });

    for (var i = 0; i < this.entities.length; i++) {
      var e = this.entities[i];
      if (!e.alive || e === owner) continue;
      if (owner && owner.team && e.team === owner.team) continue;
      var d = Math.sqrt(B.dist2(point.x, point.z, e.pos.x, e.pos.z) + Math.pow(point.y - (e.pos.y + 1), 2));
      if (d > (def.splash || 5)) continue;
      var falloff = 1 - d / (def.splash || 5);
      this.dealDamage(e, (def.splashDmg || 60) * falloff, owner, { weapon: def.name, splash: true });
    }
  };

  Game.prototype.dealDamage = function (victim, amount, attacker, info) {
    if (!victim.alive || victim.invuln > 0) return;
    info = info || {};
    amount = Math.max(1, amount);
    if (victim.armor > 0) {
      var absorbed = Math.min(victim.armor, amount * 0.5);
      victim.armor -= absorbed;
      amount -= absorbed;
    }
    victim.health -= amount;

    if (victim.isPlayer) {
      B.HUD.flashDamage();
      B.Audio.hurt();
      this.shake = Math.max(this.shake, 0.25);
    }
    if (attacker && attacker.isPlayer) {
      B.HUD.hitmark();
      if (info.headshot) B.Audio.headshot(); else B.Audio.hit();
    }
    if (victim.health <= 0) this.killEntity(victim, attacker, info);
  };

  Game.prototype.killEntity = function (victim, killer, info) {
    victim.alive = false;
    victim.health = 0;
    victim.deaths++;
    victim.vel.x = victim.vel.z = 0;
    info = info || {};

    if (victim.isPlayer) {
      B.Audio.death();
      B.HUD.showRespawn(true, victim.respawnTimer || 3.2);
      victim.respawnTimer = victim.respawnTimer || 3.2;
      victim.thirdPerson = true;
    } else {
      victim.respawnTimer = 3.2;
      victim.group.visible = false;
      B.Audio.death();
    }

    var realKiller = (killer && killer !== victim) ? killer : null;
    if (realKiller) {
      realKiller.kills++;
      realKiller.streak = (realKiller.streak || 0) + 1;
    }

    var kName = realKiller ? realKiller.name : "el entorno";
    var kTeam = realKiller ? realKiller.team : null;
    B.HUD.pushKill(kName, kTeam, info.weapon || "?", victim.name, victim.team,
      !!(realKiller && realKiller.isPlayer) || victim.isPlayer);
    if (this.netHost) {
      this.netEvents.push(["kf", kName, kTeam || 0, info.weapon || "?", victim.name, victim.team || 0,
        (realKiller && realKiller.isPlayer) || victim.isPlayer ? 1 : 0]);
    }

    if (victim.carrying) this.dropFlag(victim);
    this.mode.onKill(this, realKiller, victim);
    this.spawnDeathBurst(victim);

    if (realKiller && realKiller.isPlayer) B.Audio.kill();
  };

  Game.prototype.respawnPlayer = function () {
    var p = this.player;
    var sp = B.Bots.spawnPointFor(this, p.team);
    var best = sp, bestD = -1;
    for (var i = 0; i < 8; i++) {
      var s = this.map.spawns[B.randInt(0, this.map.spawns.length - 1)];
      if (this.world.pointSolid(s[0], 1, s[1])) continue;
      var d = Infinity;
      for (var j = 0; j < this.entities.length; j++) {
        var e = this.entities[j];
        if (!e.alive || e.isPlayer) continue;
        if (p.team && e.team === p.team) continue;
        d = Math.min(d, B.dist(s[0], s[1], e.pos.x, e.pos.z));
      }
      if (d > bestD) { bestD = d; best = s; }
    }
    p.pos.x = best[0]; p.pos.z = best[1]; p.pos.y = (best[2] || 0) + 0.08;
    p.vel.x = p.vel.y = p.vel.z = 0;
    p.health = p.maxHealth; p.armor = 50;
    p.alive = true; p.invuln = 1.6; p.thirdPerson = false;
    p.reloading = 0; p.carrying = null;
    p.ammo.pistol.reserve = 999;
    B.HUD.showRespawn(false);
    B.Audio.spawn();
    B.HUD.banner("DE VUELTA", 1.1);
  };

  /* --------------------------------- loop -------------------------------- */
  Game.prototype.update = function (dt) {
    if (this.state !== "playing") return;
    this.elapsed += dt;
    this.world.update(dt);
    this.updatePlayer(dt);
    if (this.netClient) {
      this.updateNetClient(dt);
    } else {
      this.updateBots(dt);
      if (this.netHost) this.updateRemotePlayers(dt);
    }
    this.updateProjectiles(dt);
    this.updatePickups(dt);
    this.updateEffects(dt);
    this.updateTracers(dt);
    if (!this.netClient && this.mode.update) this.mode.update(this, dt);
    if (!this.netClient) this.checkEnd();
    this.updateCamera(dt);
    this.updateViewModel(dt);
    if (this.netHost) this.hostNetTick(dt);
  };

  Game.prototype.updatePlayer = function (dt) {
    var p = this.player;
    var I = B.Input;

    p.invuln = Math.max(0, p.invuln - dt);
    p.cooldown = Math.max(0, p.cooldown - dt);
    p.shotTimer = Math.max(0, p.shotTimer - dt);
    p.goldTimer = Math.max(0, p.goldTimer - dt);

    if (!p.alive) {
      if (!this.netClient) {
        p.respawnTimer -= dt;
        B.HUD.showRespawn(true, p.respawnTimer);
        if (p.respawnTimer <= 0 || I.once("Space")) this.respawnPlayer();
      }
      // caida libre del cuerpo
      this.moveCombatant(p, 0, 0, dt, false);
      this.syncPlayerAvatar(dt);
      return;
    }

    // ---- Mirar ----
    var look = I.takeLook();
    var s = this.settings.sens * 0.0022;
    p.yaw -= look.dx * s;
    p.pitch -= look.dy * s;
    p.pitch = B.clamp(p.pitch, -1.45, 1.45);
    p.lookDX = look.dx; p.lookDY = look.dy;

    // ---- Desplazamiento ----
    var axis = I.moveAxis();
    var fwd = { x: -Math.sin(p.yaw), z: -Math.cos(p.yaw) };
    var right = { x: Math.cos(p.yaw), z: -Math.sin(p.yaw) };
    var wishX = fwd.x * axis.z + right.x * axis.x;
    var wishZ = fwd.z * axis.z + right.z * axis.x;
    var wishLen = Math.hypot(wishX, wishZ);

    var running = I.down("ShiftLeft") || I.down("ShiftRight");
    var crouching = I.down("ControlLeft") || I.down("ControlRight");
    var speed = p.moveSpeed * (running ? p.runMul : 1) * (crouching ? p.crouchMul : 1);
    if (p.adsTimer > 0.5) speed *= 0.55;

    // hielo: menos adherencia
    var ice = this.map.friction < 0.5;
    if (ice) {
      p.vel.x = B.lerp(p.vel.x, wishX * speed, dt * 2.2);
      p.vel.z = B.lerp(p.vel.z, wishZ * speed, dt * 2.2);
    }
    var vx = ice ? p.vel.x : wishX * speed;
    var vz = ice ? p.vel.z : wishZ * speed;

    // Impulso del ataque cuerpo a cuerpo (da sensacion de zancada)
    if (p.lungeT > 0) {
      var lk = p.lungeT / 0.18;
      vx += p.lungeX * lk;
      vz += p.lungeZ * lk;
      p.lungeT = Math.max(0, p.lungeT - dt);
    }

    // Golpe de katana pendiente: se resuelve al llegar el tajo
    if (p.meleeTimer > 0) {
      p.meleeTimer -= dt;
      if (p.meleeTimer <= 0 && !this.netClient) {
        this.meleeAttack(p, B.Weapon.byId(p.meleeWeapon || p.weapon));
      }
    }

    var wantJump = I.down("Space");
    this.netInputAxis = axis;
    this.netWantJump = wantJump;
    this.netRun = running;
    this.netCrouch = crouching;
    this.netFiring = I.mouse(0);
    this.netReload = I.down("KeyR");
    this.moveCombatant(p, ice ? vx : vx, vz, dt, wantJump);

    var hazard = this.world.hazardAt(p.pos.x, p.pos.y + 0.4, p.pos.z);
    if (hazard) {
      if (hazard.type === "lava") {
        if (!this.netClient) this.dealDamage(p, hazard.dmg * dt, null, { weapon: "lava" });
      } else if (hazard.type === "water") {
        p.vel.x *= 0.6; p.vel.z *= 0.6;
      }
    }
    if (p.pos.y < this.world.bounds.voidY) {
      if (this.netClient) { p.pos.y = 0.2; }
      else {
        p.health = 0;
        this.killEntity(p, null, { weapon: "el vacio" });
        p.respawnTimer = 2.6;
      }
      return;
    }

    // ---- Armas ----
    var wheel = I.takeWheel();
    if (wheel) this.cycleWeapon(wheel);
    for (var i = 1; i <= 7; i++) {
      if (I.once("Digit" + i)) this.selectSlot(i);
    }
    if (I.once("KeyR")) this.startReload();
    if (I.once("KeyV")) this.toggleCamera();

    this.handleFiring(dt);
    this.syncPlayerAvatar(dt);
  };

  Game.prototype.syncPlayerAvatar = function (dt) {
    var p = this.player;
    var av = this.playerAvatar;
    av.group.visible = p.thirdPerson && p.alive;
    if (!av.group.visible) return;    av.group.position.set(p.pos.x, p.pos.y, p.pos.z);
    av.group.rotation.y = p.yaw + Math.PI;
    var sp = Math.hypot(p.vel.x, p.vel.z) / p.moveSpeed;
    B.Avatar.update(av, dt, sp, p.grounded);
    B.Avatar.aim(av, p.pitch);
  };

  Game.prototype.handleFiring = function (dt) {
    var p = this.player;
    var I = B.Input;
    var def = B.Weapon.byId(p.weapon);

    if (p.reloading > 0) {
      p.reloading -= dt;
      if (p.reloading <= 0) {
        var st = p.ammo[p.weapon];
        var need = def.mag - st.mag;
        var take = Math.min(need, st.reserve);
        st.mag += take; st.reserve -= take;
      }
      return;
    }

    var wantFire = def.auto ? I.mouse(0) : I.mouseOnce(0);
    if (!wantFire) { if (p.shotTimer <= 0) p.shots = 0; return; }
    if (p.cooldown > 0) return;

    if (def.kind === "melee") {
      B.Audio.melee();
      p.cooldown = 60 / def.rpm;
      this.vmKick = 0.18;
      this.vmSwing = def.swingTime || 0.34;
      // El golpe se aplica al llegar el tajo, no al pulsar
      p.meleeTimer = def.hitAt || 0.14;
      p.meleeWeapon = p.weapon;
      // Pequeño impulso hacia delante al atacar
      var fw = { x: -Math.sin(p.yaw), z: -Math.cos(p.yaw) };
      p.lungeT = 0.18;
      p.lungeX = fw.x * (def.lunge || 7);
      p.lungeZ = fw.z * (def.lunge || 7);
      return;
    }

    var st = p.ammo[p.weapon];
    if (st.mag <= 0) {
      B.Audio.empty();
      p.cooldown = 0.25;
      this.startReload();
      return;
    }

    // disparo
    st.mag--;
    p.shots++;
    p.shotTimer = 0.24;
    p.cooldown = 60 / def.rpm;

    var speedRatio = Math.hypot(p.vel.x, p.vel.z) / p.moveSpeed;
    var spread = B.Weapon.spreadDeg(def, { ads: p.adsTimer > 0.5, speedRatio: speedRatio, grounded: p.grounded, shots: p.shots });
    var origin = new THREE.Vector3(this.camera.position.x, this.camera.position.y, this.camera.position.z);
    var dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);

    if (this.netClient) {
      // Los impactos los decide el anfitrion; aqui solo se muestra el efecto local
    } else if (def.kind === "projectile") {
      this.spawnRocket(p, def, origin, dir);
    } else {
      this.hitscanShot(p, def, origin, dir, { damageMul: 1, spreadDeg: spread, tracer: true });
    }

    B.Audio.shoot(def.sfx || def.id);
    this.muzzleFlash.visible = true;
    this.muzzleFlash.position.set(0, 0, -0.72);
    this.muzzleFlash.rotation.set(B.rand(0, 3), B.rand(0, 3), B.rand(0, 3));
    this.muzzleTimer = 0.045;
    this.muzzleLight.intensity = 1.6;
    this.muzzleLight.position.set(0, 0, -0.7);

    p.recoilVel += def.kick * 34;
    p.pitch += def.kick * 0.55;
    p.pitch = Math.min(p.pitch, 1.45);
    if (def.kind === "projectile") this.shake = Math.max(this.shake, 0.3);
  };

  Game.prototype.spawnRocket = function (owner, def, origin, dir) {
    var mesh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.7), B.World.material("#ff7a1a", { emissive: "#ff5500", emissiveIntensity: 0.7 }));
    var start = origin.clone().addScaledVector(dir, 0.8);
    mesh.position.copy(start);
    mesh.lookAt(start.clone().add(dir));
    this.scene.add(mesh);
    this.projectiles.push({
      mesh: mesh, pos: start, vel: dir.clone().multiplyScalar(def.speed || 30),
      def: def, owner: owner, life: 4
    });
  };

  Game.prototype.updateProjectiles = function (dt) {
    for (var i = this.projectiles.length - 1; i >= 0; i--) {
      var r = this.projectiles[i];
      r.life -= dt;
      var step = r.vel.clone().multiplyScalar(dt);
      r.pos.add(step);
      r.mesh.position.copy(r.pos);
      var boom = false;
      if (this.world.pointSolid(r.pos.x, r.pos.y, r.pos.z)) boom = true;
      if (!boom) {
        for (var j = 0; j < this.entities.length; j++) {
          var e = this.entities[j];
          if (!e.alive || e === r.owner || e.invuln > 0) continue;
          if (r.owner && r.owner.team && e.team === r.owner.team) continue;
          if (B.dist2(r.pos.x, r.pos.z, e.pos.x, e.pos.z) < 2.0 &&
            r.pos.y > e.pos.y && r.pos.y < e.pos.y + e.height) { boom = true; break; }
        }
      }
      if (boom || r.life <= 0) {
        if (boom) this.explode(r.pos, r.def, r.owner);
        this.scene.remove(r.mesh);
        r.mesh.geometry.dispose();
        this.projectiles.splice(i, 1);
      }
    }
  };

  Game.prototype.updateBots = function (dt) {
    for (var i = 0; i < this.entities.length; i++) {
      var bot = this.entities[i];
      if (!bot.isBot) continue;
      if (!bot.alive) {
        if (bot.kind === "zombie") continue;
        bot.respawnTimer -= dt;
        if (bot.respawnTimer <= 0) B.Bots.respawn(this, bot);
        continue;
      }
      B.Bots.update(this, bot, dt);
      if (bot.pos.y < this.world.bounds.voidY) {
        if (bot.kind === "zombie") {
          // Un zombi que cae al vacio vuelve a la arena en vez de desaparecer
          var sp = B.Bots.spawnPointFor(this, null);
          bot.pos.x = sp[0]; bot.pos.z = sp[1]; bot.pos.y = (sp[2] || 0) + 0.1;
          bot.vel.x = bot.vel.y = bot.vel.z = 0;
          bot.waypoint = null;
          this.voidRecoveries = (this.voidRecoveries || 0) + 1;
          if (bot.group) bot.group.position.set(bot.pos.x, bot.pos.y, bot.pos.z);
        } else {
          this.voidFalls = (this.voidFalls || 0) + 1;
          this.killEntity(bot, null, { weapon: "el vacio" });
          bot.respawnTimer = 3;
        }
      }
    }
  };

  Game.prototype.updateEffects = function (dt) {
    for (var i = this.effects.length - 1; i >= 0; i--) {
      var fx = this.effects[i];
      fx.ttl -= dt;
      var k = Math.max(0, fx.ttl / fx.life);
      if (fx.kind === "chunk") {
        fx.vel.y -= 22 * dt;
        fx.obj.position.addScaledVector(fx.vel, dt);
        fx.obj.rotation.x += fx.spin * dt;
        fx.obj.rotation.z += fx.spin * dt;
      } else if (fx.kind === "impact") {
        fx.obj.scale.setScalar(0.4 + k * 0.9);
        fx.obj.material.opacity = k;
      } else if (fx.kind === "flash") {
        fx.obj.scale.setScalar(1 + (1 - k) * 2.4);
        fx.obj.material.opacity = k * 0.6;
      } else if (fx.kind === "explosion") {
        var sc = (fx.max || 5) * (1 - k * 0.7);
        fx.obj.scale.setScalar(sc);
        fx.obj.material.opacity = k * 0.8;
      } else if (fx.kind === "light") {
        fx.obj.intensity = 3.5 * k;
      }
      if (fx.ttl <= 0) {
        if (fx.obj.parent) fx.obj.parent.remove(fx.obj);
        if (fx.obj.geometry) fx.obj.geometry.dispose();
        this.effects.splice(i, 1);
      }
    }
  };

  Game.prototype.updateTracers = function (dt) {
    for (var i = this.tracers.length - 1; i >= 0; i--) {
      var t = this.tracers[i];
      t.life -= dt;
      if (t.life <= 0) { t.mesh.visible = false; t.life = 0; this.tracers.splice(i, 1); }
    }
  };

  /* ------------------------------- pickups ------------------------------- */
  Game.prototype.updatePickups = function (dt) {
    var p = this.player;
    for (var i = 0; i < this.pickups.length; i++) {
      var pk = this.pickups[i];
      if (!pk.active) {
        pk.timer -= dt;
        if (pk.timer <= 0) { pk.active = true; pk.mesh.visible = true; }
        continue;
      }
      pk.spin += dt * 1.6;
      pk.mesh.rotation.y = pk.spin;
      pk.mesh.position.y = pk.baseY + Math.sin(pk.spin * 2) * 0.12;
      if (p.alive && B.dist2(p.pos.x, p.pos.z, pk.x, pk.z) < 2.2 && Math.abs(p.pos.y - pk.baseY) < 2.4) {
        if (this.applyPickup(pk)) {
          pk.active = false; pk.mesh.visible = false; pk.timer = pk.respawn;
          B.Audio.pickup();
        }
      }
    }
  };

  Game.prototype.applyPickup = function (pk) {
    var p = this.player;
    if (pk.type === "health") {
      if (p.health >= p.maxHealth) return false;
      p.health = Math.min(p.maxHealth, p.health + 40);
      B.HUD.toast("+40 VIDA"); B.HUD.flashHeal(); B.Audio.heal();
      return true;
    }
    if (pk.type === "armor") {
      if (p.armor >= 100) return false;
      p.armor = Math.min(100, p.armor + 50);
      B.HUD.toast("+50 ESCUDO");
      return true;
    }
    if (pk.type === "ammo") {
      var filled = false;
      B.WEAPONS.forEach(function (w) {
        if (w.kind === "melee") return;
        var st = p.ammo[w.id];
        if (w.id === "pistol") return;
        var add = Math.ceil(w.reserve * 0.5);
        if (st.reserve < w.reserve) { st.reserve = Math.min(w.reserve, st.reserve + add); filled = true; }
      });
      if (filled) { B.HUD.toast("MUNICION RECARGADA"); return true; }
      return false;
    }
    if (pk.type === "rocket") {
      var rs = p.ammo.rocket;
      if (rs.reserve >= 6) return false;
      rs.reserve = Math.min(6, rs.reserve + 2);
      B.HUD.toast("+2 COHETES");
      return true;
    }
    return false;
  };

  Game.prototype.spawnBarrels = function () {
    var self = this;
    this.barrels = [];
    var shadow = this.settings.quality.shadows;
    (this.map.barrels || []).forEach(function (b) {
      var col = self.world.addSolidBox(b[0], b[1], b[2], 0.7, 1.4, 0.7, "#c8371f", shadow);
      self.barrels.push({
        x: b[0], y: b[1], z: b[2], hp: 26, alive: true, col: col,
        minX: b[0] - 0.42, maxX: b[0] + 0.42, minY: b[1] + 0.1, maxY: b[1] + 1.4,
        minZ: b[2] - 0.42, maxZ: b[2] + 0.42
      });
    });
  };

  Game.prototype.rayBarrels = function (origin, dir, maxT) {
    var best = null;
    for (var i = 0; i < this.barrels.length; i++) {
      var b = this.barrels[i];
      if (!b.alive) continue;
      var t = rayAABB(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ);
      if (t >= 0 && t < maxT && (!best || t < best.t)) best = { barrel: b, t: t };
    }
    return best;
  };

  Game.prototype.damageBarrel = function (barrel, dmg, attacker) {
    barrel.hp -= dmg;
    if (barrel.hp > 0) return;
    barrel.alive = false;
    this.world.removeCollider(barrel.col);
    this.explode(new THREE.Vector3(barrel.x, barrel.y + 0.8, barrel.z), { splash: 5.5, splashDmg: 88, name: "Barril" }, attacker);
  };

  Game.prototype.spawnPickups = function () {
    var self = this;
    var types = ["health", "armor", "ammo"];
    var colors = { health: "#8ede5a", armor: "#4aa8ff", ammo: "#ffc63d", rocket: "#ff7a1a" };
    var nodes = this.map.pickupNodes;
    nodes.forEach(function (n, i) {
      var type = i % 5 === 4 ? "rocket" : types[i % types.length];
      var mesh = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6),
        B.World.material(colors[type], { emissive: colors[type], emissiveIntensity: 0.45 }));
      var y = (n[2] || 0) + 1.0;
      mesh.position.set(n[0], y, n[1]);
      self.scene.add(mesh);
      self.pickups.push({ type: type, x: n[0], z: n[1], baseY: y, mesh: mesh, active: true, spin: Math.random() * 6, timer: 0, respawn: 22 });
    });
  };

  /* ------------------------------- objetivos ----------------------------- */
  Game.prototype.setupFlags = function () {
    var self = this;
    var o = this.map.objectives.flags;
    this.flags = {
      red: { team: "red", home: { x: o.red[0], z: o.red[1], y: o.redY || 0 }, carrier: null, mesh: null, dropped: 0 },
      blue: { team: "blue", home: { x: o.blue[0], z: o.blue[1], y: o.blueY || 0 }, carrier: null, mesh: null, dropped: 0 }
    };
    ["red", "blue"].forEach(function (t) {
      var f = self.flags[t];
      var m = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.4, 0.18),
        B.World.material(t === "red" ? "#ff5252" : "#4b8dff", { emissive: t === "red" ? "#ff2222" : "#2255ff", emissiveIntensity: 0.5 }));
      m.position.set(f.home.x, f.home.y + 1.2, f.home.z);
      self.scene.add(m);
      f.mesh = m;
    });
    this.modeObj = {
      drawMinimap: function (game, ctx, toX, toZ, s) {
        ["red", "blue"].forEach(function (t) {
          var f = game.flags[t];
          var pos = f.carrier ? f.carrier.pos : f.mesh.position;
          ctx.fillStyle = t === "red" ? "#ff5252" : "#4b8dff";
          ctx.fillRect(toX(pos.x) - 3, toZ(pos.z) - 3, 6, 6);
        });
        ctx.strokeStyle = "rgba(255,255,255,0.25)";
        ctx.lineWidth = 1;
        ["red", "blue"].forEach(function (t) {
          var f = game.flags[t];
          ctx.beginPath(); ctx.arc(toX(f.home.x), toZ(f.home.z), 8, 0, 6.283); ctx.stroke();
        });
      }
    };
  };

  Game.prototype.dropFlag = function (ent) {
    if (!this.flags) return;
    ["red", "blue"].forEach(function (t) {
      var f = this.flags[t];
      if (f.carrier === ent) {
        f.carrier = null;
        f.mesh.visible = true;
        f.mesh.position.set(ent.pos.x, ent.pos.y + 1.2, ent.pos.z);
        f.dropped = 4;
      }
    }, this);
    ent.carrying = null;
  };

  Game.prototype.updateCtf = function (dt) {
    var self = this;
    ["red", "blue"].forEach(function (t) {
      var f = self.flags[t];
      var enemyTeam = t === "red" ? "blue" : "red";

      if (f.carrier) {
        if (!f.carrier.alive) { self.dropFlag(f.carrier); return; }
        f.mesh.visible = false;
        var enemyBase = self.flags[enemyTeam].home;
        if (B.dist(f.carrier.pos.x, f.carrier.pos.z, enemyBase.x, enemyBase.z) < 3.2) {
          self.scores[enemyTeam] += 1;
          B.HUD.banner(enemyTeam.toUpperCase() + " CAPTURA LA BANDERA", 2);
          B.Audio.uiBig();
          f.carrier.carrying = null;
          f.carrier = null;
          f.mesh.visible = true;
          f.mesh.position.set(f.home.x, f.home.y + 1.2, f.home.z);
          var m = self.mode;
          if (self.scores[enemyTeam] >= (m.capturesToWin || 3)) self.finish(enemyTeam);
        }
        return;
      }

      if (f.dropped > 0) {
        f.dropped -= dt;
        if (f.dropped <= 0) { f.mesh.position.set(f.home.x, f.home.y + 1.2, f.home.z); }
      }

      for (var i = 0; i < self.entities.length; i++) {
        var e = self.entities[i];
        if (!e.alive || !e.team) continue;
        if (e.team === t) continue; // solo lo roba el equipo rival
        if (B.dist(e.pos.x, e.pos.z, f.mesh.position.x, f.mesh.position.z) < 1.7) {
          f.carrier = e;
          e.carrying = f;
          B.HUD.toast(e.isPlayer ? "LLEVAS LA BANDERA RIVAL" : e.name + " roba la bandera");
          break;
        }
      }
    });
  };

  Game.prototype.setupHill = function () {
    var o = this.map.objectives.hill;
    this.hill = { x: o.x, z: o.z, y: o.y || 0, r: o.r };
    var ring = new THREE.Mesh(new THREE.RingGeometry(o.r - 0.4, o.r, 40),
      new THREE.MeshBasicMaterial({ color: "#ffc63d", transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(o.x, (o.y || 0) + 0.12, o.z);
    this.scene.add(ring);
    this.hillMesh = ring;
  };

  Game.prototype.updateKoth = function (dt) {
    var h = this.hill;
    var present = { red: 0, blue: 0 };
    for (var i = 0; i < this.entities.length; i++) {
      var e = this.entities[i];
      if (!e.alive || !e.team) continue;
      if (B.dist(e.pos.x, e.pos.z, h.x, h.z) < h.r && Math.abs(e.pos.y - (h.y || 0)) < 3.2) present[e.team]++;
    }
    if (present.red > 0 && present.blue === 0) {
      this.scores.red += dt;
      if (this.player.team === "red" && present.red === 1) this.scores.red += dt * 0.25;
    } else if (present.blue > 0 && present.red === 0) {
      this.scores.blue += dt;
    } else if (present.red > 0 && present.blue > 0) {
      this.scores.red += dt * 0.5; this.scores.blue += dt * 0.5;
    }
    if (this.hillMesh) {
      this.hillMesh.material.opacity = 0.45 + Math.abs(Math.sin(this.elapsed * 2)) * 0.35;
    }
    var m = this.mode;
    if (this.scores.red >= m.holdToWin) this.finish("red");
    else if (this.scores.blue >= m.holdToWin) this.finish("blue");
  };

  /* --------------------------- supervivencia ----------------------------- */
  Game.prototype.startWave = function () {
    var self = this;
    // limpia zombis muertos
    this.entities = this.entities.filter(function (e) {
      if (e.kind === "zombie" && !e.alive) {
        if (e.avatar && e.avatar.group.parent) e.avatar.group.parent.remove(e.avatar.group);
        return false;
      }
      return true;
    });
    this.wave++;
    var count = Math.min(20, 3 + Math.round(this.wave * 1.55));
    for (var i = 0; i < count; i++) {
      var z = B.Bots.create(this, { kind: "zombie", difficulty: this.settings.difficulty });
      z.netId = this.nextNetId++;
      z.health = z.maxHealth * (1.6 + this.wave * 0.12);
      z.speed = 4.0 + Math.min(2.6, this.wave * 0.12);
      this.entities.push(z);
    }
    this.waveActive = true;
    this.netBanner("OLEADA " + this.wave, 1.8);
    B.Audio.wave();
  };

  Game.prototype.prepareWaveAmmo = function () {
    var p = this.player;
    B.WEAPONS.forEach(function (w) {
      if (w.kind === "melee") return;
      p.ammo[w.id].reserve = Math.max(p.ammo[w.id].reserve, Math.ceil(w.reserve * 0.7));
    });
    p.health = Math.min(p.maxHealth, p.health + 35);
    p.armor = Math.min(100, p.armor + 40);
    // reabastece pickups
    this.pickups.forEach(function (pk) { pk.active = true; pk.mesh.visible = true; pk.timer = 0; });
  };

  /* --------------------------------- fin --------------------------------- */
  Game.prototype.checkEnd = function () {
    if (this.finished) return;
    var m = this.mode;
    if (m.isOver) {
      var e = m.isOver(this);
      if (e) return this.finish(e);
    }
    if (m.time > 0 && this.elapsed >= m.time) {
      if (m.teams) {
        var s = this.scores;
        this.finish(s.red > s.blue ? "red" : s.blue > s.red ? "blue" : "empate");
      } else {
        this.finish(this.leaderboard(null)[0]);
      }
    }
  };

  Game.prototype.finish = function (winner) {
    if (this.finished) return;
    this.finished = true;
    this.state = "over";
    var isTeam = typeof winner === "string" && (winner === "red" || winner === "blue");
    var playerWon = false;
    if (isTeam) playerWon = this.player.team === winner;
    else if (winner && winner.isPlayer) playerWon = true;
    else playerWon = false;

    B.HUD.setPlaying(false);
    B.Audio.resume();
    if (playerWon) B.Audio.win(); else B.Audio.lose();
    if (this.netHost) {
      var tag = typeof winner === "string" ? winner : (winner && winner.isBot ? "bot" : "player");
      B.Net.sendRel("fin", { winner: tag });
    }
    if (this.onFinish) this.onFinish({ winner: winner, playerWon: playerWon });
  };

  Game.prototype.leaderboard = function (team) {
    var list = this.entities.filter(function (e) { return !team || e.team === team; });
    list.sort(function (a, b) { return b.score - a.score || b.kills - a.kills; });
    return list;
  };

  Game.prototype.teamScores = function () { return this.scores; };

  Game.prototype.slotSummary = function () {
    var p = this.player;
    var html = "";
    B.WEAPONS.forEach(function (w) {
      var st = p.ammo[w.id];
      var cls = "slot" + (p.weapon === w.id ? " on" : "") + (w.kind !== "melee" && st.mag === 0 && st.reserve === 0 ? " empty" : "");
      html += '<span class="' + cls + '" title="' + B.esc(w.name) + '">' + w.slot + "</span>";
    });
    return html;
  };

  Game.prototype.selectSlot = function (slot) {
    var p = this.player;
    for (var i = 0; i < B.WEAPONS.length; i++) {
      if (B.WEAPONS[i].slot === slot) { this.setWeapon(B.WEAPONS[i].id); return; }
    }
  };

  Game.prototype.cycleWeapon = function (dir) {
    var p = this.player;
    var idx = 0;
    for (var i = 0; i < B.WEAPONS.length; i++) if (B.WEAPONS[i].id === p.weapon) idx = i;
    var n = B.WEAPONS.length;
    idx = (idx + (dir > 0 ? 1 : -1) + n) % n;
    this.setWeapon(B.WEAPONS[idx].id);
  };

  Game.prototype.startReload = function () {
    var p = this.player;
    var def = B.Weapon.byId(p.weapon);
    if (def.kind === "melee") return;
    var st = p.ammo[p.weapon];
    if (st.mag >= def.mag || st.reserve <= 0 || p.reloading > 0) return;
    p.reloading = def.reload;
    B.Audio.reload();
  };

  Game.prototype.toggleCamera = function () {
    var p = this.player;
    p.thirdPerson = !p.thirdPerson;
    if (this.vmRoot) this.vmRoot.visible = !p.thirdPerson;
    B.HUD.toast(p.thirdPerson ? "CAMARA: TERCERA PERSONA" : "CAMARA: PRIMERA PERSONA", 1.2);
  };

  /* -------------------------------- camara ------------------------------- */
  var _camDir = new THREE.Vector3();
  var _camTarget = new THREE.Vector3();
  Game.prototype.updateCamera = function (dt) {
    var p = this.player;
    var bobY = 0;
    if (p.alive && p.grounded) {
      var sp = Math.hypot(p.vel.x, p.vel.z);
      p.bob += dt * sp * 1.9;
      bobY = Math.sin(p.bob) * Math.min(0.055, sp * 0.008);
    }

    // retroceso con recuperacion
    p.recoilVel *= Math.pow(0.0016, dt);
    p.recoil += p.recoilVel * dt;
    p.recoil *= Math.pow(0.02, dt);

    var pitch = p.pitch + p.recoil;

    if (p.thirdPerson) {
      _camDir.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
      var head = new THREE.Vector3(p.pos.x, p.pos.y + p.eye, p.pos.z);
      var dist = p.cameraDist;
      var back = new THREE.Vector3(-_camDir.x, -_camDir.y - p.pitch * 0.35, -_camDir.z).normalize();
      var hit = this.world.raycast(head, back, dist + 0.4, 0.25);
      if (hit) dist = Math.max(1.1, hit.dist - 0.35);
      this.camera.position.set(head.x + back.x * dist, head.y + back.y * dist + 0.35, head.z + back.z * dist);
      this.camera.rotation.set(p.pitch * 0.65, p.yaw, 0, "YXZ");
    } else {
      this.camera.position.set(p.pos.x, p.pos.y + p.eye + bobY - (p.adsTimer > 0.5 ? 0.06 : 0), p.pos.z);
      this.camera.rotation.set(pitch, p.yaw, 0, "YXZ");
    }

    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.4);
      var a = this.shake * 0.12;
      this.camera.position.x += B.rand(-a, a);
      this.camera.position.y += B.rand(-a, a);
      this.camera.rotation.z += B.rand(-a, a) * 0.5;
    }
  };

  var _swayX = 0, _swayY = 0;
  Game.prototype.updateViewModel = function (dt) {
    if (!this.vmRoot) return;
    var p = this.player;
    this.vmRoot.visible = !p.thirdPerson && p.alive;
    if (!this.vmRoot.visible) return;

    var adsing = B.Input.mouse(2) && !p.thirdPerson;
    p.adsTimer = B.clamp(p.adsTimer + (adsing ? dt * 6 : -dt * 6), 0, 1);
    var ads = p.adsTimer;

    // Zoom al apuntar (el francotirador lleva su propia mira)
    var defZoom = B.Weapon.byId(p.weapon);
    var targetFov = (ads > 0.5 && defZoom.adsFov) ? defZoom.adsFov : this.settings.fov;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = B.lerp(this.camera.fov, targetFov, Math.min(1, dt * 10));
      this.camera.updateProjectionMatrix();
    }
    if (this.onScope) this.onScope(defZoom, ads);
    B.HUD.setScope(!!(defZoom.scope && ads > 0.85));

    _swayX = B.lerp(_swayX, B.clamp(-p.lookDX * 0.0016, -0.05, 0.05), dt * 8);
    _swayY = B.lerp(_swayY, B.clamp(-p.lookDY * 0.0016, -0.05, 0.05), dt * 8);

    var sp = Math.hypot(p.vel.x, p.vel.z);
    var bob = Math.sin(p.bob) * Math.min(0.03, sp * 0.004);
    var bob2 = Math.cos(p.bob * 2) * Math.min(0.02, sp * 0.003);

    this.vmKick = Math.max(0, (this.vmKick || 0) - dt * 1.6);
    var swDef = B.Weapon.byId(p.weapon);
    var swTime = swDef.swingTime || 0.34;
    this.vmSwing = Math.max(0, (this.vmSwing || 0) - dt);
    var swingT = this.vmSwing > 0 ? (1 - this.vmSwing / swTime) : 0;
    var slash = this.vmSwing > 0 ? Math.sin(swingT * Math.PI) : 0;
    var swYaw = swingT > 0 ? (0.95 - swingT * 1.9) * slash : 0;
    var swRoll = swingT > 0 ? (0.5 - swingT * 0.95) * slash : 0;
    var reloadDip = p.reloading > 0 ? Math.sin(Math.min(1, p.reloading / B.Weapon.byId(p.weapon).reload) * Math.PI) * 0.28 : 0;

    var tx = 0.3 - ads * 0.26 + _swayX;
    var ty = -0.28 + _swayY + bob - reloadDip - ads * 0.04;
    var tz = -0.62 + this.vmKick * 0.35 + bob2;

    this.vmRoot.position.set(tx, ty, tz);
    this.vmRoot.rotation.set(reloadDip * 1.4 + this.vmKick * 0.9 - slash * 0.28, ads * 0.02 + _swayY * 0.5 + swYaw, swRoll);

    if (this.muzzleTimer > 0) {
      this.muzzleTimer -= dt;
      if (this.muzzleTimer <= 0) { this.muzzleFlash.visible = false; this.muzzleLight.intensity = 0; }
      else { this.muzzleLight.intensity = 1.2 * (this.muzzleTimer / 0.045); }
    }
  };

  Game.prototype.render = function () {
    if (!this.renderer) return;
    this.renderer.autoClear = true;
    this.renderer.render(this.scene, this.camera);
    var p = this.player;
    if (p && !p.thirdPerson && p.alive) {
      this.renderer.autoClear = false;
      if (this.renderer.clearDepth) this.renderer.clearDepth();
      this.renderer.render(this.viewScene, this.viewCamera);
      this.renderer.autoClear = true;
    }
  };

  /* ------------------------------ multijugador ------------------------------ */

  Game.prototype.banner = function (text, dur, sub) { this.netBanner(text, dur, sub); };

  Game.prototype.hudInfo = function () {
    if (this.netClient) {
      return this.netHud || { mode: "MULTIJUGADOR", timer: 0, score: "-", hint: "Conectado al anfitrion" };
    }
    return this.mode.hud(this);
  };

  Game.prototype.dirFromYawPitch = function (yaw, pitch) {
    var cp = Math.cos(pitch);
    return new THREE.Vector3(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp).normalize();
  };

  /* Arranca en modo invitado: el mundo y las reglas llegan del anfitrion */
  Game.prototype.startNet = function (config) {
    this.netClient = true;
    this.start(config);
    B.HUD.banner(this.map.name.toUpperCase(), 2.6, "MULTIJUGADOR");
  };

  Game.prototype.buildRemotePlayer = function (name, peerId) {
    var team = this.mode.teams ? this.player.team : null;
    var av = B.Avatar.build({
      team: team || "blue",
      shirt: team === "blue" ? "#4b8dff" : team === "red" ? "#ff7a1a" : "#4b8dff",
      pants: "#2b3444", skin: "#e8b98a", hat: "cap", mood: "happy"
    });
    this.scene.add(av.group);
    var ent = {
      netRemote: true, isBot: false, isPlayer: false, peerId: peerId,
      netId: this.nextGuestId++, name: name || "Jugador",
      team: team, kind: "soldier",
      pos: { x: 0, y: 0.12, z: 0 }, vel: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0,
      radius: 0.42, height: 1.9, eye: 1.62, grounded: true, jumpCooldown: 0,
      health: 100, maxHealth: 100, armor: 50, alive: true, invuln: 1.5,
      moveSpeed: 6.3, runMul: 1.42, crouchMul: 0.5,
      weapon: "pistol", ammo: {}, cooldown: 0, reloading: 0, shots: 0, shotTimer: 0,
      kills: 0, deaths: 0, score: 0, respawnTimer: 0, carrying: null,
      avatar: av, group: av.group, netInputAxis: { x: 0, z: 0 }
    };
    B.WEAPONS.forEach(function (w) { ent.ammo[w.id] = { mag: w.mag, reserve: w.reserve }; });
    ent.ammo.pistol.reserve = 999;
    var sp = B.Bots.spawnPointFor(this, ent.team);
    ent.pos.x = sp[0]; ent.pos.z = sp[1]; ent.pos.y = (sp[2] || 0) + 0.08;
    ent.group.position.set(ent.pos.x, ent.pos.y, ent.pos.z);
    if (peerId) this.remotes[peerId] = ent;
    return ent;
  };

  Game.prototype.addRemotePlayer = function (peerId, name) {
    if (peerId && this.remotes[peerId]) return this.remotes[peerId];
    var ent = this.buildRemotePlayer(name, peerId);
    this.entities.push(ent);
    return ent;
  };

  Game.prototype.removeRemotePlayer = function (peerId) {
    var rp = this.remotes[peerId];
    if (!rp) return;
    var i = this.entities.indexOf(rp);
    if (i >= 0) this.entities.splice(i, 1);
    if (rp.group && rp.group.parent) rp.group.parent.remove(rp.group);
    if (rp.carrying) this.dropFlag(rp);
    delete this.remotes[peerId];
  };

  /* En el anfitrion, cada jugador remoto es una entidad movida por su entrada */
  Game.prototype.updateRemotePlayers = function (dt) {
    var list = this.remotes || {};
    for (var key in list) this.updateRemotePlayer(list[key], dt);
  };

  Game.prototype.updateRemotePlayer = function (rp, dt) {
    if (!rp) return;
    rp.invuln = Math.max(0, (rp.invuln || 0) - dt);
    var self = this;
    function respawn() {
      var sp = B.Bots.spawnPointFor(self, rp.team);
      rp.pos.x = sp[0]; rp.pos.z = sp[1]; rp.pos.y = (sp[2] || 0) + 0.08;
      rp.vel.x = rp.vel.y = rp.vel.z = 0;
      rp.health = rp.maxHealth; rp.armor = 50; rp.alive = true; rp.invuln = 1.6;
      rp.ammo.pistol.reserve = 999;
      if (rp.group) rp.group.visible = true;
      B.Audio.spawn();
    }
    if (!rp.alive) {
      rp.respawnTimer -= dt;
      if (rp.respawnTimer <= 0) respawn();
      else this.moveCombatant(rp, 0, 0, dt, false);
      return;
    }
    var axis = rp.netInputAxis || { x: 0, z: 0 };
    var speed = rp.moveSpeed * (rp.netRun ? rp.runMul : 1) * (rp.netCrouch ? rp.crouchMul : 1);
    var fwd = { x: -Math.sin(rp.yaw), z: -Math.cos(rp.yaw) };
    var right = { x: Math.cos(rp.yaw), z: -Math.sin(rp.yaw) };
    var vx = (fwd.x * axis.z + right.x * axis.x) * speed;
    var vz = (fwd.z * axis.z + right.z * axis.x) * speed;
    this.moveCombatant(rp, vx, vz, dt, rp.netWantJump);

    var hazard = this.world.hazardAt(rp.pos.x, rp.pos.y + 0.4, rp.pos.z);
    if (hazard && hazard.type === "lava") this.dealDamage(rp, hazard.dmg * dt, null, { weapon: "lava" });
    if (rp.pos.y < this.world.bounds.voidY) this.killEntity(rp, null, { weapon: "el vacio" });

    rp.cooldown = Math.max(0, rp.cooldown - dt);
    if (rp.reloading > 0) {
      rp.reloading -= dt;
      if (rp.reloading <= 0) {
        var def = B.Weapon.byId(rp.weapon);
        var st = rp.ammo[rp.weapon];
        var take = Math.min(def.mag - st.mag, st.reserve);
        st.mag += take; st.reserve -= take;
      }
    } else if (rp.netReload) {
      this.tryReload(rp);
    }
    if (rp.netFiring) this.tryFire(rp);

    if (rp.group) { rp.group.position.set(rp.pos.x, rp.pos.y, rp.pos.z); rp.group.rotation.y = rp.yaw; }
    if (rp.avatar) B.Avatar.update(rp.avatar, dt, Math.min(1, Math.hypot(vx, vz) / rp.moveSpeed), rp.grounded);
  };

  Game.prototype.tryReload = function (ent) {
    var def = B.Weapon.byId(ent.weapon);
    if (def.kind === "melee") return;
    var st = ent.ammo[ent.weapon];
    if (!st || st.mag >= def.mag || st.reserve <= 0 || ent.reloading > 0) return;
    ent.reloading = def.reload;
    B.Audio.reload();
  };

  Game.prototype.tryFire = function (ent) {
    var def = B.Weapon.byId(ent.weapon);
    if (ent.reloading > 0 || ent.cooldown > 0) return;
    if (def.kind !== "melee") {
      var st = ent.ammo[ent.weapon];
      if (!st) return;
      if (st.mag <= 0) { ent.cooldown = 0.3; this.tryReload(ent); return; }
      st.mag--;
    }
    ent.cooldown = 60 / def.rpm;
    var origin = new THREE.Vector3(ent.pos.x, ent.pos.y + ent.eye, ent.pos.z);
    var dir = this.dirFromYawPitch(ent.yaw, ent.pitch);
    if (def.kind === "projectile") this.spawnRocket(ent, def, origin, dir);
    else if (def.kind === "melee") this.meleeAttack(ent, def);
    else this.hitscanShot(ent, def, origin, dir, { damageMul: 1, spreadDeg: def.spread, tracer: true });
    B.Audio.shoot(def.sfx || def.id);
  };

  /* Crea la representacion local de una entidad que llega por la red */
  Game.prototype.spawnNetEntity = function (id) {
    var human = id < 10;
    var av = B.Avatar.build({
      team: human ? "blue" : undefined,
      shirt: human ? "#4b8dff" : undefined,
      hat: "cap", mood: "angry"
    });
    this.scene.add(av.group);
    var ent = {
      netRemote: true, isBot: !human, isPlayer: false, netId: id,
      name: human ? "Jugador" : "Bot", team: human ? "blue" : null, kind: "soldier",
      pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0,
      radius: 0.42, height: 1.9, eye: 1.62, grounded: true,
      health: 100, maxHealth: 100, armor: 0, alive: true, invuln: 0,
      weapon: "pistol", kills: 0, deaths: 0, score: 0, netMag: 0, netReserve: 0,
      avatar: av, group: av.group, carrying: null, netTarget: null
    };
    this.netEntities[id] = ent;
    this.entities.push(ent);
    return ent;
  };

  Game.prototype.interpolateNetEntities = function (dt) {
    var k = Math.min(1, dt * 13);
    for (var id in this.netEntities) {
      var e = this.netEntities[id];
      if (!e.netTarget || e.netLocal) continue;
      var px = e.pos.x, pz = e.pos.z;
      e.pos.x = B.lerp(e.pos.x, e.netTarget.x, k);
      e.pos.y = B.lerp(e.pos.y, e.netTarget.y, k);
      e.pos.z = B.lerp(e.pos.z, e.netTarget.z, k);
      e.yaw = B.angleLerp(e.yaw, e.netTarget.yaw, k);
      if (e.group) {
        e.group.position.set(e.pos.x, e.pos.y, e.pos.z);
        e.group.rotation.y = e.yaw;
      }
      if (e.avatar) {
        var sp = Math.min(1, B.dist(e.pos.x, e.pos.z, px, pz) / Math.max(0.001, dt) / 6);
        B.Avatar.update(e.avatar, dt, sp, true);
      }
    }
  };

  /* Fila del invitado sobre si mismo: vida, escudo y municion autoritativos */
  Game.prototype.applySelfSnapshot = function (row) {
    var p = this.player;
    p.netTarget = { x: row[1], y: row[2], z: row[3], yaw: p.yaw, pitch: p.pitch };
    p.health = row[6];
    p.armor = row[7];
    var alive = row[8] === 1;
    if (p.alive !== alive) {
      p.alive = alive;
      if (!alive) { p.respawnTimer = 3.2; B.HUD.showRespawn(true, 3.2); p.thirdPerson = true; }
    }
    var w = B.WEAPONS[row[9] - 1];
    if (w) p.weapon = w.id;
    var st = p.ammo[p.weapon];
    if (st) { st.mag = row[10]; st.reserve = row[11]; }
    p.kills = row[12]; p.deaths = row[13]; p.score = row[14];
  };

  Game.prototype.updateNetClient = function (dt) {
    this.interpolateNetEntities(dt);
    var p = this.player;
    if (p.netTarget) {
      var d = B.dist(p.pos.x, p.pos.z, p.netTarget.x, p.netTarget.z);
      if (d > 2.8) {
        p.pos.x = p.netTarget.x; p.pos.y = p.netTarget.y; p.pos.z = p.netTarget.z;
        p.vel.x = p.vel.y = p.vel.z = 0;
      } else if (d > 0.45) {
        var k = Math.min(1, dt * 3.4);
        p.pos.x = B.lerp(p.pos.x, p.netTarget.x, k);
        p.pos.z = B.lerp(p.pos.z, p.netTarget.z, k);
        p.pos.y = B.lerp(p.pos.y, p.netTarget.y, Math.min(1, dt * 5));
      }
    }
    this.netInputTimer -= dt;
    if (this.netInputTimer <= 0) {
      this.netInputTimer = 1 / B.Net.INPUT_HZ;
      B.Net.sendFast("in", B.Net.buildInput(this));
      if (Math.random() < 0.2) B.Net.sendFast("pg", null);
    }
  };

  Game.prototype.hostNetTick = function (dt) {
    this.netSnapTimer -= dt;
    this.netRosterTimer -= dt;
    if (this.netSnapTimer <= 0) {
      this.netSnapTimer = 1 / B.Net.FAST_HZ;
      B.Net.sendFast("sn", B.Net.buildSnapshot(this));
    }
    if (this.netRosterTimer <= 0) {
      this.netRosterTimer = 2;
      B.Net.sendRel("ro", B.Net.buildRoster(this));
    }
  };

  Game.prototype.netBanner = function (text, dur, sub) {
    B.HUD.banner(text, dur, sub);
    if (this.netHost) this.netEvents.push(["bn", text, sub || "", dur || 2]);
  };

  Game.prototype.applyNetEvent = function (ev) {
    if (!ev) return;
    if (ev[0] === "kf") B.HUD.pushKill(ev[1], ev[2] || null, ev[3], ev[4], ev[5] || null, ev[6] === 1);
    else if (ev[0] === "bn") B.HUD.banner(ev[1], ev[3] || 2, ev[2] || "");
    else if (ev[0] === "to") B.HUD.toast(ev[1], 1.6);
  };

  B.Game = Game;
})();
