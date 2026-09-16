/* BLOCKBURST - modos de juego. Cada modo configura los bots, actualiza su progreso y
   decide cuando termina la partida. */
(function () {
  'use strict';
  var B = (window.BLITZ = window.BLITZ || {});

  var MODES = [
    {
      id: "dm", name: "Todos contra todos", teams: false, icon: "FFA",
      desc: "Gana quien consigue mas eliminaciones antes de que acabe el tiempo. Reapareces al instante.",
      killsToWin: 25, time: 300,
      hint: "Elimina a todos los demas. Reapareces automaticamente.",
      setup: function (game) {
        game.spawnBots(game.settings.bots, null, "soldier");
      },
      hud: function (game) {
        var top = game.leaderboard(null)[0];
        return { mode: "TODOS CONTRA TODOS", timer: this.time - game.elapsed, score: (top ? top.score : 0) + " / " + this.killsToWin, hint: this.hint };
      },
      onKill: function (game, killer, victim) {
        if (killer) killer.score += 1;
        if (killer && killer.score >= this.killsToWin) game.finish(killer);
      }
    },
    {
      id: "tdm", name: "Duelo por equipos", teams: true, icon: "TDM",
      desc: "Rojo contra Azul. Los bots se reparten en dos equipos y gana el equipo con mas bajas.",
      killsToWin: 50, time: 420,
      hint: "Coordina con tu equipo y elimina a los rivales.",
      setup: function (game) {
        var n = game.settings.bots;
        var red = Math.ceil(n / 2);
        game.spawnBots(red, "red", "soldier");
        game.spawnBots(n - red, "blue", "soldier");
      },
      hud: function (game) {
        var s = game.teamScores();
        return { mode: "ROJO vs AZUL", timer: this.time - game.elapsed, score: s.red + " - " + s.blue + "  (a " + this.killsToWin + ")", hint: this.hint };
      },
      onKill: function (game, killer, victim) {
        var s = game.teamScores();
        if (killer && killer.team) { s[killer.team] += 1; }
        if (s.red >= this.killsToWin) game.finish("red");
        else if (s.blue >= this.killsToWin) game.finish("blue");
      }
    },
    {
      id: "survival", name: "Supervivencia", teams: false, icon: "OLA",
      desc: "Oleadas de zombis cada vez mas duras. Sobrevive todo lo que puedas y superate.",
      time: 0,
      hint: "Resiste las oleadas. Recoge municion y curación entre asaltos.",
      setup: function (game) {
        game.wave = 0; game.waveTimer = 0; game.waveActive = false;
        game.startWave();
      },
      startWave: function () {
        var game = this.game;
      },
      hud: function (game) {
        var alive = game.entities.filter(function (e) { return e.alive && e.kind === "zombie"; }).length;
        return {
          mode: "SUPERVIVENCIA",
          timer: game.waveActive ? (alive + " zombis vivos") : ("Oleada " + (game.wave + 1) + " en " + Math.ceil(game.waveTimer || 0) + "s"),
          score: "Oleada " + game.wave, hint: this.hint
        };
      },
      onKill: function (game, killer, victim) {
        if (killer && killer.isPlayer && victim.kind === "zombie") killer.score += 1;
      },
      update: function (game, dt) {
        var zombies = game.entities.filter(function (e) { return e.kind === "zombie"; });
        var aliveCount = zombies.filter(function (z) { return z.alive; }).length;
        if (game.waveActive && aliveCount === 0) {
          game.waveActive = false; game.wave += 1; game.waveTimer = 6;
          game.banner("OLEADA " + game.wave + " SUPERADA", 2.2);
          B.Audio.win();
          game.prepareWaveAmmo();
        } else if (!game.waveActive) {
          game.waveTimer -= dt;
          if (game.waveTimer <= 0) game.startWave();
        }
        // Los zombis no usan temporizador de fin: el jugador cae o abandona
      },
      isOver: function (game) {
        if (!game.player.alive && game.player.respawnTimer > 4) return null;
        return null;
      }
    },
    {
      id: "ctf", name: "Captura la bandera", teams: true, icon: "CTF",
      desc: "Roba la bandera rival y traela a tu base. Primer equipo con tres capturas gana.",
      capturesToWin: 3, time: 480,
      hint: "Roba la bandera del equipo rival y llevala a tu base.",
      setup: function (game) {
        var n = game.settings.bots;
        game.spawnBots(Math.ceil(n / 2), "red", "soldier");
        game.spawnBots(Math.floor(n / 2), "blue", "soldier");
        game.setupFlags();
      },
      hud: function (game) {
        var s = game.teamScores();
        return { mode: "CAPTURA LA BANDERA", timer: this.time - game.elapsed, score: "Rojo " + s.red + "  Azul " + s.blue + "  (a " + this.capturesToWin + ")", hint: this.hint };
      },
      onKill: function (game, killer, victim) {
        if (victim.carrying) game.dropFlag(victim);
      },
      update: function (game, dt) { game.updateCtf(dt); }
    },
    {
      id: "koth", name: "Rey de la colina", teams: true, icon: "KOTH",
      desc: "Mantén la zona central bajo tu control. Cada segundo dentro suma para tu equipo.",
      holdToWin: 150, time: 480,
      hint: "Mantente dentro del circulo marcado para sumar tiempo.",
      setup: function (game) {
        var n = game.settings.bots;
        game.spawnBots(Math.ceil(n / 2), "red", "soldier");
        game.spawnBots(Math.floor(n / 2), "blue", "soldier");
        game.setupHill();
      },
      hud: function (game) {
        var s = game.teamScores();
        return { mode: "REY DE LA COLINA", timer: this.time - game.elapsed, score: "Rojo " + Math.floor(s.red) + "s  Azul " + Math.floor(s.blue) + "s  (a " + this.holdToWin + "s)", hint: this.hint };
      },
      onKill: function () {},
      update: function (game, dt) { game.updateKoth(dt); }
    }
  ];

  var byId = Object.create(null);
  MODES.forEach(function (m) { byId[m.id] = m; });

  B.MODES = MODES;
  B.modeById = function (id) { return byId[id] || MODES[0]; };
})();
