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

  if (!renderer) {
    document.getElementById('nogl').style.display = 'block';
    return;
  }
  if (!window.WebGLRenderingContext) document.getElementById('nogl').style.display = 'block';

  let S = null, round = 1, wins = [0, 0], totalRounds = 5;
  let inputs = [], aiT = 0, paused = false, inGame = false;
  let quality = 'auto', scale = 1.0, lowFpsT = 0, highFpsT = 0;
  let acc = 0, last = 0, fpsN = 0, fpsT = 0, fps = 60;
  const matchId = 'm' + Date.now().toString(36);

  function baseSize() {
    const w = Math.min(1100, canvas.clientWidth || 900);
    return [Math.round(w * scale), Math.round(w * 0.45 * scale)];
  }
  function applySize() { const [w, h] = baseSize(); renderer.setSize(Math.max(320, w), Math.max(180, h)); }

  function startMatch(cfg) {
    round = 1; wins = [0, 0]; totalRounds = cfg.rounds;
    startRound(cfg);
  }
  function startRound(cfg) {
    S = Sim.create(matchId, round, {
      rounds: totalRounds, livesPerRound: cfg.lives, playerClass: cfg.pcls,
      playerWeapon: cfg.pw, diff: cfg.diff,
    });
    inputs = S.mechs.map(() => ({}));
    inGame = true; paused = false;
    document.getElementById('pause').style.display = 'none';
    show('screen-game'); applySize();
    feed('Kör ' + round + ' — ' + (cfg.lives + 1) + ' élet / fő. Sok sikert!');
    input.lock();
  }
  function endRound() {
    wins[S.winner]++;
    results(S, wins);
    if (wins[0] > totalRounds / 2 || wins[1] > totalRounds / 2 || round >= totalRounds) {
      document.getElementById('match-winner').textContent =
        wins[0] === wins[1] ? 'Döntetlen!' : (wins[0] > wins[1] ? 'KÉK nyerte a meccset!' : 'PIROS nyerte a meccset!');
      document.getElementById('btn-next').style.display = 'none';
    } else {
      document.getElementById('match-winner').textContent = 'Következő kör: ' + (round + 1) + '/' + totalRounds;
      document.getElementById('btn-next').style.display = 'inline-block';
    }
    inGame = false;
    if (document.exitPointerLock) document.exitPointerLock();
    show('screen-result');
  }

  function handleEvents() {
    const pl = S.mechs[0];
    for (const e of Sim.drainEvents(S)) {
      if (e.type === 'shot') {
        audio.shot(e.w);
        if (e.w === 'mg' && e.dist != null)
          renderer.tracer(e.ox, e.oy, e.oz, e.ox + e.dx * e.dist, e.oy, e.oz + e.dz * e.dist, 1, 0.85, 0.3, 0.09);
        else if (e.w === 'rail' && e.dist != null)
          renderer.tracer(e.ox, e.oy, e.oz, e.ox + e.dx * e.dist, e.oy, e.oz + e.dz * e.dist, 0.35, 0.85, 1, 0.18);
        else if (e.w === 'sword') { const m = S.mechs[e.id]; if (m) renderer.arc(m.x, m.y, m.z, m.yaw); }
        if (e.id === 0 && (e.w === 'rail' || e.w === 'rocket')) renderer.shake(0.15);
      }
      else if (e.type === 'hit') {
        if (e.from === 0) {
          audio.hit();
          const t = S.mechs[e.target];
          if (t) renderer.burst(t.x, t.y + 1.4, t.z, 5, 1, 0.8, 0.3, 6);
          hitmarker(false);
        }
        if (e.target === 0) damageFlash();
      }
      else if (e.type === 'kill') {
        audio.kill();
        const t = S.mechs[e.target], f = e.from != null ? S.mechs[e.from] : null;
        feed((f ? (f.team ? 'Piros' : 'Kék') + '#' + f.id : '?') + ' ➜ ' + (t.team ? 'Piros' : 'Kék') + '#' + t.id, t.id === 0 ? 'bad' : f && f.id === 0 ? 'good' : '');
        if (f && f.id === 0) hitmarker(true);
        if (pl && t) {
          const d = Math.hypot(t.x - pl.x, t.z - pl.z);
          if (d < 12) renderer.shake(0.3);
        }
        if (e.target === 0) toast('Meghaltál! Respawn…');
      }
      else if (e.type === 'boom') {
        renderer.boom(e.x, e.y != null ? e.y : 1, e.z, false);
        if (pl) {
          const d = Math.hypot(e.x - pl.x, e.z - pl.z);
          if (d < 15) renderer.shake(0.35 * (1 - d / 15));
        }
      }
      else if (e.type === 'emp') {
        renderer.boom(e.x, 1, e.z, false);
        renderer.burst(e.x, 1, e.z, 10, 0.6, 0.4, 1, 7);
      }
      else if (e.type === 'pickup' && e.id === 0) { audio.pickup(); toast('Felvétel: ' + e.kind); }
      else if (e.type === 'respawn' && e.id === 0) toast('Vissza a harcba!');
    }
  }

  function frame(ts) {
    requestAnimationFrame(frame);
    if (!S || !inGame) return;
    if (paused) { last = ts; return; }
    if (!last) last = ts;
    let dt = (ts - last) / 1000; last = ts;
    if (dt > 0.1) dt = 0.1; // delta clamp
    // FPS mérés + auto minőség
    fpsN++; fpsT += dt;
    if (fpsT >= 0.5) { fps = Math.round(fpsN / fpsT); fpsN = 0; fpsT = 0;
      if (quality === 'auto') {
        if (fps < 45) { lowFpsT += 0.5; highFpsT = 0; } else if (fps > 58) { highFpsT += 0.5; lowFpsT = 0; } else { lowFpsT = 0; highFpsT = 0; }
        if (lowFpsT >= 2) {
          lowFpsT = 0;
          if (scale > 0.66) scale = 0.66; else if (scale > 0.5) scale = 0.5;
          else { scale = 0.5; }
          applySize(); toast('Minőség csökkentve: ' + scale);
        }
        if (highFpsT >= 5 && scale < 1.0) { highFpsT = 0; scale = scale < 0.66 ? 0.66 : 1.0; applySize(); }
      }
    }
    acc += dt;
    let steps = 0;
    // bot AI 10Hz
    aiT += dt;
    if (aiT >= 0.1) {
      aiT = 0;
      const focus = focusOfPlayer();
      for (const m of S.mechs) if (m.bot && m.alive) inputs[m.id] = think(S, m, focus);
    }
    inputs[0] = input.poll();
    if (!input.isLocked() && S.mechs[0].alive) { inputs[0].fire = false; } // kattints a lock-hoz
    while (acc >= Sim.TICK && steps < 3) {
      Sim.update(S, inputs, Sim.TICK);
      // egyszeri inputok ürítése tick után (dash/reload/use/pickup éldetekció a poll-ban van)
      acc -= Sim.TICK; steps++;
    }
    if (steps === 3) acc = 0;
    handleEvents();
    renderer.render(S, 0, input.state.yaw, input.state.pitch, dt);
    hud(S, 0, fps, quality === 'auto' ? 'auto ' + scale : quality);
    if (S.over) endRound();
  }

  function focusOfPlayer() {
    // játékos által sebzett / célzott ellenfél: legközelebbi élő ellenség a célkereszt irányában
    const p = S.mechs[0];
    let best = null, bd = 1e9;
    for (const t of S.mechs) {
      if (!t.alive || t.team === 0) continue;
      const d = Math.hypot(t.x - p.x, t.z - p.z);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }

  // ---- UI kötések ----
  show('screen-menu');
  document.getElementById('btn-lobby').onclick = () => show('screen-lobby');
  document.getElementById('btn-help').onclick = () => {
    const h = document.getElementById('help'); h.style.display = h.style.display === 'none' ? 'block' : 'none';
  };
  document.getElementById('btn-start').onclick = () => { startMatch(lobbyValues()); };
  document.getElementById('btn-next').onclick = () => { round++; startRound(lobbyValues()); };
  document.getElementById('btn-again').onclick = () => { startMatch(lobbyValues()); };
  document.getElementById('btn-tolobby').onclick = () => show('screen-lobby');
  document.getElementById('btn-resume').onclick = () => { paused = false; document.getElementById('pause').style.display = 'none'; input.lock(); };
  document.getElementById('btn-quit').onclick = () => { inGame = false; show('screen-lobby'); document.getElementById('pause').style.display = 'none'; };
  document.getElementById('sel-quality').onchange = e => {
    quality = e.target.value;
    scale = quality === 'low' ? 0.5 : quality === 'high' ? 1.0 : scale;
    renderer.setQuality(quality);
    applySize();
  };
  document.getElementById('sens').oninput = e => { input.state.sens = +e.target.value; };
  addEventListener('keydown', e => {
    if ((e.code === 'Escape' || e.code === 'KeyP') && inGame) {
      paused = !paused;
      document.getElementById('pause').style.display = paused ? 'block' : 'none';
    }
    if (e.code === 'KeyM') toast(audio.toggleMute() ? 'Némítva' : 'Hang be');
  });
  addEventListener('resize', () => { if (inGame) applySize(); });
  if (location.search.includes('fps=1')) document.getElementById('fps').style.display = 'block';
  requestAnimationFrame(frame);
})();
