/* BLOCKBURST - entrada: teclado, raton, pointer lock */
(function () {
  'use strict';
  var B = (window.BLITZ = window.BLITZ || {});

  var keys = Object.create(null);
  var pressedOnce = Object.create(null);
  var mouseDX = 0, mouseDY = 0;
  var buttons = Object.create(null);
  var clickedOnce = Object.create(null);
  var wheel = 0;
  var locked = false;
  var canvas = null;
  var onLockChange = null;
  var listeners = [];

  var BLOCK = {
    Space: 1, Tab: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1,
    KeyW: 1, KeyA: 1, KeyS: 1, KeyD: 1, KeyQ: 1, KeyE: 1, Digit1: 1, Digit2: 1,
    Digit3: 1, Digit4: 1, Digit5: 1, Digit6: 1, Digit7: 1, KeyR: 1, KeyV: 1, KeyC: 1, KeyF: 1
  };

  function onKeyDown(e) {
    if (e.repeat) {
      if (BLOCK[e.code]) e.preventDefault();
      return;
    }
    keys[e.code] = true;
    pressedOnce[e.code] = true;
    if (BLOCK[e.code]) e.preventDefault();
    for (var i = 0; i < listeners.length; i++) listeners[i](e.code, e);
  }

  function onKeyUp(e) {
    keys[e.code] = false;
    if (BLOCK[e.code]) e.preventDefault();
  }

  function onMouseMove(e) {
    if (!locked) return;
    mouseDX += e.movementX || 0;
    mouseDY += e.movementY || 0;
  }

  function onMouseDown(e) {
    if (!locked) return;
    buttons[e.button] = true;
    clickedOnce[e.button] = true;
    if (e.button === 0 || e.button === 2) e.preventDefault();
  }

  function onMouseUp(e) { buttons[e.button] = false; }

  function onWheel(e) {
    if (!locked) return;
    wheel += e.deltaY > 0 ? 1 : -1;
    e.preventDefault();
  }

  function onContext(e) { e.preventDefault(); }

  function onPointerLockChange() {
    locked = document.pointerLockElement === canvas;
    if (!locked) { buttons = Object.create(null); keys = Object.create(null); }
    if (onLockChange) onLockChange(locked);
  }

  B.Input = {
    init: function (cv) {
      canvas = cv;
      window.addEventListener("keydown", onKeyDown, { passive: false });
      window.addEventListener("keyup", onKeyUp, { passive: false });
      window.addEventListener("blur", function () { keys = Object.create(null); buttons = Object.create(null); });
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mousedown", onMouseDown);
      document.addEventListener("mouseup", onMouseUp);
      document.addEventListener("wheel", onWheel, { passive: false });
      document.addEventListener("contextmenu", onContext);
      document.addEventListener("pointerlockchange", onPointerLockChange);
      return this;
    },
    onLockChange: function (fn) { onLockChange = fn; },
    onKey: function (fn) { listeners.push(fn); },
    lock: function () {
      if (canvas && canvas.requestPointerLock) {
        var p = canvas.requestPointerLock();
        if (p && p.catch) p.catch(function () { /* el navegador pedira gesto del usuario */ });
      }
    },
    unlock: function () { if (document.exitPointerLock) document.exitPointerLock(); },
    isLocked: function () { return locked; },
    down: function (code) { return !!keys[code]; },
    once: function (code) { if (pressedOnce[code]) { pressedOnce[code] = false; return true; } return false; },
    mouse: function (btn) { return !!buttons[btn]; },
    mouseOnce: function (btn) { if (clickedOnce[btn]) { clickedOnce[btn] = false; return true; } return false; },
    takeWheel: function () { var w = wheel; wheel = 0; return w; },
    takeLook: function () { var d = { dx: mouseDX, dy: mouseDY }; mouseDX = 0; mouseDY = 0; return d; },
    clearFrame: function () { pressedOnce = Object.create(null); clickedOnce = Object.create(null); },
    moveAxis: function () {
      var x = 0, z = 0;
      if (keys.KeyW || keys.ArrowUp) z += 1;
      if (keys.KeyS || keys.ArrowDown) z -= 1;
      if (keys.KeyA || keys.ArrowLeft) x -= 1;
      if (keys.KeyD || keys.ArrowRight) x += 1;
      var len = Math.hypot(x, z);
      if (len > 1) { x /= len; z /= len; }
      return { x: x, z: z };
    }
  };
})();
