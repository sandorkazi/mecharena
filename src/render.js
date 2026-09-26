// Mech Arena — minimal WebGL1 box renderer (low-poly, vertex color).
// Költség: <60 draw call, <50k tris. Nincs textúra, 1 dir light + ambient.
'use strict';

const VS = `
attribute vec3 aPos; attribute vec3 aNorm; attribute vec3 aCol;
uniform mat4 uMVP; uniform vec3 uLight;
varying vec3 vCol; varying float vSh;
void main(){ gl_Position = uMVP * vec4(aPos,1.0);
  float d = max(dot(normalize(aNorm), normalize(uLight)), 0.0);
  vSh = 0.45 + 0.55*d; vCol = aCol; }`;
const FS = `
precision mediump float; varying vec3 vCol; varying float vSh;
void main(){ gl_FragColor = vec4(vCol*vSh, 1.0); }`;

// Egységkocka: 12 tris, normál + szín per-vertex töltve rajzoláskor
const CUBE_POS = new Float32Array([
  -1,-1,-1, 1,-1,-1, 1,1,-1, -1,-1,-1, 1,1,-1, -1,1,-1, // -z
  -1,-1,1, -1,1,1, 1,1,1, -1,-1,1, 1,1,1, 1,-1,1,       // +z
  -1,-1,-1, -1,1,-1, -1,1,1, -1,-1,-1, -1,1,1, -1,-1,1, // -x
  1,-1,-1, 1,-1,1, 1,1,1, 1,-1,-1, 1,1,1, 1,1,-1,       // +x
  -1,-1,-1, -1,-1,1, 1,-1,1, -1,-1,-1, 1,-1,1, 1,-1,-1, // -y
  -1,1,-1, 1,1,-1, 1,1,1, -1,1,-1, 1,1,1, -1,1,1,       // +y
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
  let l = Math.hypot(zx,zy,zz); const z = [zx/l, zy/l, zz/l];
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
function mat4mul(out, a, b) {
  const r = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r_ = 0; r_ < 4; r_++) {
    r[c*4+r_] = a[r_]*b[c*4] + a[4+r_]*b[c*4+1] + a[8+r_]*b[c*4+2] + a[12+r_]*b[c*4+3];
  }
  out.set(r);
}
// modell: translate * rotY * scale
function mat4model(out, x, y, z, yaw, sx, sy, sz) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  out.fill(0);
  out[0]=c*sx; out[1]=0; out[2]=-s*sx; out[3]=0;
  out[4]=0; out[5]=sy; out[6]=0; out[7]=0;
  out[8]=s*sz; out[9]=0; out[10]=c*sz; out[11]=0;
  out[12]=x; out[13]=y; out[14]=z; out[15]=1;
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
  const bp = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bp);
  gl.bufferData(gl.ARRAY_BUFFER, CUBE_POS, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
  const bn = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bn);
  gl.bufferData(gl.ARRAY_BUFFER, CUBE_NORM, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(aNorm); gl.vertexAttribPointer(aNorm, 3, gl.FLOAT, false, 0, 0);
  const bc = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, bc);
  gl.enableVertexAttribArray(aCol); gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, 0, 0);
  gl.enable(gl.DEPTH_TEST);
  const view = new Float32Array(16), proj = new Float32Array(16), model = new Float32Array(16), mvp = new Float32Array(16);
  const colArr = new Float32Array(36 * 3);
  function box(x, y, z, yaw, sx, sy, sz, r, g, b) {
    mat4model(model, x, y, z, yaw, sx, sy, sz);
    mat4mul(mvp, proj, view); const tmp = new Float32Array(16); mat4mul(tmp, mvp, model);
    gl.uniformMatrix4fv(uMVP, false, tmp);
    for (let i = 0; i < 36; i++) { colArr[i*3] = r; colArr[i*3+1] = g; colArr[i*3+2] = b; }
    gl.bindBuffer(gl.ARRAY_BUFFER, bc);
    gl.bufferData(gl.ARRAY_BUFFER, colArr, gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, 36);
  }
  const TEAM = [[0.2, 0.5, 1.0], [1.0, 0.3, 0.25]];
  return {
    gl,
    setSize(w, h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); },
    render(s, playerId, camYaw, camPitch) {
      const p = s.mechs[playerId];
      const px = p ? p.x : 0, py = p ? p.y + 1.8 : 2, pz = p ? p.z : 40;
      // kamera a mech mögött 4.5m
      const cd = 4.5;
      let ex = px - Math.sin(camYaw) * Math.cos(camPitch) * cd;
      let ez = pz - Math.cos(camYaw) * Math.cos(camPitch) * cd;
      let ey = py + 1.0 + Math.sin(camPitch) * cd;
      if (ey < 0.5) ey = 0.5;
      const aspect = canvas.width / Math.max(1, canvas.height);
      mat4persp(proj, 70 * Math.PI / 180, aspect, 0.1, 300);
      mat4look(view, [ex, ey, ez], [px + Math.sin(camYaw) * 6, py + Math.sin(camPitch) * 6, pz + Math.cos(camYaw) * 6], [0, 1, 0]);
      gl.clearColor(0.04, 0.06, 0.1, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniform3f(uLight, 0.5, 1, 0.3);
      const H = 100;
      // padló + falak
      box(0, -0.5, 0, 0, H/2, 0.5, H/2, 0.13, 0.16, 0.22);
      box(0, 4, -H/2, 0, H/2, 4, 0.5, 0.2, 0.24, 0.34);
      box(0, 4, H/2, 0, H/2, 4, 0.5, 0.2, 0.24, 0.34);
      box(-H/2, 4, 0, 0, 0.5, 4, H/2, 0.2, 0.24, 0.34);
      box(H/2, 4, 0, 0, 0.5, 4, H/2, 0.2, 0.24, 0.34);
      for (const c of s.covers) box(c.cx, c.h/2, c.cz, 0, c.hx, c.h/2, c.hz, 0.3, 0.34, 0.42);
      for (const b of s.barrels) if (b.alive) box(b.x, 0.5, b.z, 0, 0.6, 0.5, 0.6, 0.85, 0.45, 0.15);
      // pickupok: lebegő kis doboz
      const PKC = { hp: [0.2, 1, 0.3], ammo: [1, 0.85, 0.2], emp: [0.6, 0.4, 1], shield: [0.3, 0.8, 1], over: [1, 0.3, 0.8] };
      const t = s.time;
      for (const pk of s.pickups) {
        if (!pk.active) continue;
        const c = PKC[pk.kind] || [1, 1, 1];
        box(pk.x, 0.6 + Math.sin(t * 3 + pk.x) * 0.15, pk.z, t, 0.35, 0.35, 0.35, c[0], c[1], c[2]);
      }
      // mechek
      for (const m of s.mechs) {
        if (!m.alive) continue;
        const tc = TEAM[m.team];
        const flash = m.spawnProt > 0 && Math.floor(t * 8) % 2 === 0;
        const r = flash ? 1 : tc[0], g = flash ? 1 : tc[1], b = flash ? 1 : tc[2];
        box(m.x, m.y + 1.2, m.z, m.yaw, 1.0, 1.2, 0.75, r, g, b);       // test
        box(m.x + Math.sin(m.yaw) * 1.0, m.y + 1.6, m.z + Math.cos(m.yaw) * 1.0, m.yaw, 0.18, 0.18, 0.9, 0.1, 0.1, 0.12); // fegyvercső
        if (m.shieldT > 0) box(m.x, m.y + 1.2, m.z, 0, 1.5, 1.7, 1.3, 0.3, 0.8, 1.0); // pajzs burok (drót helyett áttetsző nélküli)
        // blob shadow
        box(m.x, 0.02, m.z, 0, 1.1, 0.02, 1.1, 0.02, 0.02, 0.03);
      }
      // lövedékek
      for (const pr2 of s.projectiles) {
        if (pr2.kind === 'rocket') box(pr2.x, pr2.y, pr2.z, 0, 0.25, 0.25, 0.5, 1, 0.5, 0.1);
        else box(pr2.x, pr2.y, pr2.z, 0, 0.2, 0.2, 0.2, 0.7, 0.5, 1);
      }
      // részecskék
      for (const pt of s.particles) {
        const sc = pt.t * 4;
        const c = pt.kind === 'emp' ? [0.6, 0.4, 1] : [1, 0.6, 0.15];
        box(pt.x, pt.y, pt.z, 0, sc, sc, sc, c[0], c[1], c[2]);
      }
    }
  };
}
if (typeof module !== 'undefined') module.exports = { createRenderer };
