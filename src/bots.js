/* BLOCKBURST - IA de bots: percepcion con linea de vision, combate por distancia,
   evasión de obstaculos y variante zombi para el modo supervivencia. */
(function () {
  'use strict';
  var B = (window.BLITZ = window.BLITZ || {});

  var NAMES = [
    "Chispa", "Cubito", "Rocoso", "Tornado", "Pixel", "Manchita", "Zurdo", "Trueno",
    "Bloque", "Zumo", "Neon", "Lava", "Taco", "Gruñon", "Saltarin", "Cohete",
    "Tuerca", "Bombo", "Vendaval", "Pepita", "Garrote", "Cactus", "Muelle", "Vagon"
  ];
  var WEAPON_POOL = ["pistol", "smg", "shotgun", "rifle", "sniper"];

  /* Menos letales que antes: mas tiempo de reaccion, mas error de punteria y menos dano */
  var PRESETS = {
    facil: { reaction: 0.85, aim: 4.6, dmg: 0.4, view: 55, burst: [0.35, 1.5], strafe: 0.3, hpMul: 0.85 },
    normal: { reaction: 0.6, aim: 2.9, dmg: 0.6, view: 72, burst: [0.45, 1.15], strafe: 0.42, hpMul: 1.0 },
    dificil: { reaction: 0.4, aim: 1.8, dmg: 0.8, view: 92, burst: [0.6, 0.9], strafe: 0.55, hpMul: 1.0 },
    pesadilla: { reaction: 0.25, aim: 1.2, dmg: 0.95, view: 112, burst: [0.75, 0.7], strafe: 0.7, hpMul: 1.05 }
  };

  var usedNames = [];
  function botName(kind) {
    if (kind === "zombie") return "Zombi " + B.pick(["A", "B", "C", "D", "E", "F", "G", "H", "J", "K", "L", "M", "N", "P", "R", "S", "T", "V"]);
    var pool = NAMES.filter(function (n) { return usedNames.indexOf(n) === -1; });
    var n = pool.length ? B.pick(pool) : B.pick(NAMES) + " " + B.randInt(2, 9);
    usedNames.push(n);
    return n;
  }

  function eyePos(ent) { return { x: ent.pos.x, y: ent.pos.y + ent.eye, z: ent.pos.z }; }

  /* Punto de aparicion a una distancia concreta del jugador (para las oleadas de zombis) */
  function spawnNear(game, want) {
    var list = game.map.spawns;
    var ref = (game.player && game.player.alive) ? game.player : null;
    if (!ref) {
      for (var i = 0; i < game.entities.length; i++) {
        if (game.entities[i].alive) { ref = game.entities[i]; break; }
      }
    }
    if (!ref) return spawnPointFor(game, "zombie");
    var best = null, bestDiff = 1e9;
    for (var j = 0; j < list.length; j++) {
      var s = list[j];
      if (game.world.pointSolid(s[0], (s[2] || 0) + 0.6, s[1])) continue;
      var d = B.dist(s[0], s[1], ref.pos.x, ref.pos.z);
      var diff = Math.abs(d - want);
      if (diff < bestDiff) { bestDiff = diff; best = s; }
    }
    return best || list[0];
  }

  /* Aparicion repartida: se busca el punto mas cercano a una distancia jugable del rival
     mas proximo. Asi nadie aparece apilado, pero tampoco en la otra punta del mapa. */
  var IDEAL_SPAWN_DIST = 30;
  function spawnPointFor(game, team) {
    var m = game.map;
    var list = m.spawns;
    var best = null, bestScore = -1e9;
    var start = B.randInt(0, Math.max(0, list.length - 1));
    for (var i = 0; i < list.length; i++) {
      var s = list[(start + i) % list.length];
      var x = s[0], z = s[1];
      if (game.world.pointSolid(x, (s[2] || 0) + 0.6, z)) continue;
      var d = 1e9;
      for (var j = 0; j < game.entities.length; j++) {
        var e = game.entities[j];
        if (!e.alive) continue;
        d = Math.min(d, B.dist(x, z, e.pos.x, e.pos.z));
      }
      if (d === 1e9) d = IDEAL_SPAWN_DIST;
      var score = -Math.abs(d - IDEAL_SPAWN_DIST) + B.rand(0, 0.5);
      if (score > bestScore) { bestScore = score; best = s; }
      if (bestScore > -0.4) break;
    }
    void team;
    return best || list[0];
  }

  B.Bots = {
    presets: PRESETS,
    spawnPointFor: spawnPointFor,
    spawnNear: spawnNear,
    eyePos: eyePos,

    /* Siguiente punto del camino hacia un destino usando el grafo de rutas */
    pathStep: function (game, fromX, fromZ, toX, toZ) {
      var map = game.map;
      var wps = map.waypoints, links = map.wpLinks;
      if (!links || !wps || !wps.length) return { x: toX, z: toZ };
      if (map.clearLine && map.clearLine(fromX, fromZ, toX, toZ)) return { x: toX, z: toZ };

      var startIdx = -1, goalIdx = -1, sd = 1e9, gd = 1e9;
      for (var i = 0; i < wps.length; i++) {
        var ds = B.dist2(wps[i][0], wps[i][1], fromX, fromZ);
        if (ds < sd) { sd = ds; startIdx = i; }
        var dg = B.dist2(wps[i][0], wps[i][1], toX, toZ);
        if (dg < gd) { gd = dg; goalIdx = i; }
      }
      if (startIdx < 0 || goalIdx < 0) return { x: toX, z: toZ };
      if (startIdx === goalIdx) return { x: toX, z: toZ };

      var n = wps.length;
      var prev = new Int32Array(n).fill(-1);
      var seen = new Uint8Array(n);
      var queue = [startIdx];
      seen[startIdx] = 1;
      var found = false;
      for (var qi = 0; qi < queue.length; qi++) {
        var cur = queue[qi];
        if (cur === goalIdx) { found = true; break; }
        var nb = links[cur] || [];
        for (var k = 0; k < nb.length; k++) {
          if (!seen[nb[k]]) { seen[nb[k]] = 1; prev[nb[k]] = cur; queue.push(nb[k]); }
        }
      }
      if (!found) return { x: toX, z: toZ };
      var node = goalIdx;
      while (prev[node] !== -1 && prev[node] !== startIdx) node = prev[node];
      return { x: wps[node][0], z: wps[node][1] };
    },

    create: function (game, opts) {
      opts = opts || {};
      var kind = opts.kind || "soldier";
      var isZ = kind === "zombie";
      var preset = PRESETS[opts.difficulty] || PRESETS.normal;
      // Los zombis forman su propio bando: asi no se atacan entre ellos
      var team = isZ ? "zombie" : (opts.team || null);
      var sp = isZ ? spawnNear(game, 26) : spawnPointFor(game, team);
      var weaponId = isZ ? "katana" : (opts.weapon || B.pick(WEAPON_POOL));
      var def = B.Weapon.byId(weaponId);

      var avatar = B.Avatar.build({
        team: team,
        shirt: isZ ? "#5d8f3a" : (team === "red" ? "#ff5252" : team === "blue" ? "#4b8dff" : undefined),
        pants: isZ ? "#3a4a28" : (team === "red" ? "#7a2222" : team === "blue" ? "#22407a" : undefined),
        skin: isZ ? "#8fbf6a" : undefined,
        mood: isZ ? "angry" : (Math.random() < 0.5 ? "happy" : null),
        hat: isZ ? null : (team ? "helmet" : (Math.random() < 0.4 ? "cap" : null))
      });
      avatar.group.position.set(sp[0], sp[2] || 0, sp[1]);
      game.scene.add(avatar.group);

      var bot = {
        kind: kind, isBot: true, name: opts.name || botName(kind), team: team,
        pos: { x: sp[0], y: (sp[2] || 0) + 0.02, z: sp[1] }, vel: { x: 0, y: 0, z: 0 },
        yaw: Math.random() * 6.28, pitch: 0, avatar: avatar, group: avatar.group,
        radius: 0.42, height: isZ ? 1.95 : 1.9, eye: 1.6,
        alive: true, health: 100 * (isZ ? 1.9 * preset.hpMul : preset.hpMul), maxHealth: 100,
        armor: 0, speed: isZ ? 4.3 : 5.4, runMul: 1.34, jump: 6.6,
        weapon: weaponId, def: def, ammoMag: def.mag, ammoReserve: def.reserve,
        cooldown: 0, reloading: 0, shots: 0, burstLeft: 0, burstPause: 0,
        state: "roam", target: null, seen: 0, lostTimer: 0, lastKnown: null,
        waypoint: null, stuckTimer: 0, lastPos: { x: sp[0], z: sp[1] },
        percepTimer: Math.random() * 0.3, strafeDir: Math.random() < 0.5 ? -1 : 1, strafeTimer: 0,
        respawnTimer: 0, kills: 0, deaths: 0, score: 0, streak: 0,
        difficulty: opts.difficulty || "normal", preset: preset,
        reactionTimer: 0, goldTimer: 0
      };
      return bot;
    },

    /* Reposiciona un bot tras morir (modos por rondas) */
    respawn: function (game, bot) {
      var sp = spawnPointFor(game, bot.team);
      bot.pos.x = sp[0]; bot.pos.z = sp[1]; bot.pos.y = (sp[2] || 0) + 0.05;
      bot.vel.x = bot.vel.y = bot.vel.z = 0;
      bot.health = bot.maxHealth * (bot.kind === "zombie" ? 1.9 : 1) * bot.preset.hpMul;
      bot.alive = true; bot.state = "roam"; bot.target = null; bot.waypoint = null;
      bot.ammoMag = bot.def.mag; bot.ammoReserve = bot.def.reserve;
      bot.group.visible = true;
      bot.group.position.set(bot.pos.x, bot.pos.y, bot.pos.z);
      bot.avatar.group.rotation.set(0, bot.yaw, 0);
      bot.group.children.forEach(function (c) { c.visible = true; });
      bot.goldTimer = 0;
    },

    visible: function (game, from, to) {
      var a = eyePos(from);
      var tx = to.pos.x, ty = to.pos.y + to.height * 0.62, tz = to.pos.z;
      var dx = tx - a.x, dy = ty - a.y, dz = tz - a.z;
      var d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > from.preset.view) return false;
      var dir = new THREE.Vector3(dx / d, dy / d, dz / d);
      var hit = game.world.raycast(new THREE.Vector3(a.x, a.y, a.z), dir, d - 0.6, 0.3);
      return !hit;
    },

    update: function (game, bot, dt) {
      if (!bot.alive) return;
      var preset = bot.preset;

      // ---- Percepcion ----
      bot.percepTimer -= dt;
      if (bot.percepTimer <= 0) {
        bot.percepTimer = 0.18 + Math.random() * 0.14;
        var isZ = bot.kind === "zombie";
        var viewR = isZ ? preset.view * 2.4 : preset.view;
        var best = null, bestD = Infinity;
        for (var i = 0; i < game.entities.length; i++) {
          var e = game.entities[i];
          if (e === bot || !e.alive) continue;
          if (bot.team && e.team === bot.team) continue;
          if (e.invuln > 0) continue;
          var d = B.dist(bot.pos.x, bot.pos.z, e.pos.x, e.pos.z);
          if (d > viewR) continue;
          var dy = Math.abs((e.pos.y + e.height * 0.6) - (bot.pos.y + bot.eye));
          if (dy > 9) continue;
          // Los zombis van a por el jugador aunque no lo vean; si no, se quedan dando vueltas
          if (!isZ && !B.Bots.visible(game, bot, e)) continue;
          if (d < bestD) { bestD = d; best = e; }
        }
        if (best) {
          if (bot.target !== best) bot.reactionTimer = preset.reaction;
          bot.target = best; bot.seen = 0.9;
          bot.lastKnown = { x: best.pos.x, y: best.pos.y, z: best.pos.z };
        } else if (bot.target) {
          bot.seen -= 0.18 + Math.random() * 0.14;
          if (bot.seen <= 0) { bot.target = null; bot.state = "roam"; bot.waypoint = null; }
        } else {
          bot.state = "roam";
        }
      }
      if (bot.reactionTimer > 0) bot.reactionTimer -= dt;

      // ---- Movimiento deseado ----
      var wishX = 0, wishZ = 0;
      var wantJump = false;
      var speed = bot.speed;
      bot.navigating = false;

      if (bot.target && bot.target.alive) {
        bot.state = "engage";
        var t = bot.target;
        var dx = t.pos.x - bot.pos.x, dz = t.pos.z - bot.pos.z;
        var dist = Math.hypot(dx, dz) || 0.001;
        var nx = dx / dist, nz = dz / dist;
        var pref = bot.def.kind === "melee" ? 1.6 : (bot.def.id === "shotgun" ? 8 : bot.def.id === "sniper" ? 34 : bot.def.id === "smg" ? 12 : 18);
        var push = dist - pref;

        bot.strafeTimer -= dt;
        if (bot.strafeTimer <= 0) { bot.strafeTimer = 0.7 + Math.random() * 1.1; bot.strafeDir *= -1; }
        var sx = -nz * bot.strafeDir, sz = nx * bot.strafeDir;

        var fwd = B.clamp(push / 6, -1, 1);
        if (bot.health < bot.maxHealth * 0.4 && bot.def.kind !== "melee") fwd = -Math.abs(fwd) - 0.35;
        wishX = nx * fwd + sx * preset.strafe;
        wishZ = nz * fwd + sz * preset.strafe;
        // En los modos con objetivo, avanza hacia el mientras combate
        var objE = game.objectivePoint ? game.objectivePoint() : null;
        if (objE) {
          var od = B.dist(bot.pos.x, bot.pos.z, objE.x, objE.z);
          if (od > (objE.r || 6) + 3) {
            // Avanza decidido al objetivo mientras dispara, siguiendo las calles
            bot.objNavTimer = (bot.objNavTimer || 0) - dt;
            if (!bot.objNav || bot.objNavTimer <= 0) {
              bot.objNav = B.Bots.pathStep(game, bot.pos.x, bot.pos.z, objE.x, objE.z);
              bot.objNavTimer = 0.6;
            }
            var oxn = bot.objNav.x - bot.pos.x, ozn = bot.objNav.z - bot.pos.z;
            var on = Math.hypot(oxn, ozn) || 1;
            wishX = wishX * 0.35 + (oxn / on) * 0.95;
            wishZ = wishZ * 0.35 + (ozn / on) * 0.95;
          }
        }
        var l = Math.hypot(wishX, wishZ);
        if (l > 1) { wishX /= l; wishZ /= l; }

        // Sin linea de vista (o trabado): rodea por las calles en vez de empujar la pared
        bot.forceNav = Math.max(0, (bot.forceNav || 0) - dt);
        if ((dist > 3 && !B.Bots.visible(game, bot, t)) || bot.forceNav > 0) {
          bot.objNavTimer = (bot.objNavTimer || 0) - dt;
          if (!bot.objNav || bot.objNavTimer <= 0 || bot.forceNav > 0) {
            bot.objNav = B.Bots.pathStep(game, bot.pos.x, bot.pos.z, t.pos.x, t.pos.z);
            bot.objNavTimer = 0.5;
          }
          var qx = bot.objNav.x - bot.pos.x, qz = bot.objNav.z - bot.pos.z;
          var ql = Math.hypot(qx, qz) || 1;
          wishX = qx / ql;
          wishZ = qz / ql;
          bot.navigating = true;
        }
        if (bot.def.kind === "melee") speed *= 1.12;
      } else {
        // Deambular entre waypoints
        var wps = game.map.waypoints;
        if (!bot.waypoint) {
          var obj = game.objectivePoint ? game.objectivePoint() : null;
          if (obj && Math.random() < 0.85) {
            // En los modos con objetivo, la mayoria acude a disputarlo
            bot.waypoint = { x: obj.x + B.rand(-6, 6), z: obj.z + B.rand(-6, 6) };
            bot.waypointToObjective = true;
          } else {
          // Elige ruta dentro de la misma isla o plataforma conectada
          var myCluster = game.map.clusterAt ? game.map.clusterAt(bot.pos.x, bot.pos.z) : -1;
          var cands = null;
          if (myCluster >= 0 && game.map.wpClusters) {
            cands = [];
            for (var wi = 0; wi < wps.length; wi++) {
              if (game.map.wpClusters[wi] === myCluster) cands.push(wps[wi]);
            }
          }
          if (!cands || !cands.length) cands = wps;
          var cand = cands[B.randInt(0, cands.length - 1)];
          bot.waypoint = { x: cand[0] + B.rand(-3, 3), z: cand[1] + B.rand(-3, 3) };
          }
        }
        var wx = bot.waypoint.x - bot.pos.x, wz = bot.waypoint.z - bot.pos.z;
        var wd = Math.hypot(wx, wz);
        if (wd < 2.4) bot.waypoint = null;
        else {
          // Sigue el grafo de rutas en vez de ir en linea recta contra las paredes
          bot.navTimer = (bot.navTimer || 0) - dt;
          if (!bot.navTarget || bot.navTimer <= 0) {
            bot.navTarget = B.Bots.pathStep(game, bot.pos.x, bot.pos.z, bot.waypoint.x, bot.waypoint.z);
            bot.navTimer = 0.45;
          }
          var nx2 = bot.navTarget.x - bot.pos.x, nz2 = bot.navTarget.z - bot.pos.z;
          var nd = Math.hypot(nx2, nz2) || 1;
          wishX = nx2 / nd;
          wishZ = nz2 / nd;
          bot.navigating = true;
        }
        void wd;
      }

      // ---- Evasión de obstaculos y peligros (no cuando se sigue una ruta ya validada) ----
      if (!bot.navigating) {
        var probe = game.probeObstacle(bot, wishX, wishZ);
        if (probe.blocked) {
          var alt = probe.turn;
          var cx = wishX * Math.cos(alt) - wishZ * Math.sin(alt);
          var cz = wishX * Math.sin(alt) + wishZ * Math.cos(alt);
          wishX = cx; wishZ = cz;
          if (probe.jump) wantJump = true;
        }
      }

      // Evita precipicios: en islas flotantes los bots ya no se tiran al vacio
      if (bot.grounded !== false && (Math.abs(wishX) + Math.abs(wishZ)) > 0.05) {
        var wl = Math.hypot(wishX, wishZ) || 1;
        var ux = wishX / wl, uz = wishZ / wl;
        if (game.ledgeAhead(bot, ux, uz)) {
          var gap = game.gapAhead ? game.gapAhead(bot, ux, uz) : -1;
          if (gap > 0 && gap <= 2.4) {
            // Hueco corto: se salta en vez de rodearlo
            wantJump = true;
          } else {
            var side = bot.strafeDir || 1;
            var ang = side * 1.1;
            var c1x = ux * Math.cos(ang) - uz * Math.sin(ang);
            var c1z = ux * Math.sin(ang) + uz * Math.cos(ang);
            var c2x = ux * Math.cos(-ang) - uz * Math.sin(-ang);
            var c2z = ux * Math.sin(-ang) + uz * Math.cos(-ang);
            if (!game.ledgeAhead(bot, c1x, c1z)) { wishX = c1x; wishZ = c1z; }
            else if (!game.ledgeAhead(bot, c2x, c2z)) { wishX = c2x; wishZ = c2z; }
            else { wishX = -ux; wishZ = -uz; }
          }
        }
      }

      var ratio = Math.min(1, Math.hypot(wishX, wishZ));
      if (bot.target && bot.def.kind !== "melee" && ratio > 0.05) speed *= 0.82;

      game.moveCombatant(bot, wishX * speed, wishZ * speed, dt, wantJump && bot.grounded !== false);

      // ---- Mirar ----
      var lookX, lookZ;
      if (bot.target && bot.target.alive) { lookX = bot.target.pos.x - bot.pos.x; lookZ = bot.target.pos.z - bot.pos.z; }
      else if (Math.hypot(wishX, wishZ) > 0.05) { lookX = wishX; lookZ = wishZ; }
      else { lookX = Math.sin(bot.yaw); lookZ = Math.cos(bot.yaw); }
      var wantYaw = Math.atan2(lookX, lookZ);
      bot.yaw = B.angleLerp(bot.yaw, wantYaw, Math.min(1, dt * (bot.target ? 9 : 5)));
      bot.group.rotation.y = bot.yaw;
      B.Avatar.update(bot.avatar, dt, ratio, bot.grounded !== false);

      // ---- Atacar ----
      bot.cooldown = Math.max(0, bot.cooldown - dt);
      bot.burstPause = Math.max(0, bot.burstPause - dt);
      if (bot.reloading > 0) {
        bot.reloading -= dt;
        if (bot.reloading <= 0) {
          var need = bot.def.mag - bot.ammoMag;
          var take = Math.min(need, bot.ammoReserve);
          bot.ammoMag += take; bot.ammoReserve -= take;
        }
      }

      if (bot.target && bot.target.alive && bot.reactionTimer <= 0 && bot.reloading <= 0) {
        if (bot.def.kind === "melee") {
          if (distTo(bot, bot.target) < bot.def.range) B.Bots.melee(game, bot);
        } else if (bot.burstPause <= 0) {
          if (bot.ammoMag <= 0) {
            if (bot.ammoReserve > 0) { bot.reloading = bot.def.reload; bot.burstLeft = 0; }
            else { bot.ammoMag = bot.def.mag; bot.ammoReserve = bot.def.reserve; }
          } else if (bot.cooldown <= 0) {
            B.Bots.shoot(game, bot);
            bot.cooldown = 60 / bot.def.rpm;
            if (bot.burstLeft <= 0) bot.burstLeft = Math.max(2, Math.round(bot.def.rpm * preset.burst[0] / 60));
            bot.burstLeft--;
            if (bot.burstLeft <= 0) bot.burstPause = preset.burst[1] * (0.7 + Math.random() * 0.7);
          }
        }
      }

      // ---- Detección de atasco ----
      bot.stuckTimer += dt;
      if (bot.stuckTimer > 1.4) {
        var moved = B.dist(bot.pos.x, bot.pos.z, bot.lastPos.x, bot.lastPos.z);
        if (moved < 0.7) { bot.waypoint = null; bot.forceNav = 1.8; }
        bot.lastPos.x = bot.pos.x; bot.lastPos.z = bot.pos.z; bot.stuckTimer = 0;
      }
    },

    shoot: function (game, bot) {
      var t = bot.target;
      if (!t) return;
      bot.ammoMag--;
      bot.shots++;
      var a = eyePos(bot);
      var tx = t.pos.x, ty = t.pos.y + t.height * 0.62, tz = t.pos.z;
      var dx = tx - a.x, dy = ty - a.y, dz = tz - a.z;
      var d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      var lead = 0.02;
      dx += (t.vel ? t.vel.x * lead : 0);
      dz += (t.vel ? t.vel.z * lead : 0);
      var err = B.rad(bot.preset.aim * (1 + Math.min(1.2, d / 60)));
      // error aleatorio dentro de un cono
      var ox = B.rand(-1, 1) * err, oy = B.rand(-1, 1) * err;
      var dir = new THREE.Vector3(dx / d, dy / d, dz / d);
      var right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
      var up = new THREE.Vector3().crossVectors(right, dir).normalize();
      dir.addScaledVector(right, Math.tan(ox)).addScaledVector(up, Math.tan(oy)).normalize();

      game.hitscanShot(bot, bot.def, new THREE.Vector3(a.x, a.y, a.z), dir, {
        damageMul: bot.preset.dmg, tracer: true, source: "bot"
      });
      B.Audio.shoot(bot.def.id);
      if (bot.ammoMag === 0 && bot.ammoReserve > 0) bot.reloading = bot.def.reload;
    },

    melee: function (game, bot) {
      bot.cooldown = 60 / bot.def.rpm;
      var t = bot.target;
      if (!t) return;
      B.Audio.melee();
      // Un zombi golpea mas flojo que un humano con la katana
      var mul = bot.kind === "zombie" ? bot.preset.dmg * 0.35 : bot.preset.dmg;
      game.hitscanShot(bot, bot.def, new THREE.Vector3(bot.pos.x, bot.pos.y + bot.eye, bot.pos.z),
        new THREE.Vector3(t.pos.x - bot.pos.x, (t.pos.y + 1.1) - (bot.pos.y + bot.eye), t.pos.z - bot.pos.z).normalize(),
        { damageMul: mul, melee: true, source: "bot" });
    }
  };

  function distTo(a, b) { return B.dist(a.pos.x, a.pos.z, b.pos.x, b.pos.z); }
})();
