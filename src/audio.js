// Mech Arena — WebAudio szintézis (nincs audio fájl).
'use strict';
function createAudio() {
  let ctx = null, muted = false;
  function ac() {
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function beep(freq, dur, type, vol) {
    if (muted) return;
    const c = ac(); if (!c) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'square'; o.frequency.value = freq;
    g.gain.setValueAtTime(vol || 0.08, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.connect(g); g.connect(c.destination);
    o.start(); o.stop(c.currentTime + dur);
  }
  return {
    shot(w) {
      if (w === 'mg') beep(700 + Math.random() * 200, 0.05, 'square', 0.04);
      else if (w === 'rocket') beep(180, 0.25, 'sawtooth', 0.1);
      else if (w === 'rail') beep(1200, 0.3, 'sawtooth', 0.09);
      else if (w === 'sword') beep(300, 0.12, 'triangle', 0.09);
      else if (w === 'emp') beep(200, 0.4, 'sine', 0.12);
    },
    hit() { beep(1000, 0.04, 'square', 0.05); },
    kill() { beep(220, 0.3, 'sawtooth', 0.12); },
    pickup() { beep(880, 0.12, 'sine', 0.1); },
    toggleMute() { muted = !muted; return muted; },
  };
}
if (typeof module !== 'undefined') module.exports = { createAudio };
