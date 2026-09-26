// Mech Arena — UI (lobby, HUD, szünet, eredmény). DOM-függő, sim-független.
'use strict';
function el(id) { return document.getElementById(id); }
function show(id) {
  for (const s of ['screen-menu', 'screen-lobby', 'screen-game', 'screen-result'])
    el(s).style.display = s === id ? 'block' : 'none';
}
function lobbyValues() {
  return {
    pcls: el('sel-class').value, pw: el('sel-weapon').value,
    rounds: +el('sel-rounds').value, lives: +el('sel-lives').value,
    diff: el('sel-diff').value,
  };
}
function feed(msg, cls) {
  const kf = el('killfeed');
  const d = document.createElement('div');
  d.textContent = msg; if (cls) d.className = cls;
  kf.prepend(d);
  while (kf.children.length > 5) kf.lastChild.remove();
}
function toast(msg) {
  const t = el('toast'); t.textContent = msg; t.style.opacity = 1;
  clearTimeout(t._h); t._h = setTimeout(() => t.style.opacity = 0, 1800);
}
function hud(s, pid, fps, quality) {
  const m = s.mechs[pid];
  if (!m) return;
  el('hp-fill').style.width = (100 * Math.max(0, m.hp) / m.maxHp) + '%';
  el('hp-num').textContent = Math.ceil(Math.max(0, m.hp)) + '/' + m.maxHp;
  el('fuel-fill').style.width = (100 * m.fuel / 3) + '%';
  el('dash-fill').style.width = (100 * Math.max(0, 1 - m.dashCd / 3)) + '%';
  const W = { mg: 'Géppuska', rocket: 'Rakéta', rail: 'Railgun' };
  el('ammo').textContent = W[m.weapon] + '  ' + m.ammo + '/' + m.reserve + (m.reloadT > 0 ? ' …' : '');
  const S = { emp: 'EMP', shield: 'Pajzs', over: 'Overdrive' };
  el('super').textContent = 'Szuper: ' + (m.super ? S[m.super] + ' (Q)' : '—');
  let debuff = '';
  if (m.empT > 0) debuff += ' [EMP ' + m.empT.toFixed(1) + 's]';
  if (m.shieldT > 0) debuff += ' [PAJZS]';
  if (m.overT > 0) debuff += ' [OVER ' + m.overT.toFixed(0) + 's]';
  el('debuff').textContent = debuff;
  el('round-info').textContent = 'Kör ' + s.round + '/' + s.rounds + '  Kék ' + s.killsBlue + ' : ' + s.killsRed + ' Piros  Élet: ' + (m.respawns + (m.alive ? 1 : 0));
  el('fps').textContent = fps + ' fps · ' + quality;
}
function results(s, wins) {
  let h = '<table><tr><th>#</th><th>Csapat</th><th>Kaszt</th><th>K</th><th>D</th><th>Sebzés</th><th>Pont%</th></tr>';
  const rows = [...s.mechs].sort((a, b) => b.kills - a.kills);
  for (const m of rows) {
    const acc = m.shots ? Math.round(100 * m.hits / m.shots) : 0;
    h += '<tr' + (m.id === 0 ? ' class="me"' : '') + '><td>' + (m.bot ? (m.team ? 'R-' : 'B-') + m.id : 'TE') + '</td><td>' + (m.team ? 'Piros' : 'Kék') + '</td><td>' + m.cls + '</td><td>' + m.kills + '</td><td>' + m.deaths + '</td><td>' + Math.round(m.dmg) + '</td><td>' + acc + '</td></tr>';
  }
  el('result-table').innerHTML = h + '</table>';
  el('result-title').textContent = (s.winner === 0 ? 'KÉK csapat nyerte a kört!' : 'PIROS csapat nyerte a kört!') + '  (' + wins[0] + ' : ' + wins[1] + ')';
}
if (typeof module !== 'undefined') module.exports = { show, lobbyValues, feed, toast, hud, results };
