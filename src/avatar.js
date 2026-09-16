/* BLOCKBURST - avatares tipo bloque (homage a los personajes de vóxeles sin copiar
   ninguna marca): cabeza, torso, brazos y piernas con animacion de caminata. */
(function () {
  'use strict';
  var B = (window.BLITZ = window.BLITZ || {});

  var SKIN = ["#f2c08a", "#d99b63", "#a86b3c", "#7d4a26", "#5a3418", "#f7d7b0"];
  var SHIRTS = ["#ff7a1a", "#34d6f0", "#8ede5a", "#ffc63d", "#c86bff", "#ff5252", "#4b8dff", "#f4f7ff"];
  var PANTS = ["#2b3444", "#1f6feb", "#3d8b4f", "#7a3d2e", "#4a4f63", "#b4451f"];

  function box(w, h, d, color, x, y, z) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), B.World.material(color));
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  function faceTexture(skin, eye, brow, mood) {
    var c = document.createElement("canvas");
    c.width = c.height = 64;
    var g = c.getContext("2d");
    g.fillStyle = skin; g.fillRect(0, 0, 64, 64);
    // ojos
    g.fillStyle = "#1b1b22";
    g.fillRect(16, 24, 8, 9);
    g.fillRect(40, 24, 8, 9);
    // brillo
    g.fillStyle = "#ffffff";
    g.fillRect(18, 26, 3, 3);
    g.fillRect(42, 26, 3, 3);
    // boca
    g.fillStyle = eye || "#1b1b22";
    if (mood === "angry") { g.fillRect(22, 46, 20, 4); g.fillRect(18, 40, 4, 5); g.fillRect(42, 40, 4, 5); }
    else if (mood === "happy") { g.fillRect(22, 44, 20, 4); g.fillRect(18, 40, 4, 5); g.fillRect(42, 40, 4, 5); }
    else { g.fillRect(24, 45, 16, 4); }
    if (brow) { g.fillStyle = brow; g.fillRect(14, 18, 12, 3); g.fillRect(38, 18, 12, 3); }
    var t = new THREE.CanvasTexture(c);
    return t;
  }

  /* Construye un avatar. opts: {shirt, pants, skin, hat, mood, team} */
  B.Avatar = {
    build: function (opts) {
      opts = opts || {};
      var shirt = opts.shirt || B.pick(SHIRTS);
      var pants = opts.pants || B.pick(PANTS);
      var skin = opts.skin || B.pick(SKIN);
      var g = new THREE.Group();

      var torso = box(0.62, 0.72, 0.34, shirt, 0, 1.16, 0);
      var head = new THREE.Mesh(
        new THREE.BoxGeometry(0.52, 0.5, 0.52),
        new THREE.MeshLambertMaterial({ map: faceTexture(skin, "#1b1b22", opts.team === "blue" ? "#1b3a66" : null, opts.mood) })
      );
      head.position.set(0, 1.78, 0);
      head.castShadow = true; head.receiveShadow = true;

      var armL = new THREE.Group();
      var armLm = box(0.24, 0.66, 0.24, skin, 0, -0.33, 0);
      armL.add(armLm); armL.position.set(-0.44, 1.48, 0);
      var armR = new THREE.Group();
      var armRm = box(0.24, 0.66, 0.24, skin, 0, -0.33, 0);
      armR.add(armRm); armR.position.set(0.44, 1.48, 0);

      var legL = new THREE.Group();
      var legLm = box(0.26, 0.8, 0.26, pants, 0, -0.4, 0);
      legL.add(legLm); legL.position.set(-0.17, 0.8, 0);
      var legR = new THREE.Group();
      var legRm = box(0.26, 0.8, 0.26, pants, 0, -0.4, 0);
      legR.add(legRm); legR.position.set(0.17, 0.8, 0);

      g.add(torso, head, armL, armR, legL, legR);

      // Gorra / casco opcional
      if (opts.hat === "helmet") {
        g.add(box(0.58, 0.2, 0.58, opts.team === "red" ? "#ff5252" : opts.team === "blue" ? "#4b8dff" : "#34d6f0", 0, 2.08, 0));
      } else if (opts.hat === "cap") {
        g.add(box(0.56, 0.14, 0.56, shirt, 0, 2.04, 0));
        g.add(box(0.5, 0.06, 0.16, shirt, 0, 2.0, 0.34));
      }

      return {
        group: g, head: head, torso: torso,
        armL: armL, armR: armR, legL: legL, legR: legR,
        shirt: shirt, pants: pants, skin: skin,
        phase: Math.random() * 6.28
      };
    },

    /* speed: 0..1 respecto a la velocidad maxima; grounded: bool */
    update: function (av, dt, speed, grounded) {
      av.phase += dt * (5.2 * (0.4 + speed));
      var amp = grounded ? 0.55 * (0.25 + speed) : 0.15;
      var s = Math.sin(av.phase) * amp;
      av.armL.rotation.x = s + (grounded ? 0 : -0.5);
      av.armR.rotation.x = -s + (grounded ? 0 : -0.5);
      av.legL.rotation.x = -s * 0.9;
      av.legR.rotation.x = s * 0.9;
      av.torso.position.y = 1.16 + (grounded ? Math.abs(Math.cos(av.phase)) * 0.03 * speed : 0.04);
      av.head.rotation.y = Math.sin(av.phase * 0.3) * 0.05 * speed;
    },

    /* Poses para la vista de tercera persona / armas */
    aim: function (av, pitch) {
      var p = B.clamp(pitch, -1.1, 1.1);
      av.armR.rotation.x = -1.45 + p * 0.7;
      av.armL.rotation.x = -1.25 + p * 0.7;
    }
  };
})();
