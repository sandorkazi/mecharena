// Mech Arena — three.js renderer (valódi modellek).
// Ugyanaz a felület mint a box-renderer: setSize / setQuality / shake /
// tracer / burst / boom / arc / render — a main.js változtatás nélkül cserélhető.
// Modell: Quaternius RobotExpressive (CC0, assets/robot.glb), csapat-színre tintelve.
'use strict';

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const TEAM_COL = [0x2f6bff, 0xff4a30];
const KIND_COL = { hp: 0x33ff55, ammo: 0xffd633, emp: 0x9966ff, shield: 0x33ccff, over: 0xff4da6 };

export async function createRenderer3(canvas, opts) {
  opts = opts || {};
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0e16);
  scene.fog = new THREE.Fog(0x0b0e16, 60, 220);
  const camera = new THREE.PerspectiveCamera(70, 4 / 3, 0.1, 500);

  scene.add(new THREE.HemisphereLight(0x8fb4ff, 0x1a1410, 0.85));
  const sun = new THREE.DirectionalLight(0xfff2dd, 1.7);
  sun.position.set(30, 50, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -60; sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 60; sun.shadow.camera.bottom = -60;
  sun.shadow.camera.far = 150;
  scene.add(sun);

  const std = (c, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.9, metalness: 0.05 }, o));
  const basic = (c, o) => new THREE.MeshBasicMaterial(Object.assign({ color: c }, o));
  const glow = (c, o) => new THREE.MeshBasicMaterial(Object.assign({ color: c, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }, o));

  // megosztott anyagok
  const fgGreen = basic(0x33dd44, { fog: false });
  const fgYellow = basic(0xe8b62a, { fog: false });
  const fgRed = basic(0xe83a2a, { fog: false });
  const flashRedMat = glow(0xff2a1a, { opacity: 0.95 });
  const dotRedMat = glow(0xff2a1a, { opacity: 0.9 });
  const flashWhiteMat = glow(0xfff2cc, { opacity: 0.95 });
  const _matCache = {};
  function keyMat(r, g, b) {
    const k = Math.round(r * 3) + '_' + Math.round(g * 3) + '_' + Math.round(b * 3);
    if (!_matCache[k]) _matCache[k] = glow(new THREE.Color(r, g, b), { opacity: 0.9 });
    return _matCache[k];
  }
  const tracerMat = keyMat, flashColMat = keyMat;

  function box(w, h, d, mat, x, y, z, shadow) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    if (shadow) { m.castShadow = true; m.receiveShadow = true; }
    scene.add(m);
    return m;
  }

  // ---- arena ----
  const H = 100;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(H, H), std(0x161c2a, { roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const grid = new THREE.GridHelper(H, 20, 0xff7a1a, 0x2a3a55);
  grid.position.y = 0.02; grid.material.transparent = true; grid.material.opacity = 0.45; scene.add(grid);
  const ring = new THREE.Mesh(new THREE.RingGeometry(6.6, 7.4, 40), basic(0xff7a1a, { transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; scene.add(ring);
  const wallMat = std(0x232b40), trimMat = basic(0x3a5a8a);
  box(H, 8, 1, wallMat, 0, 4, -H / 2, true); box(H, 8, 1, wallMat, 0, 4, H / 2, true);
  box(1, 8, H, wallMat, -H / 2, 4, 0, true); box(1, 8, H, wallMat, H / 2, 4, 0, true);
  box(H, 0.5, 1.2, trimMat, 0, 8.2, -H / 2); box(H, 0.5, 1.2, trimMat, 0, 8.2, H / 2);
  for (const [tx, tz] of [[-50, -50], [50, -50], [-50, 50], [50, 50]]) box(3, 11, 3, wallMat, tx, 5.5, tz, true);
  const padB = box(28, 0.06, 6, basic(0x1d4ed8), 0, 0.03, 40);
  const padR = box(28, 0.06, 6, basic(0xb03020), 0, 0.03, -40);
  void padB; void padR;
  // háttér-sziluet: sötét tornyok a falon kívül (hangulat, olcsó)
  const skyMat = std(0x0e1320, { roughness: 1 });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r = 75 + (i % 3) * 12, h = 15 + ((i * 37) % 25);
    box(8, h, 8, skyMat, Math.sin(a) * r, h / 2 - 2, Math.cos(a) * r, false);
  }
  const moon = new THREE.Mesh(new THREE.CircleGeometry(9, 24), glow(0xcfe0ff, { opacity: 0.9 }));
  moon.position.set(-90, 110, -160); moon.lookAt(0, 0, 0); scene.add(moon);

  // fedezékek / hordók / pickup-alapok a sim adataiból épülnek fel lusta módon
  let coverMeshes = [], barrelMeshes = [], pickupPool = [];
  const barrelBody = std(0xd86a1e), barrelBand = basic(0xe8e0cc), barrelLid = std(0x222222);

  // ---- poolok effektekhez ----
  const fxGroup = new THREE.Group(); scene.add(fxGroup);
  function pooledTracer() {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), glow(0xffffff, { opacity: 0.9 }));
    m.visible = false; fxGroup.add(m);
    return { m, life: 0, max: 1 };
  }
  const tracers = []; for (let i = 0; i < 40; i++) tracers.push(pooledTracer());
  const sparkMats = [basic(0xffd27a), basic(0xff8c2a), basic(0xb78cff), basic(0x888888), basic(0xffffff)];
  function colorMat(r, g, b) {
    if (r > 0.9 && g < 0.5 && b > 0.8) return sparkMats[2];
    if (r > 0.9 && g > 0.7) return sparkMats[0];
    if (r > 0.9) return sparkMats[1];
    if (r < 0.5) return sparkMats[3];
    return sparkMats[4];
  }
  const sparks = [];
  for (let i = 0; i < 120; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), sparkMats[0]);
    m.visible = false; fxGroup.add(m);
    sparks.push({ m, vx: 0, vy: 0, vz: 0, life: 0, max: 1, sz: 0.12 });
  }
  const shells = [];
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), glow(0xff7a1e, { opacity: 0.8 }));
    m.visible = false; fxGroup.add(m);
    shells.push({ m, life: 0, max: 0.4, grow: 6 });
  }
  const flashes = [];
  for (let i = 0; i < 24; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), glow(0xfff2cc, { opacity: 0.95 }));
    m.visible = false; fxGroup.add(m);
    flashes.push({ m, life: 0, max: 0.12, sz: 1.5 });
  }
  const arcs = [];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), glow(0x9fe8ff, { opacity: 0.9 }));
    m.visible = false; fxGroup.add(m);
    arcs.push({ m, life: 0, max: 0.15 });
  }
  const rockets = [], empflies = [];
  function projMesh(kind) {
    let m;
    if (kind === 'rocket') {
      m = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.9), basic(0xd8d8de, { fog: false }));
      const flame = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.5), glow(0xffb02a, { opacity: 0.95 }));
      flame.position.z = -0.65; m.add(body); m.add(flame); m.userData.flame = flame;
    } else {
      m = new THREE.Mesh(new THREE.OctahedronGeometry(0.35), glow(0x9966ff, { opacity: 0.95 }));
    }
    m.visible = false; fxGroup.add(m);
    return m;
  }

  // ---- mechek ----
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync('./assets/robot.glb', undefined, (xhr) => {
    if (xhr.total && opts.onProgress) { try { opts.onProgress(xhr.loaded / xhr.total * 0.7); } catch (e) { /* noop */ } }
  });
  if (opts.onProgress) { try { opts.onProgress(0.85); } catch (e) { /* noop */ } }
  const clips = {};
  for (const c of gltf.animations) clips[c.name] = c;

  const teamMats = [0, 1].map(t => new THREE.MeshStandardMaterial({ color: TEAM_COL[t], roughness: 0.5, metalness: 0.2 }));
  const mechs = [];
  let modelScale = 1.2;
  for (let i = 0; i < 8; i++) {
    const g = cloneSkinned(gltf.scene);
    if (i === 0) {
      const bb = new THREE.Box3().setFromObject(g);
      const h = bb.max.y - bb.min.y;
      if (h > 0.01) modelScale = 2.4 / h;
    }
    g.scale.setScalar(modelScale);
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    scene.add(g);
    const mixer = new THREE.AnimationMixer(g);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.05, 20), basic(0x000000, { transparent: true, opacity: 0.42, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; scene.add(shadow);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.1, 8), glow(0xff8c2a, { opacity: 0.9 }));
    flame.visible = false; scene.add(flame);
    const bubble = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 10), glow(0x33aaff, { opacity: 0.35 }));
    bubble.visible = false; scene.add(bubble);
    const ringE = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.1, 8, 24), glow(0x9966ff, { opacity: 0.9 }));
    ringE.rotation.x = Math.PI / 2; ringE.visible = false; scene.add(ringE);
    const barBg = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.14, 0.05), basic(0x701515, { fog: false }));
    const barFg = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.16, 0.05), basic(0x33dd44, { fog: false }));
    scene.add(barBg); scene.add(barFg);
    const flashM = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), glow(0xfff2cc, { opacity: 0.95 }));
    flashM.visible = false; scene.add(flashM);
    g.traverse(o => {
      if (o.isMesh) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        const rep = ms.map(mt => (mt && mt.name === 'Main' ? teamMats[i < 4 ? 0 : 1] : mt));
        o.material = Array.isArray(o.material) ? rep : rep[0];
      }
    });
    mechs.push({ g, mixer, cur: null, one: null, oneT: 0, deadT: 0, shadow, flame, bubble, ringE, barBg, barFg, flashM, team: i < 4 ? 0 : 1 });
  }

  function play(v, name, once) {
    const clip = clips[name];
    if (!clip || (v.cur === name && !once)) return;
    const cur = v.cur && clips[v.cur] ? v.mixer.clipAction(clips[v.cur]) : null;
    if (cur) cur.fadeOut(0.15);
    const a = v.mixer.clipAction(clip);
    a.reset();
    if (once) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
    else { a.setLoop(THREE.LoopRepeat); a.clampWhenFinished = false; }
    a.fadeIn(0.15).play();
    v.cur = name;
  }

  function ensureStatic(s) {
    if (!coverMeshes.length) {
      const cm = std(0x2c3549), tm = std(0x3d4763);
      for (const c of s.covers) {
        coverMeshes.push(box(c.hx * 2, c.h, c.hz * 2, cm, c.cx, c.h / 2, c.cz, true));
        coverMeshes.push(box(c.hx * 2 + 0.16, 0.16, c.hz * 2 + 0.16, tm, c.cx, c.h + 0.08, c.cz, false));
      }
    }
    while (barrelMeshes.length < s.barrels.length) {
      const grp = new THREE.Group();
      const b1 = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1, 12), barrelBody);
      b1.position.y = 0.5; b1.castShadow = true;
      const b2 = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.2, 12), barrelBand);
      b2.position.y = 0.55;
      const b3 = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.12, 12), barrelLid);
      b3.position.y = 1.02;
      const dot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), glow(0xff2a1a, { opacity: 0.9 }));
      dot.position.y = 1.35;
      grp.add(b1, b2, b3, dot);
      grp.userData.dot = dot;
      scene.add(grp); barrelMeshes.push(grp);
    }
    while (pickupPool.length < s.pickups.length) {
      const grp = new THREE.Group();
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.08, 16), basic(0xffffff));
      base.position.y = 0.04;
      const icon = new THREE.Group();
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 4.4, 6), glow(0xffffff, { opacity: 0.3 }));
      beam.position.y = 2.2;
      grp.add(base, icon, beam);
      grp.userData = { base, icon, beam, kind: '' };
      scene.add(grp); pickupPool.push(grp);
    }
  }

  function setIcon(grp, kind) {
    const u = grp.userData;
    if (u.kind === kind) return;
    u.kind = kind;
    while (u.icon.children.length) u.icon.remove(u.icon.children[0]);
    const col = KIND_COL[kind] || 0xffffff;
    u.base.material = basic(col);
    u.beam.material = glow(col, { opacity: 0.3 });
    if (kind === 'hp') {
      u.icon.add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.3), basic(0xf2f2f2)));
      u.icon.add(new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.2, 0.34), glow(0xff2222, { opacity: 0.95 })));
      u.icon.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.56, 0.34), glow(0xff2222, { opacity: 0.95 })));
    } else if (kind === 'ammo') {
      u.icon.add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.6), basic(0xd8b62a)));
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.24), glow(0xffe97a, { opacity: 0.95 }));
      tip.position.y = 0.42; u.icon.add(tip);
    } else {
      const big = kind === 'over' ? 1.4 : 1;
      u.icon.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.42 * big), glow(col, { opacity: 0.95 })));
      u.icon.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.22 * big), basic(0xffffff, { fog: false })));
    }
  }
  let trauma = 0, lowQ = false;

  function camCollide(s, hx, hy, hz, ex, ey, ez) {
    let px = ex, py = ey, pz = ez;
    for (let i = 1; i <= 10; i++) {
      const f = i / 10;
      const x = hx + (ex - hx) * f, y = hy + (ey - hy) * f, z = hz + (ez - hz) * f;
      let inside = Math.abs(x) > 49 || Math.abs(z) > 49;
      if (!inside && y < 8) for (const c of s.covers) {
        if (Math.abs(x - c.cx) < c.hx + 0.4 && Math.abs(z - c.cz) < c.hz + 0.4 && y < c.h + 0.4) { inside = true; break; }
      }
      if (inside) break;
      px = x; py = y; pz = z;
    }
    return [px, py, pz];
  }

  const V1 = new THREE.Vector3(), V2 = new THREE.Vector3();

  function stepFx(dt) {
    for (const t of tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) t.m.visible = false;
      else { const k = t.life / t.max; t.m.material.opacity = 0.9 * k; t.m.scale.x = t.m.scale.y = 0.03 + 0.09 * k; }
    }
    for (const p of sparks) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.m.visible = false; continue; }
      p.vy -= 18 * dt;
      p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt;
      if (p.m.position.y < 0.05) p.m.position.y = 0.05;
      const k = p.life / p.max, sc = p.sz * k + 0.03;
      p.m.scale.set(sc, sc, sc);
    }
    for (const sh2 of shells) {
      if (sh2.life <= 0) continue;
      sh2.life -= dt;
      if (sh2.life <= 0) { sh2.m.visible = false; continue; }
      const k = 1 - sh2.life / sh2.max, sc = 0.5 + sh2.grow * (1 - sh2.life / sh2.max) + k;
      sh2.m.scale.set(sc, sc * 0.8, sc);
      sh2.m.material.opacity = 0.8 * (sh2.life / sh2.max);
    }
    for (const f of flashes) {
      if (f.life <= 0) continue;
      f.life -= dt;
      if (f.life <= 0) { f.m.visible = false; continue; }
      f.m.material.opacity = 0.95 * (f.life / f.max);
    }
    for (const a of arcs) {
      if (a.life <= 0) continue;
      a.life -= dt;
      if (a.life <= 0) { a.m.visible = false; continue; }
      a.m.material.opacity = 0.9 * (a.life / a.max);
    }
  }

  function render(s, playerId, camYaw, camPitch, dt) {
    dt = dt || 1 / 60;
    if (dt > 0.1) dt = 0.1;
    trauma = Math.max(0, trauma - dt * 1.4);
    ensureStatic(s);
    time += dt;

    const p = s.mechs[playerId];
    const px = p ? p.x : 0, py = p ? p.y + 1.8 : 2, pz = p ? p.z : 40;
    const cd = 4.5;
    const rx = -Math.cos(camYaw), rz = Math.sin(camYaw);
    let ex = px - Math.sin(camYaw) * Math.cos(camPitch) * cd + rx * 0.9;
    let ez = pz - Math.cos(camYaw) * Math.cos(camPitch) * cd + rz * 0.9;
    let ey = py + 1.5 + Math.sin(camPitch) * cd;
    if (ey < 0.5) ey = 0.5;
    const cc = camCollide(s, px, py + 0.6, pz, ex, ey, ez);
    ex = cc[0]; ey = cc[1]; ez = cc[2];
    const shk = trauma * trauma;
    if (shk > 0.001) { ex += Math.sin(time * 91) * shk * 0.35; ey += Math.cos(time * 113) * shk * 0.3; }
    camera.position.set(ex, ey, ez);
    camera.lookAt(px + Math.sin(camYaw) * 8 + rx * 0.9, py + 0.3 + Math.sin(camPitch) * 8, pz + Math.cos(camYaw) * 8 + rz * 0.9);

    // mechek
    for (let i = 0; i < 8; i++) {
      const m = s.mechs[i], v = mechs[i];
      if (!m) { v.g.visible = false; continue; }
      v.g.position.set(m.x, m.y, m.z);
      v.g.rotation.y = m.yaw;
      if (!m.alive) {
        if (v.one !== 'Death') { play(v, 'Death', true); v.one = 'Death'; v.deadT = 0; }
        v.deadT += dt;
        v.g.visible = v.deadT < 1.4;
        v.barBg.visible = v.barFg.visible = false;
        v.shadow.visible = false;
        v.flame.visible = false; v.bubble.visible = false; v.ringE.visible = false; v.flashM.visible = false;
        v.mixer.update(dt);
        continue;
      }
      v.g.visible = !(m.spawnProt > 0 && Math.floor(time * 8) % 2 === 0);
      if (v.one === 'Death') { v.one = null; v.cur = null; }
      if (v.one === 'Punch') { v.oneT -= dt; if (v.oneT <= 0) { v.one = null; v.cur = null; } }
      const spd = Math.hypot(m.vx, m.vz);
      if (!v.one) {
        if (m.y > 0.05) play(v, 'Jump');
        else if (spd > 5) play(v, 'Running');
        else if (spd > 0.5) play(v, 'Walking');
        else play(v, 'Idle');
      }
      if (m.swordCd > 0.63 && v.one !== 'Punch' && m.alive) {
        play(v, 'Punch', true); v.one = 'Punch'; v.oneT = 0.45;
      }
      v.mixer.update(dt);
      v.shadow.visible = true;
      v.shadow.position.set(m.x, 0.02, m.z);
      const air = m.y > 0.05;
      v.flame.visible = air;
      if (air) {
        v.flame.position.set(m.x - Math.sin(m.yaw) * 0.3, m.y + 0.4, m.z - Math.cos(m.yaw) * 0.3);
        v.flame.rotation.x = Math.PI;
        const fl = 1 + Math.sin(time * 40 + i * 3) * 0.25;
        v.flame.scale.set(1, fl, 1);
      }
      v.bubble.visible = m.shieldT > 0;
      if (v.bubble.visible) v.bubble.position.set(m.x, m.y + 1.5, m.z);
      v.ringE.visible = m.empT > 0 && Math.floor(time * 6) % 2 === 0;
      if (v.ringE.visible) { v.ringE.position.set(m.x, m.y + 0.4, m.z); v.ringE.rotation.z = time * 2; }
      v.flashM.visible = m.muzzle > 0;
      if (v.flashM.visible) {
        const f = 0.5 + m.muzzle * 6;
        v.flashM.position.set(m.x + Math.sin(m.yaw) * 1.6, m.y + 1.5, m.z + Math.cos(m.yaw) * 1.6);
        v.flashM.scale.set(0.5 * f, 0.5 * f, 0.5 * f);
        v.flashM.rotation.y = time * 7;
      }
      const f = Math.max(0, m.hp / m.maxHp);
      v.barBg.visible = v.barFg.visible = true;
      v.barBg.position.set(m.x, m.y + 3.3, m.z);
      v.barFg.position.set(m.x, m.y + 3.3, m.z);
      v.barBg.quaternion.copy(camera.quaternion);
      v.barFg.quaternion.copy(camera.quaternion);
      v.barFg.scale.x = Math.max(0.001, f);
      v.barFg.position.x -= (1.7 * (1 - f)) / 2 * Math.cos(camYaw);
      v.barFg.position.z += (1.7 * (1 - f)) / 2 * Math.sin(camYaw);
      v.barFg.material = f > 0.5 ? fgGreen : f > 0.25 ? fgYellow : fgRed;
    }

    // hordók
    for (let i = 0; i < s.barrels.length; i++) {
      const b = s.barrels[i], grp = barrelMeshes[i];
      grp.visible = b.alive;
      if (!b.alive) continue;
      grp.position.set(b.x, 0, b.z);
      const blink = b.hp < 50 && Math.floor(time * 6) % 2 === 0;
      grp.userData.dot.visible = true;
      grp.userData.dot.material = blink ? flashRedMat : dotRedMat;
    }
    // pickupok
    for (let i = 0; i < s.pickups.length; i++) {
      const pk = s.pickups[i], grp = pickupPool[i];
      grp.visible = pk.active;
      if (!pk.active) continue;
      setIcon(grp, pk.kind);
      grp.position.set(pk.x, 0, pk.z);
      const u = grp.userData;
      u.icon.position.y = 0.7 + Math.sin(time * 3 + pk.x) * 0.15;
      u.icon.rotation.y = time * (pk.kind === 'over' ? 2.2 : 1.5);
      u.beam.visible = !lowQ;
    }
    // lövedékek
    let ri = 0, ei = 0;
    for (const pr2 of s.projectiles) {
      if (pr2.kind === 'rocket') {
        while (rockets.length <= ri) rockets.push(projMesh('rocket'));
        const m = rockets[ri++];
        m.visible = true;
        m.position.set(pr2.x, pr2.y, pr2.z);
        m.rotation.y = Math.atan2(pr2.vx, pr2.vz);
        m.userData.flame.scale.z = 0.8 + Math.random() * 0.5;
      } else if (pr2.kind === 'empfly') {
        while (empflies.length <= ei) empflies.push(projMesh('emp'));
        const m = empfiles[ei++];
        m.visible = true;
        m.position.set(pr2.x, pr2.y, pr2.z);
        m.rotation.y = time * 6;
        const pu = 1 + Math.sin(time * 20) * 0.25;
        m.scale.set(pu, pu, pu);
      }
    }
    for (let i = ri; i < rockets.length; i++) rockets[i].visible = false;
    for (let i = ei; i < empfiles.length; i++) empfiles[i].visible = false;
    // szimulált részecskék
    for (const pt of s.particles) {
      if (pt.kind === 'emp') {
        flashStep(pt.x, pt.y, pt.z, (0.5 - pt.t) * 16, 0.6, 0.4, 1);
      } else {
        flashStep(pt.x, pt.y, pt.z, pt.t * 4 + 0.2, 1, 0.6, 0.15);
      }
    }
    stepFx(dt);
    renderer.render(scene, camera);
  }

  // szimulált részecske -> tranziens flash (egyszerűsített, nem halmoz)
  function flashStep(x, y, z, sc, r, g, b) {
    for (const f of flashes) {
      if (f.life > 0) continue;
      f.life = 0.08; f.max = 0.08;
      f.m.visible = true;
      f.m.position.set(x, y, z);
      f.m.scale.set(sc, sc, sc);
      f.m.material = flashColMat(r, g, b);
      return;
    }
  }

  if (opts.onProgress) { try { opts.onProgress(1); } catch (e) { /* noop */ } }

  return {
    setSize(w, h) {
      renderer.setSize(Math.max(320, w), Math.max(180, h), false);
      camera.aspect = Math.max(320, w) / Math.max(180, h);
      camera.updateProjectionMatrix();
    },
    setQuality(q) {
      lowQ = q === 'low';
      sun.castShadow = !lowQ; // shadowMap.enabled marad (újrafordítás nélkül váltható)
    },
    shake(a) { trauma = Math.min(1, trauma + a); },
    tracer(x1, y1, z1, x2, y2, z2, r, g, b, life) {
      for (const t of tracers) {
        if (t.life > 0) continue;
        t.life = t.max = life || 0.1;
        t.m.visible = true;
        t.m.material = tracerMat(r, g, b);
        V1.set(x1, y1, z1); V2.set(x2, y2, z2);
        t.m.position.copy(V1).lerp(V2, 0.5);
        t.m.lookAt(V2);
        const len = V1.distanceTo(V2);
        t.m.scale.set(0.12, 0.12, Math.max(0.3, len));
        t.m.material.opacity = 0.9;
        return;
      }
    },
    burst(x, y, z, n, r, g, b, spd) {
      n = lowQ ? Math.ceil(n / 3) : n;
      for (let k = 0; k < n; k++) {
        for (const p of sparks) {
          if (p.life > 0) continue;
          const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI - Math.PI / 2;
          const vv = (spd || 6) * (0.4 + Math.random() * 0.8);
          p.vx = Math.cos(a) * Math.cos(e) * vv;
          p.vy = Math.abs(Math.sin(e)) * vv + 2;
          p.vz = Math.sin(a) * Math.cos(e) * vv;
          p.life = p.max = 0.25 + Math.random() * 0.25;
          p.sz = 0.12;
          p.m.visible = true;
          p.m.position.set(x, y, z);
          p.m.material = colorMat(r, g, b);
          break;
        }
      }
    },
    boom(x, y, z, big) {
      for (const f of flashes) {
        if (f.life > 0) continue;
        f.life = f.max = 0.12;
        f.m.visible = true;
        f.m.position.set(x, y, z);
        const sz = big ? 4.4 : 2.8;
        f.m.scale.set(sz, sz, sz);
        f.m.material = flashWhiteMat;
        break;
      }
      for (const sh2 of shells) {
        if (sh2.life > 0) continue;
        sh2.life = sh2.max = 0.4;
        sh2.grow = big ? 18 : 12;
        sh2.m.visible = true;
        sh2.m.position.set(x, y, z);
        break;
      }
      this.burst(x, y, z, big ? 22 : 12, 1, 0.6, 0.15, 9);
      this.burst(x, y, z, big ? 10 : 6, 0.3, 0.3, 0.3, 5);
    },
    arc(x, y, z, yaw) {
      for (const a of arcs) {
        if (a.life > 0) continue;
        a.life = a.max = 0.15;
        a.m.visible = true;
        a.m.position.set(x + Math.sin(yaw) * 1.6, y + 1.2, z + Math.cos(yaw) * 1.6);
        a.m.rotation.y = yaw;
        a.m.scale.set(4.4, 0.5, 1.2);
        a.m.material.opacity = 0.9;
        return;
      }
    },
    render,
  };
}