// Mech Arena — fő loop: fix 60Hz sim + render + botok + körök + auto minőség.
'use strict';
(function () {
  const canvas = document.getElementById('c');
  const renderer = createRenderer(canvas);
  const input = createInput(canvas);
  const audio = createAudio();
  const isDevelop = location.pathname.includes('/develop');
  document.getElementById('branch').textContent = isDevelop ? 'develop' : 'main';
  document.getElementById('branch').className = 'badge ' + (isDevelop ? 'develop' : 'main');

  if (location.search.includes('fps=1')) document.getElementById('fps').style.display = 'block';

  let S = null, round = 1, wins = [0, 0], totalRounds = 5;
  let inputs = [], aiT = 0, paused = false, inGame = false;

  function frame(now) {
    if (!frame.prev) frame.prev = now;
    const dt = Math.min((now - frame.prev) / 1000, 0.25);
    frame.prev = now;
    const s = sim.get();
    const i = input.poll();
    const ids = Object.keys(s.mechs).map(Number).sort((a, b) => b - a);
    const playerId = ids[0], botIds = ids.slice(1);

    // sim
    for (const k of Object.keys(s.mechs)) sim.update(+k, i, dt, ids, audio);

    // bot ágyazat
    if (botIds.length) {
      aiT += dt;
      const interval = 1 / (1 + s.difficulty * 2);
      if (aiT > interval) {
        const b = s.mechs[botIds[Math.floor(Math.random() * botIds.length)]];
        if (b.alive && !paused) for (const k of botIds) if (k !== playerId && s.mechs[k].alive) {
          const id2 = input.beam(b.x, b.z, s.mechs[k].x, s.mechs[k].z);
          if (id2) sim.update(k, { fire: 1, sword: 1, jump: false, dash: false, reload: false, use: false, pickup: false, mx: 0, mz: 0, pitch: 0, yaw: 0, sens: i.sens }, dt, ids, audio);
        }
        aiT = 0;
      }
    }

    // renderer
    const [, camYaw, camPitch] = input.cam();
    renderer.render(s, playerId, camYaw, camPitch, dt);

    // UI
    const p = s.mechs[playerId] || {};
    document.getElementById('hp-num').textContent = p.hp ?? 0;
    const f = p.fuel ?? 0, d = p.dashCd ?? 0;
    const hpFill = document.getElementById('hp-fill'), fuelFill = document.getElementById('fuel-fill'), dashFill = document.getElementById('dash-fill');
    hpFill.style.width = (p.hp && p.maxHp ? (p.hp / p.maxHp * 100) : 0) + '%';
    fuelFill.style.width = (f / 120 * 100) + '%';
    dashFill.style.width = (d / 60 * 100) + '%';
    document.getElementById('round-info').textContent = round + '/' + totalRounds;
    if (location.search.includes('fps=1')) document.getElementById('fps').textContent = Math.round(1000 / dt) + ' FPS';
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();