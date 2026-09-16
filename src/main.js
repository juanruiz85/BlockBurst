/* BLOCKBURST - arranque, menus, bucle principal y orquestacion de pantallas */
(function () {
  'use strict';
  var B = (window.BLITZ = window.BLITZ || {});
  B.VERSION = "0.1.0";

  var DIFFS = [
    { id: "facil", label: "Facil" },
    { id: "normal", label: "Normal" },
    { id: "dificil", label: "Dificil" },
    { id: "pesadilla", label: "Pesadilla" }
  ];

  function qualityOptions() {
    var dpr = window.devicePixelRatio || 1;
    return {
      bajo: { pixelRatio: 0.72, shadows: false, name: "Bajo" },
      medio: { pixelRatio: Math.min(dpr, 1), shadows: false, name: "Medio" },
      alto: { pixelRatio: Math.min(dpr, 1.4), shadows: true, name: "Alto" }
    };
  }

  var q = qualityOptions();
  var state = {
    tab: "play",
    modeId: "dm",
    mapId: "distrito",
    bots: 8,
    difficulty: "normal",
    quality: "medio",
    fov: 80,
    sens: 100,
    volume: 70,
    name: "Tu"
  };

  var game = null;
  var el = {};
  var last = 0;
  var started = false;

  function $(id) { return document.getElementById(id); }

  function loadSettings() {
    var s = B.storage.get("settings", null);
    if (s) for (var k in s) if (s.hasOwnProperty(k) && state[k] !== undefined) state[k] = s[k];
    if (!B.mapById(state.mapId)) state.mapId = "distrito";
  }

  function saveSettings() { B.storage.set("settings", state); }

  function currentQuality() { return q[state.quality] || q.medio; }

  /* ------------------------------- pantallas ------------------------------ */
  function show(id, on) { $(id).hidden = !on; }

  function hideMenu() { show("menu", false); }
  function showMenu() { show("menu", true); renderTab(); }

  /* -------------------------------- menus -------------------------------- */
  function renderTabs() {
    var tabs = [["play", "Jugar"], ["controls", "Controles"], ["settings", "Ajustes"]];
    el.menuTabs.innerHTML = tabs.map(function (t) {
      return '<button class="tab' + (state.tab === t[0] ? " on" : "") + '" data-tab="' + t[0] + '">' + t[1] + "</button>";
    }).join("");
    el.menuTabs.querySelectorAll(".tab").forEach(function (b) {
      b.addEventListener("click", function () {
        state.tab = b.getAttribute("data-tab");
        B.Audio.ui();
        renderTab();
      });
    });
  }

  function renderTab() {
    renderTabs();
    if (state.tab === "play") el.menuBody.innerHTML = panelPlay();
    else if (state.tab === "controls") el.menuBody.innerHTML = panelControls();
    else el.menuBody.innerHTML = panelSettings();
    wire();
  }

  function panelPlay() {
    var modeCards = B.MODES.map(function (m) {
      return '<button class="card' + (state.modeId === m.id ? " on" : "") + '" data-mode="' + m.id + '">' +
        "<h4>" + B.esc(m.name) + "</h4><p>" + B.esc(m.desc) + '</p><span class="flag">' + B.esc(m.icon) + "</span></button>";
    }).join("");

    var mapCards = B.MAPS.map(function (m) {
      var sw = (m.swatch || []).map(function (c) { return '<i style="background:' + c + '"></i>'; }).join("");
      return '<button class="card' + (state.mapId === m.id ? " on" : "") + '" data-map="' + m.id + '">' +
        "<h4>" + B.esc(m.name) + "</h4><p>" + B.esc(m.tagline) + '</p><span class="swatch">' + sw + "</span></button>";
    }).join("");

    var mode = B.modeById(state.modeId);
    var map = B.mapById(state.mapId);
    var teams = mode.teams ? "Equipos: Rojo vs Azul" : "Individual";

    return '' +
      '<div class="rowsplit">' +
        "<div>" +
          '<h3 class="sectionTitle">Modo de juego</h3><div class="cards">' + modeCards + "</div>" +
          '<h3 class="sectionTitle">Mapa</h3><div class="cards">' + mapCards + "</div>" +
        "</div>" +
        '<aside class="side">' +
          '<div class="panel" style="padding:16px">' +
            '<h3 class="sectionTitle">Resumen de la partida</h3>' +
            '<ul class="summaryList">' +
              "<li><span>Modo</span><b>" + B.esc(mode.name) + "</b></li>" +
              "<li><span>Mapa</span><b>" + B.esc(map.name) + "</b></li>" +
              "<li><span>Formato</span><b>" + teams + "</b></li>" +
              "<li><span>Bots</span><b>" + state.bots + "</b></li>" +
              "<li><span>Dificultad</span><b>" + B.esc(labelOf(DIFFS, state.difficulty)) + "</b></li>" +
            "</ul>" +
            '<div style="display:grid;gap:10px;margin-top:16px">' +
              '<button id="btnPlay" class="btn primary">JUGAR AHORA</button>' +
              '<button id="btnQuick" class="btn">PARTIDA RAPIDA</button>' +
            "</div>" +
          "</div>" +
          '<div class="panel" style="padding:16px">' +
            '<h3 class="sectionTitle">Como se juega</h3>' +
            '<ul class="tips">' +
              "<li><b>Mueve y apunta</b> con WASD y el raton. Clic izquierdo dispara; clic derecho apunta con mas precision.</li>" +
              "<li><b>Cambia de arma</b> con 1-7 o la rueda. La katana es cuerpo a cuerpo y el lanzacohetes hace dano en area.</li>" +
              "<li><b>Recoge</b> cubos de vida, escudo y municion; reaparecen solos con el tiempo.</li>" +
              "<li><b>En equipos</b> tu bando es el Rojo. En captura la bandera, lleva la bandera rival a tu base.</li>" +
              "<li><b>Supervivencia</b>: aguanta oleadas de zombis; entre oleadas recuperas vida, escudo y municion.</li>" +
            "</ul>" +
          "</div>" +
        "</aside>" +
      "</div>";
  }

  function panelControls() {
    var rows = [
      ["WASD", "Moverse"], ["Raton", "Mirar"], ["Clic izq.", "Disparar"],
      ["Clic der.", "Apuntar"], ["Espacio", "Saltar"], ["Shift", "Correr"],
      ["Ctrl", "Agacharse"], ["R", "Recargar"], ["1-7 / Rueda", "Cambiar arma"],
      ["V", "Cambiar camara"], ["Tab", "Marcador"], ["Esc", "Pausa"]
    ];
    return '<h3 class="sectionTitle">Controles</h3>' +
      '<div class="controlsGrid">' + rows.map(function (r) {
        return '<div class="ctrl"><kbd>' + r[0] + "</kbd><span>" + r[1] + "</span></div>";
      }).join("") + "</div>" +
      '<h3 class="sectionTitle">Consejos</h3>' +
      '<ul class="tips">' +
        "<li>El <b>retroceso</b> sube la mira: dispara en rafagas cortas a distancia larga.</li>" +
        "<li>Las <b>rampas</b> llevan a las azoteas; desde arriba controlas las calles.</li>" +
        "<li>En <b>Caldera Voxel</b> evita la lava; en <b>Islas Flotantes</b> no caigas al vacio.</li>" +
        "<li>El escudo absorbe la mitad del dano hasta agotarse, y vuelve a recargarse con los cubos azules.</li>" +
        "<li>Pulsa <b>V</b> para tercera persona y ver tu personaje de bloques.</li>" +
      "</ul>";
  }

  function panelSettings() {
    return '<div class="rowsplit"><div>' +
      '<h3 class="sectionTitle">Jugabilidad</h3>' +
      '<div class="side">' +
        '<label class="sliderRow"><span class="mono">SENSIBILIDAD</span><input id="setSens" type="range" min="40" max="300" step="5" value="' + state.sens + '"><b id="setSensVal" class="mono">' + state.sens + "</b></label>" +
        '<label class="sliderRow"><span class="mono">CAMPO DE VISION</span><input id="setFov" type="range" min="60" max="110" step="1" value="' + state.fov + '"><b id="setFovVal" class="mono">' + state.fov + "</b></label>" +
        '<label class="sliderRow"><span class="mono">VOLUMEN</span><input id="setVol" type="range" min="0" max="100" step="5" value="' + state.volume + '"><b id="setVolVal" class="mono">' + state.volume + "</b></label>" +
      "</div>" +
      '<h3 class="sectionTitle">Partida</h3>' +
      '<div class="side">' +
        '<label class="field"><span>Dificultad de los bots</span><select id="setDiff">' +
          DIFFS.map(function (d) { return '<option value="' + d.id + '"' + (state.difficulty === d.id ? " selected" : "") + ">" + d.label + "</option>"; }).join("") +
        "</select></label>" +
        '<label class="field"><span>Numero de bots</span><select id="setBots">' +
          [2, 4, 6, 8, 10, 12].map(function (n) { return '<option value="' + n + '"' + (state.bots === n ? " selected" : "") + ">" + n + " bots</option>"; }).join("") +
        "</select></label>" +
        '<label class="field"><span>Calidad grafica</span><select id="setQuality">' +
          Object.keys(q).map(function (k) { return '<option value="' + k + '"' + (state.quality === k ? " selected" : "") + ">" + q[k].name + "</option>"; }).join("") +
        "</select></label>" +
        '<label class="field"><span>Tu nombre</span><input id="setName" type="text" maxlength="14" value="' + B.esc(state.name) + '"></label>' +
      "</div>" +
      '<div style="margin-top:18px;display:flex;gap:10px;flex-wrap:wrap">' +
        '<button id="btnReset" class="btn">RESTABLECER AJUSTES</button>' +
      "</div>" +
      "</div><aside class=\"side\"><div class=\"panel\" style=\"padding:16px\">" +
        '<h3 class="sectionTitle">Ajuste rapido</h3>' +
        "<ul class=\"tips\">" +
          "<li>Baja la <b>calidad</b> si notas tirones; el alto activa sombras reales.</li>" +
          "<li>El <b>campo de vision</b> amplio ayuda a ver emboscadas.</li>" +
          "<li>Los ajustes se guardan en este navegador.</li>" +
        "</ul>" +
      "</div></aside></div>";
  }

  function labelOf(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i].label;
    return id;
  }

  function wire() {
    var body = el.menuBody;
    body.querySelectorAll("[data-mode]").forEach(function (b) {
      b.addEventListener("click", function () {
        state.modeId = b.getAttribute("data-mode"); B.Audio.ui(); saveSettings(); renderTab();
      });
    });
    body.querySelectorAll("[data-map]").forEach(function (b) {
      b.addEventListener("click", function () {
        state.mapId = b.getAttribute("data-map"); B.Audio.ui(); saveSettings(); renderTab();
      });
    });
    var play = $("btnPlay"), quick = $("btnQuick");
    if (play) play.addEventListener("click", function () { startMatch(false); });
    if (quick) quick.addEventListener("click", function () { startMatch(true); });

    bindSlider("setSens", "setSensVal", "sens", function (v) { state.sens = v; });
    bindSlider("setFov", "setFovVal", "fov", function (v) { state.fov = v; game.settings.fov = v; game.camera.fov = v; game.camera.updateProjectionMatrix(); });
    bindSlider("setVol", "setVolVal", "volume", function (v) { state.volume = v; B.Audio.setVolume(v / 100); });

    var diff = $("setDiff");
    if (diff) diff.addEventListener("change", function () { state.difficulty = diff.value; saveSettings(); });
    var bots = $("setBots");
    if (bots) bots.addEventListener("change", function () { state.bots = parseInt(bots.value, 10); saveSettings(); });
    var qual = $("setQuality");
    if (qual) qual.addEventListener("change", function () {
      state.quality = qual.value; saveSettings();
      game.settings.quality = currentQuality(); game.applyQuality();
    });
    var name = $("setName");
    if (name) name.addEventListener("input", function () { state.name = name.value || "Tu"; saveSettings(); });
    var reset = $("btnReset");
    if (reset) reset.addEventListener("click", function () {
      state.sens = 100; state.fov = 80; state.volume = 70; state.bots = 8;
      state.difficulty = "normal"; state.quality = "medio"; state.name = "Tu";
      saveSettings(); renderTab();
    });
  }

  function bindSlider(id, valId, key, apply) {
    var input = $(id), out = $(valId);
    if (!input) return;
    input.addEventListener("input", function () {
      var v = parseInt(input.value, 10);
      out.textContent = v;
      apply(v);
      B.storage.set("settings", state);
    });
  }

  /* ------------------------------- partida ------------------------------- */
  function startMatch(quick) {
    hideMenu();
    show("results", false);
    B.Audio.resume();
    B.Audio.uiBig();
    game.settings.quality = currentQuality();
    game.applyQuality();
    game.start({
      modeId: quick ? "dm" : state.modeId,
      mapId: quick ? "distrito" : state.mapId,
      bots: state.bots,
      difficulty: state.difficulty,
      fov: state.fov,
      name: state.name
    });
    B.Audio.setVolume(state.volume / 100);
    B.Input.lock();
  }

  function pauseGame() {
    if (game.state !== "playing") return;
    game.state = "paused";
    B.Input.unlock();
    el.pSens.value = state.sens;
    el.pSensVal.textContent = state.sens;
    el.pVol.value = state.volume;
    el.pVolVal.textContent = state.volume;
    show("pause", true);
  }

  function resumeGame() {
    if (game.state !== "paused") return;
    show("pause", false);
    game.state = "playing";
    B.Input.lock();
  }

  function quitToMenu() {
    show("pause", false);
    show("results", false);
    B.HUD.setPlaying(false);
    game.state = "menu";
    game.teardown();
    showMenu();
  }

  function onFinish(res) {
    var winner = res.winner;
    var title, banner;
    if (winner === "empate") { title = "Empate"; banner = "FIN DE PARTIDA"; }
    else if (winner === "red") { title = "Gana el equipo Rojo"; banner = res.playerWon ? "VICTORIA" : "DERROTA"; }
    else if (winner === "blue") { title = "Gana el equipo Azul"; banner = res.playerWon ? "VICTORIA" : "DERROTA"; }
    else if (winner && winner.isPlayer) { title = "Ganaste la partida"; banner = "VICTORIA"; }
    else if (winner) { title = "Gana " + winner.name; banner = "DERROTA"; }
    else { title = "Fin de partida"; banner = "FIN DE PARTIDA"; }

    el.resultsBanner.textContent = banner;
    el.resultsBanner.className = "mono banner " + (res.playerWon ? "win" : "lose");
    el.resultsTitle.textContent = title;
    var map = game.map, mode = game.mode;
    el.resultsSub.textContent = mode.name + " en " + map.name + " - duracion " + B.formatTime(game.elapsed);

    var rows = game.leaderboard(null);
    var html = '<div class="sbRow head"><span class="mono">#</span><span class="mono">JUGADOR</span>' +
      '<span class="mono">BAJAS</span><span class="mono">MUERTES</span><span class="mono">PUNTOS</span></div>';
    rows.slice(0, 12).forEach(function (e, i) {
      html += '<div class="sbRow' + (e.isPlayer ? " me" : "") + (e.team ? " " + e.team : "") + '">' +
        '<span class="mono">' + (i + 1) + "</span>" +
        '<span class="name">' + B.esc(e.name) + (e.isPlayer ? " (tu)" : "") + "</span>" +
        '<span class="mono">' + e.kills + "</span>" +
        '<span class="mono">' + e.deaths + "</span>" +
        '<span class="mono">' + Math.round(e.score * 10) / 10 + "</span></div>";
    });
    el.resultsTable.innerHTML = html;
    B.HUD.setPlaying(false);
    B.Input.unlock();
    show("results", true);
  }

  function buildScoreboard() {
    if (game.state !== "playing" && game.state !== "paused") return "";
    var rows = game.leaderboard(null);
    var html = '<div class="sbRow head"><span class="mono">#</span><span class="mono">JUGADOR</span>' +
      '<span class="mono">BAJAS</span><span class="mono">MUERTES</span><span class="mono">PUNTOS</span></div>';
    rows.forEach(function (e, i) {
      html += '<div class="sbRow' + (e.isPlayer ? " me" : "") + (e.team ? " " + e.team : "") + '">' +
        '<span class="mono">' + (i + 1) + "</span>" +
        '<span class="name">' + B.esc(e.name) + "</span>" +
        '<span class="mono">' + e.kills + "</span>" +
        '<span class="mono">' + e.deaths + "</span>" +
        '<span class="mono">' + Math.round(e.score * 10) / 10 + "</span></div>";
    });
    return html;
  }

  /* -------------------------------- bucle -------------------------------- */
  function frame(ts) {
    requestAnimationFrame(frame);
    var now = ts / 1000;
    var dt = last ? Math.min(0.05, now - last) : 0.016;
    last = now;

    if (game.state === "playing") {
      game.update(dt);
      B.HUD.update(game, dt);
      var sbOn = B.Input.down("Tab");
      if (sbOn) B.HUD.setScoreboard(true, "MARCADOR", buildScoreboard());
      else B.HUD.setScoreboard(false);
      if (B.Input.once("Escape")) pauseGame();
    }
    game.render();
    B.Input.clearFrame();
  }

  /* ------------------------------- arranque ------------------------------ */
  function boot() {
    ["menu", "menuTabs", "menuBody", "menuFooter", "verTag", "repoLink", "pause", "results",
      "resultsBanner", "resultsTitle", "resultsSub", "resultsTable", "btnAgain", "btnMenu",
      "btnResume", "btnQuit", "pSens", "pSensVal", "pVol", "pVolVal", "loading", "loadBar", "loadText",
      "fatal", "fatalText", "hud", "minimapName"].forEach(function (id) { el[id] = $(id); });

    el.verTag.textContent = "v" + B.VERSION;

    if (!window.THREE) {
      show("fatal", true);
      el.fatalText.textContent = "No se pudo cargar el motor 3D local (vendor/three.min.js).";
      return;
    }

    try {
      game = new B.Game();
      B.HUD.init();
      B.Input.init($("view"));
      game.initRenderer($("view"));
      game.settings.quality = currentQuality();
      game.applyQuality();
    } catch (err) {
      show("fatal", true);
      el.fatalText.textContent = "Error al iniciar WebGL: " + (err && err.message ? err.message : err);
      return;
    }

    loadSettings();
    B.Audio.setVolume(state.volume / 100);
    B.Audio.setEnabled(true);

    game.onFinish = onFinish;

    B.Input.onKey(function (code) {
      if (code === "Escape" && game.state === "playing") pauseGame();
    });
    B.Input.onLockChange(function (locked) {
      if (!locked && game.state === "playing") pauseGame();
    });

    $("btnResume").addEventListener("click", function () { B.Audio.ui(); resumeGame(); });
    $("btnQuit").addEventListener("click", function () { B.Audio.ui(); quitToMenu(); });
    $("btnAgain").addEventListener("click", function () { B.Audio.ui(); startMatch(false); });
    $("btnMenu").addEventListener("click", function () { B.Audio.ui(); quitToMenu(); });
    $("btnRespawn").addEventListener("click", function () {
      if (game.player && !game.player.alive) { game.player.respawnTimer = 0; }
    });
    el.pSens.addEventListener("input", function () { state.sens = parseInt(el.pSens.value, 10); el.pSensVal.textContent = state.sens; saveSettings(); });
    el.pVol.addEventListener("input", function () { state.volume = parseInt(el.pVol.value, 10); el.pVolVal.textContent = state.volume; B.Audio.setVolume(state.volume / 100); saveSettings(); });

    window.addEventListener("resize", function () { game.resize(); });
    document.addEventListener("visibilitychange", function () {
      if (document.hidden && game.state === "playing") pauseGame();
    });
    window.addEventListener("click", function () {
      if (game.state === "playing" && !B.Input.isLocked()) B.Input.lock();
    });

    // Pantalla de carga
    el.loadBar.style.width = "60%";
    el.loadText.textContent = "Cargando mapas y armas...";
    setTimeout(function () {
      el.loadBar.style.width = "100%";
      el.loadText.textContent = "Listo";
      setTimeout(function () { show("loading", false); started = true; }, 260);
    }, 260);

    renderTab();
    requestAnimationFrame(frame);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
