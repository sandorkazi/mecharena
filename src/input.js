// Mech Arena — input absztrakció (billentyűzet + egér, Pointer Lock).
'use strict';
function createInput(canvas) {
  const keys = {};
  const st = { yaw: Math.PI, pitch: 0, fire: false, sword: false, jump: false, dash: false, reload: false, use: false, pickup: false, fwd: 0, str: 0, sens: 1.2 };
  let locked = false;
  addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'KeyR') st.reload = true;
    if (e.code === 'KeyQ') st.use = true;
    if (e.code === 'KeyE') st.pickup = true;
    if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  canvas.addEventListener('click', () => { if (!locked) canvas.requestPointerLock(); });
  document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === canvas; });
  addEventListener('mousemove', e => {
    if (!locked) return;
    st.yaw -= e.movementX * 0.0022 * st.sens;
    st.pitch -= e.movementY * 0.0022 * st.sens;
    st.pitch = Math.max(-1.2, Math.min(1.2, st.pitch));
  });
  canvas.addEventListener('mousedown', e => {
    if (!locked) return;
    if (e.button === 0) st.fire = true;
    if (e.button === 2) st.sword = true;
  });
  addEventListener('mouseup', e => {
    if (e.button === 0) st.fire = false;
    if (e.button === 2) st.sword = false;
  });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  function poll() {
    const f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
    const r = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    // kamera-relatív -> világ (yaw körül forgatva)
    const s = Math.sin(st.yaw), c = Math.cos(st.yaw);
    const out = {
      mx: (s * f + c * r), mz: (c * f - s * r),
      yaw: st.yaw, pitch: st.pitch, fire: st.fire,
      sword: st.sword, jump: !!keys.Space,
      dash: !!keys.ShiftLeft || !!keys.ShiftRight,
      reload: st.reload, use: st.use, pickup: st.pickup,
    };
    // dash él-detekció: csak lenyomás pillanatában
    out.dash = out.dash && !poll._dashHeld;
    poll._dashHeld = !!(keys.ShiftLeft || keys.ShiftRight);
    st.reload = false; st.use = false; st.pickup = false; st.sword = st.sword && false || st.sword;
    // kard: jobb klikk folyamatos is ok (sim cooldownol)
    return out;
  }
  return { state: st, poll, isLocked: () => locked, lock: () => canvas.requestPointerLock() };
}
if (typeof module !== 'undefined') module.exports = { createInput };
