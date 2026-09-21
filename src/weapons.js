/* BLOCKBURST - armas: definiciones, viewmodel de bloques y utilidades de disparo */
(function () {
  'use strict';
  var B = (window.BLITZ = window.BLITZ || {});

  /* El retroceso (kick) solo es alto en rifle y escopeta; el resto son mas suaves.
     adsFov activa el zoom al apuntar con el boton derecho. */
  var WEAPONS = [
    {
      id: "pistol", slot: 1, name: "PISTOLA", short: "PST", kind: "hitscan", color: "#c9d3e6", hud: "#c9d3e6",
      damage: 26, rpm: 400, mag: 12, reserve: 72, spread: 0.9, adsSpread: 0.32, pellets: 1,
      range: 120, falloffStart: 26, falloffEnd: 70, falloffMin: 0.62, auto: false,
      reload: 1.15, recoil: 0.5, kick: 0.026, sfx: "pistol", headMul: 2.0, adsFov: 62
    },
    {
      id: "smg", slot: 2, name: "SUBFUSIL", short: "SMG", kind: "hitscan", color: "#8ede5a", hud: "#8ede5a",
      damage: 15, rpm: 880, mag: 34, reserve: 170, spread: 1.7, adsSpread: 0.95, pellets: 1,
      range: 90, falloffStart: 18, falloffEnd: 52, falloffMin: 0.55, auto: true,
      reload: 1.5, recoil: 0.3, kick: 0.015, sfx: "smg", headMul: 1.6, adsFov: 66
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
      reload: 1.9, recoil: 0.62, kick: 0.045, sfx: "rifle", headMul: 2.0, adsFov: 60
    },
    {
      id: "sniper", slot: 5, name: "FRANCOTIRADOR", short: "SNP", kind: "hitscan", color: "#c86bff", hud: "#c86bff",
      damage: 88, rpm: 44, mag: 5, reserve: 25, spread: 0.14, adsSpread: 0.0, pellets: 1,
      range: 240, falloffStart: 200, falloffEnd: 300, falloffMin: 0.9, auto: false,
      reload: 2.7, recoil: 1.6, kick: 0.075, sfx: "sniper", headMul: 2.4,
      adsFov: 22, lethalHead: true, scope: true
    },
    {
      id: "katana", slot: 6, name: "KATANA", short: "KAT", kind: "melee", color: "#f4f7ff", hud: "#f4f7ff",
      damage: 74, range: 2.6, arc: 1.7, sweep: true, maxTargets: 3,
      mag: 0, reserve: 0, reload: 0, recoil: 0, kick: 0.012,
      rpm: 115, auto: false, sfx: "melee", headMul: 1.0
    },
    {
      id: "rocket", slot: 7, name: "LANZACOHETES", short: "RCK", kind: "projectile", color: "#ff7a1a", hud: "#ff7a1a",
      damage: 105, splash: 5.2, splashDmg: 78, rpm: 52, mag: 1, reserve: 6, spread: 0.6, adsSpread: 0.4,
      range: 200, reload: 2.6, recoil: 1.0, kick: 0.05, sfx: "rocket", headMul: 1.0, speed: 34
    }
  ];

  var byId = Object.create(null);
  WEAPONS.forEach(function (w) { byId[w.id] = w; });

  function gunMat(color) { return B.World.material(color); }

  function part(group, w, h, d, color, x, y, z, rot) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), gunMat(color));
    m.position.set(x, y, z);
    if (rot) { m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0); }
    group.add(m);
    return m;
  }

  /* Viewmodel: arma de bloques anclada a la camara (esquina inferior derecha).
     Cada arma lleva cuerpo, cargador, culata/mango, cañon y miras para que se lean. */
  function buildViewmodel(id) {
    var g = new THREE.Group();
    var muzzle = new THREE.Object3D();
    var def = byId[id] || WEAPONS[0];
    var dark = "#22293a", mid = "#2b3444", steel = "#3a4456";

    if (id === "pistol") {
      part(g, 0.11, 0.13, 0.4, mid, 0, 0, -0.16);            // cuerpo
      part(g, 0.09, 0.06, 0.2, def.color, 0, 0.075, -0.3);   // corredera
      part(g, 0.075, 0.2, 0.1, dark, 0, -0.16, -0.02);       // empuñadura
      part(g, 0.06, 0.05, 0.1, dark, 0, -0.055, 0.02);       // boquilla del cargador
      part(g, 0.03, 0.035, 0.03, def.color, 0, 0.11, -0.2);  // alza
      part(g, 0.028, 0.03, 0.03, def.color, 0, 0.11, -0.36); // punto de mira
      muzzle.position.set(0, 0.07, -0.4);
    } else if (id === "smg") {
      part(g, 0.12, 0.15, 0.52, mid, 0, 0, -0.24);           // cuerpo
      part(g, 0.09, 0.22, 0.12, def.color, 0, -0.17, -0.06); // cargador
      part(g, 0.07, 0.07, 0.3, dark, 0, 0.105, -0.46);       // cañon
      part(g, 0.05, 0.05, 0.12, steel, 0, 0.105, -0.62);     // bocacha
      part(g, 0.06, 0.12, 0.08, dark, 0, -0.09, 0.06);       // empuñadura
      part(g, 0.09, 0.05, 0.14, steel, 0, 0.02, 0.20);       // culata plegada
      part(g, 0.03, 0.04, 0.03, def.color, 0, 0.14, -0.2);   // alza
      muzzle.position.set(0, 0.105, -0.66);
    } else if (id === "shotgun") {
      part(g, 0.13, 0.16, 0.74, "#3a2b22", 0, 0, -0.32);     // culata y cuerpo
      part(g, 0.08, 0.08, 0.64, def.color, -0.05, 0.085, -0.36);
      part(g, 0.08, 0.08, 0.64, def.color, 0.05, 0.085, -0.36);
      part(g, 0.1, 0.06, 0.14, dark, 0, -0.05, -0.36);       // guardamanos
      part(g, 0.06, 0.1, 0.1, dark, 0, -0.11, -0.02);        // empuñadura
      part(g, 0.03, 0.035, 0.05, def.color, 0, 0.135, -0.6); // punto de mira
      muzzle.position.set(0, 0.085, -0.7);
    } else if (id === "rifle") {
      part(g, 0.12, 0.16, 0.68, dark, 0, 0, -0.3);           // cuerpo
      part(g, 0.08, 0.2, 0.13, def.color, 0, -0.16, -0.08);  // cargador
      part(g, 0.06, 0.06, 0.34, "#161c28", 0, 0.1, -0.62);   // cañon
      part(g, 0.045, 0.045, 0.1, steel, 0, 0.1, -0.82);      // bocacha
      part(g, 0.05, 0.1, 0.09, dark, 0, -0.08, 0.02);        // empuñadura
      part(g, 0.1, 0.07, 0.18, steel, 0, 0.03, 0.22);        // culata
      part(g, 0.04, 0.05, 0.16, steel, 0, 0.15, -0.28);      // carril de miras
      part(g, 0.035, 0.04, 0.04, def.color, 0, 0.19, -0.34);
      muzzle.position.set(0, 0.1, -0.88);
    } else if (id === "sniper") {
      part(g, 0.12, 0.14, 0.92, "#1f2734", 0, 0, -0.42);     // cuerpo largo
      part(g, 0.06, 0.24, 0.07, def.color, 0, -0.17, -0.14); // cargador
      part(g, 0.11, 0.11, 0.36, "#0f141d", 0, 0.135, -0.32); // visor
      part(g, 0.13, 0.05, 0.06, steel, 0, 0.135, -0.5);      // lente delantera
      part(g, 0.13, 0.05, 0.06, steel, 0, 0.135, -0.14);     // lente trasera
      part(g, 0.05, 0.06, 0.42, "#161c28", 0, 0.05, -0.72);  // cañon
      part(g, 0.055, 0.055, 0.1, steel, 0, 0.05, -0.94);     // bocacha
      part(g, 0.06, 0.11, 0.1, dark, 0, -0.1, 0.0);          // empuñadura
      part(g, 0.1, 0.09, 0.2, steel, 0, 0.0, 0.24);          // culata
      part(g, 0.04, 0.2, 0.04, steel, 0, -0.06, -0.3);       // bípode
      muzzle.position.set(0, 0.05, -1.0);
    } else if (id === "katana") {
      part(g, 0.055, 0.055, 0.42, "#5a3418", 0, -0.12, -0.18);   // empuñadura
      for (var w = 0; w < 4; w++) {                                // vendas del mango
        part(g, 0.062, 0.062, 0.03, "#2b3444", 0, -0.12, -0.32 + w * 0.09);
      }
      part(g, 0.19, 0.055, 0.07, "#b8923a", 0, -0.12, -0.42);      // tsuba (guardia)
      part(g, 0.05, 0.11, 0.86, def.color, 0, -0.09, -0.88);       // hoja
      part(g, 0.05, 0.02, 0.86, "#ffffff", 0, -0.035, -0.88);      // filo brillante
      part(g, 0.052, 0.05, 0.1, "#d8dde8", 0, -0.09, -1.32);       // punta
      muzzle.position.set(0, -0.09, -1.4);
    } else if (id === "rocket") {
      part(g, 0.19, 0.19, 0.92, mid, 0, 0, -0.42);            // tubo
      part(g, 0.23, 0.07, 0.22, def.color, 0, 0.14, -0.5);    // asa superior
      part(g, 0.1, 0.18, 0.13, dark, 0, -0.17, -0.1);         // empuñadura
      part(g, 0.12, 0.12, 0.1, steel, 0, 0.02, 0.1);          // culata
      part(g, 0.2, 0.2, 0.06, "#11151d", 0, 0, -0.9);         // boca del tubo
      part(g, 0.04, 0.05, 0.24, def.color, 0.1, 0.08, -0.24); // mira
      muzzle.position.set(0, 0, -0.94);
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
