// Mech Arena — net stub (multiplayer-készen). MVP-ben nincs hálózat.
'use strict';
const Net = {
  connected: false,
  connect() { return false; },
  snapshot(s) { return s.snapshot ? s.snapshot(s) : null; },
  apply() {},
};
if (typeof module !== 'undefined') module.exports = Net;
