// Mech Arena — bot AI (10 Hz FSM). Csak sim állapotot olvas/ír inputokon át.
'use strict';

function losClear(s, a, b) {
  // olcsó: fedezék AABB metszés a-b szakaszon (2D mintavétel)
  const steps = 8;
  for (let i = 1; i < steps; i++) {
    const x = a.x + (b.x - a.x) * (i / steps), z = a.z + (b.z - a.z) * (i / steps);
    for (const c of s.covers) {
      if (Math.abs(x - c.cx) < c.hx && Math.abs(z - c.cz) < c.hz) return false;
    }
  }
  return true;
}
function nearestEnemy(s, m) {
  let best = null, bd = 50; // látótáv 50m
  for (const t of s.mechs) {
    if (!t.alive || t.team === m.team) continue;
    const d = Math.hypot(t.x - m.x, t.z - m.z);
    if (d < bd && losClear(s, m, t)) { bd = d; best = t; }
  }
  return best ? { m: best, d: bd } : null;
}
function nearestPickup(s, m, kinds) {
  let best = null, bd = 1e9;
  for (const p of s.pickups) {
    if (!p.active || (kinds && !kinds.includes(p.kind))) continue;
    const d = Math.hypot(p.x - m.x, p.z - m.z);
    if (d < bd) { bd = d; best = p; }
  }
  return best ? { p: best, d: bd } : null;
}

// bot input generálás 10Hz-en; közte a main.js tartja az előző inputot
function think(s, m, focusTarget) {
  const ai = m.ai;
  ai.t -= 0.1;
  const seen = nearestEnemy(s, m);
  const err = m.diff === 'easy' ? 4 * Math.PI / 180 : 2 * Math.PI / 180;
  const inp = { mx: 0, mz: 0, yaw: m.yaw, fire: false, sword: false, jump: false, dash: false, reload: false, use: false, pickup: false };

  if (ai.t <= 0) {
    ai.t = 0.4 + s.rand() * 0.4;
    ai.strafe = s.rand() < 0.5 ? -1 : 1;
    if (m.hp < m.maxHp * 0.3) ai.state = 'retreat';
    else if (m.ammo === 0) ai.state = 'cover';
    else if (!m.super && s.rand() < 0.25) ai.state = 'seek';
    else ai.state = 'engage';
    if (ai.state === 'seek') {
      const pk = nearestPickup(s, m, ['hp', 'ammo', 'emp', 'shield', 'over']) || nearestPickup(s, m);
      if (pk) { ai.tx = pk.p.x; ai.tz = pk.p.z; }
    }
  }
  let tgt = seen ? seen.m : null;
  if (focusTarget && focusTarget.alive && Math.hypot(focusTarget.x - m.x, focusTarget.z - m.z) < 50 && losClear(s, m, focusTarget)) tgt = focusTarget;

  if (ai.state === 'retreat') {
    const pk = nearestPickup(s, m, ['hp']);
    const gx = pk ? pk.p.x : -m.x, gz = pk ? pk.p.z : -m.z;
    moveToward(m, inp, gx, gz, 1);
    if (tgt && seen && seen.d < 20) { aimAt(m, inp, tgt, err); inp.fire = seen.d < 25; }
    if (m.hp > m.maxHp * 0.7) ai.state = 'engage';
    return inp;
  }
  if (ai.state === 'seek') {
    moveToward(m, inp, ai.tx, ai.tz, 1);
    if (Math.hypot(ai.tx - m.x, ai.tz - m.z) < 2) { inp.pickup = true; ai.state = 'engage'; }
    if (tgt && Math.hypot(tgt.x - m.x, tgt.z - m.z) < 15) { aimAt(m, inp, tgt, err); inp.fire = true; }
    return inp;
  }
  if (!tgt) {
    // közép felé + pickup
    const pk = nearestPickup(s, m);
    moveToward(m, inp, pk ? pk.p.x * 0.5 : 0, pk ? pk.p.z * 0.5 : 0, 0.7);
    if (pk && Math.hypot(pk.p.x - m.x, pk.p.z - m.z) < 2) inp.pickup = true;
    // support a játékost követi
    if (m.cls === 'support') {
      const pl = s.mechs[0];
      if (pl && pl.alive && Math.hypot(pl.x - m.x, pl.z - m.z) > 12) moveToward(m, inp, pl.x, pl.z, 0.8);
    }
    return inp;
  }
  // engage
  aimAt(m, inp, tgt, err);
  const d = Math.hypot(tgt.x - m.x, tgt.z - m.z);
  const want = m.weapon === 'sword' || d > 30 ? 1 : d < 10 ? -1 : 0;
  // strafe + közeledés/távolodás a cél körül
  const ang = Math.atan2(tgt.x - m.x, tgt.z - m.z);
  const fx = Math.sin(ang), fz = Math.cos(ang);
  const sx = Math.cos(ang) * ai.strafe, sz = -Math.sin(ang) * ai.strafe;
  let mx = fx * want * 0.8 + sx * 0.6, mz = fz * want * 0.8 + sz * 0.6;
  const l = Math.hypot(mx, mz) || 1;
  inp.mx = mx / l; inp.mz = mz / l;
  const range = m.weapon === 'mg' ? 45 : m.weapon === 'rocket' ? 30 : m.weapon === 'rail' ? 70 : 3;
  inp.fire = d < range;
  if (m.weapon === 'mg' && m.ammo === 0) inp.reload = true;
  // kard ha közel
  if (d < 3.5) inp.sword = true;
  // dash oldalra ha lőnek rá (olcsó random)
  if (d < 20 && s.rand() < 0.06) inp.dash = true;
  // jump/jetpack ritkán
  if (d > 15 && s.rand() < 0.05 && m.fuel > 1) inp.jump = true;
  // szuper használat
  if (m.super === 'emp' && d < 18) inp.use = true;
  if (m.super === 'shield' && m.hp < m.maxHp * 0.5) inp.use = true;
  if (m.super === 'over' && d < 30) inp.use = true;
  return inp;
}
function moveToward(m, inp, gx, gz, sp) {
  const dx = gx - m.x, dz = gz - m.z, l = Math.hypot(dx, dz) || 1;
  inp.mx = (dx / l) * sp; inp.mz = (dz / l) * sp;
  inp.yaw = Math.atan2(dx, dz);
}
function aimAt(m, inp, tgt, err) {
  const lead = 0; // MVP: nincs lövedék-előretartás (rakétánál későbbi finomítás)
  inp.yaw = Math.atan2(tgt.x - m.x, tgt.z - m.z) + (m.ai.t > 0 ? 0 : (Math.sin(m.id * 7 + tgt.id) * err)) + lead;
}

if (typeof module !== 'undefined') module.exports = { think };
