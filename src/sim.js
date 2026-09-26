// Mech Arena — tiszta szimuláció (nincs DOM / WebGL függés).
// Spec: fix 60Hz timestep, determinisztikus seed, snapshot-olható állapot.
'use strict';

const TICK = 1 / 60;
const GRAV = 20;
const ARENA = 100;          // 100x100 m
const WALL_H = 8;

const CLASSES = {
  tank:    { hp: 200, speed: 6.0, dashCd: 3.0, dmgTaken: 0.85, name: 'Tank' },
  striker: { hp: 120, speed: 8.5, dashCd: 2.0, reloadMul: 0.8, name: 'Striker' },
  support: { hp: 140, speed: 7.5, dashCd: 3.0, empBonus: 1.0, name: 'Support' },
};

const WEAPONS = {
  mg:     { dmg: 8, interval: 0.1, mag: 40, reserve: 160, reload: 1.5, range: 60, auto: true, name: 'Géppuska' },
  rocket: { dmg: 45, splash: 30, splashR: 4, interval: 1.25, mag: 4, reserve: 12, reload: 2.5, speed: 25, name: 'Rakéta' },
  rail:   { dmg: 80, interval: 1.25, mag: 5, reserve: 15, reload: 2.0, range: 100, pierce: true, name: 'Railgun' },
  sword:  { dmg: 60, interval: 0.83, range: 3.0, name: 'Lánckard' },
};

const SUPER = {
  emp:   { respawn: 30, name: 'EMP gránát' },
  shield:{ respawn: 45, absorb: 100, time: 5.0, slow: 0.8, name: 'Energia-pajzs' },
  over:  { respawn: 60, time: 8.0, name: 'Overdrive' },
};

// Determinisztikus RNG (mulberry32)
function rng32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Fix fedezékek (AABB: cx,cz,hx,hz,h)
function staticCovers() {
  return [
    { cx: 0, cz: 0, hx: 2, hz: 1, h: 3 },     // közép kereszt 1
    { cx: 0, cz: 0, hx: 1, hz: 2, h: 3 },     // közép kereszt 2
    { cx: -20, cz: -20, hx: 2, hz: 2, h: 3 },
    { cx: 20, cz: -20, hx: 2, hz: 2, h: 3 },
    { cx: -20, cz: 20, hx: 2, hz: 2, h: 3 },
    { cx: 20, cz: 20, hx: 2, hz: 2, h: 3 },
    { cx: -20, cz: 0, hx: 1, hz: 1, h: 2 },
    { cx: 20, cz: 0, hx: 1, hz: 1, h: 2 },
  ];
}
function barrelSpots() {
  return [[-8, -8], [8, -8], [-8, 8], [8, 8], [0, -14], [0, 14]];
}
function pickupDefs() {
  return [
    { kind: 'hp', x: -30, z: 0 }, { kind: 'hp', x: 30, z: 0 },
    { kind: 'ammo', x: -10, z: -30 }, { kind: 'ammo', x: 10, z: 30 },
    { kind: 'emp', x: -30, z: -30 }, { kind: 'emp', x: 30, z: -30 }, { kind: 'emp', x: 0, z: 30 },
    { kind: 'shield', x: -30, z: 30 }, { kind: 'shield', x: 30, z: 30 },
    { kind: 'over', x: 0, z: 0 },
  ];
}

function makeMech(id, team, cls, weapon, x, z, yaw, bot, diff) {
  const c = CLASSES[cls];
  const w = WEAPONS[weapon];
  return {
    id, team, cls, weapon, bot: !!bot, diff: diff || 'normal',
    x, z, y: 0, vx: 0, vy: 0, vz: 0, yaw, pitch: 0,
    hp: c.hp, maxHp: c.hp, alive: true, respawns: 2,
    fuel: 3.0, dashCd: 0, dashT: 0, dashDx: 0, dashDz: 0, dmgMul: 1,
    fireCd: 0, reloadT: 0, ammo: w.mag, reserve: w.reserve,
    swordCd: 0, super: null, shieldT: 0, shieldHp: 0, overT: 0, empT: 0,
    muzzle: 0, hitT: 0,
    kills: 0, deaths: 0, dmg: 0, shots: 0, hits: 0,
    ai: { state: 'engage', t: 0, tx: x, tz: z, target: -1, strafe: 1 },
    spawnProt: 0,
  };
}

function create(matchId, round, opts) {
  opts = opts || {};
  const seed = hashStr(matchId + ':' + round);
  const rand = rng32(seed);
  const covers = staticCovers();
  const state = {
    matchId, round, seed, time: 0, over: false, winner: -1,
    rounds: opts.rounds || 5, livesPerRound: opts.livesPerRound != null ? opts.livesPerRound : 2,
    mechs: [], projectiles: [], particles: [],
    barrels: barrelSpots().map(([x, z]) => ({ x, z, hp: 50, alive: true })),
    pickups: pickupDefs().map(p => ({ ...p, y: 0, active: true, t: 0 })),
    covers, rand,
    killsBlue: 0, killsRed: 0,
    events: [], // {type,...} UI/hanghoz, ürítve olvasáskor
  };
  // Csapatok: kék = 0 (játékos + 3 bot), piros = 1 (4 bot)
  const blueCls = opts.blueCls || ['striker', 'tank', 'striker', 'support'];
  const redCls = opts.redCls || ['tank', 'striker', 'striker', 'support'];
  const pw = opts.playerWeapon || 'mg';
  const pcls = opts.playerClass || 'striker';
  for (let i = 0; i < 4; i++) {
    const bot = i !== 0;
    state.mechs.push(makeMech(i, 0, bot ? blueCls[i] : pcls, bot ? (i % 3 === 0 ? 'mg' : i % 3 === 1 ? 'rocket' : 'rail') : pw,
      -10 + i * 6, 40, Math.PI, bot, opts.diff));
  }
  for (let i = 0; i < 4; i++) {
    state.mechs.push(makeMech(4 + i, 1, redCls[i], i % 3 === 0 ? 'mg' : i % 3 === 1 ? 'rocket' : 'rail',
      -10 + i * 6, -40, 0, true, opts.diff));
  }
  for (const m of state.mechs) m.respawns = state.livesPerRound;
  return state;
}

function mechById(s, id) { return s.mechs[id]; }

function collideCovers(s, m) {
  // Falak
  const H = ARENA / 2 - 1;
  if (m.x < -H) { m.x = -H; m.vx = 0; } if (m.x > H) { m.x = H; m.vx = 0; }
  if (m.z < -H) { m.z = -H; m.vz = 0; } if (m.z > H) { m.z = H; m.vz = 0; }
  // Fedezék AABB (csak ha alacsonyabb mint mech teteje és mech alacsonyan van)
  for (const c of s.covers) {
    if (m.y > c.h) continue;
    const dx = m.x - c.cx, dz = m.z - c.cz;
    const px = c.hx + 1.0 - Math.abs(dx), pz = c.hz + 1.0 - Math.abs(dz);
    if (px > 0 && pz > 0) {
      if (px < pz) { m.x = c.cx + (dx > 0 ? c.hx + 1.0 : -(c.hx + 1.0)); m.vx = 0; }
      else { m.z = c.cz + (dz > 0 ? c.hz + 1.0 : -(c.hz + 1.0)); m.vz = 0; }
    }
  }
}

// Ray vs mech kapszula (2D kör + magasság) — olcsó hitscan
function rayHitMech(ox, oz, oy, dx, dz, m, maxDist) {
  const rx = m.x - ox, rz = m.z - oz;
  const t = rx * dx + rz * dz;
  if (t < 0 || t > maxDist) return -1;
  const px = ox + dx * t, pz = oz + dz * t;
  const dd = Math.hypot(m.x - px, m.z - pz);
  if (dd > 1.0) return -1;
  if (oy > m.y + 2.5) return -1;
  return t;
}
function rayBlocked(s, ox, oz, dx, dz, maxDist) {
  let best = maxDist;
  for (const c of s.covers) {
    // slab test 2D
    let tmin = 0, tmax = best;
    const o = [ox, oz], d = [dx, dz], mn = [c.cx - c.hx, c.cz - c.hz], mx = [c.cx + c.hx, c.cz + c.hz];
    let ok = true;
    for (let i = 0; i < 2; i++) {
      if (Math.abs(d[i]) < 1e-8) { if (o[i] < mn[i] || o[i] > mx[i]) { ok = false; break; } }
      else {
        let t1 = (mn[i] - o[i]) / d[i], t2 = (mx[i] - o[i]) / d[i];
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
        tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
        if (tmin > tmax) { ok = false; break; }
      }
    }
    if (ok && tmin < best) best = tmin;
  }
  return best;
}

function damage(s, target, amount, fromId, isSplash) {
  if (!target.alive || target.spawnProt > 0) return;
  const cls = CLASSES[target.cls];
  amount *= (cls.dmgTaken || 1);
  if (target.dashT > 0) amount *= 0.5;
  if (target.shieldT > 0 && target.shieldHp > 0) {
    const ab = Math.min(target.shieldHp, amount);
    target.shieldHp -= ab; amount -= ab;
    if (target.shieldHp <= 0) target.shieldT = 0;
  }
  target.hp -= amount;
  target.hitT = 0.3;
  if (fromId != null && s.mechs[fromId]) s.mechs[fromId].dmg += amount;
  s.events.push({ type: 'hit', target: target.id, from: fromId, amount });
  if (target.hp <= 0) kill(s, target, fromId);
}
function kill(s, target, fromId) {
  target.alive = false; target.deaths++;
  target.hp = 0; target.empT = 0; target.shieldT = 0; target.overT = 0; target.super = null;
  if (fromId != null && s.mechs[fromId] && fromId !== target.id) {
    s.mechs[fromId].kills++;
    if (target.team === 1) s.killsBlue++; else s.killsRed++;
  }
  s.events.push({ type: 'kill', target: target.id, from: fromId });
  s.particles.push({ kind: 'boom', x: target.x, y: 1, z: target.z, t: 0.4 });
  // Respawn időzítés
  target.respawnT = 3.0;
  checkRoundEnd(s);
}
function checkRoundEnd(s) {
  const aliveBlue = s.mechs.some(m => m.team === 0 && (m.alive || m.respawns > 0));
  const aliveRed = s.mechs.some(m => m.team === 1 && (m.alive || m.respawns > 0));
  if (!aliveBlue || !aliveRed) {
    s.over = true;
    s.winner = !aliveRed ? 0 : 1;
    s.events.push({ type: 'round', winner: s.winner });
  }
}

function fireWeapon(s, m) {
  const w = WEAPONS[m.weapon];
  if (m.reloadT > 0 || m.fireCd > 0 || !m.alive) return;
  if (m.ammo <= 0) { startReload(m); return; }
  const dmgMul = (m.overT > 0 ? 2 : 1);
  m.fireCd = w.interval * (m.cls === 'striker' && (m.weapon === 'rocket' || m.weapon === 'rail') ? 0.8 : 1);
  m.ammo--; m.shots++;
  m.muzzle = 0.09;
  const ox = m.x, oz = m.z, oy = m.y + 1.6;
  const dx = Math.sin(m.yaw), dz = Math.cos(m.yaw);
  if (m.weapon === 'rocket') {
    s.projectiles.push({ kind: 'rocket', x: ox + dx * 1.5, y: oy, z: oz + dz * 1.5, vx: dx * 25, vy: 0, vz: dz * 25, team: m.team, from: m.id, dmg: w.dmg * dmgMul, life: 3 });
    s.events.push({ type: 'shot', id: m.id, w: 'rocket', ox, oy, oz });
  } else if (m.weapon === 'rail') {
    const dist = hitscan(s, m, w.range, w.dmg * dmgMul, true);
    s.events.push({ type: 'shot', id: m.id, w: 'rail', ox, oy, oz, dx, dz, dist });
  } else {
    // mg: kis szórás
    const sp = 1.5 * Math.PI / 180;
    const a = (s.rand() - 0.5) * 2 * sp;
    const ca = Math.cos(a), sa = Math.sin(a);
    const sx = dx * ca - dz * sa, sz = dx * sa + dz * ca;
    const dist = hitscan(s, m, w.range, w.dmg * dmgMul, false, sx, sz);
    s.events.push({ type: 'shot', id: m.id, w: 'mg', ox, oy, oz, dx: sx, dz: sz, dist });
  }
  if (m.ammo <= 0) startReload(m);
}
function hitscan(s, m, range, dmg, pierce, dx, dz) {
  dx = dx == null ? Math.sin(m.yaw) : dx;
  dz = dz == null ? Math.cos(m.yaw) : dz;
  const ox = m.x, oz = m.z, oy = m.y + 1.6;
  const blocked = rayBlocked(s, ox, oz, dx, dz, range);
  let bestT = blocked, bestM = null;
  for (const t of s.mechs) {
    if (t.id === m.id || !t.alive || t.team === m.team) continue;
    const tt = rayHitMech(ox, oz, oy, dx, dz, t, blocked);
    if (tt >= 0 && tt < bestT) { bestT = tt; bestM = t; }
  }
  // hordó találat
  for (const b of s.barrels) {
    if (!b.alive) continue;
    const t = rayHitMech(ox, oz, oy, dx, dz, { x: b.x, z: b.z, y: 0 }, blocked);
    if (t >= 0 && t < bestT) { bestT = t; bestM = null; hitBarrel(s, b, dmg, m.id); m.hits++; return bestT; }
  }
  if (bestM) {
    damage(s, bestM, dmg, m.id);
    m.hits++;
    if (pierce) {
      // második célpont 50%-kal
      let second = null, st = blocked;
      for (const t of s.mechs) {
        if (t.id === m.id || t.id === bestM.id || !t.alive || t.team === m.team) continue;
        const tt = rayHitMech(ox, oz, oy, dx, dz, t, blocked);
        if (tt >= 0 && tt < st && tt > bestT) { st = tt; second = t; }
      }
      if (second) damage(s, second, dmg * 0.5, m.id);
    }
  }
  return bestT;
}
function fireSword(s, m) {
  if (m.swordCd > 0 || !m.alive) return;
  m.swordCd = WEAPONS.sword.interval;
  const w = WEAPONS.sword;
  const dashBonus = m.dashT > 0 ? 1.25 : 1;
  const dmgMul = (m.overT > 0 ? 2 : 1) * dashBonus;
  for (const t of s.mechs) {
    if (t.id === m.id || !t.alive || t.team === m.team) continue;
    const d = Math.hypot(t.x - m.x, t.z - m.z);
    if (d > w.range + 1.0) continue;
    let da = Math.atan2(t.x - m.x, t.z - m.z) - m.yaw;
    while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    if (Math.abs(da) < Math.PI / 4 + 0.2) { damage(s, t, w.dmg * dmgMul, m.id); m.hits++; }
  }
  s.events.push({ type: 'shot', id: m.id, w: 'sword' });
}
function startReload(m) {
  const w = WEAPONS[m.weapon];
  if (m.reloadT > 0 || m.reserve <= 0 || m.ammo >= w.mag) return;
  let rt = w.reload;
  if (m.cls === 'striker' && (m.weapon === 'rocket' || m.weapon === 'rail')) rt *= 0.8;
  m.reloadT = rt;
}
function useSuper(s, m) {
  if (!m.super || !m.alive) return;
  if (m.super === 'emp') {
    // EMP dobás előre 20m, robban 8m
    const dx = Math.sin(m.yaw), dz = Math.cos(m.yaw);
    s.projectiles.push({ kind: 'empfly', x: m.x + dx * 1.5, y: m.y + 1.6, z: m.z + dz * 1.5, vx: dx * 18, vy: 0, vz: dz * 18, team: m.team, from: m.id, dist: 0, maxDist: 20 });
    m.super = null;
    s.events.push({ type: 'shot', id: m.id, w: 'emp' });
  } else if (m.super === 'shield') {
    const absorb = CLASSES[m.cls].dmgTaken && m.cls === 'tank' ? 150 : 100;
    m.shieldT = SUPER.shield.time; m.shieldHp = absorb; m.super = null;
    s.events.push({ type: 'shield', id: m.id });
  } else if (m.super === 'over') {
    m.overT = SUPER.over.time; m.super = null;
    s.events.push({ type: 'over', id: m.id });
  }
}
function explodeEmp(s, x, z, fromId) {
  const from = s.mechs[fromId];
  const bonus = from && from.cls === 'support' ? 1.0 : 0;
  for (const t of s.mechs) {
    if (!t.alive) continue;
    const d = Math.hypot(t.x - x, t.z - z);
    if (d < 8 && t.team !== s.mechs[fromId].team) {
      t.empT = 3.0 + bonus;
      t.vy = Math.min(t.vy, 0);
      damage(s, t, 10, fromId);
    }
  }
  s.particles.push({ kind: 'emp', x, y: 1, z, t: 0.5 });
  s.events.push({ type: 'emp', x, y: 1, z });
}
function explode(s, x, y, z, dmg, radius, fromId, team) {
  for (const t of s.mechs) {
    if (!t.alive || t.team === team && fromId != null && s.mechs[fromId] && t.id !== fromId) {
      // saját splash csak a lövőnek (50%), társnak nincs (friendly fire KI)
      if (!(t.id === fromId)) continue;
    }
    const d = Math.hypot(t.x - x, (t.y + 1) - y, t.z - z);
    if (d < radius) {
      const fall = 1 - 0.5 * (d / radius);
      let amt = dmg * fall;
      if (t.id === fromId) amt *= 0.5;
      damage(s, t, amt, fromId, true);
    }
  }
  s.particles.push({ kind: 'boom', x, y, z, t: 0.4 });
  s.events.push({ type: 'boom', x, y, z });
}
function hitBarrel(s, b, dmg, fromId) {
  b.hp -= dmg;
  if (b.hp <= 0 && b.alive) {
    b.alive = false;
    const m = s.mechs[fromId];
    explode(s, b.x, 1, b.z, 40, 5, fromId, m ? m.team : -1);
    // loot
    const r = s.rand();
    if (r < 0.25) s.pickups.push({ kind: 'hp', small: true, x: b.x, y: 0, z: b.z, active: true, t: 0, temp: true });
  }
}

// input: {mx,mz (strafe/forward -1..1), yaw, pitch, fire, sword, jump, dash, reload, use, pickup}
function updateMech(s, m, inp, dt) {
  if (!m.alive) {
    if (m.respawns > 0) {
      m.respawnT -= dt;
      if (m.respawnT <= 0) {
        m.respawns--;
        m.hp = m.maxHp; m.alive = true;
        m.x = -10 + (m.id % 4) * 6; m.z = m.team === 0 ? 40 : -40;
        m.y = 0; m.vy = 0; m.vx = 0; m.vz = 0;
        const w = WEAPONS[m.weapon]; m.ammo = w.mag;
        m.fuel = 3.0; m.spawnProt = 2.0;
        s.events.push({ type: 'respawn', id: m.id });
      }
    }
    return;
  }
  const cls = CLASSES[m.cls];
  if (m.spawnProt > 0) m.spawnProt -= dt;
  if (m.fireCd > 0) m.fireCd -= dt;
  if (m.swordCd > 0) m.swordCd -= dt;
  if (m.dashCd > 0) m.dashCd -= dt;
  if (m.empT > 0) m.empT -= dt;
  if (m.muzzle > 0) m.muzzle -= dt;
  if (m.hitT > 0) m.hitT -= dt;
  if (m.shieldT > 0) { m.shieldT -= dt; if (m.shieldT <= 0) m.shieldHp = 0; }
  if (m.overT > 0) m.overT -= dt;
  if (m.reloadT > 0) {
    m.reloadT -= dt;
    if (m.reloadT <= 0) {
      const w = WEAPONS[m.weapon];
      const need = w.mag - m.ammo, take = Math.min(need, m.reserve);
      m.ammo += take; m.reserve -= take;
    }
  }
  m.yaw = inp.yaw != null ? inp.yaw : m.yaw;
  m.pitch = inp.pitch != null ? inp.pitch : m.pitch;

  const dashBlocked = m.empT > 0;
  if (inp.dash && m.dashCd <= 0 && !dashBlocked && m.dashT <= 0) {
    const fx = inp.mx, fz = inp.mz;
    const len = Math.hypot(fx, fz) || 1;
    // dash a mozgás- vagy nézési irányba
    let dx = fx / len, dz = fz / len;
    if (!fx && !fz) { dx = Math.sin(m.yaw); dz = Math.cos(m.yaw); }
    // világ-koordinátába (kamera yaw = m.yaw feltételezéssel a botoknál; játékosnál input már világ)
    m.dashT = 0.18; m.dashDx = dx; m.dashDz = dz;
    m.dashCd = cls.dashCd;
    s.events.push({ type: 'dash', id: m.id });
  }
  let speed = cls.speed * (m.shieldT > 0 ? SUPER.shield.slow : 1);
  if (m.dashT > 0) {
    m.dashT -= dt;
    m.vx = m.dashDx * 77; m.vz = m.dashDz * 77;
  } else {
    // exponenciális közelítés a célsebességhez (arcade)
    const k = Math.min(1, 10 * dt);
    const airMul = m.y > 0.01 ? 0.6 : 1;
    m.vx += ((inp.mx || 0) * speed * airMul - m.vx) * k;
    m.vz += ((inp.mz || 0) * speed * airMul - m.vz) * k;
  }
  // függőleges: ugrás + jetpack
  const grounded = m.y <= 0.001;
  if (grounded && m.fuel < 3.0) m.fuel = Math.min(3.0, m.fuel + dt * (3.0 / 4.0));
  if (inp.jump && grounded && m.vy <= 0.01) { m.vy = 7; }
  if (inp.jump && !grounded && m.fuel > 0 && m.empT <= 0) {
    m.vy += 12 * dt;
    if (m.vy > 6) m.vy = 6;
    m.fuel = Math.max(0, m.fuel - dt);
  }
  m.vy -= GRAV * dt;
  m.x += m.vx * dt; m.z += m.vz * dt; m.y += m.vy * dt;
  if (m.y < 0) { m.y = 0; m.vy = 0; }
  if (m.y > 12) { m.y = 12; m.vy = 0; }
  collideCovers(s, m);
  // mech-mech puha szétlökés
  for (const o of s.mechs) {
    if (o.id === m.id || !o.alive) continue;
    const dx = m.x - o.x, dz = m.z - o.z;
    const d = Math.hypot(dx, dz);
    if (d < 2.0 && d > 1e-4) {
      const push = (2.0 - d) * 0.5;
      m.x += (dx / d) * push; m.z += (dz / d) * push;
    }
  }
  if (inp.fire) fireWeapon(s, m);
  if (inp.sword) fireSword(s, m);
  if (inp.reload) startReload(m);
  if (inp.use) { useSuper(s, m); inp.use = false; }
  if (inp.pickup) { tryPickup(s, m); inp.pickup = false; }
  // support aura
  if (m.cls === 'support' && m.alive) {
    for (const o of s.mechs) {
      if (o.team !== m.team || o.id === m.id || !o.alive) continue;
      if (Math.hypot(o.x - m.x, o.z - m.z) < 10 && o.hp < o.maxHp && s.time % 1 < dt) {
        o.hp = Math.min(o.maxHp, o.hp + 10);
      }
    }
  }
}

function tryPickup(s, m) {
  for (const p of s.pickups) {
    if (!p.active) continue;
    if (Math.hypot(p.x - m.x, p.z - m.z) > 1.5) continue;
    if (p.kind === 'hp') { if (m.hp >= m.maxHp) continue; m.hp = Math.min(m.maxHp, m.hp + (p.small ? 25 : 50)); }
    else if (p.kind === 'ammo') { const w = WEAPONS[m.weapon]; m.reserve = Math.min(w.reserve, m.reserve + w.mag); }
    else { if (m.super) continue; m.super = p.kind; }
    p.active = false;
    p.t = p.kind === 'hp' ? 20 : p.kind === 'ammo' ? 15 : SUPER[p.kind === 'over' ? 'over' : p.kind].respawn;
    s.events.push({ type: 'pickup', id: m.id, kind: p.kind });
    break;
  }
}

function updateProjectiles(s, dt) {
  for (let i = s.projectiles.length - 1; i >= 0; i--) {
    const p = s.projectiles[i];
    p.life -= dt;
    if (p.kind === 'empfly') {
      p.x += p.vx * dt; p.z += p.vz * dt;
      p.dist += Math.hypot(p.vx, p.vz) * dt;
      if (p.dist >= p.maxDist || p.life <= 0) {
        explodeEmp(s, p.x, p.z, p.from);
        s.projectiles.splice(i, 1);
      }
      continue;
    }
    p.x += p.vx * dt; p.z += p.vz * dt; p.y += (p.vy || 0) * dt;
    let dead = p.life <= 0;
    // fal
    if (Math.abs(p.x) > ARENA / 2 || Math.abs(p.z) > ARENA / 2) dead = true;
    // fedezék
    if (!dead) for (const c of s.covers) {
      if (Math.abs(p.x - c.cx) < c.hx && Math.abs(p.z - c.cz) < c.hz && p.y < c.h) { dead = true; break; }
    }
    // mech találat
    if (!dead && p.kind === 'rocket') {
      for (const t of s.mechs) {
        if (!t.alive || t.team === p.team) continue;
        if (Math.hypot(t.x - p.x, t.z - p.z) < 1.2 && p.y < t.y + 2.5) { dead = true; break; }
      }
      // hordó
      if (!dead) for (const b of s.barrels) {
        if (b.alive && Math.hypot(b.x - p.x, b.z - p.z) < 1.0) { hitBarrel(s, b, 60, p.from); dead = true; break; }
      }
    }
    if (dead) {
      if (p.kind === 'rocket') explode(s, p.x, p.y, p.z, p.dmg, WEAPONS.rocket.splashR, p.from, p.team);
      s.projectiles.splice(i, 1);
    }
  }
}

function update(s, inputs, dt) {
  s.time += dt;
  for (const m of s.mechs) updateMech(s, m, inputs[m.id] || {}, dt);
  updateProjectiles(s, dt);
  // pickup respawn
  for (const p of s.pickups) {
    if (!p.active) { p.t -= dt; if (p.t <= 0) { if (p.temp) { p.dead = true; } else { p.active = true; } } }
  }
  s.pickups = s.pickups.filter(p => !p.dead);
  // részecskék
  for (let i = s.particles.length - 1; i >= 0; i--) {
    s.particles[i].t -= dt;
    if (s.particles[i].t <= 0) s.particles.splice(i, 1);
  }
}

function snapshot(s) {
  return JSON.stringify({ t: s.time, mechs: s.mechs, proj: s.projectiles, pickups: s.pickups, barrels: s.barrels, kb: s.killsBlue, kr: s.killsRed });
}
function restore(s, json) {
  const d = JSON.parse(json);
  s.time = d.t; s.mechs = d.mechs; s.projectiles = d.proj; s.pickups = d.pickups; s.barrels = d.barrels;
  s.killsBlue = d.kb; s.killsRed = d.kr;
}
function drainEvents(s) { const e = s.events; s.events = []; return e; }

const Sim = { TICK, CLASSES, WEAPONS, SUPER, ARENA, create, update, snapshot, restore, drainEvents, fireWeapon, useSuper, tryPickup, hashStr };
if (typeof module !== 'undefined') module.exports = Sim;
