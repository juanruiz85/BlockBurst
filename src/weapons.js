/* BLOCKBURST - armas: definiciones, viewmodel de bloques y utilidades de disparo */
(function () {
  'use strict';
  var B = (window.BLITZ = window.BLITZ || {});

  var WEAPONS = [
    {
      id: "pistol", slot: 1, name: "PISTOLA", short: "PST", kind: "hitscan", color: "#c9d3e6", hud: "#c9d3e6",
      damage: 26, rpm: 400, mag: 12, reserve: 72, spread: 0.9, adsSpread: 0.35, pellets: 1,
      range: 120, falloffStart: 26, falloffEnd: 70, falloffMin: 0.62, auto: false,
      reload: 1.15, recoil: 0.85, kick: 0.05, sfx: "pistol", headMul: 2.0
    },
    {
      id: "smg", slot: 2, name: "SUBFUSIL", short: "SMG", kind: "hitscan", color: "#8ede5a", hud: "#8ede5a",
      damage: 15, rpm: 880, mag: 34, reserve: 170, spread: 1.7, adsSpread: 0.9, pellets: 1,
      range: 90, falloffStart: 18, falloffEnd: 52, falloffMin: 0.55, auto: true,
      reload: 1.5, recoil: 0.42, kick: 0.03, sfx: "smg", headMul: 1.6
    },
    {
      id: "shotgun", slot: 3, name: "ESCOPETA", short: "ESC", kind: "hitscan", color: "#ffc63d", hud: "#ffc63d",
      damage: 13, rpm: 76, mag: 6, reserve: 36, spread: 5.4, adsSpread: 3.6, pellets: 8,
      range: 40, falloffStart: 6, falloffEnd: 22, falloffMin: 0.2, auto: false,
      reload: 2.2, recoil: 2.7, kick: 0.13, sfx: "shotgun", headMul: 1.5
    },
    {
      id: "rifle", slot: 4, name: "RIFLE", short: "RIF", kind: "hitscan", color: "#34d6f0", hud: "#34d6f0",
      damage: 23, rpm: 600, mag: 30, reserve: 150, spread: 1.1, adsSpread: 0.45, pellets: 1,
      range: 140, falloffStart: 34, falloffEnd: 90, falloffMin: 0.7, auto: true,
      reload: 1.9, recoil: 0.62, kick: 0.045, sfx: "rifle", headMul: 2.0
    },
    {
      id: "sniper", slot: 5, name: "FRANCOTIRADOR", short: "SNP", kind: "hitscan", color: "#c86bff", hud: "#c86bff",
      damage: 96, rpm: 46, mag: 5, reserve: 25, spread: 0.12, adsSpread: 0.01, pellets: 1,
      range: 220, falloffStart: 200, falloffEnd: 260, falloffMin: 0.9, auto: false,
      reload: 2.7, recoil: 3.4, kick: 0.16, sfx: "sniper", headMul: 2.4, zoom: 3.4
    },
    {
      id: "katana", slot: 6, name: "KATANA", short: "KAT", kind: "melee", color: "#f4f7ff", hud: "#f4f7ff",
      damage: 68, range: 3.4, arc: 1.1, mag: 0, reserve: 0, reload: 0, recoil: 1.4, kick: 0.05,
      rpm: 110, auto: false, sfx: "melee", headMul: 1.0
    },
    {
      id: "rocket", slot: 7, name: "LANZACOHETES", short: "RCK", kind: "projectile", color: "#ff7a1a", hud: "#ff7a1a",
      damage: 105, splash: 5.2, splashDmg: 78, rpm: 52, mag: 1, reserve: 6, spread: 0.6, adsSpread: 0.4,
      range: 200, reload: 2.6, recoil: 2.2, kick: 0.12, sfx: "rocket", headMul: 1.0, speed: 34
    }
  ];

  var byId = Object.create(null);
  WEAPONS.forEach(function (w) { byId[w.id] = w; });

  function vmBox(w, h, d, color, x, y, z) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), B.World.material(color));
    m.position.set(x, y, z);
    return m;
  }

  /* Viewmodel: arma de bloques anclada a la camara (esquina inferior derecha) */
  function buildViewmodel(id) {
    var g = new THREE.Group();
    var muzzle = new THREE.Object3D();
    var def = byId[id] || WEAPONS[0];

    if (id === "pistol") {
      g.add(vmBox(0.11, 0.13, 0.38, "#2b3444", 0, 0, -0.16));
      g.add(vmBox(0.09, 0.16, 0.11, def.color, 0, 0.07, -0.3));
      muzzle.position.set(0, 0.07, -0.38);
    } else if (id === "smg") {
      g.add(vmBox(0.12, 0.15, 0.5, "#2b3444", 0, 0, -0.22));
      g.add(vmBox(0.09, 0.22, 0.12, def.color, 0, -0.16, -0.06));
      g.add(vmBox(0.07, 0.07, 0.26, "#1d2431", 0, 0.1, -0.46));
      muzzle.position.set(0, 0.1, -0.6);
    } else if (id === "shotgun") {
      g.add(vmBox(0.13, 0.16, 0.72, "#3a2b22", 0, 0, -0.3));
      g.add(vmBox(0.08, 0.08, 0.6, def.color, -0.05, 0.08, -0.34));
      g.add(vmBox(0.08, 0.08, 0.6, def.color, 0.05, 0.08, -0.34));
      muzzle.position.set(0, 0.08, -0.66);
    } else if (id === "rifle") {
      g.add(vmBox(0.12, 0.16, 0.66, "#22293a", 0, 0, -0.3));
      g.add(vmBox(0.08, 0.2, 0.12, def.color, 0, -0.15, -0.08));
      g.add(vmBox(0.06, 0.06, 0.32, "#161c28", 0, 0.1, -0.62));
      muzzle.position.set(0, 0.1, -0.8);
    } else if (id === "sniper") {
      g.add(vmBox(0.12, 0.14, 0.9, "#1f2734", 0, 0, -0.4));
      g.add(vmBox(0.06, 0.24, 0.06, def.color, 0, -0.16, -0.14));
      g.add(vmBox(0.1, 0.1, 0.34, "#0f141d", 0, 0.13, -0.3));
      muzzle.position.set(0, 0.06, -0.9);
    } else if (id === "katana") {
      g.add(vmBox(0.05, 0.05, 0.5, "#5a3418", 0, -0.1, -0.2));
      g.add(vmBox(0.12, 0.05, 0.06, "#2b3444", 0, -0.1, -0.42));
      var blade = vmBox(0.04, 0.1, 0.85, def.color, 0, -0.07, -0.88);
      g.add(blade);
      muzzle.position.set(0, -0.07, -1.3);
    } else if (id === "rocket") {
      g.add(vmBox(0.18, 0.18, 0.9, "#2b3444", 0, 0, -0.4));
      g.add(vmBox(0.22, 0.06, 0.2, def.color, 0, 0.14, -0.5));
      g.add(vmBox(0.1, 0.18, 0.12, "#1d2431", 0, -0.16, -0.1));
      muzzle.position.set(0, 0, -0.86);
    }
    g.add(muzzle);
    g.traverse(function (o) { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    return { group: g, muzzle: muzzle };
  }

  B.WEAPONS = WEAPONS;
  B.Weapon = {
    byId: function (id) { return byId[id] || WEAPONS[0]; },
    buildViewmodel: buildViewmodel,
    slotOf: function (id) { return (byId[id] || WEAPONS[0]).slot; },
    /* dispersion efectiva en grados segun movimiento y apuntado */
    spreadDeg: function (def, state) {
      if (def.kind === "melee") return 0;
      var base = state.ads && def.adsSpread != null ? def.adsSpread : def.spread;
      var move = state.speedRatio * (def.kind === "hitscan" ? 1.0 : 0.6);
      var air = state.grounded ? 0 : 1.4;
      var streak = Math.min(1.6, state.shots * 0.16);
      return base * (1 + move * 0.9 + air + streak);
    }
  };
})();
