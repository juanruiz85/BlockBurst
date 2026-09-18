/* BLOCKBURST - multijugador peer to peer sobre WebRTC.
   No necesita servidor: el anfitrion y el invitado intercambian un codigo de texto
   (oferta y respuesta) y a partir de ahi hablan directo. Asi el juego sigue siendo
   estatico y se puede publicar en GitHub Pages o en cualquier hosting de archivos.

   Diseno: autoridad en el anfitrion.
   - El anfitrion simula todo (jugadores, bots, modos) y envia instantaneas.
   - El invitado envia su entrada y predice su propio movimiento en local; las
     instantaneas corrigen su posicion y le dan el resto del mundo.

   El protocolo (serializar / aplicar) es independiente del transporte, de modo que
   se puede probar sin navegador (ver tools/simulate.js). */
(function () {
  'use strict';
  var B = (window.BLITZ = window.BLITZ || {});

  var STUN = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" }
  ];
  /* Retransmision publica de respaldo: mejora mucho la conexion entre redes distintas
     (sobre todo detras de NAT simetrico). Si no responde, el ICE la descarta sola. */
  var TURN = [
    { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
    { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
    { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" }
  ];
  var ICE = [].concat(STUN, TURN);

  var MQTT_URLS = ["wss://broker.emqx.io:8084/mqtt", "wss://test.mosquitto.org:8081/mqtt"];
  var APP = "bbx7q2";
  var HELLO_MS = 2000;
  var MAX_PLAYERS = 10;

  function baseTopic(room) { return "bb/" + APP + "/" + String(room || "").toUpperCase(); }
  function shortId() {
    var s = "";
    var abc = "abcdefghijkmnpqrstuvwxyz23456789";
    for (var i = 0; i < 6; i++) s += abc.charAt(Math.floor(Math.random() * abc.length));
    return s;
  }
  function roomCode() {
    var s = "";
    var abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    for (var i = 0; i < 5; i++) s += abc.charAt(Math.floor(Math.random() * abc.length));
    return s;
  }
  var FAST_HZ = 20;      // instantaneas por segundo (canal no fiable)
  var INPUT_HZ = 30;     // entradas por segundo (canal no fiable)
  var ROSTER_MS = 2000;  // reenvio de la plantilla de jugadores

  function q(v, d) { var f = Math.pow(10, d == null ? 2 : d); return Math.round(v * f) / f; }
  function now() { return Date.now(); }

  /* ------------------------------ codificacion ----------------------------- */
  function pack(bytes) {
    var s = "";
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function unpack(str) {
    var s = String(str).trim().replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    var bin = atob(s);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function encode(text) {
    var data = new TextEncoder().encode(text);
    if (typeof CompressionStream === "function") {
      return new Response(new Blob([data]).stream().pipeThrough(new CompressionStream("deflate-raw")))
        .arrayBuffer()
        .then(function (buf) { return "1" + pack(new Uint8Array(buf)); })
        .catch(function () { return "0" + pack(data); });
    }
    return Promise.resolve("0" + pack(data));
  }
  function decode(code) {
    var body = String(code).trim();
    var flag = body.charAt(0);
    var bytes = unpack(body.slice(1));
    if (flag === "1" && typeof DecompressionStream === "function") {
      return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw")))
        .arrayBuffer()
        .then(function (buf) { return new TextDecoder().decode(new Uint8Array(buf)); });
    }
    return Promise.resolve(new TextDecoder().decode(bytes));
  }

  function waitIce(pc) {
    return new Promise(function (resolve) {
      if (pc.iceGatheringState === "complete") return resolve();
      var done = false;
      var finish = function () { if (!done) { done = true; resolve(); } };
      pc.addEventListener("icegatheringstatechange", function () {
        if (pc.iceGatheringState === "complete") finish();
      });
      setTimeout(finish, 4000);
    });
  }

  var Net = {
    name: "blockburst-p2p",

    active: false,
    role: null,          // "host" | "guest"
    connected: false,
    ping: 0,
    lastError: "",
    guestName: "Invitado",
    hostName: "Anfitrion",
    FAST_HZ: FAST_HZ,
    INPUT_HZ: INPUT_HZ,
    link: null,
    handlers: {},

    /* ------------------------------- protocolo ------------------------------- */

    buildInput: function (game) {
      var p = game.player;
      var a = game.netInputAxis || { x: 0, z: 0 };
      return [
        q(a.x, 2), q(a.z, 2),
        q(p.yaw, 3), q(p.pitch, 3),
        (game.netWantJump ? 1 : 0),
        (game.netFiring ? 1 : 0),
        B.Weapon.byId(p.weapon).slot,
        (game.netReload ? 1 : 0),
        (game.netRun ? 1 : 0),
        (game.netCrouch ? 1 : 0)
      ];
    },

    applyInput: function (remote, input) {
      if (!remote || !input) return;
      remote.netInputAxis = { x: input[0], z: input[1] };
      remote.yaw = input[2];
      remote.pitch = input[3];
      remote.netWantJump = input[4] === 1;
      remote.netFiring = input[5] === 1;
      var w = B.WEAPONS[input[6] - 1];
      if (w && remote.weapon !== w.id) { remote.weapon = w.id; remote.reloading = 0; }
      remote.netReload = input[7] === 1;
      remote.netRun = input[8] === 1;
      remote.netCrouch = input[9] === 1;
    },

    buildRoster: function (game) {
      return game.entities.map(function (e) {
        return [e.netId, e.name, e.team || 0, e.isBot ? 1 : 0, e.kind || "soldier"];
      });
    },

    buildSnapshot: function (game) {
      var players = [];
      for (var i = 0; i < game.entities.length; i++) {
        var e = game.entities[i];
        if (e.netId == null) continue;
        var st = (!e.isBot && e.ammo) ? e.ammo[e.weapon] : null;
        players.push([
          e.netId, q(e.pos.x), q(e.pos.y), q(e.pos.z), q(e.yaw, 3), q(e.pitch || 0, 3),
          Math.round(e.health), Math.round(e.armor || 0), e.alive ? 1 : 0,
          B.Weapon.byId(e.weapon).slot,
          st ? st.mag : 0, st ? st.reserve : 0,
          e.kills, e.deaths, Math.round(e.score * 10) / 10,
          e.carrying ? 1 : 0
        ]);
      }
      var ev = game.netEvents ? game.netEvents.splice(0, game.netEvents.length) : [];
      return { len: game.entities.length, t: q(game.elapsed, 2), m: game.hudInfo(), p: players, ev: ev };
    },

    applySnapshot: function (game, snap) {
      if (!snap || !snap.p) return;
      game.netHud = snap.m;
      for (var i = 0; i < snap.p.length; i++) {
        var row = snap.p[i];
        var ent = game.netEntities[row[0]];
        if (!ent && game.player && row[0] === game.player.netId) {
          game.applySelfSnapshot(row);
          continue;
        }
        if (!ent) ent = game.spawnNetEntity(row[0]);
        ent.netTarget = { x: row[1], y: row[2], z: row[3], yaw: row[4], pitch: row[5] };
        ent.health = row[6];
        ent.armor = row[7];
        var alive = row[8] === 1;
        if (ent.alive !== alive) {
          ent.alive = alive;
          if (ent.group) ent.group.visible = alive;
          if (ent.avatar && ent.avatar.group) ent.avatar.group.visible = alive;
        }
        var w = B.WEAPONS[row[9] - 1];
        if (w) ent.weapon = w.id;
        ent.netMag = row[10];
        ent.netReserve = row[11];
        ent.kills = row[12];
        ent.deaths = row[13];
        ent.score = row[14];
        ent.carrying = row[15] === 1;
      }
      if (snap.ev) for (var k = 0; k < snap.ev.length; k++) game.applyNetEvent(snap.ev[k]);
    },

    applyRoster: function (game, roster) {
      if (!roster) return;
      for (var i = 0; i < roster.length; i++) {
        var r = roster[i];
        if (game.netClient && game.player && r[0] === game.player.netId) continue;
        var ent = game.netEntities[r[0]] || game.spawnNetEntity(r[0]);
        ent.name = r[1];
        ent.team = r[2] || null;
        ent.isBot = r[3] === 1;
        ent.kind = r[4];
      }
    },

    /* --------------------------- enlace WebRTC --------------------------- */

    host: function (onStatus) {
      var self = this;
      self.role = "host";
      self.connected = false;
      self.lastError = "";
      var pc = new RTCPeerConnection({ iceServers: STUN });
      var fast = pc.createDataChannel("bb-fast", { ordered: false, maxRetransmits: 0 });
      var rel = pc.createDataChannel("bb-rel", { ordered: true });
      self._wire(pc, onStatus, fast, rel);
      return pc.createOffer()
        .then(function (off) { return pc.setLocalDescription(off); })
        .then(function () { return waitIce(pc); })
        .then(function () { return encode(pc.localDescription.sdp); })
        .catch(function (e) { self.lastError = e.message; throw e; });
    },

    join: function (offerCode, onStatus) {
      var self = this;
      self.role = "guest";
      self.connected = false;
      self.lastError = "";
      var pc = new RTCPeerConnection({ iceServers: STUN });
      self._wire(pc, onStatus, null, null);
      return decode(offerCode)
        .then(function (sdp) { return pc.setRemoteDescription({ type: "offer", sdp: sdp }); })
        .then(function () { return pc.createAnswer(); })
        .then(function (ans) { return pc.setLocalDescription(ans); })
        .then(function () { return waitIce(pc); })
        .then(function () { return encode(pc.localDescription.sdp); })
        .catch(function (e) { self.lastError = e.message; throw e; });
    },

    acceptAnswer: function (answerCode) {
      var self = this;
      if (!self.link || !self.link.pc) return Promise.reject(new Error("no hay oferta activa"));
      return decode(answerCode).then(function (sdp) {
        return self.link.pc.setRemoteDescription({ type: "answer", sdp: sdp });
      });
    },

    _wire: function (pc, onStatus, fast, rel) {
      var self = this;
      var link = { pc: pc, fast: null, rel: null, isHost: self.role === "host" };
      self.link = link;
      if (onStatus) self._onStatus = onStatus;

      function ready() {
        if (link.fast && link.rel &&
          link.fast.readyState === "open" && link.rel.readyState === "open" && !self.connected) {
          self.connected = true;
          self.active = true;
          if (self._onStatus) self._onStatus("connected");
        }
      }
      function attach(channel) {
        if (!channel) return;
        if (channel.label === "bb-fast") link.fast = channel; else link.rel = channel;
        channel.addEventListener("open", function () { ready(); self._flush(); });
        channel.addEventListener("message", function (ev) { self._onData(ev.data); });
        channel.addEventListener("close", function () {
          self.connected = false;
          self.active = false;
          if (self._onStatus) self._onStatus("closed");
        });
      }

      if (fast) attach(fast);
      if (rel) attach(rel);
      pc.addEventListener("datachannel", function (ev) { attach(ev.channel); ready(); });
      pc.addEventListener("connectionstatechange", function () {
        var st = pc.connectionState;
        if (st === "connected") ready();
        if ((st === "failed" || st === "disconnected") && self._onStatus) self._onStatus(st);
      });
    },

    on: function (type, fn) { this.handlers[type] = fn; },
    off: function () { this.handlers = {}; },

    _onData: function (raw, peer) {
      var msg;
      try { msg = JSON.parse(raw); } catch (e) { return; }
      if (!msg || !msg.k) return;
      if (msg.k === "pg") { this.sendRel("po", msg.t); return; }
      if (msg.k === "po") { this.ping = Math.max(1, now() - msg.d); return; }
      var fn = this.handlers[msg.k];
      this.received[msg.k] = (this.received[msg.k] || 0) + 1;
      if (fn) fn(msg.d, msg.t, peer);
    },

    _send: function (kind, payload, fast) {
      var link = this.link;
      if (!link) return false;
      return this._sendLink(link, kind, payload, fast);
    },

    _flush: function () {
      var link = this.link;
      if (link) this._flushLink(link);
    },

    sendFast: function (kind, payload) {
      if (this.room) {
        if (this.isHost) this.broadcast(kind, payload, true); else this.toHost(kind, payload, true);
        return true;
      }
      return this._send(kind, payload, true);
    },
    sendRel: function (kind, payload) {
      if (this.room) {
        if (this.isHost) this.broadcast(kind, payload, false); else this.toHost(kind, payload, false);
        return true;
      }
      return this._send(kind, payload, false);
    },

    close: function () {
      if (this.link && this.link.pc) { try { this.link.pc.close(); } catch (e) { } }
      this.link = null;
      this.active = false;
      this.connected = false;
      this.role = null;
      this.ping = 0;
      this.handlers = {};
    },

    /* ======================= salas por codigo (MQTT) =======================
       Un broker publico solo sirve para que los jugadores se encuentren; el juego
       va despues directo entre navegadores. El anfitrion es la autoridad y mantiene
       una conexion por jugador (estrella). */

    room: null,
    peers: null,
    stats: {},
    received: {},
    lastSkip: "",
    lastSendError: "",
    maxPlayers: MAX_PLAYERS,
    mqtt: null,
    peerId: null,
    isHost: false,

    openRoom: function (code, name, asHost, onStatus) {
      var self = this;
      this.room = String(code || roomCode()).toUpperCase();
      this.peerId = shortId();
      this.isHost = !!asHost;
      this.peers = {};
      this.role = asHost ? "host" : "guest";
      this.connected = false;
      this.active = false;
      this.lastError = "";
      this._onStatus = onStatus;
      this.peerName = name || (asHost ? "Anfitrion" : "Invitado");

      var base = baseTopic(this.room);
      var url = MQTT_URLS[0];
      var mq = new B.Mqtt(url, "bb-" + this.room + "-" + this.peerId).connect();
      this.mqtt = mq;
      this.topicBase = base;
      this.topicMe = base + "/" + this.peerId;

      mq.on("open", function () {
        self.subscribed = 0;
        mq.subscribe(self.topicMe);
        if (asHost) mq.subscribe(base + "/all");
        if (self._onStatus) self._onStatus("signaling");
      });
      mq.on("suback", function () {
        self.subscribed++;
        if (self.subscribed < (asHost ? 2 : 1)) return;
        if (asHost) self._hostAnnounce();
        else self._guestHello();
      });
      mq.on("message", function (topic, text) { self._onSig(topic, text); });
      mq.on("error", function (e) {
        if (self._onStatus) self._onStatus("mqtt-error");
        void e;
      });
      mq.on("close", function () {
        if (self.connected || self._onStatus) self._onStatus("mqtt-closed");
      });
      return this.room;
    },

    leaveRoom: function () {
      var self = this;
      var ids = Object.keys(this.peers || {});
      ids.forEach(function (id) { self._sig("closed", { to: id }); });
      ids.forEach(function (id) {
        var p = self.peers[id];
        if (p && p.pc) { try { p.pc.close(); } catch (e) { } }
      });
      this.peers = {};
      if (this.mqtt) { try { this.mqtt.close(); } catch (e) { } }
      this.mqtt = null;
      if (this._helloTimer) clearInterval(this._helloTimer);
      if (this._beatTimer) clearInterval(this._beatTimer);
      this.room = null;
      this.active = false;
      this.connected = false;
      this.role = null;
      this.mqttConnected = false;
    },

    _sig: function (type, extra) {
      var msg = { type: type, from: this.peerId, name: this.peerName };
      if (extra) for (var k in extra) msg[k] = extra[k];
      if (this.mqtt) this.mqtt.publish(this.topicBase + "/" + (msg.to || "all"), JSON.stringify(msg));
    },

    _hostAnnounce: function () {
      var self = this;
      var beat = function () {
        if (self.isHost) self._sig("host");
      };
      beat();
      if (this._helloTimer) clearInterval(this._helloTimer);
      this._helloTimer = setInterval(beat, HELLO_MS * 2);
      if (this._onStatus) this._onStatus("room-open");
    },

    _guestHello: function () {
      var self = this;
      var beat = function () {
        if (!self.connected) self._sig("hello");
      };
      beat();
      if (this._helloTimer) clearInterval(this._helloTimer);
      this._helloTimer = setInterval(beat, HELLO_MS);
      if (this._onStatus) this._onStatus("searching");
    },

    _onSig: function (topic, text) {
      var self = this;
      var m;
      try { m = JSON.parse(text); } catch (e) { return; }
      if (!m || m.from === this.peerId) return;

      if (this.isHost) {
        if (m.type === "hello") return this._hostOffer(m.from, m.name);
        if (m.type === "answer") return this._hostAnswer(m.from, m.sdp);
        return;
      }
      // Invitado: solo escucha al anfitrion
      if (m.type === "offer" && !this.link) return this._guestAnswer(m.sdp);
      if (m.type === "full" && this._onStatus) return this._onStatus("room-full");
      if (m.type === "closed" && this._onStatus) this._onStatus("room-closed");
      void topic;
    },

    _hostOffer: function (guestId, guestName) {
      var self = this;
      if (this.peers[guestId]) return;
      if (Object.keys(this.peers).length >= MAX_PLAYERS - 1) {
        this._sig("full", { to: guestId });
        return;
      }
      var pc = new RTCPeerConnection({ iceServers: ICE });
      var peer = { id: guestId, name: guestName || "Jugador", pc: pc, fast: null, rel: null, connected: false };
      this.peers[guestId] = peer;
      this._wirePeer(peer, true);
      pc.createOffer()
        .then(function (o) { return pc.setLocalDescription(o); })
        .then(function () { return waitIce(pc); })
        .then(function () { self._sig("offer", { sdp: pc.localDescription.sdp, to: guestId }); })
        .catch(function (e) { self.lastError = e.message; delete self.peers[guestId]; });
    },

    _hostAnswer: function (guestId, sdp) {
      var peer = this.peers[guestId];
      if (peer && peer.pc) peer.pc.setRemoteDescription({ type: "answer", sdp: sdp }).catch(function () { });
    },

    _guestAnswer: function (offerSdp) {
      var self = this;
      var pc = new RTCPeerConnection({ iceServers: ICE });
      var link = { pc: pc, fast: null, rel: null, isHost: false };
      this.link = link;
      pc.addEventListener("datachannel", function (ev) { self._peerChannel(link, ev.channel, null); });
      pc.setRemoteDescription({ type: "offer", sdp: offerSdp })
        .then(function () { return pc.createAnswer(); })
        .then(function (a) { return pc.setLocalDescription(a); })
        .then(function () { return waitIce(pc); })
        .then(function () { self._sig("answer", { sdp: pc.localDescription.sdp }); })
        .catch(function (e) { self.lastError = e.message; });
    },

    _wirePeer: function (peer, isHost) {
      var self = this;
      var fast = peer.pc.createDataChannel("bb-fast", { ordered: false, maxRetransmits: 0 });
      var rel = peer.pc.createDataChannel("bb-rel", { ordered: true });
      var link = { pc: peer.pc, fast: null, rel: null, isHost: isHost, peer: peer };
      this._peerChannel(link, fast, peer);
      this._peerChannel(link, rel, peer);
      peer.link = link;
      peer.pc.addEventListener("datachannel", function (ev) { self._peerChannel(link, ev.channel, peer); });
      peer.pc.addEventListener("connectionstatechange", function () {
        var st = peer.pc.connectionState;
        if (st === "failed" || st === "disconnected" || st === "closed") self._peerGone(peer.id);
      });
    },

    _peerChannel: function (link, channel, peer) {
      var self = this;
      if (!channel) return;
      if (channel.label === "bb-fast") link.fast = channel; else link.rel = channel;
      channel.addEventListener("open", function () {
        if (link.fast && link.rel && link.fast.readyState === "open" && link.rel.readyState === "open") {
          if (peer) peer.connected = true;
          self.connected = true;
          self.active = true;
          link.outbox = link.outbox || [];
          self._flushLink(link);
          if (self._onStatus) self._onStatus("peer-connected", peer ? peer.id : "host");
        }
      });
      channel.addEventListener("message", function (ev) { self._onData(ev.data, peer); });
      channel.addEventListener("close", function () { if (peer) self._peerGone(peer.id); });
    },

    _flushLink: function (link) {
      if (!link.outbox || !link.rel || link.rel.readyState !== "open") return;
      var q = link.outbox.splice(0, link.outbox.length);
      for (var i = 0; i < q.length; i++) { try { link.rel.send(q[i]); } catch (e) { } }
    },

    _peerGone: function (id) {
      var p = this.peers[id];
      if (!p) return;
      if (p.pc) { try { p.pc.close(); } catch (e) { } }
      delete this.peers[id];
      if (this._onStatus) this._onStatus("peer-left", id);
    },

    playerCount: function () {
      var n = 0;
      var list = this.peers || {};
      for (var k in list) if (list[k] && list[k].connected) n++;
      return n + 1;
    },

    peerList: function () {
      var out = [];
      var list = this.peers || {};
      for (var k in list) if (list[k]) out.push({ id: k, name: list[k].name, connected: !!list[k].connected });
      return out;
    },

    /* Envio en estrella: el anfitrion difunde a todos; el invitado habla con el anfitrion */
    broadcast: function (kind, payload, fast) {
      var list = this.peers || {};
      for (var k in list) if (list[k] && list[k].connected) this._sendToPeer(list[k], kind, payload, fast);
    },
    toHost: function (kind, payload, fast) {
      if (this.link) this._sendLink(this.link, kind, payload, fast);
    },
    sendTo: function (peerId, kind, payload, fast) {
      var p = this.peers && this.peers[peerId];
      if (p) this._sendToPeer(p, kind, payload, fast);
    },
    _sendToPeer: function (peer, kind, payload, fast) {
      if (peer && peer.link) this._sendLink(peer.link, kind, payload, fast);
    },
    _sendLink: function (link, kind, payload, fast) {
      var ch = fast ? (link.fast || link.rel) : (link.rel || link.fast);
      this.stats[kind + "_try"] = (this.stats[kind + "_try"] || 0) + 1;
      if (!ch || ch.readyState !== "open") {
        this.lastSkip = kind + ":" + (ch ? ch.readyState : "sin-canal");
        var msg0 = JSON.stringify({ k: kind, t: now(), d: payload });
        if (!fast) (link.outbox || (link.outbox = [])).push(msg0);
        return false;
      }
      var msg = JSON.stringify({ k: kind, t: now(), d: payload });
      try { ch.send(msg); this.stats[kind] = (this.stats[kind] || 0) + 1; return true; }
      catch (e) { this.lastSendError = kind + ": " + String((e && e.message) || e); return false; }
    },

    status: function () {
      if (!this.active) return "SIN CONEXION";
      return this.connected ? ("EN LINEA  " + this.ping + " ms") : "CONECTANDO...";
    }
  };

  B.Net = Net;
  B.Net.codec = { encode: encode, decode: decode };
})();
