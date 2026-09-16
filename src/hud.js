/* BLOCKBURST - HUD: barras, municion, marcador, killfeed y minimapa */
(function () {
  'use strict';
  var B = (window.BLITZ = window.BLITZ || {});

  var el = {};
  var mm = null, mmx = null;
  var feedItems = [];
  var bannerTimer = 0, toastTimer = 0, hitTimer = 0, dmgTimer = 0, healTimer = 0;

  function $(id) { return document.getElementById(id); }

  B.HUD = {
    init: function () {
      ["hud", "minimap", "minimapName", "objMode", "objTimer", "objScore", "killfeed", "modeHint",
        "healthNum", "healthFill", "armorNum", "armorFill", "weaponName", "ammoMag", "ammoReserve",
        "weaponSlots", "crosshair", "hitmarker", "damageVignette", "healVignette", "centerMsg",
        "pickupToast", "respawnBox", "respawnTime", "btnRespawn", "respawnHint",
        "scoreboard", "sbTitle", "sbBody"].forEach(function (id) { el[id] = $(id); });
      mm = el.minimap;
      mmx = mm.getContext("2d");
    },

    setPlaying: function (on) {
      el.hud.hidden = !on;
      if (!on) {
        feedItems = [];
        el.killfeed.innerHTML = "";
        el.centerMsg.classList.remove("on");
        el.hitmarker.classList.remove("on");
        el.crosshair.classList.remove("hit");
        el.respawnBox.hidden = true;
        el.scoreboard.hidden = true;
      }
    },

    banner: function (text, dur) {
      el.centerMsg.textContent = text;
      el.centerMsg.classList.add("on");
      bannerTimer = dur || 2;
    },

    toast: function (text, dur) {
      el.pickupToast.textContent = text;
      el.pickupToast.classList.add("on");
      toastTimer = dur || 1.6;
    },

    hitmark: function (kill) {
      el.hitmarker.classList.remove("on");
      void el.hitmarker.offsetWidth;
      el.hitmarker.classList.add("on");
      el.crosshair.classList.add("hit");
      hitTimer = 0.24;
      void kill;
    },

    flashDamage: function () { el.damageVignette.style.opacity = "0.95"; dmgTimer = 0.5; },
    flashHeal: function () { el.healVignette.style.opacity = "0.9"; healTimer = 0.5; },

    pushKill: function (killerName, killerTeam, weaponName, victimName, victimTeam, isMe) {
      var li = document.createElement("li");
      if (isMe) li.className = "me";
      var k = '<b class="' + (killerTeam || "") + '">' + B.esc(killerName) + "</b>";
      var v = '<b class="' + (victimTeam || "") + '">' + B.esc(victimName) + "</b>";
      li.innerHTML = k + " <i>" + B.esc(weaponName) + "</i> " + v;
      el.killfeed.appendChild(li);
      feedItems.push({ node: li, t: 5.5 });
      while (feedItems.length > 5) {
        var old = feedItems.shift();
        if (old.node.parentNode) old.node.parentNode.removeChild(old.node);
      }
    },

    showRespawn: function (on, seconds) {
      el.respawnBox.hidden = !on;
      if (on) el.respawnTime.textContent = Math.max(0, Math.ceil(seconds));
    },

    setScoreboard: function (visible, title, html) {
      el.scoreboard.hidden = !visible;
      if (visible) { el.sbTitle.textContent = title; el.sbBody.innerHTML = html; }
    },

    update: function (game, dt) {
      var p = game.player;

      // Barras
      var hp = B.clamp(p.health, 0, p.maxHealth);
      el.healthNum.textContent = B.num(hp);
      el.healthFill.style.width = (hp / p.maxHealth) * 100 + "%";
      el.healthFill.classList.toggle("low", hp <= 30);
      el.armorNum.textContent = B.num(p.armor);
      el.armorFill.style.width = B.clamp((p.armor / 100) * 100, 0, 100) + "%";

      // Arma y municion
      var def = B.Weapon.byId(p.weapon);
      el.weaponName.textContent = def.name;
      if (def.kind === "melee") {
        el.ammoMag.textContent = "∞";
        el.ammoReserve.textContent = "";
        el.ammoMag.classList.remove("zero");
      } else {
        var mag = p.ammo[p.weapon].mag;
        el.ammoMag.textContent = B.num(mag);
        el.ammoReserve.textContent = "/ " + B.num(p.ammo[p.weapon].reserve);
        el.ammoMag.classList.toggle("zero", mag === 0);
      }
      el.weaponSlots.innerHTML = game.slotSummary();

      // Objetivo
      var hud = game.mode.hud(game);
      el.objMode.textContent = hud.mode;
      el.objTimer.textContent = typeof hud.timer === "number" ? B.formatTime(hud.timer) : hud.timer;
      el.objScore.textContent = hud.score;
      el.modeHint.textContent = hud.hint;
      el.minimapName.textContent = game.map.name.toUpperCase();

      // Temporizadores de efectos
      if (bannerTimer > 0) { bannerTimer -= dt; if (bannerTimer <= 0) el.centerMsg.classList.remove("on"); }
      if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) el.pickupToast.classList.remove("on"); }
      if (hitTimer > 0) { hitTimer -= dt; if (hitTimer <= 0) { el.hitmarker.classList.remove("on"); el.crosshair.classList.remove("hit"); } }
      if (dmgTimer > 0) { dmgTimer -= dt; if (dmgTimer <= 0) el.damageVignette.style.opacity = "0"; }
      if (healTimer > 0) { healTimer -= dt; if (healTimer <= 0) el.healVignette.style.opacity = "0"; }

      for (var i = feedItems.length - 1; i >= 0; i--) {
        feedItems[i].t -= dt;
        if (feedItems[i].t <= 0) {
          if (feedItems[i].node.parentNode) feedItems[i].node.parentNode.removeChild(feedItems[i].node);
          feedItems.splice(i, 1);
        }
      }

      this.renderMinimap(game);
    },

    renderMinimap: function (game) {
      var size = 200;
      var mapSize = game.map.size;
      var s = size / mapSize;
      var cx = size / 2, cz = size / 2;
      var toX = function (x) { return cx + x * s; };
      var toZ = function (z) { return cz + z * s; };

      mmx.clearRect(0, 0, size, size);
      mmx.fillStyle = "#0a0d12";
      mmx.fillRect(0, 0, size, size);
      // cuadricula
      mmx.strokeStyle = "rgba(48,60,80,0.55)";
      mmx.lineWidth = 1;
      for (var g = -mapSize / 2; g <= mapSize / 2; g += 16) {
        mmx.beginPath(); mmx.moveTo(toX(g), 0); mmx.lineTo(toX(g), size); mmx.stroke();
        mmx.beginPath(); mmx.moveTo(0, toZ(g)); mmx.lineTo(size, toZ(g)); mmx.stroke();
      }

      // peligros
      game.world.hazards.forEach(function (h) {
        mmx.fillStyle = h.type === "lava" ? "rgba(255,90,18,0.5)" : "rgba(47,143,216,0.45)";
        mmx.fillRect(toX(h.min.x), toZ(h.min.z), (h.max.x - h.min.x) * s, (h.max.z - h.min.z) * s);
      });

      // estructuras
      mmx.fillStyle = "rgba(120,140,170,0.5)";
      var fp = game.world.footprints;
      for (var i = 0; i < fp.length; i++) {
        mmx.fillRect(toX(fp[i].x - fp[i].w / 2), toZ(fp[i].z - fp[i].d / 2), fp[i].w * s, fp[i].d * s);
      }

      // objetivos
      var o = game.map.objectives;
      if (game.modeObj) game.modeObj.drawMinimap(game, mmx, toX, toZ, s);
      if (o.hill && game.mode.id === "koth") {
        mmx.strokeStyle = "#ffc63d"; mmx.lineWidth = 2;
        mmx.beginPath(); mmx.arc(toX(o.hill.x), toZ(o.hill.z), o.hill.r * s, 0, 6.283); mmx.stroke();
      }

      // entidades
      for (var j = 0; j < game.entities.length; j++) {
        var e = game.entities[j];
        if (!e.alive) continue;
        var col = e.isPlayer ? "#e9eef7" : e.team === "red" ? "#ff5252" : e.team === "blue" ? "#4b8dff" : e.kind === "zombie" ? "#8ede5a" : "#ff9a4d";
        mmx.fillStyle = col;
        var r = e.isPlayer ? 3.4 : 2.6;
        mmx.beginPath(); mmx.arc(toX(e.pos.x), toZ(e.pos.z), r, 0, 6.283); mmx.fill();
      }
      // jugador
      var p = game.player;
      mmx.fillStyle = "#ff7a1a";
      mmx.beginPath(); mmx.arc(toX(p.pos.x), toZ(p.pos.z), 4.2, 0, 6.283); mmx.fill();
      mmx.strokeStyle = "#14100a"; mmx.lineWidth = 2;
      mmx.beginPath();
      mmx.moveTo(toX(p.pos.x), toZ(p.pos.z));
      mmx.lineTo(toX(p.pos.x + Math.sin(p.yaw) * 8), toZ(p.pos.z + Math.cos(p.yaw) * 8));
      mmx.stroke();
    }
  };
})();
