/* BLOCKBURST - mapas. Seis arenas generadas de forma determinista (misma semilla,
   mismo mapa). Coordenadas de bloque: p = [x, yInferior, z].
   Los puntos de aparicion, waypoints, pickups y objetivos se calculan contra la
   geometria real para que nunca queden dentro de un bloque. */
(function () {
  'use strict';
  var B = (window.BLITZ = window.BLITZ || {});

  B.MAPS = [];

  function r2(v) { return Math.round(v * 100) / 100; }

  function solidBoxes(structures) {
    var out = [];
    for (var i = 0; i < structures.length; i++) {
      var s = structures[i];
      if (s.type === "ramp") continue;
      out.push({
        minX: s.p[0] - s.s[0] / 2, maxX: s.p[0] + s.s[0] / 2,
        minY: s.p[1], maxY: s.p[1] + s.s[1],
        minZ: s.p[2] - s.s[2] / 2, maxZ: s.p[2] + s.s[2] / 2
      });
    }
    return out;
  }

  /* Altura de la superficie pisable en (x,z). null si no hay nada debajo. */
  function surfaceY(boxes, x, z, hasGround) {
    var y = hasGround ? 0 : null;
    for (var i = 0; i < boxes.length; i++) {
      var b = boxes[i];
      if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
      if (b.maxY > 8.5) continue;
      if (y === null || b.maxY > y) y = b.maxY;
    }
    return y;
  }

  /* Comprueba que un personaje apoyado en (x,z,feetY) no intersecte ningun bloque */
  function fits(boxes, x, z, feetY, r, h) {
    var lo = feetY + 0.12, hi = feetY + h;
    for (var i = 0; i < boxes.length; i++) {
      var b = boxes[i];
      if (x + r <= b.minX || x - r >= b.maxX) continue;
      if (z + r <= b.minZ || z - r >= b.maxZ) continue;
      if (hi <= b.minY || lo >= b.maxY) continue;
      return false;
    }
    return true;
  }

  function inHazard(hazards, x, z) {
    for (var i = 0; i < hazards.length; i++) {
      var h = hazards[i];
      if (x > h.min[0] && x < h.max[0] && z > h.min[2] && z < h.max[2]) return true;
    }
    return false;
  }

  function standable(boxes, x, z, hasGround, hazards) {
    if (hazards && inHazard(hazards, x, z)) return null;
    var y = surfaceY(boxes, x, z, hasGround);
    if (y === null || y < -2) return null;
    if (!fits(boxes, x, z, y, 0.55, 1.95)) return null;
    return y;
  }

  function candidates(cfg, boxes) {
    var half = cfg.size / 2;
    var hasGround = cfg.ground !== false;
    var haz = cfg.hazards || [];
    var raw = [];
    for (var ring = 1; ring <= 4; ring++) {
      var R = (half - 6) * (ring / 4);
      var n = 14 + ring * 5;
      for (var i = 0; i < n; i++) {
        var a = (i / n) * Math.PI * 2 + ring * 0.37;
        raw.push([Math.cos(a) * R, Math.sin(a) * R]);
      }
    }
    var step = Math.max(6, Math.round(cfg.size / 15));
    for (var gx = -half + 3; gx <= half - 3; gx += step) {
      for (var gz = -half + 3; gz <= half - 3; gz += step) raw.push([gx, gz]);
    }
    var out = [];
    for (var c = 0; c < raw.length; c++) {
      var y = standable(boxes, raw[c][0], raw[c][1], hasGround, haz);
      if (y !== null) out.push([r2(raw[c][0]), r2(raw[c][1]), r2(y)]);
    }
    return out;
  }

  function pickSpread(points, count, minDist) {
    var pool = B.shuffle(points.slice());
    var out = [];
    var d2 = minDist * minDist;
    for (var i = 0; i < pool.length && out.length < count; i++) {
      var ok = true;
      for (var j = 0; j < out.length; j++) {
        if (B.dist2(pool[i][0], pool[i][1], out[j][0], out[j][1]) < d2) { ok = false; break; }
      }
      if (ok) out.push(pool[i]);
    }
    if (out.length < count) {
      for (var k = 0; k < pool.length && out.length < count; k++) {
        if (out.indexOf(pool[k]) === -1) out.push(pool[k]);
      }
    }
    return out;
  }

  function nearest(points, x, z) {
    var best = null, bd = Infinity;
    for (var i = 0; i < points.length; i++) {
      var d = B.dist2(points[i][0], points[i][1], x, z);
      if (d < bd) { bd = d; best = points[i]; }
    }
    return best;
  }

  function clearOf(x, z, areas) {
    for (var i = 0; i < areas.length; i++) {
      var a = areas[i];
      if (B.dist2(x, z, a[0], a[1]) < a[2] * a[2]) return false;
    }
    return true;
  }

  /* Generador de manzanas/arena de bloques */
  function city(seed, o) {
    var rand = B.rng(seed);
    var out = [];
    var half = o.size / 2;
    var cell = o.cell;
    var n = Math.round(o.size / cell);
    var open = o.open || [];

    for (var ix = 0; ix < n; ix++) {
      for (var iz = 0; iz < n; iz++) {
        var cx = -half + cell / 2 + ix * cell;
        var cz = -half + cell / 2 + iz * cell;
        if (ix % o.streetEvery === 0 || iz % o.streetEvery === 0) continue;
        if (!clearOf(cx, cz, open)) continue;
        if (rand() < (o.gap || 0)) continue;

        var w = cell * (o.fill || 0.78);
        var d = cell * (o.fill || 0.78);
        var h = Math.round(o.minH + rand() * (o.maxH - o.minH));
        var c = o.colors[Math.floor(rand() * o.colors.length)];
        out.push({ p: [r2(cx), 0, r2(cz)], s: [r2(w), h, r2(d)], c: c });

        if (o.roofDetail && h > 3 && rand() < 0.55) {
          out.push({
            p: [r2(cx + (rand() - 0.5) * w * 0.4), h, r2(cz + (rand() - 0.5) * d * 0.4)],
            s: [r2(w * 0.36), 1 + Math.round(rand() * 2), r2(d * 0.36)],
            c: o.detail
          });
        }
        if (o.stairs && h >= 2.6) {
          var run = Math.round(h * 1.6 + 1.2);
          out.push({
            type: "ramp", axis: "z", dir: 1,
            p: [r2(cx - w / 2 - 1.4), 0, r2(cz - d / 2 - run / 2)],
            s: [1.7, h, run], c: o.stairColor || c
          });
        }
      }
    }

    (o.blocks || []).forEach(function (b) { out.push(b); });
    return out;
  }

  function finish(seed, cfg) {
    var boxes = solidBoxes(cfg.structures);
    var hasGround = cfg.ground !== false;
    var pts = candidates(cfg, boxes);
    var half = cfg.size / 2;
    var seedRng = B.rng(seed);

    var spawns = pickSpread(pts, 16, cfg.size * 0.2);
    if (spawns.length < 8) spawns = pts.slice(0, 12);

    var waypoints = pickSpread(pts, 44, cfg.size * 0.08).map(function (p) { return [p[0], p[1]]; });
    if (waypoints.length < 10) waypoints = pts.map(function (p) { return [p[0], p[1]]; });

    var pickSrc = pts.slice();
    // Empuja algunos pickups hacia las esquinas para repartirlos
    var corners = [[-half * 0.62, -half * 0.62], [half * 0.62, half * 0.62], [half * 0.62, -half * 0.62], [-half * 0.62, half * 0.62]];
    corners.forEach(function (c) {
      var p = nearest(pts, c[0], c[1]);
      if (p) pickSrc.unshift(p, p, p, p);
    });
    var pickups = pickSpread(pickSrc, 10, cfg.size * 0.18);
    if (pickups.length < 6) pickups = pts.slice(0, 8);

    var hillP = nearest(pts, 0, 0) || [0, 0, 0];
    var redP = nearest(pts, -half + 9, -half + 9) || [-half + 9, -half + 9, 0];
    var blueP = nearest(pts, half - 9, half - 9) || [half - 9, half - 9, 0];

    var barrels = pickSpread(pts, 6, cfg.size * 0.2).map(function (p) { return [p[0], p[2], p[1]]; });

    void seedRng;
    return {
      id: cfg.id, name: cfg.name, tagline: cfg.tagline, size: cfg.size,
      theme: cfg.theme, ground: hasGround,
      structures: cfg.structures, hazards: cfg.hazards || [],
      barrels: barrels, swatch: cfg.swatch,
      friction: cfg.friction == null ? 0.82 : cfg.friction,
      jump: cfg.jump == null ? 8.2 : cfg.jump,
      gravity: cfg.gravity == null ? 22 : cfg.gravity,
      voidY: cfg.voidY == null ? -14 : cfg.voidY,
      spawns: spawns, waypoints: waypoints, pickupNodes: pickups,
      objectives: {
        flags: { red: [redP[0], redP[1]], blue: [blueP[0], blueP[1]], redY: redP[2], blueY: blueP[2] },
        hill: { x: hillP[0], z: hillP[1], y: hillP[2], r: 7.5 }
      }
    };
  }

  /* ---------------- 1. Distrito Doodle (calles y azoteas) --------------- */
  (function () {
    var o = {
      id: "distrito", name: "Distrito Doodle", tagline: "Calles anchas, azoteas conectadas por rampas y una plaza con fuente.",
      size: 104, cell: 11, streetEvery: 2, fill: 0.76, gap: 0.08, minH: 3, maxH: 11,
      roofDetail: true, stairs: true, stairColor: "#8a4a2c",
      colors: ["#e8734a", "#f0a05a", "#d95f3b", "#f4c66a", "#c9563a", "#e08b6a"],
      detail: "#7a4226",
      open: [[0, 0, 13], [-44, -44, 10], [44, 44, 10]],
      blocks: [
        { p: [0, 0, 0], s: [12, 0.5, 12], c: "#6f8f5a" },
        { p: [0, 0.5, 0], s: [2.4, 2.6, 2.4], c: "#8aa0b8" },
        { p: [0, 3.1, 0], s: [1.2, 1.2, 1.2], c: "#34d6f0" },
        { p: [9, 0, 0], s: [1.4, 1, 9], c: "#5a4636" },
        { p: [-9, 0, 0], s: [1.4, 1, 9], c: "#5a4636" }
      ]
    };
    B.MAPS.push(finish(101, {
      id: o.id, name: o.name, tagline: o.tagline, size: o.size, structures: city(101, o),
      theme: { sky: "#ffcf96", fog: "#f0ab6a", fogNear: 70, fogFar: 235, sun: "#fff2cc", sunIntensity: 1.15, ambient: "#ffe0c0", ambientIntensity: 0.34, hemi: 0.5, base: "#6f8f5a", edge: "#5a4636" },
      hazards: [{ type: "water", min: [-48, -0.6, -52], max: [-36, 0.35, -40] }],
      swatch: ["#e8734a", "#f4c66a", "#6f8f5a"]
    }));
  })();

  /* ------------------------- 2. Caldera Voxel (lava) -------------------- */
  (function () {
    var o = {
      id: "caldera", name: "Caldera Voxel", tagline: "Roca oscura, torres de basalto y rios de lava que no perdonan.",
      size: 100, cell: 12, streetEvery: 2, fill: 0.7, gap: 0.16, minH: 2, maxH: 9,
      roofDetail: true, stairs: true, stairColor: "#6a5a50",
      colors: ["#4a4048", "#5a4a50", "#2e2830", "#6a5a52", "#3a3238"],
      detail: "#241f26",
      open: [[0, 0, 13], [-42, -42, 10], [42, 42, 10]],
      blocks: [
        { p: [0, 0, 0], s: [12, 0.5, 12], c: "#6a5a52" },
        { p: [0, 0.5, 0], s: [3, 2.2, 3], c: "#3a3238" },
        { p: [-32, 0, 20], s: [6, 13, 6], c: "#3a3238" },
        { p: [32, 0, -20], s: [6, 13, 6], c: "#3a3238" }
      ]
    };
    B.MAPS.push(finish(202, {
      id: o.id, name: o.name, tagline: o.tagline, size: o.size, structures: city(202, o),
      theme: { sky: "#3a2026", fog: "#5a2c22", fogNear: 40, fogFar: 175, sun: "#ff9a5a", sunIntensity: 0.9, ambient: "#ff7040", ambientIntensity: 0.3, hemi: 0.35, base: "#3a3238", edge: "#241f26" },
      hazards: [
        { type: "lava", min: [-50, -1.2, 8], max: [-16, 0.25, 22], dmg: 26 },
        { type: "lava", min: [16, -1.2, -22], max: [50, 0.25, -8], dmg: 26 },
        { type: "lava", min: [-9, -1.2, -46], max: [9, 0.25, -36], dmg: 26 }
      ],
      swatch: ["#4a4048", "#ff5a12", "#ff9a5a"]
    }));
  })();

  /* ------------------------ 3. Glaciar Azul (hielo) --------------------- */
  (function () {
    var o = {
      id: "glaciar", name: "Glaciar Azul", tagline: "Superficie resbaladiza, lagunas heladas y bloques de hielo.",
      size: 96, cell: 11, streetEvery: 2, fill: 0.72, gap: 0.12, minH: 3, maxH: 10,
      roofDetail: true, stairs: true, stairColor: "#8fbfdc",
      colors: ["#a9d4ee", "#dff1fb", "#8fbfdc", "#c7e6f7", "#7fb0d0"],
      detail: "#6d9fbf",
      open: [[0, 0, 12], [-40, -40, 10], [40, 40, 10]],
      blocks: [
        { p: [0, 0, 0], s: [11, 0.5, 11], c: "#dff1fb" },
        { p: [0, 0.5, 0], s: [3.4, 3.6, 3.4], c: "#8fbfdc" }
      ]
    };
    B.MAPS.push(finish(303, {
      id: o.id, name: o.name, tagline: o.tagline, size: o.size, structures: city(303, o),
      friction: 0.24, jump: 8.0,
      theme: { sky: "#d9f0fb", fog: "#cfe8f5", fogNear: 60, fogFar: 215, sun: "#ffffff", sunIntensity: 1.05, ambient: "#eaf6ff", ambientIntensity: 0.42, hemi: 0.6, base: "#dff1fb", edge: "#8fbfdc" },
      hazards: [
        { type: "water", min: [-46, -0.7, -46], max: [-26, 0.3, -26], slow: 0.55 },
        { type: "water", min: [24, -0.7, 24], max: [46, 0.3, 46], slow: 0.55 }
      ],
      swatch: ["#dff1fb", "#8fbfdc", "#34d6f0"]
    }));
  })();

  /* --------------------- 4. Templo Selva (terrazas) --------------------- */
  (function () {
    var o = {
      id: "templo", name: "Templo Selva", tagline: "Terrazas de piedra, columnas antiguas y pozas de agua.",
      size: 100, cell: 12, streetEvery: 2, fill: 0.68, gap: 0.14, minH: 2, maxH: 8,
      roofDetail: true, stairs: true, stairColor: "#b8a06a",
      colors: ["#6d8f4a", "#8aa85c", "#b8a06a", "#7f6a44", "#5d7a3a"],
      detail: "#4f7a3a",
      open: [[0, 0, 15], [-42, -42, 10], [42, 42, 10]],
      blocks: [
        { p: [0, 0, 0], s: [17, 0.5, 17], c: "#b8a06a" },
        { p: [0, 0.5, 0], s: [8, 1.1, 8], c: "#8aa85c" },
        { p: [-12, 0, -12], s: [4, 6, 4], c: "#7f6a44" },
        { p: [12, 0, 12], s: [4, 6, 4], c: "#7f6a44" },
        { p: [-12, 6, -12], s: [5, 0.8, 5], c: "#b8a06a" },
        { p: [12, 6, 12], s: [5, 0.8, 5], c: "#b8a06a" },
        { p: [-6.5, 0.5, 0], s: [1.2, 3, 1.2], c: "#b8a06a" },
        { p: [6.5, 0.5, 0], s: [1.2, 3, 1.2], c: "#b8a06a" },
        { p: [0, 0.5, -6.5], s: [1.2, 3, 1.2], c: "#b8a06a" },
        { p: [0, 0.5, 6.5], s: [1.2, 3, 1.2], c: "#b8a06a" }
      ]
    };
    B.MAPS.push(finish(404, {
      id: o.id, name: o.name, tagline: o.tagline, size: o.size, structures: city(404, o),
      theme: { sky: "#bfe0a0", fog: "#9dc47a", fogNear: 55, fogFar: 200, sun: "#fff6c8", sunIntensity: 1.0, ambient: "#d8f0b8", ambientIntensity: 0.36, hemi: 0.55, base: "#4f7a3a", edge: "#3a5c2a" },
      hazards: [
        { type: "water", min: [-48, -0.9, 8], max: [-28, 0.3, 26], slow: 0.6 },
        { type: "water", min: [28, -0.9, -26], max: [48, 0.3, -8], slow: 0.6 }
      ],
      swatch: ["#6d8f4a", "#b8a06a", "#2f8fd8"]
    }));
  })();

  /* ---------------------- 5. Azoteas Neon (noche) ----------------------- */
  (function () {
    var o = {
      id: "neon", name: "Azoteas Neon", tagline: "Rascacielos de colores, pasarelas suspendidas y niebla de medianoche.",
      size: 104, cell: 11, streetEvery: 2, fill: 0.74, gap: 0.1, minH: 5, maxH: 15,
      roofDetail: true, stairs: true, stairColor: "#333c58",
      colors: ["#26304a", "#312a4a", "#1f2a3a", "#2d3f5c", "#3a2f55"],
      detail: "#34d6f0",
      open: [[0, 0, 14], [-44, -44, 11], [44, 44, 11]],
      blocks: [
        { p: [0, 0, 0], s: [13, 0.5, 13], c: "#232c3c" },
        { p: [0, 0.5, -6], s: [8, 7, 1.2], c: "#34d6f0" },
        { p: [0, 0.5, 6], s: [1.2, 7, 8], c: "#ff4fd8" },
        { p: [-22, 8, 0], s: [22, 1, 2.4], c: "#333c58" },
        { p: [22, 8, 0], s: [22, 1, 2.4], c: "#333c58" },
        { p: [0, 8, -22], s: [2.4, 1, 22], c: "#333c58" },
        { p: [0, 8, 22], s: [2.4, 1, 22], c: "#333c58" }
      ]
    };
    B.MAPS.push(finish(505, {
      id: o.id, name: o.name, tagline: o.tagline, size: o.size, structures: city(505, o),
      theme: { sky: "#0b1020", fog: "#131a2c", fogNear: 45, fogFar: 185, sun: "#8fb4ff", sunIntensity: 0.55, ambient: "#4a6ba8", ambientIntensity: 0.3, hemi: 0.4, base: "#1a1f2b", edge: "#2b3444" },
      hazards: [],
      swatch: ["#26304a", "#34d6f0", "#ff4fd8"]
    }));
  })();

  /* ---------------------- 6. Islas Flotantes (vacio) -------------------- */
  (function () {
    var size = 108;
    var rand = B.rng(606);
    var out = [];
    var centers = [[-32, -30], [0, 0], [32, 30], [-32, 32], [34, -32], [0, -44], [0, 44], [-44, 0], [44, 0]];
    centers.forEach(function (c, i) {
      var w = i === 1 ? 26 : 17 + rand() * 6;
      var d = i === 1 ? 26 : 17 + rand() * 6;
      out.push({ p: [c[0], -3, c[1]], s: [w, 3, d], c: i === 1 ? "#7ab55c" : "#6fa04e" });
      out.push({ p: [c[0], 0, c[1]], s: [w * 0.45, 1.2 + rand() * 1.2, d * 0.45], c: ["#c9a86a", "#b8975a", "#8a6f45"][i % 3] });
      if (rand() < 0.75) out.push({ p: [c[0] - w * 0.28, 0, c[1] + d * 0.24], s: [3, 4 + rand() * 4, 3], c: "#5d7a3a" });
      if (rand() < 0.65) out.push({ p: [c[0] + w * 0.3, 0, c[1] - d * 0.24], s: [2.6, 3 + rand() * 3, 2.6], c: "#7f6a44" });
    });
    // Puentes entre islas
    out.push({ p: [0, -1.6, -21], s: [6, 1, 20], c: "#a8834f" });
    out.push({ p: [0, -1.6, 21], s: [6, 1, 20], c: "#a8834f" });
    out.push({ p: [-21, -1.6, 0], s: [20, 1, 6], c: "#a8834f" });
    out.push({ p: [21, -1.6, 0], s: [20, 1, 6], c: "#a8834f" });

    B.MAPS.push(finish(606, {
      id: "islas", name: "Islas Flotantes", tagline: "Plataformas sobre el vacio: un paso en falso y caes fuera de la arena.",
      size: size, structures: out, ground: false, voidY: -17,
      theme: { sky: "#a8d8f0", fog: "#cfe9f7", fogNear: 70, fogFar: 265, sun: "#ffffff", sunIntensity: 1.1, ambient: "#dff0ff", ambientIntensity: 0.44, hemi: 0.7, base: "#7ab55c", edge: "#6fa04e" },
      hazards: [], swatch: ["#7ab55c", "#c9a86a", "#a8d8f0"]
    }));
  })();

  B.mapById = function (id) {
    for (var i = 0; i < B.MAPS.length; i++) if (B.MAPS[i].id === id) return B.MAPS[i];
    return B.MAPS[0];
  };
})();
