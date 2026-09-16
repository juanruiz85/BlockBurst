/* BLOCKBURST - utilidades compartidas */
(function () {
  'use strict';
  var B = (window.BLITZ = window.BLITZ || {});

  B.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  B.lerp = function (a, b, t) { return a + (b - a) * t; };
  B.rand = function (a, b) { return a + Math.random() * (b - a); };
  B.randInt = function (a, b) { return Math.floor(a + Math.random() * (b - a + 1)); };
  B.pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };
  B.sign = function (v) { return v < 0 ? -1 : v > 0 ? 1 : 0; };
  B.deg = function (r) { return (r * 180) / Math.PI; };
  B.rad = function (d) { return (d * Math.PI) / 180; };
  B.dist2 = function (ax, az, bx, bz) { var dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; };
  B.dist = function (ax, az, bx, bz) { return Math.sqrt(B.dist2(ax, az, bx, bz)); };
  B.angleLerp = function (a, b, t) {
    var d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  };
  B.shuffle = function (arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  };
  B.formatTime = function (sec) {
    sec = Math.max(0, Math.ceil(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ":" + (s < 10 ? "0" : "") + s;
  };
  B.num = function (n) { return String(Math.round(n)); };

  /* RNG determinista (mulberry32) para que los mapas sean estables entre sesiones */
  B.rng = function (seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  B.esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };

  B.storage = {
    get: function (key, fallback) {
      try {
        var raw = window.localStorage.getItem("blockburst." + key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch (e) { return fallback; }
    },
    set: function (key, value) {
      try { window.localStorage.setItem("blockburst." + key, JSON.stringify(value)); } catch (e) { /* modo privado */ }
    }
  };
})();
