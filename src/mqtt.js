/* BLOCKBURST - cliente MQTT 3.1.1 minimo sobre WebSocket.
   Solo lo imprescindible para la senalizacion de las salas: conectar, suscribirse,
   publicar (QoS 0), latido y desconectar. Sin dependencias.

   Se apoya en un broker publico (por defecto broker.emqx.io), que solo interviene
   mientras los jugadores se encuentran; despues el juego va directo entre navegadores. */
(function () {
  'use strict';
  var B = (window.BLITZ = window.BLITZ || {});

  var T = { CONNECT: 1, CONNACK: 2, PUBLISH: 3, SUBACK: 9, PINGRESP: 13 };

  function utf8(s) {
    if (typeof TextEncoder === 'function') return new TextEncoder().encode(s);
    var out = [];
    for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i) & 0xff);
    return new Uint8Array(out);
  }
  function decode(bytes) {
    if (typeof TextDecoder === 'function') return new TextDecoder().decode(bytes);
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return s;
  }
  function strField(s) {
    var b = utf8(s);
    var out = new Uint8Array(b.length + 2);
    out[0] = (b.length >> 8) & 0xff;
    out[1] = b.length & 0xff;
    out.set(b, 2);
    return out;
  }
  function varLen(n) {
    var out = [];
    do {
      var d = n % 128;
      n = Math.floor(n / 128);
      if (n > 0) d |= 128;
      out.push(d);
    } while (n > 0);
    return out;
  }
  function packet(type, flags, parts) {
    var len = 0, i;
    for (i = 0; i < parts.length; i++) len += parts[i].length;
    var head = [((type << 4) | flags) & 0xff].concat(varLen(len));
    var out = new Uint8Array(head.length + len);
    out.set(head, 0);
    var off = head.length;
    for (i = 0; i < parts.length; i++) { out.set(parts[i], off); off += parts[i].length; }
    return out;
  }

  function Mqtt(url, clientId, opts) {
    opts = opts || {};
    this.url = url;
    this.clientId = clientId;
    this.keepalive = opts.keepalive || 45;
    this.handlers = { open: [], message: [], close: [], error: [], suback: [] };
    this.pid = 1;
    this.buf = new Uint8Array(0);
    this.ws = null;
    this.connected = false;
    this._timer = null;
    this.closed = false;
  }

  Mqtt.prototype.on = function (evt, fn) {
    (this.handlers[evt] || (this.handlers[evt] = [])).push(fn);
    return this;
  };
  Mqtt.prototype._emit = function (evt, a, b) {
    var list = this.handlers[evt] || [];
    for (var i = 0; i < list.length; i++) {
      try { list[i](a, b); } catch (e) { /* un fallo en un manejador no corta el flujo */ }
    }
  };

  Mqtt.prototype.connect = function () {
    var self = this;
    try {
      this.ws = new WebSocket(this.url, 'mqtt');
      this.ws.binaryType = 'arraybuffer';
    } catch (e) {
      this._emit('error', e);
      return this;
    }
    this.ws.addEventListener('open', function () {
      self._raw(packet(T.CONNECT, 0, [
        strField('MQTT'),
        new Uint8Array([4, 0x02, (self.keepalive >> 8) & 0xff, self.keepalive & 0xff]),
        strField(self.clientId)
      ]));
    });
    this.ws.addEventListener('message', function (ev) {
      var data = ev.data;
      if (typeof data === 'string') return;
      var bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer || data);
      self._feed(bytes);
    });
    this.ws.addEventListener('close', function () {
      self.connected = false;
      if (self._timer) clearInterval(self._timer);
      if (!self.closed) self._emit('close');
    });
    this.ws.addEventListener('error', function (e) { self._emit('error', e); });
    return this;
  };

  Mqtt.prototype._raw = function (bytes) {
    if (this.ws && this.ws.readyState === 1) {
      try { this.ws.send(bytes); } catch (e) { this._emit('error', e); }
    }
  };

  Mqtt.prototype.subscribe = function (topic) {
    this.pid = (this.pid % 60000) + 1;
    this._raw(packet(8, 2, [
      new Uint8Array([(this.pid >> 8) & 0xff, this.pid & 0xff]),
      strField(topic),
      new Uint8Array([0])
    ]));
    return this;
  };

  Mqtt.prototype.publish = function (topic, text) {
    this._raw(packet(3, 0, [strField(topic), utf8(text)]));
    return this;
  };

  Mqtt.prototype.close = function () {
    this.closed = true;
    if (this._timer) clearInterval(this._timer);
    try { this._raw(packet(14, 0, [])); } catch (e) { }
    try { if (this.ws) this.ws.close(); } catch (e) { }
    this.connected = false;
  };

  Mqtt.prototype._pingLoop = function () {
    var self = this;
    if (this._timer) clearInterval(this._timer);
    this._timer = setInterval(function () {
      if (self.connected) self._raw(packet(12, 0, []));
    }, Math.max(5, this.keepalive / 2) * 1000);
  };

  Mqtt.prototype._feed = function (chunk) {
    var all = new Uint8Array(this.buf.length + chunk.length);
    all.set(this.buf, 0);
    all.set(chunk, this.buf.length);
    this.buf = all;

    for (;;) {
      if (this.buf.length < 2) return;
      var type = this.buf[0] >> 4;
      var i = 1, mult = 1, len = 0, digit;
      do {
        if (i >= this.buf.length) return;
        digit = this.buf[i++];
        len += (digit & 127) * mult;
        mult *= 128;
      } while (digit & 128);
      var total = i + len;
      if (this.buf.length < total) return;
      var body = this.buf.subarray(i, total);
      this.buf = new Uint8Array(this.buf.subarray(total));
      this._handle(type, body);
    }
  };

  Mqtt.prototype._handle = function (type, body) {
    if (type === T.CONNACK) {
      this.connected = true;
      this._pingLoop();
      this._emit('open');
      return;
    }
    if (type === T.PUBLISH) {
      var tlen = (body[0] << 8) | body[1];
      var topic = decode(body.subarray(2, 2 + tlen));
      var text = decode(body.subarray(2 + tlen));
      this._emit('message', topic, text);
      return;
    }
    if (type === T.SUBACK) {
      var pid = (body[0] << 8) | body[1];
      this._emit('suback', pid);
    }
  };

  B.Mqtt = Mqtt;
  B.Mqtt.util = { packet: packet, strField: strField, utf8: utf8, decode: decode, T: T };
})();
