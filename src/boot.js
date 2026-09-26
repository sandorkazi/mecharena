// Mech Arena — boot: three.js renderer próba, hibára box-fallback.
// file:// vagy offline hálózat esetén a moduláris three.js nem töltődik:
// ilyenkor a saját box-rendererrel indul a játék (mindig játszható marad).
'use strict';

(function () {
  const canvas = document.getElementById('c');

  function startFallback(reason) {
    console.warn('[boot] fallback box-renderer:', reason);
    startGame(createRenderer(canvas));
    if (location.protocol === 'file:') {
      toast('Tipp: teljes grafikához indítsd szerverről: python3 -m http.server');
      feed('Box-grafika (file:// mód) — teljes grafika Pages-en / lokális szerverrel.');
    }
  }

  async function boot() {
    try {
      const [{ createRenderer3 }] = await Promise.all([import('./render3.js')]);
      const r3 = await createRenderer3(canvas, {
        onProgress(p) {
          feed('Modell töltés… ' + Math.round(p * 100) + '%');
        },
      });
      startGame(r3);
    } catch (e) {
      startFallback(e && e.message ? e.message : e);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
