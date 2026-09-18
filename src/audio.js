/* BLOCKBURST - audio sintetizado con WebAudio (sin archivos externos) */
(function () {
  'use strict';
  var B = (window.BLITZ = window.BLITZ || {});

  var ctx = null;
  var master = null;
  var noiseBuf = null;
  var enabled = true;

  function ensure() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { enabled = false; return null; }
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.7;
    master.connect(ctx.destination);

    var len = Math.floor(ctx.sampleRate * 1.2);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = noiseBuf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return ctx;
  }

  function setVolume(v) {
    ensure();
    if (master) master.gain.value = B.clamp(v, 0, 1);
  }

  function resume() {
    var c = ensure();
    if (c && c.state === "suspended") {
      var p = c.resume();
      if (p && p.catch) p.catch(function () { /* el navegador exige un gesto del usuario */ });
    }
  }

  function tone(opt) {
    if (!enabled) return;
    var c = ensure();
    if (!c) return;
    var t0 = c.currentTime + (opt.delay || 0);
    var osc = c.createOscillator();
    var g = c.createGain();
    osc.type = opt.type || "square";
    osc.frequency.setValueAtTime(opt.freq, t0);
    if (opt.to) osc.frequency.exponentialRampToValueAtTime(Math.max(30, opt.to), t0 + opt.dur);
    var peak = opt.gain == null ? 0.22 : opt.gain;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + (opt.attack || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opt.dur);
    osc.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + opt.dur + 0.02);
  }

  function noise(opt) {
    if (!enabled) return;
    var c = ensure();
    if (!c) return;
    var t0 = c.currentTime + (opt.delay || 0);
    var src = c.createBufferSource();
    src.buffer = noiseBuf;
    var f = c.createBiquadFilter();
    f.type = opt.filter || "bandpass";
    f.frequency.setValueAtTime(opt.freq || 900, t0);
    if (opt.to) f.frequency.exponentialRampToValueAtTime(Math.max(60, opt.to), t0 + opt.dur);
    f.Q.value = opt.q == null ? 1.1 : opt.q;
    var g = c.createGain();
    var peak = opt.gain == null ? 0.3 : opt.gain;
    g.gain.setValueAtTime(peak, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opt.dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0); src.stop(t0 + opt.dur + 0.02);
  }

  B.Audio = {
    resume: resume,
    setVolume: setVolume,
    ready: function () { return !!ctx; },
    setEnabled: function (v) { enabled = v; },

    shoot: function (kind) {
      if (kind === "sniper") { noise({ freq: 2400, to: 180, dur: 0.4, gain: 0.42, filter: "lowpass" }); tone({ freq: 190, to: 50, dur: 0.32, type: "sawtooth", gain: 0.28 }); }
      else if (kind === "shotgun") { noise({ freq: 1500, to: 160, dur: 0.34, gain: 0.46, filter: "lowpass", q: 0.7 }); tone({ freq: 130, to: 42, dur: 0.28, type: "square", gain: 0.3 }); }
      else if (kind === "rocket") { noise({ freq: 700, to: 120, dur: 0.5, gain: 0.34, filter: "lowpass" }); tone({ freq: 90, to: 34, dur: 0.5, type: "sawtooth", gain: 0.3 }); }
      else if (kind === "smg") { noise({ freq: 3200, to: 900, dur: 0.07, gain: 0.2, q: 2 }); tone({ freq: 420, to: 180, dur: 0.06, type: "square", gain: 0.14 }); }
      else { noise({ freq: 2600, to: 700, dur: 0.09, gain: 0.24, q: 1.6 }); tone({ freq: 340, to: 130, dur: 0.08, type: "square", gain: 0.16 }); }
    },
    melee: function () { noise({ freq: 1800, to: 420, dur: 0.16, gain: 0.24, q: 0.8, filter: "highpass" }); },
    reload: function () {
      tone({ freq: 300, to: 190, dur: 0.06, type: "square", gain: 0.16 });
      tone({ freq: 240, to: 150, dur: 0.07, type: "square", gain: 0.16, delay: 0.16 });
      tone({ freq: 360, to: 240, dur: 0.07, type: "square", gain: 0.18, delay: 0.42 });
    },
    empty: function () { tone({ freq: 900, to: 700, dur: 0.04, type: "square", gain: 0.1 }); },
    hit: function () { tone({ freq: 1400, to: 900, dur: 0.05, type: "square", gain: 0.14 }); },
    headshot: function () { tone({ freq: 1900, to: 1200, dur: 0.07, type: "square", gain: 0.18 }); tone({ freq: 2600, to: 1700, dur: 0.06, type: "square", gain: 0.12, delay: 0.05 }); },
    hurt: function () { tone({ freq: 220, to: 110, dur: 0.16, type: "sawtooth", gain: 0.24 }); },
    death: function () { tone({ freq: 340, to: 60, dur: 0.55, type: "sawtooth", gain: 0.28 }); noise({ freq: 900, to: 120, dur: 0.5, gain: 0.2 }); },
    kill: function () { tone({ freq: 700, to: 900, dur: 0.07, type: "square", gain: 0.18 }); tone({ freq: 1000, to: 1400, dur: 0.09, type: "square", gain: 0.16, delay: 0.07 }); },
    jump: function () { tone({ freq: 420, to: 680, dur: 0.11, type: "square", gain: 0.14 }); },
    land: function () { noise({ freq: 320, to: 120, dur: 0.1, gain: 0.16, filter: "lowpass" }); },
    pickup: function () { tone({ freq: 720, to: 1180, dur: 0.1, type: "square", gain: 0.18 }); tone({ freq: 1180, to: 1560, dur: 0.09, type: "square", gain: 0.12, delay: 0.08 }); },
    heal: function () { tone({ freq: 520, to: 880, dur: 0.18, type: "sine", gain: 0.2 }); },
    explode: function () { noise({ freq: 900, to: 90, dur: 0.7, gain: 0.5, filter: "lowpass", q: 0.6 }); tone({ freq: 70, to: 28, dur: 0.7, type: "sawtooth", gain: 0.34 }); },
    spawn: function () { tone({ freq: 260, to: 620, dur: 0.18, type: "square", gain: 0.16 }); },
    ui: function () { tone({ freq: 620, to: 820, dur: 0.05, type: "square", gain: 0.1 }); },
    uiBig: function () { tone({ freq: 500, to: 980, dur: 0.13, type: "square", gain: 0.16 }); },
    wave: function () { tone({ freq: 300, to: 720, dur: 0.22, type: "sawtooth", gain: 0.18 }); tone({ freq: 300, to: 720, dur: 0.22, type: "square", gain: 0.1, delay: 0.14 }); },
    win: function () { [523, 659, 784, 1046].forEach(function (f, i) { tone({ freq: f, dur: 0.24, type: "square", gain: 0.18, delay: i * 0.13 }); }); },
    lose: function () { [392, 330, 262, 196].forEach(function (f, i) { tone({ freq: f, dur: 0.3, type: "sawtooth", gain: 0.18, delay: i * 0.16 }); }); }
  };
})();
