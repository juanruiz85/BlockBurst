/* BLOCKBURST - arranque, menus, bucle principal y orquestacion de pantallas */
(function () {
  'use strict';
  var B = (window.BLITZ = window.BLITZ || {});
  B.VERSION = "0.4.0";

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
    quality: "alto",
    fov: 80,
    sens: 100,
    volume: 70,
    name: "Tu"
  };

  var game = null;
  var el = {};
  var last = 0;
  var lastFrameTs = 0;
  var minFrameMs = 0;
  var started = false;
  var pendingGuestName = "Invitado";
  var pendingHostName = "Anfitrion";

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
    var tabs = [["play", "Jugar"], ["multi", "Multijugador"], ["controls", "Controles"], ["settings", "Ajustes"]];
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
    else if (state.tab === "multi") el.menuBody.innerHTML = panelRoom();
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

  /* --------------------------- salas (por codigo) --------------------------- */
  function roomLeft() {
    var n = 0;
    var list = B.Net.peers || {};
    for (var k in list) if (list[k]) n++;
    return n;
  }

  function panelRoom() {
    var mode = B.modeById(state.modeId);
    var map = B.mapById(state.mapId);
    var inRoom = !!B.Net.room;
    var host = B.Net.isHost;
    var count = inRoom ? B.Net.playerCount() : 0;
    var peers = B.Net.peerList();
    var rows = '<li><span>' + B.esc(state.name || "Tu") + (host ? " (anfitrion)" : "") + '</span><b>tu</b></li>';
    peers.forEach(function (p) {
      rows += '<li><span>' + B.esc(p.name || "Jugador") + '</span><b>' + (p.connected ? "conectado" : "conectando") + '</b></li>';
    });

    var stateText = !inRoom ? "Sin sala" : (host ? "Sala abierta como anfitrion" : "Dentro de la sala");
    var stateKind = !inRoom ? "" : (B.Net.connected ? "ok" : "warn");

    return '<div class="rowsplit"><div>' +
      '<h3 class="sectionTitle">Sala multijugador (hasta 10 jugadores)</h3>' +
      '<div class="panel" style="padding:16px;display:grid;gap:14px">' +
        '<div class="netState ' + stateKind + '" id="roomState"><i></i><span id="roomStateText" class="mono">' + B.esc(stateText) + '</span></div>' +

        '<div id="roomOpenBox" style="display:' + (inRoom && host ? "grid" : "none") + ';gap:8px">' +
          '<label class="field"><span>Tu codigo de sala (solo lectura, se copia con el boton)</span></label>' +
          '<div style="display:flex;gap:10px;align-items:stretch;flex-wrap:wrap">' +
            '<input id="roomCodeOut" class="netCode readonly" style="min-height:44px;flex:1;min-width:180px" readonly value="' + B.esc(B.Net.room || "") + '">' +
            '<button id="btnCopyRoom" class="btn">COPIAR</button>' +
            '<button id="btnCopyInvite" class="btn">COPIAR INVITACION</button>' +
          '</div>' +
        '</div>' +

        '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
          '<button id="btnCreateRoom" class="btn primary"' + (inRoom ? " disabled" : "") + '>CREAR SALA</button>' +
          '<button id="btnCloseRoom" class="btn"' + (inRoom ? "" : " disabled") + '>CERRAR SALA</button>' +
        '</div>' +

        '<div style="border-top:2px solid var(--line-soft);padding-top:14px;display:grid;gap:8px">' +
          '<label class="field"><span>Aqui si se escribe: si te han dado un codigo, unete</span></label>' +
          '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
            '<input id="roomCodeIn" class="netCode write" style="min-height:46px;flex:1;min-width:170px;text-transform:uppercase;letter-spacing:0.22em" placeholder="Escribe el codigo, por ejemplo K7M2P" maxlength="8" autocomplete="off" spellcheck="false">' +
            '<button id="btnPasteRoom" class="btn">PEGAR</button>' +
            '<button id="btnJoinRoom" class="btn primary"' + (inRoom ? " disabled" : "") + '>UNIRSE</button>' +
          '</div>' +
          '<p class="dim" id="joinHint" style="font-size:12.5px;margin:0">' +
            (inRoom ? "Estas dentro de una sala: cierrala si quieres unirte a otra." : "Pulsa primero en el recuadro y escribe; o pulsa PEGAR si lo copiaste.") +
          '</p>' +
        '</div>' +

        '<div style="display:grid;gap:8px">' +
          '<span class="mono" style="font-size:12px;letter-spacing:0.14em;color:var(--ink-dim)">JUGADORES <b id="roomCount" style="color:var(--ink)">' + count + "/" + B.Net.maxPlayers + '</b></span>' +
          '<ul class="summaryList" id="roomList">' + rows + '</ul>' +
          '<p class="dim" id="roomNote" style="font-size:13px;margin:0"></p>' +
        '</div>' +

        '<div style="display:grid;gap:8px">' +
          '<span class="mono" style="font-size:12px;letter-spacing:0.14em;color:var(--ink-dim)">AJUSTES DE LA PARTIDA</span>' +
          '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
            '<label class="field" style="flex:1;min-width:150px"><span>Dificultad de los bots</span><select id="roomDiff"' + (host ? "" : " disabled") + '>' +
              DIFFS.map(function (d) { return '<option value="' + d.id + '"' + (state.difficulty === d.id ? " selected" : "") + ">" + d.label + "</option>"; }).join("") +
            '</select></label>' +
            '<label class="field" style="flex:1;min-width:130px"><span>Numero de bots</span><select id="roomBots"' + (host ? "" : " disabled") + '>' +
              [2, 4, 6, 8, 10, 12].map(function (n) { return '<option value="' + n + '"' + (state.bots === n ? " selected" : "") + ">" + n + " bots</option>"; }).join("") +
            '</select></label>' +
          '</div>' +
          '<p class="dim" style="font-size:12.5px;margin:0">' +
            (host ? "Se aplican al empezar la partida. Baja la dificultad si los bots matan demasiado rapido." : "Los elige el anfitrion; tu puedes practicar mientras tanto en una partida propia.") +
          '</p>' +
        '</div>' +

        '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
          '<button id="btnStartRoom" class="btn primary"' + (inRoom && host ? "" : " disabled") + '>EMPEZAR PARTIDA</button>' +
        '</div>' +
      '</div>' +

      '<details class="panel" style="padding:16px;margin-top:16px">' +
        '<summary style="cursor:pointer;font-family:var(--mono-font);font-size:13px">Modo sin relay: codigos manuales (si el broker publico no esta disponible)</summary>' +
        '<div style="margin-top:14px">' + panelManual() + '</div>' +
      '</details>' +
    '</div><aside class="side">' +
      '<div class="panel" style="padding:16px">' +
        '<h3 class="sectionTitle">Partida de la sala</h3>' +
        '<ul class="summaryList">' +
          '<li><span>Modo</span><b>' + B.esc(mode.name) + '</b></li>' +
          '<li><span>Mapa</span><b>' + B.esc(map.name) + '</b></li>' +
          '<li><span>Bots</span><b>' + state.bots + '</b></li>' +
          '<li><span>Dificultad</span><b>' + B.esc(labelOf(DIFFS, state.difficulty)) + '</b></li>' +
        '</ul>' +
        '<p class="dim" style="font-size:13px;margin:12px 0 0">El anfitrion los cambia en la pestana <b>Jugar</b> antes de empezar.</p>' +
      '</div>' +
      '<div class="panel" style="padding:16px">' +
        '<h3 class="sectionTitle">Como funciona</h3>' +
        '<ul class="tips">' +
          '<li><b>Sin servidor del juego:</b> el broker publico solo sirve para que os encontreis; la partida va despues directa entre los navegadores.</li>' +
          '<li>El <b>anfitrion</b> simula y manda: su navegador es la autoridad y reparte los bots. Los demas envian su entrada y predicen su movimiento.</li>' +
          '<li>La sala sigue abierta mientras haya alguien dentro. Si se van <b>todos</b>, se cierra sola <b>1 minuto</b> despues (veras la cuenta atras).</li>' +
          '<li>Si el anfitrion cierra la pestana o sale, la sala termina para todos.</li>' +
          '<li>Necesita internet. En redes muy restrictivas puede fallar la conexion directa; en ese caso se usa la retransmision publica de respaldo.</li>' +
        '</ul>' +
      '</div>' +
    '</aside></div>';
  }

  function panelManual() {
    var mode = B.modeById(state.modeId);
    var map = B.mapById(state.mapId);
    return '<div class="rowsplit"><div>' +
      '<h3 class="sectionTitle">Jugar con otra persona</h3>' +
      '<div class="panel" style="padding:16px;display:grid;gap:12px">' +
        '<div class="netState" id="netState"><i></i><span id="netStateText" class="mono">Sin conexion</span></div>' +
        '<h4 style="margin:4px 0 0;font-size:14px;letter-spacing:0.1em">ANFITRION</h4>' +
        '<ol class="steps">' +
          '<li>Pulsa <b>Crear sala</b> y espera el codigo.</li>' +
          '<li>Pasale ese <b>codigo</b> a la otra persona.</li>' +
          '<li>Pega abajo la <b>respuesta</b> que te devuelva y pulsa <b>Conectar</b>.</li>' +
          '<li>La partida arranca sola con el modo y el mapa elegidos en la pestana Jugar.</li>' +
        '</ol>' +
        '<button id="btnHost" class="btn primary">CREAR SALA</button>' +
        '<textarea id="netHostCode" class="netCode" readonly placeholder="Tu codigo de sala aparecera aqui"></textarea>' +
        '<label class="field"><span>Respuesta del invitado</span><textarea id="netAnswer" class="netCode" placeholder="Pega aqui la respuesta que te envien"></textarea></label>' +
        '<button id="btnHostConnect" class="btn">CONECTAR</button>' +
      '</div>' +
      '<div class="panel" style="padding:16px;display:grid;gap:12px;margin-top:16px">' +
        '<h4 style="margin:0;font-size:14px;letter-spacing:0.1em">INVITADO</h4>' +
        '<ol class="steps">' +
          '<li>Pega el <b>codigo de sala</b> que te pasen.</li>' +
          '<li>Pulsa <b>Generar respuesta</b>.</li>' +
          '<li>Envia esa respuesta al anfitrion. Cuando la acepte, entras a la partida.</li>' +
        '</ol>' +
        '<label class="field"><span>Codigo de sala</span><textarea id="netOffer" class="netCode" placeholder="Pega aqui el codigo del anfitrion"></textarea></label>' +
        '<button id="btnJoin" class="btn primary">GENERAR RESPUESTA</button>' +
        '<textarea id="netReply" class="netCode" readonly placeholder="Tu respuesta aparecera aqui"></textarea>' +
      '</div>' +
    '</div><aside class="side">' +
      '<div class="panel" style="padding:16px">' +
        '<h3 class="sectionTitle">Sala actual</h3>' +
        '<ul class="summaryList">' +
          '<li><span>Modo</span><b>' + B.esc(mode.name) + '</b></li>' +
          '<li><span>Mapa</span><b>' + B.esc(map.name) + '</b></li>' +
          '<li><span>Bots</span><b>' + state.bots + '</b></li>' +
          '<li><span>Dificultad</span><b>' + B.esc(labelOf(DIFFS, state.difficulty)) + '</b></li>' +
        '</ul>' +
        '<p class="dim" style="font-size:13px;margin:12px 0 0">Cambia el modo y el mapa en la pestana <b>Jugar</b>; la sala usa esa seleccion.</p>' +
      '</div>' +
      '<div class="panel" style="padding:16px">' +
        '<h3 class="sectionTitle">Como funciona</h3>' +
        '<ul class="tips">' +
          '<li>Conexion <b>directa entre los dos navegadores</b> (WebRTC): no hay servidor intermedio ni cuentas.</li>' +
          '<li>El <b>anfitrion</b> simula la partida, manda los bots y decide los impactos; el invitado predice su movimiento para que se sienta fluido.</li>' +
          '<li>Los codigos son largos porque llevan la negociacion cifrada del enlace.</li>' +
          '<li>Si una red es muy restrictiva (NAT simetrico sin salida), el enlace puede no cuajar: cambia de red o intercambia quien crea la sala.</li>' +
          '<li>En modos por equipos, los dos jugadores van al <b>mismo bando</b> contra los bots.</li>' +
        '</ul>' +
      '</div>' +
    '</aside></div>';
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
      state.difficulty = "normal"; state.quality = "alto"; state.name = "Tu";
      saveSettings(); renderTab();
    });

    var bh = $("btnHost"); if (bh) bh.addEventListener("click", netHostCreate);
    var bc = $("btnHostConnect"); if (bc) bc.addEventListener("click", netHostAccept);
    var bj = $("btnJoin"); if (bj) bj.addEventListener("click", netJoin);

    var cr = $("btnCreateRoom"); if (cr) cr.addEventListener("click", function () { openRoom(true); });
    var jr = $("btnJoinRoom"); if (jr) jr.addEventListener("click", function () { openRoom(false); });
    var ci2 = $("roomCodeIn");
    if (ci2) {
      ci2.addEventListener("input", function () { ci2.value = ci2.value.toUpperCase().replace(/[^A-Z0-9]/g, ""); });
      ci2.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") { ev.preventDefault(); openRoom(false); }
      });
    }
    var rd = $("roomDiff");
    if (rd) rd.addEventListener("change", function () { state.difficulty = rd.value; saveSettings(); refreshRoomUI(); });
    var rb = $("roomBots");
    if (rb) rb.addEventListener("change", function () { state.bots = parseInt(rb.value, 10) || 8; saveSettings(); refreshRoomUI(); });
    var bp = $("btnPasteRoom");
    if (bp) bp.addEventListener("click", function () {
      B.Audio.ui();
      try {
        if (navigator.clipboard && navigator.clipboard.readText) {
          navigator.clipboard.readText().then(function (t) {
            var clean = String(t || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
            if (!clean) { roomState("bad", "El portapapeles esta vacio o no tiene un codigo."); return; }
            if (ci2) { ci2.value = clean; ci2.focus(); }
            roomState("warn", "Codigo pegado: " + clean + ". Pulsa UNIRSE.");
          }, function () { roomState("warn", "El navegador no dejo leer el portapapeles; escribe el codigo a mano."); });
          return;
        }
      } catch (e) { }
      roomState("warn", "Pega a mano con Ctrl+V dentro del recuadro.");
    });
    var sr = $("btnStartRoom"); if (sr) sr.addEventListener("click", function () { B.Audio.ui(); startRoomMatch(); });
    var xr = $("btnCloseRoom"); if (xr) xr.addEventListener("click", function () { closeRoom(false); });
    var cp = $("btnCopyRoom"); if (cp) cp.addEventListener("click", copyRoomCode);
    var ci = $("btnCopyInvite"); if (ci) ci.addEventListener("click", copyInvite);
  }

  /* ------------------------------- salas ---------------------------------- */
  var roomCloseTimer = null;
  var roomCloseAt = 0;

  function roomState(kind, text) {
    var s = $("roomState"), t = $("roomStateText");
    if (s) s.className = "netState" + (kind ? " " + kind : "");
    if (t) t.textContent = text;
  }

  function roomLeft() {
    var n = 0;
    var list = B.Net.peers || {};
    for (var k in list) if (list[k]) n++;
    return n;
  }

  function refreshRoomUI() {
    var st = $("roomStateText");
    if (st) {
      if (!B.Net.room) st.textContent = "Sin sala";
      else if (B.Net.isHost) st.textContent = "Sala " + B.Net.room + (B.Net.connected ? " abierta" : " abierta, esperando jugadores");
      else st.textContent = "Dentro de la sala" + (B.Net.connected ? "" : " (conectando...)");
    }
    var cnt = $("roomCount");
    if (cnt) cnt.textContent = B.Net.playerCount() + "/" + B.Net.maxPlayers;
    var note = $("roomNote");
    if (note) {
      if (roomCloseAt) note.textContent = "La sala se cerrara en " + Math.max(0, Math.ceil((roomCloseAt - Date.now()) / 1000)) + " s si no entra nadie.";
      else if (B.Net.room && B.Net.isHost) note.textContent = "Comparte el codigo " + B.Net.room + ". La sala se mantiene abierta mientras haya alguien.";
      else note.textContent = "";
    }
    var codeOut = $("roomCodeOut");
    if (codeOut && B.Net.room) codeOut.value = B.Net.room;

    var inRoomNow = !!B.Net.room;
    var hostNow = B.Net.isHost;
    var cr = $("btnCreateRoom"), jr = $("btnJoinRoom"), sr = $("btnStartRoom"), xr = $("btnCloseRoom"), box = $("roomOpenBox");
    if (cr) cr.disabled = inRoomNow;
    if (jr) jr.disabled = inRoomNow;
    if (xr) xr.disabled = !inRoomNow;
    if (sr) sr.disabled = !(inRoomNow && hostNow);
    if (box) box.style.display = (inRoomNow && hostNow) ? "grid" : "none";
  }

  function openRoom(asHost) {
    B.Audio.ui();
    var code = "";
    if (!asHost) {
      var box = $("roomCodeIn");
      code = box ? box.value.trim().toUpperCase() : "";
      if (code.length < 4) { roomState("bad", "Escribe un codigo de sala valido."); return; }
    }
    B.Net.off();
    registerNetHandlers();
    var created = B.Net.openRoom(code, state.name, asHost, onRoomStatus);
    roomState("warn", asHost ? ("Creando la sala " + created + "...") : ("Buscando la sala " + created + "..."));
    refreshRoomUI();
  }

  function onRoomStatus(kind, arg) {
    if (kind === "signaling") roomState("warn", "Conectando con el servicio de encuentro...");
    else if (kind === "room-open") { roomState("ok", "Sala " + B.Net.room + " abierta. Comparte el codigo."); refreshRoomUI(); }
    else if (kind === "searching") roomState("warn", "Buscando la sala " + B.Net.room + "...");
    else if (kind === "peer-connected") {
      if (B.Net.isHost && game.state === "playing") {
        var name = (B.Net.peers[arg] && B.Net.peers[arg].name) || "Jugador";
        var rp = game.addRemotePlayer(arg, name);
        B.Net.sendTo(arg, "seat", { netId: rp.netId, name: state.name });
        B.Net.sendTo(arg, "go", {
          modeId: state.modeId, mapId: state.mapId, bots: state.bots,
          difficulty: state.difficulty, name: state.name, netId: rp.netId, running: true
        });
      }
      refreshRoomUI();
    } else if (kind === "peer-left") {
      if (game.netHost) game.removeRemotePlayer(arg);
      refreshRoomUI();
      if (B.Net.isHost && !roomLeft()) {
        roomCloseAt = Date.now() + 60000;
        scheduleRoomClose();
      }
    } else if (kind === "room-closed") {
      B.Net.leaveRoom();
      roomState("bad", "El anfitrion cerro la sala.");
      renderTab();
    } else if (kind === "room-full") {
      B.Net.leaveRoom();
      roomState("bad", "La sala esta completa (10 jugadores).");
      renderTab();
    } else if (kind === "mqtt-error" || kind === "mqtt-closed") {
      if (!B.Net.connected) roomState("bad", "No se pudo usar el servicio de encuentro. Prueba el modo sin relay.");
    }
  }

  function scheduleRoomClose() {
    if (roomCloseTimer) clearInterval(roomCloseTimer);
    roomCloseTimer = setInterval(function () {
      if (roomLeft()) {
        roomCloseAt = 0;
        clearInterval(roomCloseTimer); roomCloseTimer = null;
        refreshRoomUI();
        return;
      }
      if (Date.now() >= roomCloseAt) {
        clearInterval(roomCloseTimer); roomCloseTimer = null;
        roomCloseAt = 0;
        closeRoom(true);
      } else refreshRoomUI();
    }, 1000);
  }

  function closeRoom(auto) {
    B.Audio.ui();
    B.Net.leaveRoom();
    if (roomCloseTimer) { clearInterval(roomCloseTimer); roomCloseTimer = null; }
    roomCloseAt = 0;
    if (auto) roomState("warn", "La sala se cerro por falta de jugadores. Crea otra cuando quieras.");
    else roomState("", "Sala cerrada.");
    renderTab();
  }

  function startRoomMatch() {
    if (!B.Net.isHost) return;
    hideMenu();
    show("results", false);
    game.settings.quality = currentQuality();
    game.applyQuality();
    game.netHost = true;
    game.start({
      modeId: state.modeId, mapId: state.mapId, bots: state.bots,
      difficulty: state.difficulty, fov: state.fov, name: state.name
    });
    B.Net.peerList().forEach(function (p) {
      if (!p.connected) return;
      var rp = game.addRemotePlayer(p.id, p.name);
      B.Net.sendTo(p.id, "seat", { netId: rp.netId, name: state.name });
      B.Net.sendTo(p.id, "go", {
        modeId: state.modeId, mapId: state.mapId, bots: state.bots,
        difficulty: state.difficulty, name: state.name, netId: rp.netId, running: true
      });
    });
    B.Audio.setVolume(state.volume / 100);
  }

  function copyText(text, okMsg) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { roomState("ok", okMsg); }, function () { roomState("warn", text); });
        return;
      }
    } catch (e) { }
    roomState("warn", text);
  }

  function copyRoomCode() {
    var box = $("roomCodeOut");
    if (box) { box.select(); }
    copyText(B.Net.room || "", "Codigo copiado: " + (B.Net.room || ""));
  }

  function copyInvite() {
    if (!B.Net.room) { roomState("bad", "Crea una sala primero."); return; }
    var url = "https://juanruiz85.github.io/BlockBurst/";
    var msg = "BLOCKBURST - unete a mi sala. Abre " + url + " y en Multijugador escribe el codigo " + B.Net.room;
    copyText(msg, "Invitacion copiada. Pegala donde quieras.");
  }

  /* ----------------------------- multijugador ----------------------------- */
  function netState(kind, text) {
    var s = $("netState"), t = $("netStateText");
    if (!s || !t) return;
    s.className = "netState" + (kind ? " " + kind : "");
    t.textContent = text;
  }

  function netHostCreate() {
    B.Audio.ui();
    netState("warn", "Generando el codigo de sala...");
    B.Net.host(function (st) {
      if (st === "connected") onHostConnected();
      else if (st === "failed") netState("bad", "La red rechazo la conexion. Prueba otra vez o desde otra red.");
    }).then(function (code) {
      var box = $("netHostCode");
      if (box) box.value = code;
      netState("warn", "Codigo listo. Pasaselo al invitado y pega abajo su respuesta.");
    }).catch(function (e) {
      netState("bad", "No se pudo crear la sala: " + e.message);
    });
  }

  function netHostAccept() {
    var box = $("netAnswer");
    var code = box ? box.value.trim() : "";
    if (!code) { netState("bad", "Pega primero la respuesta del invitado."); return; }
    netState("warn", "Conectando con el invitado...");
    B.Net.acceptAnswer(code).catch(function (e) {
      netState("bad", "No se pudo conectar: " + e.message);
    });
  }

  function netJoin() {
    var box = $("netOffer");
    var code = box ? box.value.trim() : "";
    if (!code) { netState("bad", "Pega primero el codigo de sala."); return; }
    B.Audio.ui();
    netState("warn", "Generando tu respuesta...");
    B.Net.join(code, function (st) {
      if (st === "connected") {
        B.Net.sendRel("hi", { name: state.name });
        netState("warn", "Conectado. Esperando a que el anfitrion acepte...");
      } else if (st === "failed") {
        netState("bad", "La red rechazo la conexion. Prueba otra vez o desde otra red.");
      }
    }).then(function (reply) {
      var out = $("netReply");
      if (out) out.value = reply;
      netState("warn", "Copia esa respuesta y enviasela al anfitrion.");
    }).catch(function (e) {
      netState("bad", "Codigo no valido: " + e.message);
    });
  }

  function onHostConnected() {
    netState("ok", "Conectado. Empezando la partida...");
    hideMenu();
    show("results", false);
    game.settings.quality = currentQuality();
    game.applyQuality();
    game.netHost = true;
    game.start({
      modeId: state.modeId, mapId: state.mapId, bots: state.bots,
      difficulty: state.difficulty, fov: state.fov, name: state.name
    });
    game.addRemotePlayer(pendingGuestName);
    B.Net.sendRel("go", {
      modeId: state.modeId, mapId: state.mapId, bots: state.bots,
      difficulty: state.difficulty, name: state.name
    });
    B.Audio.setVolume(state.volume / 100);
  }

  function onGuestGo(cfg) {
    if (!cfg) return;
    state.modeId = cfg.modeId || state.modeId;
    state.mapId = cfg.mapId || state.mapId;
    state.bots = cfg.bots == null ? state.bots : cfg.bots;
    state.difficulty = cfg.difficulty || state.difficulty;
    hideMenu();
    show("results", false);
    game.settings.quality = currentQuality();
    game.applyQuality();
    game.startNet({
      modeId: state.modeId, mapId: state.mapId, bots: state.bots,
      difficulty: state.difficulty, fov: state.fov, name: state.name
    });
    if (cfg.netId) game.player.netId = cfg.netId;
    B.Audio.setVolume(state.volume / 100);
  }

  function registerNetHandlers() {
    B.Net.on("hi", function (d) {
      pendingGuestName = (d && d.name) ? d.name : "Invitado";
    });
    B.Net.on("seat", function (d) {
      if (d && d.netId) state.myNetId = d.netId;
      if (d && d.name) pendingHostName = d.name;
    });
    B.Net.on("in", function (d, t, peer) {
      if (!game.netHost || !peer) return;
      var rp = game.remotes[peer.id];
      if (rp) B.Net.applyInput(rp, d);
    });
    B.Net.on("sn", function (d) {
      if (game.netClient) B.Net.applySnapshot(game, d);
    });
    B.Net.on("ro", function (d) {
      if (game.netClient) B.Net.applyRoster(game, d);
    });
    B.Net.on("go", function (d) { onGuestGo(d); });
    B.Net.on("fin", function (d) {
      if (game.netClient && !game.finished) {
        var w = d && d.winner;
        game.finish(w === "red" || w === "blue" ? w : null);
      }
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
    game.netHost = false;
    game.netClient = false;
    if (B.Net.room) B.Net.leaveRoom();
    B.Net.close();
    game.teardown();
    showMenu();
    renderTab();
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
    if (minFrameMs && (ts - lastFrameTs) < minFrameMs) return;
    lastFrameTs = ts;
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
    var qp = new URLSearchParams(window.location.search);
    if (/[?&]lowq=1/.test(window.location.search)) state.quality = "bajo";
    if (qp.get("bots")) state.bots = Math.max(1, Math.min(16, parseInt(qp.get("bots"), 10) || 8));
    B.Audio.setVolume(state.volume / 100);
    B.Audio.setEnabled(true);

    game.onFinish = onFinish;
    registerNetHandlers();
    setInterval(function () {
      if (B.Net.room && game.state === "menu" && state.tab === "multi") refreshRoomUI();
    }, 1000);

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

    // Punto de enganche para pruebas automatizadas y capturas
    window.BLITZ.debug = { game: game, state: state };

    var qs = new URLSearchParams(window.location.search);
    if (qs.get("fps")) minFrameMs = 1000 / Math.max(1, Math.min(120, parseInt(qs.get("fps"), 10) || 60));

    var qs0 = new URLSearchParams(window.location.search);
    var auto = qs0.get("auto");
    if (auto && B.modeById(auto)) {
      state.modeId = auto;
      if (qs.get("map") && B.mapById(qs.get("map"))) state.mapId = qs.get("map");
      if (qs.get("bots")) state.bots = Math.max(1, Math.min(16, parseInt(qs.get("bots"), 10) || 8));
      if (qs.get("diff") && B.Bots.presets[qs.get("diff")]) state.difficulty = qs.get("diff");
      startMatch(false);
      if (qs.get("third") && game.player) game.player.thirdPerson = true;
    }

    requestAnimationFrame(frame);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
