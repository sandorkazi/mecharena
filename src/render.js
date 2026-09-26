// Mech Arena — batch-elt WebGL1 renderer (low-poly, vertex color, textúra nélkül).
// 1 program, 2 draw call (opaque lit + FX additive unlit), CPU-oldali box-batch.
// Költség: <10 draw call összesen, <20k tris. Nincs futásidejű `new` a frame-ben.
'use strict';

const VS = `
attribute vec3 aPos; attribute vec3 aNorm; attribute vec3 aCol;
uniform mat4 uMVP; uniform vec3 uLight; uniform float uFull;
varying vec3 vCol; varying float vSh; varying float vDepth;
void main(){ gl_Position = uMVP * vec4(aPos,1.0);
  float d = max(dot(normalize(aNorm), normalize(uLight)), 0.0);
  vSh = mix(0.42+0.58*d, 1.0, uFull); vCol = aCol; vDepth = gl_Position.w; }`;
const FS = `
precision mediump float; varying vec3 vCol; varying float vSh; varying float vDepth;
uniform vec3 uFog; uniform vec2 uFogR;
void main(){ float f = clamp((vDepth-uFogR.x)/(uFogR.y-uFogR.x), 0.0, 1.0);
  vec3 c = mix(vCol*vSh, uFog, f);
  gl_FragColor = vec4(c, 1.0); }`;

const CUBE_POS = new Float32Array([
  -1,-1,-1, 1,-1,-1, 1,1,-1, -1,-1,-1, 1,1,-1, -1,1,-1,
  -1,-1,1, -1,1,1, 1,1,1, -1,-1,1, 1,1,1, 1,-1,1,
  -1,-1,-1, -1,1,-1, -1,1,1, -1,-1,-1, -1,1,1, -1,-1,1,
  1,-1,-1, 1,-1,1, 1,1,1, 1,-1,-1, 1,1,1, 1,1,-1,
  -1,-1,-1, -1,-1,1, 1,-1,1, -1,-1,-1, 1,-1,1, 1,-1,-1,
  -1,1,-1, 1,1,-1, 1,1,1, -1,1,-1, 1,1,1, -1,1,1,
]);
const CUBE_NORM = new Float32Array([
  0,0,-1, 0,0,-1, 0,0,-1, 0,0,-1, 0,0,-1, 0,0,-1,
  0,0,1, 0,0,1, 0,0,1, 0,0,1, 0,0,1, 0,0,1,
  -1,0,0, -1,0,0, -1,0,0, -1,0,0, -1,0,0, -1,0,0,
  1,0,0, 1,0,0, 1,0,0, 1,0,0, 1,0,0, 1,0,0,
  0,-1,0, 0,-1,0, 0,-1,0, 0,-1,0, 0,-1,0, 0,-1,0,
  0,1,0, 0,1,0, 0,1,0, 0,1,0, 0,1,0, 0,1,0,
]);

function mat4persp(out, fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2);
  out.fill(0);
  out[0] = f / aspect; out[5] = f; out[10] = (far + near) / (near - far);
  out[11] = -1; out[14] = (2 * far * near) / (near - far);
}
function mat4look(out, eye, at, up) {
  const zx = eye[0]-at[0], zy = eye[1]-at[1], zz = eye[2]-at[2];
  let l = Math.hypot(zx,zy,zz) || 1; const z = [zx/l, zy/l, zz/l];
  const xx = up[1]*z[2]-up[2]*z[1], xy = up[2]*z[0]-up[0]*z[2], xz = up[0]*z[1]-up[1]*z[0];
  l = Math.hypot(xx,xy,xz) || 1; const x = [xx/l, xy/l, xz/l];
  const y = [z[1]*x[2]-z[2]*x[1], z[2]*x[0]-z[0]*x[2], z[0]*x[1]-z[1]*x[0]];
  out[0]=x[0]; out[1]=y[0]; out[2]=z[0]; out[3]=0;
  out[4]=x[1]; out[5]=y[1]; out[6]=z[1]; out[7]=0;
  out[8]=x[2]; out[9]=y[2]; out[10]=z[2]; out[11]=0;
  out[12]=-(x[0]*eye[0]+x[1]*eye[1]+x[2]*eye[2]);
  out[13]=-(y[0]*eye[0]+y[1]*eye[1]+y[2]*eye[2]);
  out[14]=-(z[0]*eye[0]+z[1]*eye[1]+z[2]*eye[2]);
  out[15]=1;
}
function mat4mul(out, a, b, tmp) {
  for (let c = 0; c < 4; c++) for (let r_ = 0; r_ < 4; r_++) {
    tmp[c*4+r_] = a[r_]*b[c*4] + a[4+r_]*b[c*4+1] + a[8+r_]*b[c*4+2] + a[12+r_]*b[c*4+3];
  }
  out.set(tmp);
}

const MAXB = 1400; // box / batch: bőven elég 8 részletes mech + arena + FX-re

function makeBatch(gl, prog, aPos, aNorm, aCol) {
  const b = {
    n: 0,
    pos: new Float32Array(MAXB * 36 * 3),
    nor: new Float32Array(MAXB * 36 * 3),
    col: new Float32Array(MAXB * 36 * 3),
    bp: gl.createBuffer(), bn: gl.createBuffer(), bc: gl.createBuffer(),
  };
  b.clear = () => { b.n = 0; };
  b.upload = () => {
    gl.bindBuffer(gl.ARRAY_BUFFER, b.bp);
    gl.bufferData(gl.ARRAY_BUFFER, b.pos.subarray(0, b.n * 3), gl.DYNAMIC_DRAW);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, b.bn);
    gl.bufferData(gl.ARRAY_BUFFER, b.nor.subarray(0, b.n * 3), gl.DYNAMIC_DRAW);
    gl.vertexAttribPointer(aNorm, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, b.bc);
    gl.bufferData(gl.ARRAY_BUFFER, b.col.subarray(0, b.n * 3), gl.DYNAMIC_DRAW);
    gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, 0, 0);
  };
  return b;
}

// yaw-körüli forgatás + skála + eltolás (megegyezik a régi mat4model-lel)
// yaw+pitch forgatás + skála + eltolás; R = Ry(yaw)*Rx(pitch)
function pushBoxP(b, x, y, z, yaw, pitch, sx, sys, sz, r, g, bl) {
  if (b.n + 36 > MAXB * 36) return;
  const cY = Math.cos(yaw), sY = Math.sin(yaw), cP = Math.cos(pitch), sP = Math.sin(pitch);
  const Xx = cY, Xy = 0, Xz = -sY;
  const Yx = sP * sY, Yy = cP, Yz = sP * cY;
  const Zx = cP * sY, Zy = -sP, Zz = cP * cY;
  let o = b.n * 3;
  for (let i = 0; i < 36; i++) {
    const lx = CUBE_POS[i*3] * sx, ly = CUBE_POS[i*3+1] * sys, lz = CUBE_POS[i*3+2] * sz;
    b.pos[o]   = Xx*lx + Yx*ly + Zx*lz + x;
    b.pos[o+1] = Xy*lx + Yy*ly + Zy*lz + y;
    b.pos[o+2] = Xz*lx + Yz*ly + Zz*lz + z;
    const nx = CUBE_NORM[i*3], ny = CUBE_NORM[i*3+1], nz = CUBE_NORM[i*3+2];
    b.nor[o]   = Xx*nx + Yx*ny + Zx*nz;
    b.nor[o+1] = Xy*nx + Yy*ny + Zy*nz;
    b.nor[o+2] = Xz*nx + Yz*ny + Zz*nz;
    b.col[o] = r; b.col[o+1] = g; b.col[o+2] = bl;
    o += 3;
  }
  b.n += 36;
}
function pushBox(b, x, y, z, yaw, sx, sy, sz, r, g, bl) {
  pushBoxP(b, x, y, z, yaw, 0, sx, sy, sz, r, g, bl);
}
// végtag-pont: pivot + R(yaw,pitch)*offset (pl. csípő->térd)
function limbPoint(px, py, pz, ox, oy, oz, yaw, pitch) {
  const cY = Math.cos(yaw), sY = Math.sin(yaw), cP = Math.cos(pitch), sP = Math.sin(pitch);
  return [
    px + ox * cY + oy * sP * sY + oz * cP * sY,
    py + oy * cP - oz * sP,
    pz - ox * sY + oy * sP * cY + oz * cP * cY,
  ];
}

function createRenderer(canvas) {
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false });
  if (!gl) return null;
  function sh(type, src) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  const pr = gl.createProgram();
  gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS));
  gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(pr); gl.useProgram(pr);
  const aPos = gl.getAttribLocation(pr, 'aPos'), aNorm = gl.getAttribLocation(pr, 'aNorm'), aCol = gl.getAttribLocation(pr, 'aCol');
  const uMVP = gl.getUniformLocation(pr, 'uMVP'), uLight = gl.getUniformLocation(pr, 'uLight');
  const uFull = gl.getUniformLocation(pr, 'uFull'), uFog = gl.getUniformLocation(pr, 'uFog'), uFogR = gl.getUniformLocation(pr, 'uFogR');
  gl.enableVertexAttribArray(aPos); gl.enableVertexAttribArray(aNorm); gl.enableVertexAttribArray(aCol);
  gl.enable(gl.DEPTH_TEST);
  const opaque = makeBatch(gl, pr, aPos, aNorm, aCol);
  const fx = makeBatch(gl, pr, aPos, aNorm, aCol);
  const view = new Float32Array(16), proj = new Float32Array(16), pv = new Float32Array(16), tmp = new Float32Array(16);

  const TEAM = [[0.25, 0.55, 1.0], [1.0, 0.3, 0.22]];
  const DARK = [0.15, 0.17, 0.23], MID = [0.24, 0.27, 0.35], LITE = [0.36, 0.4, 0.5];

  // tranziens effektek (renderer-oldali, nem szimulált)
  const parts = [];   // {kind,x,y,z,vx,vy,vz,t,life,r,g,b,sz,grow}
  let trauma = 0, lowQ = false, time = 0;

  function spawn(kind, x, y, z, o) {
    if (parts.length > 220) parts.shift();
    const p = { kind, x, y, z, t: 0, life: 0.3, vx: 0, vy: 0, vz: 0, r: 1, g: 1, b: 1, sz: 0.2, grow: 0 };
    if (o) for (const k in o) p[k] = o[k];
    parts.push(p);
  }

  // ---- anime mech suit (~40 box): Gundam-ihletésű humanoid ----
  // fehér páncél + csapat-szín jelzések + arany V-fin + sárga szellőzők,
  // séta-animáció (láb/kar-lengés), ugráskor behúzott póz
  function drawMech(m) {
    const tc = TEAM[m.team];
    const by = m.y, yaw = m.yaw;
    const sy = Math.sin(yaw), cy = Math.cos(yaw);
    const flash = m.spawnProt > 0 && Math.floor(time * 8) % 2 === 0;
    const k = m.cls === 'tank' ? 1.12 : m.cls === 'striker' ? 0.95 : 1.02; // testalkat
    const W = flash ? [1, 1, 1] : (m.cls === 'tank' ? [0.62, 0.64, 0.66] : [0.82, 0.84, 0.88]); // páncél
    const F = flash ? [1, 1, 1] : [0.16, 0.18, 0.22];  // váz (sötét ízületek)
    const T = flash ? [1, 1, 1] : tc;                   // csapat-szín
    const GOLD = flash ? [1, 1, 1] : [1, 0.78, 0.25];
    const VENT = flash ? [1, 1, 1] : [1, 0.85, 0.2];

    // mozgás-animáció
    const spd = Math.hypot(m.vx, m.vz);
    const moveK = Math.min(1, spd / 6);
    const air = by > 0.05;
    const ph = time * (5 + spd * 1.1) + m.id * 2.1;
    const swL = air ? -0.55 : Math.sin(ph) * 0.55 * moveK;
    const swR = air ? -0.4 : Math.sin(ph + Math.PI) * 0.55 * moveK;
    const bob = air ? 0 : Math.abs(Math.sin(ph)) * 0.05 * moveK;

    // ---- lábak (csípő->comb->lábszár->lábfej, döntött boxok) ----
    const hipY = by + 1.06 * k + bob, hipX = 0.3 * k;
    for (let side = -1; side <= 1; side += 2) {
      const sw = side < 0 ? swL : swR;
      const hx = m.x + cy * hipX * side, hz = m.z - sy * hipX * side;
      const th = limbPoint(hx, hipY, hz, 0, -0.2, 0, yaw, sw);
      const sh = limbPoint(hx, hipY, hz, 0, -0.58, 0, yaw, sw);
      const ft = limbPoint(hx, hipY, hz, 0, -0.94, 0.05, yaw, sw);
      pushBoxP(opaque, th[0], th[1], th[2], yaw, sw, 0.15, 0.2, 0.17, F[0], F[1], F[2]);          // comb (váz)
      pushBoxP(opaque, sh[0], sh[1], sh[2], yaw, sw, 0.19, 0.3, 0.21, W[0], W[1], W[2]);          // lábszár-páncél
      pushBoxP(opaque, sh[0] + sy * 0.2, sh[1] + 0.12, sh[2] + cy * 0.2, yaw, sw, 0.1, 0.1, 0.08, T[0], T[1], T[2]); // térd-jel
      const fy = Math.max(0.1, ft[1]);
      pushBox(opaque, ft[0], fy, ft[2], yaw, 0.19, 0.1, 0.32, F[0], F[1], F[2]);                  // lábfej
      pushBox(opaque, ft[0] + sy * 0.12, fy - 0.02, ft[2] + cy * 0.12, yaw, 0.2, 0.06, 0.14, W[0], W[1], W[2]); // orr-páncél
      if (air) pushBox(fx, ft[0], fy - 0.05, ft[2], yaw, 0.1, 0.15, 0.1, 1, 0.55, 0.15);          // láb-vernierek
    }
    // ---- szoknya-páncél (elöl/hátul döntve, oldalt egyenesen) ----
    const wy = by + 1.18 * k + bob;
    pushBoxP(opaque, m.x + sy * 0.42, wy, m.z + cy * 0.42, yaw, 0.3, 0.4, 0.22, 0.08, W[0], W[1], W[2]);
    pushBoxP(opaque, m.x - sy * 0.42, wy, m.z - cy * 0.42, yaw, -0.3, 0.4, 0.22, 0.08, W[0], W[1], W[2]);
    pushBox(opaque, m.x + cy * 0.5, wy, m.z - sy * 0.5, yaw, 0.08, 0.24, 0.4, W[0], W[1], W[2]);
    pushBox(opaque, m.x - cy * 0.5, wy, m.z + sy * 0.5, yaw, 0.08, 0.24, 0.4, W[0], W[1], W[2]);
    pushBox(opaque, m.x, wy + 0.12, m.z, yaw, 0.34, 0.14, 0.3, F[0], F[1], F[2]); // derék
    // ---- törzs: mellkas + sárga szellőzők + pilótafülke + csapat-sáv ----
    const chy = by + 1.58 * k + bob;
    pushBox(opaque, m.x, chy, m.z, yaw, 0.34 * k, 0.32, 0.26, W[0], W[1], W[2]);
    pushBox(opaque, m.x + cy * 0.2 + sy * 0.3, chy + 0.12, m.z - sy * 0.2 + cy * 0.3, yaw, 0.1, 0.08, 0.05, VENT[0], VENT[1], VENT[2]);
    pushBox(opaque, m.x - cy * 0.2 + sy * 0.3, chy + 0.12, m.z + sy * 0.2 + cy * 0.3, yaw, 0.1, 0.08, 0.05, VENT[0], VENT[1], VENT[2]);
    pushBox(opaque, m.x + sy * 0.28, chy + 0.02, m.z + cy * 0.28, yaw, 0.2, 0.16, 0.05, F[0], F[1], F[2]); // cockpit
    pushBox(opaque, m.x, chy - 0.2, m.z, yaw, 0.36 * k, 0.07, 0.28, T[0], T[1], T[2]); // csapat-sáv
    // ---- hátizsák + hajtóművek ----
    pushBox(opaque, m.x - sy * 0.34, chy + 0.1, m.z - cy * 0.34, yaw, 0.4, 0.36, 0.14, W[0], W[1], W[2]);
    for (let side = -1; side <= 1; side += 2) {
      const tx = m.x + cy * 0.22 * side - sy * 0.42, tz = m.z - sy * 0.22 * side - cy * 0.42;
      pushBox(opaque, tx, chy - 0.05, tz, yaw, 0.13, 0.2, 0.13, F[0], F[1], F[2]);
      if (air || (m.dashT > 0)) {
        const fl = 0.3 + Math.sin(time * 40 + m.id * 3 + side) * 0.1;
        pushBox(fx, tx, chy - 0.28 - fl / 2, tz, yaw, 0.09, fl, 0.09, 1, 0.55, 0.15);
      }
    }
    if (m.cls === 'support') { // nagy antenna + segély-jel
      pushBox(opaque, m.x + cy * 0.3 - sy * 0.4, chy + 0.55, m.z - sy * 0.3 - cy * 0.4, yaw, 0.03, 0.45, 0.03, F[0], F[1], F[2]);
      pushBox(fx, m.x + cy * 0.3 - sy * 0.4, chy + 0.78, m.z - sy * 0.3 - cy * 0.4, yaw, 0.05, 0.05, 0.05, 0.3, 1, 0.4);
    }
    if (m.cls === 'tank') { // váll-ágyúk
      for (let side = -1; side <= 1; side += 2)
        pushBox(opaque, m.x + cy * 0.62 * k * side + sy * 0.2, chy + 0.42, m.z - sy * 0.62 * k * side + cy * 0.2, yaw, 0.12, 0.12, 0.7, F[0], F[1], F[2]);
    }
    // ---- vállak + karok ----
    const shoY = by + 1.82 * k + bob;
    let fistR = null, fistL = null;
    for (let side = -1; side <= 1; side += 2) {
      const sxp = m.x + cy * 0.62 * k * side, szp = m.z - sy * 0.62 * k * side;
      const shS = (m.cls === 'tank' ? 1.25 : 1);
      pushBox(opaque, sxp, shoY + 0.08, szp, yaw, 0.2 * shS, 0.16 * shS, 0.24 * shS, W[0], W[1], W[2]); // vállpáncél
      pushBox(opaque, sxp, shoY + 0.18 * shS, szp, yaw, 0.14 * shS, 0.06, 0.18 * shS, T[0], T[1], T[2]); // váll-jel
      const isR = side > 0;
      const armP = isR ? -1.0 : (air ? 0.35 : -(side < 0 ? swL : swR) * 0.5); // jobb kar fegyvert tart előre
      const el = limbPoint(sxp, shoY, szp, 0, -0.2, 0, yaw, armP);
      const fi = limbPoint(sxp, shoY, szp, 0, -0.44, 0, yaw, armP);
      pushBoxP(opaque, el[0], el[1], el[2], yaw, armP, 0.12, 0.2, 0.13, W[0], W[1], W[2]); // felkar+alkar
      pushBoxP(opaque, fi[0], fi[1], fi[2], yaw, armP, 0.11, 0.12, 0.12, F[0], F[1], F[2]); // ököl
      if (isR) fistR = fi; else fistL = { p: fi, pitch: armP };
    }
    // ---- fej: sisak + arc + világító szemek + V-fin ----
    const heY = by + 2.12 * k + bob;
    pushBox(opaque, m.x, heY, m.z, yaw, 0.17, 0.2, 0.18, W[0], W[1], W[2]);
    pushBox(opaque, m.x + sy * 0.15, heY - 0.05, m.z + cy * 0.15, yaw, 0.13, 0.12, 0.06, 0.75, 0.77, 0.8);
    pushBox(fx, m.x + sy * 0.2, heY - 0.02, m.z + cy * 0.2, yaw, 0.11, 0.035, 0.03,
      m.team ? 1 : 0.3, m.team ? 0.25 : 1, m.team ? 0.2 : 0.4); // szem-szenzor
    const finS = m.cls === 'striker' ? 1.3 : 1;
    pushBoxP(opaque, m.x + cy * 0.08, heY + 0.26 * finS, m.z - sy * 0.08, yaw + 0.5, -0.25, 0.05, 0.18 * finS, 0.05, GOLD[0], GOLD[1], GOLD[2]);
    pushBoxP(opaque, m.x - cy * 0.08, heY + 0.26 * finS, m.z + sy * 0.08, yaw - 0.5, -0.25, 0.05, 0.18 * finS, 0.05, GOLD[0], GOLD[1], GOLD[2]);
    // ---- pajzs (bal alkar) ----
    if (fistL) {
      const fp = fistL.p;
      const shx = fp[0] - cy * 0.2, shz = fp[2] + sy * 0.2;
      const shS = m.cls === 'tank' ? 1.3 : 1;
      pushBoxP(opaque, shx, fp[1] + 0.05, shz, yaw, fistL.pitch, 0.06, 0.42 * shS, 0.34 * shS, T[0], T[1], T[2]);
      pushBoxP(opaque, shx - cy * 0.04, fp[1] + 0.05, shz + sy * 0.04, yaw, fistL.pitch, 0.03, 0.3 * shS, 0.2 * shS, W[0], W[1], W[2]);
    }
    // ---- fegyver (jobb kéz, előre): beam-rifle / rakéta / rail ----
    let mx = m.x + sy, mz = m.z + cy, my = by + 1.5;
    if (fistR) {
      const fp = fistR;
      if (m.weapon === 'rocket') {
        pushBox(opaque, fp[0] + sy * 0.35, fp[1] + 0.05, fp[2] + cy * 0.35, yaw, 0.16, 0.18, 0.7, 0.85, 0.45, 0.15);
        pushBox(opaque, fp[0] + sy * 0.75, fp[1] + 0.05, fp[2] + cy * 0.75, yaw, 0.12, 0.12, 0.12, 0.7, 0.2, 0.1);
        mx = fp[0] + sy * 1.1; my = fp[1] + 0.05; mz = fp[2] + cy * 1.1;
      } else if (m.weapon === 'rail') {
        pushBox(opaque, fp[0] + sy * 0.45, fp[1] + 0.05, fp[2] + cy * 0.45, yaw, 0.09, 0.12, 1.1, 0.3, 0.35, 0.45);
        pushBox(fx, fp[0] + sy * 1.0, fp[1] + 0.05, fp[2] + cy * 1.0, yaw, 0.07, 0.07, 0.14, 0.35, 0.85, 1); // töltött sín
        mx = fp[0] + sy * 1.15; my = fp[1] + 0.05; mz = fp[2] + cy * 1.15;
      } else {
        pushBox(opaque, fp[0] + sy * 0.35, fp[1] + 0.05, fp[2] + cy * 0.35, yaw, 0.1, 0.13, 0.75, 0.45, 0.48, 0.55);
        pushBox(opaque, fp[0] + sy * 0.4, fp[1] - 0.08, fp[2] + cy * 0.4, yaw, 0.08, 0.14, 0.2, F[0], F[1], F[2]); // tár
        mx = fp[0] + sy * 0.8; my = fp[1] + 0.05; mz = fp[2] + cy * 0.8;
      }
    }
    // ---- beam-saber (bal kéz): penge csak csapáskor ----
    if (fistL && m.swordCd > 0.63) {
      const fp = fistL.p;
      pushBox(fx, fp[0] + sy * 0.9, fp[1] + 0.15, fp[2] + cy * 0.9, yaw, 0.07, 0.07, 0.9, 1, 0.35, 0.6);
      pushBox(fx, fp[0] + sy * 0.9, fp[1] + 0.15, fp[2] + cy * 0.9, yaw, 0.12, 0.12, 0.9, 1, 0.6, 0.8);
    } else if (fistL) {
      pushBox(opaque, fistL.p[0], fistL.p[1] - 0.1, fistL.p[2], yaw, 0.05, 0.14, 0.05, F[0], F[1], F[2]); // markolat
    }
    // találat-villanás
    if (m.hitT > 0) pushBox(fx, m.x, by + 1.5, m.z, yaw, 0.65 * k, 0.85, 0.5, 1, 1, 1);
    // muzzle flash a cső végén
    if (m.muzzle > 0) {
      const f = 0.5 + m.muzzle * 6;
      const mc = m.weapon === 'rail' ? [0.4, 0.9, 1] : m.weapon === 'rocket' ? [1, 0.55, 0.15] : [1, 0.9, 0.4];
      pushBox(fx, mx, my, mz, yaw, 0.28 * f, 0.28 * f, 0.28 * f, mc[0], mc[1], mc[2]);
      pushBox(fx, mx, my, mz, yaw + Math.PI / 4, 0.16 * f, 0.16 * f, 0.16 * f, 1, 1, 1);
    }
    // dash-szellemkép
    if (m.dashT > 0) pushBox(fx, m.x - m.dashDx * 1.5, by + 1.5, m.z - m.dashDz * 1.5, yaw, 0.6 * k, 0.8, 0.45, T[0] * 0.7, T[1] * 0.7, T[2] * 0.7);
    // pajzs-burok
    if (m.shieldT > 0) pushBox(fx, m.x, by + 1.5, m.z, yaw, 1.0, 1.5, 0.85, 0.25, 0.7, 1);
    // EMP-debuff gyűrű
    if (m.empT > 0 && Math.floor(time * 6) % 2 === 0)
      pushBox(fx, m.x, by + 0.4, m.z, time * 2, 1.2, 0.1, 1.2, 0.6, 0.4, 1);
    // blob shadow
    pushBox(opaque, m.x, 0.02, m.z, 0, 1.0, 0.02, 1.0, 0.02, 0.02, 0.03);
  }

  function drawHpBar(m, camYaw) {
    if (!m.alive) return;
    const f = Math.max(0, m.hp / m.maxHp);
    const y = m.y + 3.0, w = 1.7;
    pushBox(fx, m.x, y, m.z, camYaw, w / 2, 0.07, 0.07, 0.45, 0.08, 0.08);
    if (f > 0) pushBox(fx, m.x - (w * (1 - f)) / 2 * Math.cos(camYaw), y, m.z + (w * (1 - f)) / 2 * Math.sin(camYaw),
      camYaw, (w * f) / 2, 0.09, 0.09, f > 0.5 ? 0.2 : f > 0.25 ? 0.9 : 1, f > 0.5 ? 0.9 : f > 0.25 ? 0.7 : 0.15, 0.2);
  }

  function camCollide(s, hx, hy, hz, ex, ey, ez) {
    // 10 lépésben: ne menjen falba / fedezékbe a kamera
    let px = ex, py = ey, pz = ez;
    for (let i = 1; i <= 10; i++) {
      const f = i / 10;
      const x = hx + (ex - hx) * f, y = hy + (ey - hy) * f, z = hz + (ez - hz) * f;
      let inside = Math.abs(x) > 49 || Math.abs(z) > 49;
      if (!inside && y < 8) for (const c of s.covers) {
        if (Math.abs(x - c.cx) < c.hx + 0.4 && Math.abs(z - c.cz) < c.hz + 0.4 && y < c.h + 0.4) { inside = true; break; }
      }
      if (inside) break;
      px = x; py = y; pz = z;
    }
    return [px, py, pz];
  }

  return {
    gl,
    setSize(w, h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); },
    setQuality(q) { lowQ = q === 'low'; },
    shake(a) { trauma = Math.min(1, trauma + a); },
    tracer(x1, y1, z1, x2, y2, z2, r, g, b, life) {
      spawn('tracer', 0, 0, 0, { x1, y1, z1, x2, y2, z2, r, g, b, life, t: 0 });
    },
    burst(x, y, z, n, r, g, b, spd) {
      n = lowQ ? Math.ceil(n / 3) : n;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI - Math.PI / 2;
        const v = (spd || 6) * (0.4 + Math.random() * 0.8);
        spawn('spark', x, y, z, {
          vx: Math.cos(a) * Math.cos(e) * v, vy: Math.abs(Math.sin(e)) * v + 2,
          vz: Math.sin(a) * Math.cos(e) * v, r, g, b, life: 0.25 + Math.random() * 0.25, sz: 0.12,
        });
      }
    },
    boom(x, y, z, big) {
      spawn('flash', x, y, z, { life: 0.12, sz: big ? 2.2 : 1.4, r: 1, g: 0.9, b: 0.6 });
      spawn('shell', x, y, z, { life: 0.4, sz: 0.5, grow: big ? 9 : 6, r: 1, g: 0.5, b: 0.15 });
      this.burst(x, y, z, big ? 22 : 12, 1, 0.6, 0.15, 9);
      this.burst(x, y, z, big ? 10 : 6, 0.3, 0.3, 0.3, 5);
    },
    arc(x, y, z, yaw) {
      spawn('arc', x, y, z, { life: 0.15, yaw, r: 0.7, g: 0.9, b: 1, sz: 2.2 });
    },
    render(s, playerId, camYaw, camPitch, dt) {
      dt = dt || 1 / 60;
      time = s.time;
      trauma = Math.max(0, trauma - dt * 1.4);
      opaque.clear(); fx.clear();
      const p = s.mechs[playerId];
      const px = p ? p.x : 0, py = p ? p.y + 1.8 : 2, pz = p ? p.z : 40;
      const cd = 4.5;
      let ex = px - Math.sin(camYaw) * Math.cos(camPitch) * cd;
      let ez = pz - Math.cos(camYaw) * Math.cos(camPitch) * cd;
      let ey = py + 1.0 + Math.sin(camPitch) * cd;
      if (ey < 0.5) ey = 0.5;
      const cc = camCollide(s, px, py + 0.6, pz, ex, ey, ez);
      ex = cc[0]; ey = cc[1]; ez = cc[2];
      // kamera-rázás (trauma² skálázva)
      const sh = trauma * trauma;
      if (sh > 0.001) {
        ex += Math.sin(time * 91) * sh * 0.35; ey += Math.cos(time * 113) * sh * 0.3;
      }
      const aspect = canvas.width / Math.max(1, canvas.height);
      mat4persp(proj, 70 * Math.PI / 180, aspect, 0.1, 300);
      const lx = px + Math.sin(camYaw) * 6, ly = py + Math.sin(camPitch) * 6, lz = pz + Math.cos(camYaw) * 6;
      mat4look(view, [ex, ey, ez], [lx, ly, lz], [0, 1, 0]);
      mat4mul(pv, proj, view, tmp);

      const H = 100;
      // padló + rács (távolság-érzet)
      pushBox(opaque, 0, -0.5, 0, 0, H/2, 0.5, H/2, 0.1, 0.13, 0.19);
      if (!lowQ) {
        for (let i = -40; i <= 40; i += 10) {
          pushBox(opaque, i, 0.01, 0, 0, 0.08, 0.02, H/2, 0.14, 0.18, 0.26);
          pushBox(opaque, 0, 0.01, i, 0, H/2, 0.02, 0.08, 0.14, 0.18, 0.26);
        }
        // közép-kör
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          pushBox(opaque, Math.sin(a) * 7, 0.02, Math.cos(a) * 7, -a, 0.5, 0.03, 0.18, 0.2, 0.26, 0.36);
        }
      }
      // falak + párkány + saroktornyok
      pushBox(opaque, 0, 4, -H/2, 0, H/2, 4, 0.5, 0.18, 0.22, 0.32);
      pushBox(opaque, 0, 4, H/2, 0, H/2, 4, 0.5, 0.18, 0.22, 0.32);
      pushBox(opaque, -H/2, 4, 0, 0, 0.5, 4, H/2, 0.18, 0.22, 0.32);
      pushBox(opaque, H/2, 4, 0, 0, 0.5, 4, H/2, 0.18, 0.22, 0.32);
      pushBox(opaque, 0, 8.2, -H/2, 0, H/2, 0.25, 0.6, 0.25, 0.35, 0.55);
      pushBox(opaque, 0, 8.2, H/2, 0, H/2, 0.25, 0.6, 0.25, 0.35, 0.55);
      for (const [tx, tz] of [[-50, -50], [50, -50], [-50, 50], [50, 50]])
        pushBox(opaque, tx, 5.5, tz, 0, 1.5, 5.5, 1.5, 0.22, 0.26, 0.38);
      // spawn-zónák
      pushBox(opaque, 0, 0.03, 40, 0, 14, 0.03, 3, 0.15, 0.3, 0.7);
      pushBox(opaque, 0, 0.03, -40, 0, 14, 0.03, 3, 0.7, 0.2, 0.15);
      // fedezékek: test + világos tető
      for (const c of s.covers) {
        pushBox(opaque, c.cx, c.h/2, c.cz, 0, c.hx, c.h/2, c.hz, 0.28, 0.32, 0.4);
        pushBox(opaque, c.cx, c.h + 0.08, c.cz, 0, c.hx + 0.08, 0.08, c.hz + 0.08, 0.38, 0.43, 0.52);
      }
      // hordók: test + pánt + tető (henger-illúzió)
      for (const b of s.barrels) {
        if (!b.alive) continue;
        const blink = b.hp < 50 && Math.floor(time * 6) % 2 === 0;
        pushBox(opaque, b.x, 0.5, b.z, 0, 0.55, 0.5, 0.55, blink ? 1 : 0.85, blink ? 0.2 : 0.45, 0.15);
        pushBox(opaque, b.x, 0.55, b.z, 0, 0.58, 0.1, 0.58, 0.9, 0.85, 0.7);
        pushBox(opaque, b.x, 1.02, b.z, 0, 0.5, 0.06, 0.5, 0.2, 0.18, 0.2);
        pushBox(fx, b.x, 1.35, b.z, 0, 0.1, 0.1, 0.1, 1, 0.3, 0.1); // figyelmeztető pötty
      }
      // pickupok: talp-gyűrű + lebegő ikon + fénysugár
      const PKC = { hp: [0.2, 1, 0.3], ammo: [1, 0.85, 0.2], emp: [0.6, 0.4, 1], shield: [0.3, 0.8, 1], over: [1, 0.3, 0.8] };
      for (const pk of s.pickups) {
        if (!pk.active) continue;
        const c = PKC[pk.kind] || [1, 1, 1];
        const fy = 0.7 + Math.sin(time * 3 + pk.x) * 0.15;
        pushBox(opaque, pk.x, 0.04, pk.z, 0, 0.8, 0.04, 0.8, c[0] * 0.35, c[1] * 0.35, c[2] * 0.35);
        if (pk.kind === 'hp') {
          pushBox(opaque, pk.x, fy, pk.z, time, 0.4, 0.4, 0.15, 0.95, 0.95, 0.95);
          pushBox(fx, pk.x, fy, pk.z, time, 0.28, 0.1, 0.16, 1, 0.15, 0.2);
          pushBox(fx, pk.x, fy, pk.z, time, 0.1, 0.28, 0.16, 1, 0.15, 0.2);
        } else if (pk.kind === 'ammo') {
          pushBox(opaque, pk.x, fy, pk.z, time, 0.45, 0.25, 0.3, 0.85, 0.7, 0.15);
          pushBox(fx, pk.x, fy + 0.3, pk.z, time * 1.3, 0.12, 0.12, 0.12, 1, 0.9, 0.3);
        } else {
          const big = pk.kind === 'over' ? 1.4 : 1;
          pushBox(fx, pk.x, fy, pk.z, time * 1.5, 0.3 * big, 0.3 * big, 0.3 * big, c[0], c[1], c[2]);
          pushBox(fx, pk.x, fy, pk.z, -time * 1.5, 0.18 * big, 0.18 * big, 0.18 * big, 1, 1, 1);
        }
        if (!lowQ) pushBox(fx, pk.x, 2.2, pk.z, 0, 0.09, 2.2, 0.09, c[0] * 0.5, c[1] * 0.5, c[2] * 0.5);
      }
      // overdrive-pedestal középen
      pushBox(opaque, 0, 0.25, 0, 0, 1.2, 0.25, 1.2, 0.3, 0.28, 0.36);
      // mechek + HP-bar
      for (const m of s.mechs) {
        if (!m.alive) continue;
        drawMech(m);
        drawHpBar(m, camYaw);
      }
      // lövedékek: nagy, világító, lángcsóvával
      for (const pr2 of s.projectiles) {
        if (pr2.kind === 'rocket') {
          const dx = pr2.vx / 25, dz = pr2.vz / 25;
          const yaw = Math.atan2(pr2.vx, pr2.vz);
          pushBox(opaque, pr2.x, pr2.y, pr2.z, yaw, 0.2, 0.2, 0.45, 0.75, 0.75, 0.8);
          pushBox(fx, pr2.x, pr2.y, pr2.z, yaw, 0.24, 0.24, 0.2, 1, 0.5, 0.1);
          const fl = 0.3 + Math.random() * 0.2;
          pushBox(fx, pr2.x - dx * 0.7, pr2.y, pr2.z - dz * 0.7, yaw, 0.2, 0.2, fl, 1, 0.7, 0.2);
        } else if (pr2.kind === 'empfly') {
          const pu = 0.3 + Math.sin(time * 20) * 0.1;
          pushBox(fx, pr2.x, pr2.y, pr2.z, time * 6, pu, pu, pu, 0.6, 0.4, 1);
        }
      }
      // szimulált részecskék (boom / emp)
      for (const pt of s.particles) {
        const sc = pt.kind === 'emp' ? (0.5 - pt.t) * 16 : pt.t * 4 + 0.2;
        const c = pt.kind === 'emp' ? [0.6, 0.4, 1] : [1, 0.6, 0.15];
        pushBox(fx, pt.x, pt.y, pt.z, time * 3, sc, sc, sc, c[0], c[1], c[2]);
      }
      // renderer-oldali tranziens FX
      for (let i = parts.length - 1; i >= 0; i--) {
        const pt = parts[i];
        pt.t += dt;
        if (pt.t >= pt.life) { parts.splice(i, 1); continue; }
        const k = pt.t / pt.life, a = 1 - k;
        if (pt.kind === 'tracer') {
          const mx = (pt.x1 + pt.x2) / 2, my = (pt.y1 + pt.y2) / 2, mz = (pt.z1 + pt.z2) / 2;
          const len = Math.hypot(pt.x2 - pt.x1, pt.z2 - pt.z1) / 2;
          const yaw = Math.atan2(pt.x2 - pt.x1, pt.z2 - pt.z1);
          pushBox(fx, mx, my, mz, yaw, 0.09 * a + 0.03, 0.09 * a + 0.03, Math.max(0.3, len), pt.r * a + 0.1, pt.g * a + 0.1, pt.b * a + 0.1);
        } else if (pt.kind === 'spark') {
          pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.z += pt.vz * dt; pt.vy -= 18 * dt;
          if (pt.y < 0.05) pt.y = 0.05;
          pushBox(fx, pt.x, pt.y, pt.z, 0, pt.sz * a + 0.03, pt.sz * a + 0.03, pt.sz * a + 0.03, pt.r, pt.g, pt.b);
        } else if (pt.kind === 'flash') {
          pushBox(fx, pt.x, pt.y, pt.z, 0, pt.sz, pt.sz, pt.sz, pt.r * a, pt.g * a, pt.b * a);
        } else if (pt.kind === 'shell') {
          const sc = pt.sz + pt.grow * pt.t;
          pushBox(fx, pt.x, pt.y, pt.z, pt.t * 2, sc, sc * 0.8, sc, pt.r * a, pt.g * a, pt.b * a);
        } else if (pt.kind === 'arc') {
          pushBox(fx, pt.x + Math.sin(pt.yaw) * 1.6, pt.y + 1.2, pt.z + Math.cos(pt.yaw) * 1.6, pt.yaw, pt.sz * a, 0.25, 0.6, pt.r * a, pt.g * a, pt.b * a);
        }
      }

      // kirajzolás: opaque (lit) + FX (unlit additív)
      gl.clearColor(0.04, 0.06, 0.1, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniform3f(uLight, 0.5, 1, 0.3);
      gl.uniform3f(uFog, 0.04, 0.06, 0.1); gl.uniform2f(uFogR, 60, 220);
      gl.disable(gl.BLEND); gl.depthMask(true);
      gl.uniform1f(uFull, 0);
      gl.uniformMatrix4fv(uMVP, false, pv);
      opaque.upload();
      gl.drawArrays(gl.TRIANGLES, 0, opaque.n);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false);
      gl.uniform1f(uFull, 1);
      fx.upload();
      gl.drawArrays(gl.TRIANGLES, 0, fx.n);
      gl.disable(gl.BLEND); gl.depthMask(true);
    }
  };
}
if (typeof module !== 'undefined') module.exports = { createRenderer };
