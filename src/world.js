/* BLOCKBURST - construccion del mundo: geometria instanciada, colisiones AABB,
   rampas transitables, hash espacial y raycast por muestreo. */
(function () {
  'use strict';
  var B = (window.BLITZ = window.BLITZ || {});

  var CELL = 8;

  var blockTex = null;
  function getBlockTexture() {
    if (blockTex) return blockTex;
    var c = document.createElement("canvas");
    c.width = c.height = 64;
    var g = c.getContext("2d");
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, 64, 64);
    var img = g.getImageData(0, 0, 64, 64);
    var d = img.data;
    for (var i = 0; i < d.length; i += 4) {
      var n = Math.random() * 18 - 9;
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
    g.putImageData(img, 0, 0);
    g.lineWidth = 3;
    g.strokeStyle = "rgba(255,255,255,0.34)";
    g.beginPath(); g.moveTo(1.5, 62); g.lineTo(1.5, 1.5); g.lineTo(62, 1.5); g.stroke();
    g.strokeStyle = "rgba(0,0,0,0.30)";
    g.beginPath(); g.moveTo(62.5, 2); g.lineTo(62.5, 62.5); g.lineTo(2, 62.5); g.stroke();
    blockTex = new THREE.CanvasTexture(c);
    blockTex.wrapS = blockTex.wrapT = THREE.RepeatWrapping;
    blockTex.anisotropy = 4;
    return blockTex;
  }

  var matCache = Object.create(null);
  function material(hex, opt) {
    var key = hex + (opt && opt.emissive ? "|e" : "") + (opt && opt.opacity != null ? "|" + opt.opacity : "");
    if (matCache[key]) return matCache[key];
    var m = new THREE.MeshLambertMaterial({ color: new THREE.Color(hex), map: getBlockTexture() });
    if (opt && opt.emissive) { m.emissive = new THREE.Color(opt.emissive); m.emissiveIntensity = opt.emissiveIntensity || 0.55; }
    if (opt && opt.opacity != null) { m.transparent = true; m.opacity = opt.opacity; m.depthWrite = false; }
    matCache[key] = m;
    return m;
  }

  function key(cx, cz) { return cx + ":" + cz; }

  function World(scene, map, quality) {
    this.scene = scene;
    this.map = map;
    this.group = new THREE.Group();
    this.group.name = "world:" + map.id;
    this.colliders = [];
    this.ramps = [];
    this.hazards = [];
    this.triggers = [];
    this.footprints = [];
    this.unitGeo = new THREE.BoxGeometry(1, 1, 1);
    this._anim = [];

    scene.add(this.group);

    var theme = map.theme;
    scene.background = new THREE.Color(theme.sky);
    scene.fog = theme.fog === false ? null : new THREE.Fog(new THREE.Color(theme.fog || theme.sky), theme.fogNear || 90, theme.fogFar || 260);

    this.group.add(new THREE.HemisphereLight(new THREE.Color(theme.sky), new THREE.Color(theme.base || "#666"), theme.hemi == null ? 0.55 : theme.hemi));

    var sun = new THREE.DirectionalLight(new THREE.Color(theme.sun || "#fff3d0"), theme.sunIntensity == null ? 1.05 : theme.sunIntensity);
    sun.position.set(theme.sunX || 70, theme.sunY || 130, theme.sunZ || 50);
    if (quality && quality.shadows) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(1536, 1536);
      var s = (map.size || 96) * 0.8;
      sun.shadow.camera.left = -s; sun.shadow.camera.right = s;
      sun.shadow.camera.top = s; sun.shadow.camera.bottom = -s;
      sun.shadow.camera.near = 1; sun.shadow.camera.far = 400;
      sun.shadow.bias = -0.0004;
      sun.shadow.normalBias = 0.035;
    }
    this.group.add(sun);
    this.group.add(sun.target);

    this.group.add(new THREE.AmbientLight(new THREE.Color(theme.ambient || "#ffffff"), theme.ambientIntensity == null ? 0.32 : theme.ambientIntensity));

    this.group.add(this._fillLight(theme));
    this.group.add(this._skyDome(map, theme));

    this._build(map, quality);
  }

  /* Luz de relleno frio, opuesta al sol, para dar volumen a los bloques */
  World.prototype._fillLight = function (theme) {
    var fill = new THREE.DirectionalLight(new THREE.Color(theme.fill || "#9fc0ff"), theme.fillIntensity == null ? 0.3 : theme.fillIntensity);
    fill.position.set(-70, 45, -80);
    return fill;
  };

  /* Cupula de cielo con degradado vertical */
  World.prototype._skyDome = function (map, theme) {
    var c = document.createElement("canvas");
    c.width = 8;
    c.height = 256;
    var g = c.getContext("2d");
    var grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, theme.skyTop || theme.sky);
    grad.addColorStop(0.3, theme.sky);
    grad.addColorStop(0.5, theme.fog || theme.sky);
    grad.addColorStop(1, theme.fog || theme.sky);
    g.fillStyle = grad;
    g.fillRect(0, 0, 8, 256);
    var tex = new THREE.CanvasTexture(c);
    var mesh = new THREE.Mesh(
      new THREE.SphereGeometry((map.size || 96) * 1.7, 24, 16),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, depthWrite: false, fog: false })
    );
    mesh.renderOrder = -1;
    return mesh;
  };

  World.prototype._build = function (map, quality) {
    var self = this;
    var half = (map.size || 96) / 2;
    var byColor = Object.create(null);
    var shadow = !!(quality && quality.shadows);

    function addSolid(x, y, z, w, h, d, color) {
      var b = new THREE.Box3(new THREE.Vector3(x - w / 2, y, z - d / 2), new THREE.Vector3(x + w / 2, y + h, z + d / 2));
      self.colliders.push({ min: b.min, max: b.max, box: b, kind: "solid" });
      (byColor[color] || (byColor[color] = [])).push({ x: x, y: y + h / 2, z: z, w: w, h: h, d: d });
    }

    if (map.ground !== false) {
      addSolid(0, -4, 0, map.size, 4, map.size, map.theme.base || "#4b5a44");
      var rail = 1.2, rh = 1.5;
      var edge = map.theme.edge || map.theme.base;
      addSolid(0, 0, -half, map.size, rh, rail, edge);
      addSolid(0, 0, half, map.size, rh, rail, edge);
      addSolid(-half, 0, 0, rail, rh, map.size, edge);
      addSolid(half, 0, 0, rail, rh, map.size, edge);
    }

    (map.structures || []).forEach(function (s) {
      if (s.type === "ramp") {
        var axis = s.axis || "z";
        var dir = s.dir == null ? 1 : s.dir;
        var w = s.s[0], h = s.s[1], d = s.s[2];
        var len = axis === "z" ? d : w;
        var run = Math.sqrt(len * len + h * h);
        var thick = 0.45;
        var geo = axis === "z"
          ? new THREE.BoxGeometry(w, thick, run)
          : new THREE.BoxGeometry(run, thick, d);
        var angle = Math.atan2(h, len);
        var mesh = new THREE.Mesh(geo, material(s.c));
        mesh.position.set(s.p[0], s.p[1] + h / 2 - 0.2, s.p[2]);
        if (axis === "z") mesh.rotation.x = -angle * dir; else mesh.rotation.z = angle * dir;
        mesh.castShadow = shadow; mesh.receiveShadow = shadow;
        self.group.add(mesh);
        self.ramps.push({
          min: new THREE.Vector3(s.p[0] - w / 2, s.p[1], s.p[2] - d / 2),
          max: new THREE.Vector3(s.p[0] + w / 2, s.p[1] + h, s.p[2] + d / 2),
          axis: axis, dir: dir, baseY: s.p[1], h: h, len: len
        });
        return;
      }
      addSolid(s.p[0], s.p[1], s.p[2], s.s[0], s.s[1], s.s[2], s.c);
      if (s.s[1] > 1.8) self.footprints.push({ x: s.p[0], z: s.p[2], w: s.s[0], d: s.s[2], c: s.c });
    });

    var dummy = new THREE.Object3D();
    Object.keys(byColor).forEach(function (color) {
      var list = byColor[color];
      var mesh = new THREE.InstancedMesh(self.unitGeo, material(color), list.length);
      mesh.castShadow = shadow; mesh.receiveShadow = shadow;
      for (var j = 0; j < list.length; j++) {
        var it = list[j];
        dummy.position.set(it.x, it.y, it.z);
        dummy.scale.set(it.w, it.h, it.d);
        dummy.updateMatrix();
        mesh.setMatrixAt(j, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.matrixAutoUpdate = false;
      self.group.add(mesh);
    });

    (map.hazards || []).forEach(function (h) {
      var box = new THREE.Box3(new THREE.Vector3(h.min[0], h.min[1], h.min[2]), new THREE.Vector3(h.max[0], h.max[1], h.max[2]));
      self.hazards.push({ type: h.type, box: box, min: box.min, max: box.max, dmg: h.dmg || 0, slow: h.slow || 0 });
      var size = box.getSize(new THREE.Vector3());
      var center = box.getCenter(new THREE.Vector3());
      var mat = h.type === "lava"
        ? material("#ff5a12", { emissive: "#ff3a00", emissiveIntensity: 0.9 })
        : material("#2f8fd8", { opacity: 0.6 });
      var mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), mat);
      mesh.position.copy(center);
      mesh.renderOrder = h.type === "water" ? 2 : 1;
      self.group.add(mesh);
      self._anim.push({ mesh: mesh, base: center.y, type: h.type, t: Math.random() * 6.28 });
    });

    (map.triggers || []).forEach(function (t) {
      var box = new THREE.Box3(new THREE.Vector3(t.min[0], t.min[1], t.min[2]), new THREE.Vector3(t.max[0], t.max[1], t.max[2]));
      self.triggers.push({ id: t.id, team: t.team, box: box, min: box.min, max: box.max, r: t.r });
    });

    this.hash = (function () {
      var buckets = Object.create(null);
      for (var i = 0; i < self.colliders.length; i++) {
        var c = self.colliders[i];
        var x0 = Math.floor(c.min.x / CELL), x1 = Math.floor(c.max.x / CELL);
        var z0 = Math.floor(c.min.z / CELL), z1 = Math.floor(c.max.z / CELL);
        for (var x = x0; x <= x1; x++) for (var z = z0; z <= z1; z++) {
          var k = key(x, z);
          (buckets[k] || (buckets[k] = [])).push(i);
        }
      }
      return buckets;
    })();

    this.bounds = { minX: -half, maxX: half, minZ: -half, maxZ: half, voidY: map.voidY == null ? -14 : map.voidY };
  };

  World.prototype.bucketsFor = function (min, max, out) {
    out.length = 0;
    var x0 = Math.floor(min.x / CELL), x1 = Math.floor(max.x / CELL);
    var z0 = Math.floor(min.z / CELL), z1 = Math.floor(max.z / CELL);
    for (var x = x0; x <= x1; x++) for (var z = z0; z <= z1; z++) {
      var b = this.hash[key(x, z)];
      if (!b) continue;
      for (var i = 0; i < b.length; i++) if (out.indexOf(b[i]) === -1) out.push(b[i]);
    }
    return out;
  };

  var _scratch = [];
  World.prototype.boxHits = function (box) {
    var list = this.bucketsFor(box.min, box.max, _scratch);
    for (var i = 0; i < list.length; i++) {
      var c = this.colliders[list[i]];
      if (!c.disabled && c.box.intersectsBox(box)) return c;
    }
    return null;
  };

  var _pmin = new THREE.Vector3();
  var _pmax = new THREE.Vector3();
  var _pbox = new THREE.Box3(_pmin, _pmax);
  World.prototype.pointSolid = function (x, y, z) {
    _pmin.set(x - 0.01, y - 0.01, z - 0.01);
    _pmax.set(x + 0.01, y + 0.01, z + 0.01);
    return !!this.boxHits(_pbox);
  };

  World.prototype.raycast = function (origin, dir, maxDist, step) {
    step = step || 0.22;
    var dist = 0;
    while (dist <= maxDist) {
      var x = origin.x + dir.x * dist, y = origin.y + dir.y * dist, z = origin.z + dir.z * dist;
      if (this.pointSolid(x, y, z)) return { point: new THREE.Vector3(x, y, z), dist: dist };
      dist += step;
    }
    return null;
  };

  /* Altura de la superficie de una rampa en (x,z), o null si no hay rampa ahi */
  World.prototype.rampHeightAt = function (x, z) {
    for (var i = 0; i < this.ramps.length; i++) {
      var r = this.ramps[i];
      if (x < r.min.x || x > r.max.x || z < r.min.z || z > r.max.z) continue;
      var t;
      if (r.axis === "z") t = (z - r.min.z) / (r.max.z - r.min.z);
      else t = (x - r.min.x) / (r.max.x - r.min.x);
      if (r.dir < 0) t = 1 - t;
      return r.baseY + B.clamp(t, 0, 1) * r.h;
    }
    return null;
  };

  World.prototype.hazardAt = function (x, y, z) {
    for (var i = 0; i < this.hazards.length; i++) {
      var h = this.hazards[i];
      if (x >= h.min.x && x <= h.max.x && z >= h.min.z && z <= h.max.z && y >= h.min.y - 0.7 && y <= h.max.y) return h;
    }
    return null;
  };

  World.prototype.update = function (dt) {
    for (var i = 0; i < this._anim.length; i++) {
      var a = this._anim[i];
      a.t += dt;
      if (a.type === "lava") {
        a.mesh.material.emissiveIntensity = 0.62 + Math.sin(a.t * 1.7) * 0.26;
        a.mesh.position.y = a.base + Math.sin(a.t * 0.9) * 0.06;
      } else if (a.type === "water") {
        a.mesh.position.y = a.base + Math.sin(a.t * 1.2) * 0.07;
      }
    }
  };

  /* Inserta un bloque solido despues de construir el mapa (barriles, etc.) */
  World.prototype.addSolidBox = function (x, y, z, w, h, d, color, shadow) {
    var box = new THREE.Box3(new THREE.Vector3(x - w / 2, y, z - d / 2), new THREE.Vector3(x + w / 2, y + h, z + d / 2));
    var col = { min: box.min, max: box.max, box: box, kind: "solid" };
    this.colliders.push(col);
    var idx = this.colliders.length - 1;
    var x0 = Math.floor(col.min.x / CELL), x1 = Math.floor(col.max.x / CELL);
    var z0 = Math.floor(col.min.z / CELL), z1 = Math.floor(col.max.z / CELL);
    for (var cx = x0; cx <= x1; cx++) {
      for (var cz = z0; cz <= z1; cz++) {
        var k = key(cx, cz);
        (this.hash[k] || (this.hash[k] = [])).push(idx);
      }
    }
    var mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(color));
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = !!shadow; mesh.receiveShadow = !!shadow;
    this.group.add(mesh);
    col.mesh = mesh;
    return col;
  };

  World.prototype.removeCollider = function (col) {
    if (!col) return;
    col.disabled = true;
    if (col.mesh) {
      if (col.mesh.parent) col.mesh.parent.remove(col.mesh);
      col.mesh.geometry.dispose();
    }
  };

  World.prototype.dispose = function () {
    this.scene.remove(this.group);
    this.group.traverse(function (o) { if (o.isMesh && o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); });
    this.unitGeo.dispose();
    this.colliders = []; this.ramps = []; this.hazards = []; this.triggers = []; this.footprints = []; this._anim = [];
  };

  B.World = World;
  B.World.material = material;
})();
