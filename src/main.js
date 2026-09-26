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

  // egyezetlenség seed-je a meccsekhez
  const matchId = 'm' + Date.now().toString(36);

  // sim állapot létrehozása (match/cikkszám alapján determinisztikus)
  let S = Sim.create(matchId, 1, {
    rounds: 5, livesPerRound: 2, playerClass: 'striker', playerWeapon: 'mg', diff: 'normal'
  });
  // inputök inicializálása minden mech-hez
  let inputs = S.mechs.map(() => ({}));
  let inGame = false, paused = false;

  // UI hivatkozások
  const hpNum = document.getElementById('hp-num');
  const hpFill = document.getElementById('hp-fill');
  const fuelFill = document.getElementById('fuel-fill');
  const dashFill = document.getElementById('dash-fill');
  const roundInfo = document.getElementById('round-info');
  const fpsEl = document.getElementById('fps');

  function updateHud() {
    const p = S.mechs[0] || {};
    hpNum.textContent = p.hp ?? 0;
    const f = p.fuel ?? 0, d = p.dashCd ?? 0;
    hpFill.style.width = (p.hp && p.maxHp ? (p.hp / p.maxHp * 100) : 0) + '%';
    fuelFill.style.width = (f / 120 * 100) + '%';
    dashFill.style.width = (d / 60 * 100) + '%';
    roundInfo.textContent = 'Kör 1/' + S.rounds;
    if (location.search.includes('fps=1')) fpsEl.textContent = 'FPS: —';
  }

  function show(sid) {
    ['screen-menu','screen-lobby','screen-game','screen-result'].forEach(x=>document.getElementById('screen-'+x).style.display='none');
    document.getElementById('screen-'+sid).style.display='block';
  }
  function feed(msg, type) {
    const toast = document.getElementById('toast');
    toast.style.opacity = 1; toast.textContent = msg;
    setTimeout(()=>toast.style.opacity=0, 3000);
  }

  // lobbyértékek olvasása (DOMról)
  function lobbyValues() {
    return {
      pcls: document.getElementById('sel-class').value,
      pw: document.getElementById('sel-weapon').value,
      rounds: +document.getElementById('sel-rounds').value,
      lives: +document.getElementById('sel-lives').value,
      diff: document.getElementById('sel-diff').value
    };
  }

  // menü gombok kötései
  document.getElementById('btn-lobby').onclick = () => show('screen-lobby');
  document.getElementById('btn-help').onclick = () => {
    const h = document.getElementById('help'); h.style.display = h.style.display === 'none' ? 'block' : 'none';
  };
  document.getElementById('btn-start').onclick = () => {
    const cfg = lobbyValues();
    S = Sim.create(matchId, 1, {
      rounds: cfg.rounds, livesPerRound: cfg.lives,
      playerClass: cfg.pcls, playerWeapon: cfg.pw, diff: cfg.diff
    });
    inputs = S.mechs.map(() => ({}));
    inGame = true; paused = false;
    show('screen-game');
    input.lock();
  };
  document.getElementById('btn-next').onclick = () => { show('screen-result'); };
  document.getElementById('btn-again').onclick = () => show('screen-lobby');
  document.getElementById('btn-tolobby').onclick = () => show('screen-lobby');
  document.getElementById('btn-resume').onclick = () => { paused = false; document.getElementById('pause').style.display = 'none'; input.lock(); };
  document.getElementById('btn-quit').onclick = () => { inGame = false; show('screen-lobby'); inGame = false; document.getElementById('pause').style.display = 'none'; };
  document.getElementById('sel-quality').onchange = e => {
    renderer.setQuality(e.target.value);
  };
  document.getElementById('sens').oninput = e => { input.state.sens = +e.target.value; };
  addEventListener('keydown', e => {
    if ((e.code === 'Escape' || e.code === 'KeyP') && inGame) {
      paused = !paused;
      document.getElementById('pause').style.display = paused ? 'block' : 'none';
    }
    if (e.code === 'KeyM') toast(audio.toggleMute ? audio.toggleMute() : false ? 'Némítva' : 'Hang be');
  });
  addEventListener('resize', () => { if (inGame) renderer.setSize(canvas.width, canvas.height); });
  if (location.search.includes('fps=1')) document.getElementById('fps').style.display = 'block';

  // fő animloop
  let last = 0, acc = 0, steps = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    if (!S || !inGame) { updateHud(); return; }
    if (paused) { last = ts; updateHud(); return; }
    if (!last) last = ts;
    let dt = (ts - last) / 1000; last = ts;
    if (dt > 0.1) dt = 0.1;
    // FPS mérést és egyszerű minőség-beállítást lefúrjuk (opcionális)
    acc += dt;
    while (acc >= Sim.TICK && steps < 3) {
      Sim.update(S, inputs, Sim.TICK);
      acc -= Sim.TICK; steps++;
    }
    if (steps === 3) acc = 0;

    // játékos inputpoll -> csak az első mech (játékos)
    inputs[0] = input.poll();

    // pointer lock: ha nincs locked és alive, tűzógomb tiltása
    if (!input.isLocked() && S.mechs[0] && S.mechs[0].alive) {
      inputs[0].fire = false; inputs[0].sword = false;
    }

    // bot AI minden tick után (10Hz)
    if (acc >= Sim.TICK) {
      const ids = Object.keys(S.mechs).map(Number).sort((a,b)=>b-a);
      const pid = ids[0];
      for (const m of S.mechs) if (m.bot && m.alive) {
        const f = focusOfPlayer();
        inputs[m.id] = think(S, m, f); // think van sim.js-ben vagy itt implementáljuk
      }
    }

    // események kezelése + render + UI
    Sim.drainEvents(S); // visszafelé olvas + ürí
    renderer.render(S, 0, input.state.yaw, input.state.pitch, dt);
    updateHud();

    if (S.over) {
      const w = S.winner === 0 ? 'Kék' : 'Piros';
      feed(w + ' nyert a meccset!');
      setTimeout(()=>{ show('screen-lobby'); }, 1500);
    }
  }

  function focusOfPlayer() {
    const p = S.mechs[0];
    if (!p || !p.alive) return null;
    let best = null, bd = 1e9;
    for (const t of S.mechs) {
      if (!t.alive || t.team === 0) continue;
      const d = Math.hypot(t.x - p.x, t.z - p.z);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }

  // bot gondolkodó (egyszerű): irányba turtle, lövés ha van cél a terjedőben
  function think(s, mech, focus) {
    const out = { yaw: mech.yaw, pitch: mech.pitch, fire: false, sword: false, jump: false, dash: false, reload: false, use: false, pickup: false, mx: 0, mz: 0 };
    if (!focus) return out;
    const dx = focus.x - mech.x, dz = focus.z - mech.z;
    let targetYaw = Math.atan2(dx, dz);
    // normálizálás
    let dy = targetYaw - mech.yaw;
    while (dy > Math.PI) dy -= 2*Math.PI; while (dy < -Math.PI) dy += 2*Math.PI;
    out.yaw = mech.yaw + dy * 0.15; // lassú nyújulás
    // lés ha a cél elfogható
    const d = Math.hypot(dx, dz);
    if (d < 50 && !mech.empT) { out.fire = true; }
    return out;
  }

  requestAnimationFrame(frame);
})();