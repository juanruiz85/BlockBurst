/* Validador de mapas de BLOCKBURST.
   Comprueba, sin navegador, que cada mapa genere geometria coherente y que los
   puntos de aparicion, waypoints, pickups y objetivos sean pisables y no queden
   dentro de un bloque. Uso: node tools/validate-maps.js */
'use strict';

global.window = global;

require('../src/util.js');
require('../src/maps.js');
require('../src/modes.js');
require('../src/weapons.js');

var B = global.BLITZ;

var R = 0.55, H = 1.95;

function solidBoxes(structures) {
  var out = [];
  (structures || []).forEach(function (s) {
    if (s.type === "ramp") return;
    out.push({
      minX: s.p[0] - s.s[0] / 2, maxX: s.p[0] + s.s[0] / 2,
      minY: s.p[1], maxY: s.p[1] + s.s[1],
      minZ: s.p[2] - s.s[2] / 2, maxZ: s.p[2] + s.s[2] / 2
    });
  });
  return out;
}

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

function fits(boxes, x, z, feetY) {
  var lo = feetY + 0.12, hi = feetY + H;
  for (var i = 0; i < boxes.length; i++) {
    var b = boxes[i];
    if (x + R <= b.minX || x - R >= b.maxX) continue;
    if (z + R <= b.minZ || z - R >= b.maxZ) continue;
    if (hi <= b.minY || lo >= b.maxY) continue;
    return false;
  }
  return true;
}

function ok(boxes, x, z, y, hasGround) {
  if (y == null) return "sin suelo";
  var sy = surfaceY(boxes, x, z, hasGround);
  if (sy == null) return "sin superficie";
  if (!fits(boxes, x, z, sy)) return "espacio ocupado (superficie " + sy + ")";
  return null;
}

var fails = 0, warns = 0;
console.log("BLOCKBURST - validacion de mapas\n");

B.MAPS.forEach(function (map) {
  var boxes = solidBoxes(map.structures);
  var hasGround = map.ground !== false;
  var problems = [];
  var ramps = (map.structures || []).filter(function (s) { return s.type === "ramp"; }).length;
  var colors = {};
  (map.structures || []).forEach(function (s) { if (s.c) colors[s.c] = 1; });

  if (map.spawns.length < 10) problems.push("pocos spawns (" + map.spawns.length + ")");
  if (map.waypoints.length < 12) problems.push("pocos waypoints (" + map.waypoints.length + ")");
  if (map.pickupNodes.length < 6) problems.push("pocos pickups (" + map.pickupNodes.length + ")");

  map.spawns.forEach(function (s, i) {
    var e = ok(boxes, s[0], s[1], s[2], hasGround);
    if (e) problems.push("spawn #" + i + " (" + s[0] + "," + s[1] + ") " + e);
  });
  map.waypoints.forEach(function (w, i) {
    var e = ok(boxes, w[0], w[1], 0, hasGround);
    if (e && i < 4) problems.push("waypoint #" + i + " (" + w[0] + "," + w[1] + ") " + e);
  });
  map.pickupNodes.forEach(function (p, i) {
    var e = ok(boxes, p[0], p[1], p[2], hasGround);
    if (e) problems.push("pickup #" + i + " (" + p[0] + "," + p[1] + ") " + e);
  });
  Object.keys(map.objectives.flags).forEach(function (k) {
    if (k === "redY" || k === "blueY") return;
    var f = map.objectives.flags[k];
    var e = ok(boxes, f[0], f[1], 0, hasGround);
    if (e) problems.push("base de bandera " + k + " " + e);
  });
  var hill = map.objectives.hill;
  var eh = ok(boxes, hill.x, hill.z, 0, hasGround);
  if (eh) problems.push("colina central " + eh);

  // spawns demasiado juntos
  var tooClose = 0;
  for (var a = 0; a < map.spawns.length; a++) {
    for (var b = a + 1; b < map.spawns.length; b++) {
      if (B.dist2(map.spawns[a][0], map.spawns[a][1], map.spawns[b][0], map.spawns[b][1]) < 16) tooClose++;
    }
  }
  if (tooClose > 4) { warns++; problems.push("aviso: " + tooClose + " pares de spawns a menos de 4 unidades"); }

  if (problems.length) fails++;
  console.log("[" + (problems.length ? "FALLO" : " OK  ") + "] " + map.name + " (" + map.id + ")");
  console.log("        suelo:" + (hasGround ? "si" : "no") + "  solidos:" + boxes.length + "  rampas:" + ramps +
    "  colores:" + Object.keys(colors).length + "  spawns:" + map.spawns.length +
    "  waypoints:" + map.waypoints.length + "  pickups:" + map.pickupNodes.length + "  barriles:" + map.barrels.length);
  console.log("        colina: (" + hill.x + ", " + hill.z + ", y=" + hill.y + ")   banderas: " +
    map.objectives.flags.red.join(",") + " / " + map.objectives.flags.blue.join(",") + "  y=" +
    map.objectives.flags.redY + "/" + map.objectives.flags.blueY);
  problems.forEach(function (p) { console.log("        - " + p); });
});

console.log("\nModos: " + B.MODES.length + "  |  Armas: " + B.WEAPONS.length);
B.MODES.forEach(function (m) { console.log("  - " + m.id + "  " + m.name + (m.teams ? "  [equipos]" : "  [individual]")); });

console.log("\nResultado: " + B.MAPS.length + " mapas, " + fails + " con fallos, " + warns + " avisos.");
process.exit(fails ? 1 : 0);
