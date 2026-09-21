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
      // Solo terreno accesible a pie: nada de azoteas, o los enemigos cuerpo a cuerpo
      // se quedarian abajo sin poder llegar.
      if (y === null || y > 2.6) continue;
      out.push([r2(raw[c][0]), r2(raw[c][1]), r2(y)]);
    }
    return out;
  }

  function pickSpread(points, count, minDist, rng) {
    var pool = points.slice();
    for (var s = pool.length - 1; s > 0; s--) {
      var j = Math.floor((rng ? rng() : Math.random()) * (s + 1));
      var t = pool[s]; pool[s] = pool[j]; pool[j] = t;
    }
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

  var RAMP_COLOR = "#98a2b0";

  function strictOverlap(a, b, eps) {
    eps = eps == null ? 0.05 : eps;
    return a.minX < b.maxX - eps && a.maxX > b.minX + eps &&
      a.minY < b.maxY - eps && a.maxY > b.minY + eps &&
      a.minZ < b.maxZ - eps && a.maxZ > b.minZ + eps;
  }

  function structBox(s) {
    return {
      minX: s.p[0] - s.s[0] / 2, maxX: s.p[0] + s.s[0] / 2,
      minY: s.p[1], maxY: s.p[1] + s.s[1],
      minZ: s.p[2] - s.s[2] / 2, maxZ: s.p[2] + s.s[2] / 2
    };
  }

  function sameBox(a, b, eps) {
    eps = eps == null ? 1e-6 : eps;
    return Math.abs(a.minX - b.minX) < eps && Math.abs(a.maxX - b.maxX) < eps &&
      Math.abs(a.minY - b.minY) < eps && Math.abs(a.maxY - b.maxY) < eps &&
      Math.abs(a.minZ - b.minZ) < eps && Math.abs(a.maxZ - b.maxZ) < eps;
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
    var pending = [];
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
        var bld = { p: [r2(cx), -0.25, r2(cz)], s: [r2(w), h + 0.25, r2(d)], c: c };
        out.push(bld);
        // Acera: da base visual al edificio y ordena la calle
        out.push({ p: [r2(cx), 0.02, r2(cz)], s: [r2(w + 0.34), 0.14, r2(d + 0.34)], c: o.curb || "#9aa3b0", soft: true });

        if (o.roofDetail && h > 3 && rand() < 0.55) {
          out.push({
            p: [r2(cx + (rand() - 0.5) * w * 0.4), h, r2(cz + (rand() - 0.5) * d * 0.4)],
            s: [r2(w * 0.36), 1 + Math.round(rand() * 2), r2(d * 0.36)],
            c: o.detail
          });
        }
        if (o.stairs && h >= 3 && h <= 7) {
          var run = Math.round(h * 1.6 + 1.2);
          var rampX = r2(cx - w / 2 - 1.35);
          pending.push({
            ramp: { type: "ramp", axis: "z", dir: 1, p: [rampX, 0, r2(cz - d / 2 - run / 2)], s: [1.7, h, run], c: RAMP_COLOR },
            landing: { p: [rampX, h - 0.34, r2(cz - d / 2 - 0.5)], s: [2.2, 0.34, 1.6], c: RAMP_COLOR },
            owner: structBox(bld)
          });
        }
      }
    }

    (o.blocks || []).forEach(function (b) { out.push(b); });

    // Rampas: solo se aceptan si el hueco de detras esta libre y no chocan entre si
    var hard = out.filter(function (s) { return !s.soft; });
    var boxes = solidBoxes(hard);
    var accepted = [];
    pending.forEach(function (item) {
      if (accepted.length >= 16) return;
      var b1 = structBox(item.ramp), b2 = structBox(item.landing);
      for (var i = 0; i < boxes.length; i++) {
        if (sameBox(boxes[i], item.owner)) continue;
        if (strictOverlap(b1, boxes[i]) || strictOverlap(b2, boxes[i])) return;
      }
      for (var j = 0; j < accepted.length; j++) {
        if (strictOverlap(b1, accepted[j]) || strictOverlap(b2, accepted[j])) return;
      }
      accepted.push(b1, b2);
      out.push(item.ramp, item.landing);
    });

    return out;
  }

  function finish(seed, cfg) {
    var boxes = solidBoxes(cfg.structures);
    var hasGround = cfg.ground !== false;
    var pts = candidates(cfg, boxes);
    var half = cfg.size / 2;
    var rng = B.rng(seed);

    var spawns = pickSpread(pts, 16, cfg.size * 0.2, rng);
    if (spawns.length < 8) spawns = pts.slice(0, 12);

    var waypoints = pickSpread(pts, 44, cfg.size * 0.08, rng).map(function (p) { return [p[0], p[1]]; });
    if (waypoints.length < 10) waypoints = pts.map(function (p) { return [p[0], p[1]]; });

    var pickSrc = pts.slice();
    // Empuja algunos pickups hacia las esquinas para repartirlos
    var corners = [[-half * 0.62, -half * 0.62], [half * 0.62, half * 0.62], [half * 0.62, -half * 0.62], [-half * 0.62, half * 0.62]];
    corners.forEach(function (c) {
      var p = nearest(pts, c[0], c[1]);
      if (p) pickSrc.unshift(p, p, p, p);
    });
    var pickups = pickSpread(pickSrc, 10, cfg.size * 0.18, rng);
    if (pickups.length < 6) pickups = pts.slice(0, 8);

    var hillP = nearest(pts, 0, 0) || [0, 0, 0];
    var redP = nearest(pts, -half + 9, -half + 9) || [-half + 9, -half + 9, 0];
    var blueP = nearest(pts, half - 9, half - 9) || [half - 9, half - 9, 0];

    var barrels = pickSpread(pts, 6, cfg.size * 0.2, rng).map(function (p) { return [p[0], p[2], p[1]]; });

    // Props de calle: postes, cajas, barreras y arboles. Dan escala, cobijo y vida.
    var boxes = solidBoxes(cfg.structures.filter(function (s) { return !s.soft; }));
    var rampBoxes = (cfg.structures || []).filter(function (s) { return s.type === "ramp"; }).map(structBox);
    var blocked = boxes.concat(rampBoxes);
    var propTypes = [
      { s: [0.34, 3.2, 0.34], c: cfg.theme.prop || "#26303f" },
      { s: [0.95, 0.95, 0.95], c: cfg.swatch[1] || cfg.swatch[0] },
      { s: [2.8, 0.85, 0.5], c: cfg.theme.edge || cfg.swatch[0] },
      { s: [0.44, 2.4, 0.44], c: "#6b4a2a", top: [2.6, 1.1, 2.6], topC: cfg.swatch[2] || "#5d7a3a", top2: [1.7, 1.0, 1.7] }
    ];
    var propPts = pts.filter(function (p) {
      if (spawns.indexOf(p) !== -1 || pickups.indexOf(p) !== -1) return false;
      var i;
      if (B.dist2(p[0], p[1], hillP[0], hillP[1]) < 144) return false;
      if (B.dist2(p[0], p[1], redP[0], redP[1]) < 81) return false;
      if (B.dist2(p[0], p[1], blueP[0], blueP[1]) < 81) return false;
      for (i = 0; i < spawns.length; i++) if (B.dist2(p[0], p[1], spawns[i][0], spawns[i][1]) < 36) return false;
      for (i = 0; i < waypoints.length; i++) if (B.dist2(p[0], p[1], waypoints[i][0], waypoints[i][1]) < 16) return false;
      for (i = 0; i < barrels.length; i++) if (B.dist2(p[0], p[1], barrels[i][0], barrels[i][2]) < 25) return false;
      return true;
    });
    var props = [];
    pickSpread(propPts, 16, cfg.size * 0.13, rng).forEach(function (p, i) {
      var pt = propTypes[i % propTypes.length];
      var box = {
        minX: p[0] - pt.s[0] / 2, maxX: p[0] + pt.s[0] / 2,
        minY: p[2], maxY: p[2] + pt.s[1],
        minZ: p[1] - pt.s[2] / 2, maxZ: p[1] + pt.s[2] / 2
      };
      for (var k = 0; k < blocked.length; k++) if (strictOverlap(box, blocked[k])) return;
      props.push({ p: [p[0], p[2], p[1]], s: pt.s, c: pt.c });
      if (pt.top) props.push({ p: [p[0], r2(p[2] + pt.s[1] - 0.35), p[1]], s: pt.top, c: pt.topC });
      if (pt.top2) props.push({ p: [p[0], r2(p[2] + pt.s[1] + 0.72), p[1]], s: pt.top2, c: pt.topC });
    });

    // Calzada: retícula viaria para que las calles no sean un vacio verde
    if (cfg.grid) {
      var gcell = cfg.grid.cell, gse = cfg.grid.streetEvery;
      var gn = Math.round(cfg.size / gcell);
      var roadC = cfg.theme.road || "#4a4f57";
      var haz = cfg.hazards || [];
      for (var gi = 0; gi < gn; gi++) {
        if (gi % gse !== 0) continue;
        var gx = -half + gcell / 2 + gi * gcell;
        var strips = [
          { p: [r2(gx), 0.03, 0], s: [r2(gcell - 0.9), 0.06, r2(cfg.size - 2)], c: roadC, soft: true },
          { p: [0, 0.03, r2(gx)], s: [r2(cfg.size - 2), 0.06, r2(gcell - 0.9)], c: roadC, soft: true }
        ];
        strips.forEach(function (st) {
          var b = structBox(st);
          for (var k = 0; k < haz.length; k++) {
            var hb = { minX: haz[k].min[0], maxX: haz[k].max[0], minY: haz[k].min[1], maxY: haz[k].max[1], minZ: haz[k].min[2], maxZ: haz[k].max[2] };
            if (strictOverlap(b, hb)) return;
          }
          props.push(st);
        });
      }
    }

    var finalStructures = cfg.structures.concat(props);
    var fboxes = solidBoxes(finalStructures);
    var haz2 = cfg.hazards || [];
    var cellStep = 2.5;
    var gN = Math.max(1, Math.ceil(cfg.size / cellStep));
    var grid = new Int32Array(gN * gN).fill(-1);
    var gi, gj;
    for (gj = 0; gj < gN; gj++) {
      for (gi = 0; gi < gN; gi++) {
        var px = -half + (gi + 0.5) * cellStep;
        var pz = -half + (gj + 0.5) * cellStep;
        if (standable(fboxes, px, pz, hasGround, haz2) !== null) grid[gj * gN + gi] = -2;
      }
    }
    var nextCluster = 0;
    var queue = [];
    for (var ci = 0; ci < grid.length; ci++) {
      if (grid[ci] !== -2) continue;
      var id = nextCluster++;
      grid[ci] = id;
      queue.length = 0;
      queue.push(ci);
      while (queue.length) {
        var cur = queue.pop();
        var cx = cur % gN, cz = (cur - cx) / gN;
        var nb = [];
        if (cx > 0) nb.push(cur - 1);
        if (cx < gN - 1) nb.push(cur + 1);
        if (cz > 0) nb.push(cur - gN);
        if (cz < gN - 1) nb.push(cur + gN);
        for (var nbi = 0; nbi < nb.length; nbi++) {
          if (grid[nb[nbi]] === -2) { grid[nb[nbi]] = id; queue.push(nb[nbi]); }
        }
      }
    }
    function clusterAt(x, z) {
      var a = Math.floor((x + half) / cellStep);
      var b = Math.floor((z + half) / cellStep);
      if (a < 0 || b < 0 || a >= gN || b >= gN) return -1;
      var v = grid[b * gN + a];
      return v < 0 ? -1 : v;
    }
    var wpClusters = waypoints.map(function (w) { return clusterAt(w[0], w[1]); });

    /* Grafo de rutas: une waypoints con linea de vista a la altura de los ojos.
       Es lo que permite a los bots recorrer las calles en vez de pegarse a las paredes. */
    function clearLine(ax, az, bx, bz) {
      var steps = Math.max(2, Math.ceil(B.dist(ax, az, bx, bz) / 1.3));
      for (var s = 1; s < steps; s++) {
        var t = s / steps;
        var x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        for (var bi = 0; bi < fboxes.length; bi++) {
          var b = fboxes[bi];
          if (x > b.minX - 0.35 && x < b.maxX + 0.35 && z > b.minZ - 0.35 && z < b.maxZ + 0.35 &&
              b.maxY > 1.1 && b.minY < 2.1) return false;
        }
      }
      return true;
    }
    var wpLinks = waypoints.map(function () { return []; });
    for (var la = 0; la < waypoints.length; la++) {
      for (var lb = la + 1; lb < waypoints.length; lb++) {
        if (wpClusters[la] !== wpClusters[lb]) continue;
        var dd = B.dist(waypoints[la][0], waypoints[la][1], waypoints[lb][0], waypoints[lb][1]);
        if (dd > 18) continue;
        if (!clearLine(waypoints[la][0], waypoints[la][1], waypoints[lb][0], waypoints[lb][1])) continue;
        wpLinks[la].push(lb);
        wpLinks[lb].push(la);
      }
    }
    var clusterSizes = [];
    for (var sc = 0; sc < grid.length; sc++) {
      if (grid[sc] >= 0) clusterSizes[grid[sc]] = (clusterSizes[grid[sc]] || 0) + 1;
    }

    return {
      id: cfg.id, name: cfg.name, tagline: cfg.tagline, size: cfg.size,
      theme: cfg.theme, ground: hasGround,
      structures: finalStructures, hazards: cfg.hazards || [],
      barrels: barrels, swatch: cfg.swatch,
      friction: cfg.friction == null ? 0.82 : cfg.friction,
      jump: cfg.jump == null ? 8.2 : cfg.jump,
      gravity: cfg.gravity == null ? 22 : cfg.gravity,
      voidY: cfg.voidY == null ? -14 : cfg.voidY,
      spawns: spawns, waypoints: waypoints, pickupNodes: pickups,
      wpClusters: wpClusters, clusterAt: clusterAt, clusterCount: nextCluster, clusterSizes: clusterSizes,
      wpLinks: wpLinks, clearLine: clearLine,
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
      size: 96, cell: 9, streetEvery: 3, fill: 0.72, gap: 0.06, minH: 3, maxH: 10,
      roofDetail: true, stairs: true, stairColor: "#8a4a2c",
      colors: ["#e8734a", "#f0a05a", "#d95f3b", "#f4c66a", "#c9563a", "#e08b6a"],
      detail: "#7a4226",
      open: [[0, 0, 13], [-44, -44, 10], [44, 44, 10]],
      blocks: [
        { p: [0, 0, 0], s: [14, 0.4, 14], c: "#7d8f6a" },
        { p: [0, 0.4, 0], s: [6.4, 0.8, 6.4], c: "#9aa3b0" },
        { p: [0, 1.2, 0], s: [4.6, 0.25, 4.6], c: "#34d6f0" },
        { p: [0, 1.45, 0], s: [1.5, 1.9, 1.5], c: "#8a94a3" },
        { p: [0, 3.35, 0], s: [2, 0.35, 2], c: "#9aa3b0" },
        { p: [9.5, 0, 0], s: [0.9, 0.55, 7], c: "#6b4a2a" },
        { p: [-9.5, 0, 0], s: [0.9, 0.55, 7], c: "#6b4a2a" },
        { p: [0, 0, 9.5], s: [7, 0.55, 0.9], c: "#6b4a2a" },
        { p: [0, 0, -9.5], s: [7, 0.55, 0.9], c: "#6b4a2a" }
      ]
    };
    B.MAPS.push(finish(101, {
      id: o.id, name: o.name, tagline: o.tagline, size: o.size, structures: city(101, o), grid: { cell: 9, streetEvery: 3 },
      theme: { road: "#5b5f66", skyTop: "#5fa8d8", sky: "#ffcf96", fog: "#f0ab6a", fogNear: 70, fogFar: 235, sun: "#fff2cc", sunIntensity: 1.15, ambient: "#ffe0c0", ambientIntensity: 0.34, hemi: 0.5, base: "#6f8f5a", edge: "#5a4636" },
      hazards: [{ type: "water", min: [-44, -0.6, -46], max: [-32, 0.35, -34] }],
      swatch: ["#e8734a", "#f4c66a", "#6f8f5a"]
    }));
  })();

  /* ------------------------- 2. Caldera Voxel (lava) -------------------- */
  (function () {
    var o = {
      id: "caldera", name: "Caldera Voxel", tagline: "Roca oscura, torres de basalto y rios de lava que no perdonan.",
      size: 96, cell: 9, streetEvery: 3, fill: 0.68, gap: 0.1, minH: 2, maxH: 8,
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
      id: o.id, name: o.name, tagline: o.tagline, size: o.size, structures: city(202, o), grid: { cell: 9, streetEvery: 3 },
      theme: { road: "#2b252b", skyTop: "#241a2e", sky: "#3a2026", fog: "#5a2c22", fogNear: 40, fogFar: 175, sun: "#ff9a5a", sunIntensity: 0.9, ambient: "#ff7040", ambientIntensity: 0.3, hemi: 0.35, base: "#3a3238", edge: "#241f26" },
      hazards: [
        { type: "lava", min: [-46, -1.2, 8], max: [-14, 0.25, 20], dmg: 26 },
        { type: "lava", min: [14, -1.2, -20], max: [46, 0.25, -8], dmg: 26 },
        { type: "lava", min: [-9, -1.2, -44], max: [9, 0.25, -34], dmg: 26 }
      ],
      swatch: ["#4a4048", "#ff5a12", "#ff9a5a"]
    }));
  })();

  /* ------------------------ 3. Glaciar Azul (hielo) --------------------- */
  (function () {
    var o = {
      id: "glaciar", name: "Glaciar Azul", tagline: "Superficie resbaladiza, lagunas heladas y bloques de hielo.",
      size: 90, cell: 9, streetEvery: 3, fill: 0.7, gap: 0.08, minH: 3, maxH: 9,
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
      id: o.id, name: o.name, tagline: o.tagline, size: o.size, structures: city(303, o), grid: { cell: 9, streetEvery: 3 },
      friction: 0.24, jump: 8.0,
      theme: { road: "#b6cfdd", skyTop: "#6fb8e8", sky: "#d9f0fb", fog: "#cfe8f5", fogNear: 60, fogFar: 215, sun: "#ffffff", sunIntensity: 1.05, ambient: "#eaf6ff", ambientIntensity: 0.42, hemi: 0.6, base: "#dff1fb", edge: "#8fbfdc" },
      hazards: [
        { type: "water", min: [-43, -0.7, -43], max: [-24, 0.3, -24], slow: 0.55 },
        { type: "water", min: [22, -0.7, 22], max: [43, 0.3, 43], slow: 0.55 }
      ],
      swatch: ["#dff1fb", "#8fbfdc", "#34d6f0"]
    }));
  })();

  /* --------------------- 4. Templo Selva (terrazas) --------------------- */
  (function () {
    var o = {
      id: "templo", name: "Templo Selva", tagline: "Terrazas de piedra, columnas antiguas y pozas de agua.",
      size: 96, cell: 9, streetEvery: 3, fill: 0.68, gap: 0.1, minH: 2, maxH: 8,
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
      id: o.id, name: o.name, tagline: o.tagline, size: o.size, structures: city(404, o), grid: { cell: 9, streetEvery: 3 },
      theme: { road: "#8d7c58", skyTop: "#4a9ad0", sky: "#bfe0a0", fog: "#9dc47a", fogNear: 55, fogFar: 200, sun: "#fff6c8", sunIntensity: 1.0, ambient: "#d8f0b8", ambientIntensity: 0.36, hemi: 0.55, base: "#4f7a3a", edge: "#3a5c2a" },
      hazards: [
        { type: "water", min: [-45, -0.9, 8], max: [-26, 0.3, 24], slow: 0.6 },
        { type: "water", min: [26, -0.9, -24], max: [45, 0.3, -8], slow: 0.6 }
      ],
      swatch: ["#6d8f4a", "#b8a06a", "#2f8fd8"]
    }));
  })();

  /* ---------------------- 5. Azoteas Neon (noche) ----------------------- */
  (function () {
    var o = {
      id: "neon", name: "Azoteas Neon", tagline: "Rascacielos de colores, pasarelas suspendidas y niebla de medianoche.",
      size: 99, cell: 9, streetEvery: 3, fill: 0.72, gap: 0.06, minH: 4, maxH: 13,
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
      id: o.id, name: o.name, tagline: o.tagline, size: o.size, structures: city(505, o), grid: { cell: 9, streetEvery: 3 },
      theme: { road: "#1f2734", skyTop: "#04060d", sky: "#0b1020", fog: "#131a2c", fogNear: 45, fogFar: 185, sun: "#8fb4ff", sunIntensity: 0.55, ambient: "#4a6ba8", ambientIntensity: 0.3, hemi: 0.4, base: "#1a1f2b", edge: "#2b3444" },
      hazards: [],
      swatch: ["#26304a", "#34d6f0", "#ff4fd8"]
    }));
  })();

  /* ---------------------- 6. Islas Flotantes (vacio) -------------------- */
  (function () {
    var size = 112;
    var rand = B.rng(606);
    var out = [];
    var RING = 6;
    var RAD = 30;
    var islands = [{ x: 0, z: 0, w: 28, d: 28 }];
    for (var r = 0; r < RING; r++) {
      var ang = (r / RING) * Math.PI * 2 - Math.PI / 2;
      islands.push({ x: Math.cos(ang) * RAD, z: Math.sin(ang) * RAD, w: 19, d: 19 });
    }
    islands.forEach(function (is, i) {
      out.push({ p: [is.x, -3, is.z], s: [is.w, 3, is.d], c: i === 0 ? "#7ab55c" : "#6fa04e" });
      out.push({ p: [is.x, 0, is.z], s: [is.w * 0.4, 1.2 + rand() * 1.0, is.d * 0.4], c: ["#c9a86a", "#b8975a", "#8a6f45"][i % 3] });
      if (rand() < 0.8) out.push({ p: [is.x - is.w * 0.28, 0, is.z + is.d * 0.24], s: [3, 4 + rand() * 3, 3], c: "#5d7a3a" });
      if (rand() < 0.7) out.push({ p: [is.x + is.w * 0.3, 0, is.z - is.d * 0.24], s: [2.6, 3 + rand() * 2.5, 2.6], c: "#7f6a44" });
    });

    /* Puentes en L: dos tramos que se cruzan y que solapan las dos islas, asi que
       SIEMPRE hay camino continuo. La superficie queda al mismo nivel que las islas
       para que nadie tenga que saltar. */
    function link(a, b, color) {
      out.push({ p: [(a.x + b.x) / 2, -1.2, a.z], s: [Math.abs(b.x - a.x) + 10, 1.2, 9], c: color });
      out.push({ p: [b.x, -1.2, (a.z + b.z) / 2], s: [9, 1.2, Math.abs(b.z - a.z) + 10], c: color });
    }
    for (var k = 1; k <= RING; k++) link(islands[0], islands[k], "#a8834f");
    for (var n = 1; n <= RING; n++) link(islands[n], islands[n % RING + 1], "#b08a52");

    B.MAPS.push(finish(606, {
      id: "islas", name: "Islas Flotantes", tagline: "Plataformas sobre el vacio unidas por pasarelas: salirse del camino es caer fuera de la arena.",
      size: size, structures: out, ground: false, voidY: -17,
      theme: { skyTop: "#4a9fe0", sky: "#a8d8f0", fog: "#cfe9f7", fogNear: 70, fogFar: 265, sun: "#ffffff", sunIntensity: 1.1, ambient: "#dff0ff", ambientIntensity: 0.44, hemi: 0.7, base: "#7ab55c", edge: "#6fa04e" },
      hazards: [], swatch: ["#7ab55c", "#c9a86a", "#a8d8f0"]
    }));
  })();

  B.mapById = function (id) {
    for (var i = 0; i < B.MAPS.length; i++) if (B.MAPS[i].id === id) return B.MAPS[i];
    return B.MAPS[0];
  };
})();
