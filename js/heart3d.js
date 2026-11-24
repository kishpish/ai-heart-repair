// The 3D heart in the hero: a dark, softly lit surface wound with long fibre lines
// and crossed by the coronary arteries. It is an illustration (geometry from
// tools/build_heart.py), drawn with plain WebGL so nothing has to be vendored.
//
//   - fibre lines follow the epicardial fibre angle of the paper's rule-based field
//   - the crimson patch is scar and does not contract; the ochre rim is border zone
//     and contracts at 0.67 of remote muscle (Section 2.11)
//   - a dashed artery marks the blocked coronary branch that fed the scar
//   - teal beads are gel depots in the border zone, clear of the scar (Fig. 4)
//   - the beat follows the raised-cosine activation of Eq. (45), slowed for display;
//     a band of light sweeps from apex to base as each beat starts and skips the scar
//
// createHeart(canvas, { src }) resolves to a controller, or rejects if WebGL or the
// geometry is unavailable, so the caller can fall back to the 2D drawing.

const PERIOD = 1.7; // seconds per beat on screen (matches js/ventricle.js)
const SWEEP = 0.34; // seconds the band of light takes to travel from apex to base
const FILM = [13 / 255, 12 / 255, 11 / 255];

const DEFORM = `
uniform float u_act;
uniform vec3 u_axis;
uniform vec3 u_centre;
uniform float u_baseH;

// 0 at the base of the ventricles, 1 at the apex
float along(vec3 p) {
  return clamp((u_baseH - dot(p - u_centre, u_axis)) / 1.55, 0.0, 1.0);
}

// Systole: the wall moves toward the long axis, the base descends toward the apex
// and the apex twists. w = how much this point belongs to the ventricles,
// c = contractility of the tissue there (scar 0, border zone 0.67, remote 1).
vec3 deform(vec3 p, float w, float c) {
  float k = u_act * w;
  vec3 q = p - u_centre;
  float h = dot(q, u_axis);
  vec3 r = q - h * u_axis;
  float t = clamp((u_baseH - h) / 1.55, 0.0, 1.0);
  r *= 1.0 - 0.115 * k * c + 0.03 * k * (1.0 - c);
  float a = 0.16 * k * t;
  r = r * cos(a) + cross(u_axis, r) * sin(a);
  h -= 0.085 * k * (1.0 - 0.75 * t);
  return u_centre + h * u_axis + r;
}
`;

const MESH_VS = `
attribute vec3 a_pos;
attribute vec3 a_nrm;
attribute vec3 a_off;
attribute vec4 a_attr;   // w, c, fade, paint
attribute vec3 a_tint;   // scar, border zone, occlusion
uniform mat4 u_mvp;
uniform mat3 u_rot;
uniform vec2 u_wave;     // position of the band of light along the axis, strength
varying vec3 v_n;
varying vec4 v_attr;
varying vec3 v_tint;
varying float v_glow;
${DEFORM}
void main() {
  vec3 p = deform(a_pos, a_attr.x, a_attr.y) + a_off;
  v_n = u_rot * a_nrm;
  v_attr = a_attr;
  v_tint = a_tint;
  float d = (along(a_pos) - u_wave.x) / 0.16;
  v_glow = exp(-d * d) * u_wave.y * a_attr.x * a_attr.y;
  gl_Position = u_mvp * vec4(p, 1.0);
}
`;

const MESH_FS = `
precision mediump float;
varying vec3 v_n;
varying vec4 v_attr;
varying vec3 v_tint;
varying float v_glow;
uniform vec3 u_film;
void main() {
  vec3 n = normalize(v_n);
  vec3 l = normalize(vec3(-0.45, 0.62, 0.64));
  float diff = max(dot(n, l), 0.0);
  float rim = pow(1.0 - max(n.z, 0.0), 2.4);
  float spec = pow(max(dot(reflect(-l, n), vec3(0.0, 0.0, 1.0)), 0.0), 22.0);
  vec3 col;
  float alpha = 1.0;
  if (v_attr.w > 0.5) {
    // gel depot: a bead of teal with a bright edge
    vec3 teal = vec3(0.27, 0.77, 0.74);
    col = teal * (0.30 + 0.74 * diff) + vec3(0.62) * spec + vec3(0.42, 0.95, 0.90) * 0.34 * rim;
  } else {
    float ao = mix(0.30, 1.0, v_tint.z);
    vec3 body = mix(vec3(0.042, 0.039, 0.036), vec3(0.158, 0.146, 0.134), diff) * ao;
    body += vec3(0.135, 0.126, 0.116) * rim * mix(0.55, 1.0, v_tint.z);
    body += vec3(0.060) * spec * ao;
    vec3 scar = vec3(0.36, 0.07, 0.15) * (0.34 + 0.78 * diff);
    vec3 bz = vec3(0.38, 0.21, 0.06) * (0.34 + 0.78 * diff);
    body = mix(body, bz, v_tint.y * 0.62);
    body = mix(body, scar, v_tint.x * 0.74);
    body += vec3(0.080, 0.074, 0.066) * v_glow;
    col = mix(u_film, body, v_attr.z);
    // healthy ventricular wall lets a little of the far wall show through; scar, border zone,
    // atria and vessels do not
    alpha = 1.0 - 0.15 * v_attr.x * (1.0 - clamp(v_tint.x + v_tint.y, 0.0, 1.0));
  }
  gl_FragColor = vec4(col, alpha);
}
`;

const LINE_VS = `
attribute vec3 a_p;
attribute vec4 a_ts;     // tangent, side
attribute vec3 a_nrm;
attribute vec4 a_a0;     // w, c, fade, scar
attribute vec4 a_a1;     // border zone, occlusion, width, position along the line
attribute vec2 a_cr;     // class, random
uniform mat4 u_mvp;
uniform mat3 u_rot;
uniform vec2 u_view;     // viewport in device px
uniform float u_width;   // half-width of a fibre line in device px
uniform vec2 u_wave;
uniform float u_pass;    // 0 lines, 1 dark underlay for arteries, 2 far-side fibres seen through the wall, 3 soft light around the band
varying float v_side;
varying vec3 v_col;
varying float v_alpha;
varying float v_dash;
${DEFORM}
void main() {
  float w = a_a0.x;
  float c = a_a0.y;
  float cls = a_cr.x;
  vec4 a = u_mvp * vec4(deform(a_p, w, c), 1.0);
  vec4 b = u_mvp * vec4(deform(a_p + a_ts.xyz * 0.03, w, c), 1.0);
  vec2 d = normalize((b.xy / b.w - a.xy / a.w) * u_view + vec2(1e-5));
  vec2 side = vec2(-d.y, d.x) * a_ts.w;

  float d0 = (along(a_p) - u_wave.x) / 0.15;
  float glow = cls < 0.5 ? exp(-d0 * d0) * u_wave.y * w * c : 0.0;

  bool artery = cls > 2.5;
  float px = u_width * a_a1.z * (artery ? 2.1 : 1.0) * (1.0 + 0.6 * glow);
  if (u_pass > 0.5 && u_pass < 1.5) px = px * 2.2 + u_width * 1.2;
  if (u_pass > 2.5) px = px * 4.0;
  a.xy += side * px / u_view * 2.0 * a.w;
  a.z -= (artery ? (u_pass > 0.5 ? 0.00062 : 0.00074) : 0.00048) * a.w;
  gl_Position = a;

  vec3 n = normalize(u_rot * a_nrm);
  float diff = max(dot(n, normalize(vec3(-0.45, 0.62, 0.64))), 0.0);
  float facing = cls < 0.5 ? smoothstep(-0.05, 0.30, n.z) : smoothstep(0.04, 0.42, n.z);
  float light = (0.32 + 0.68 * diff) * mix(0.42, 1.0, a_a1.y);

  vec3 col;
  float alpha;
  v_dash = 0.0;
  if (cls < 0.5) {
    col = mix(mix(vec3(0.84, 0.83, 0.81), vec3(0.97, 0.65, 0.30), a_a1.x), vec3(0.94, 0.33, 0.49), a_a0.w);
    alpha = mix(0.74, 1.0, max(a_a1.x, a_a0.w));
    col = mix(col, vec3(1.0, 0.975, 0.93), 0.62 * glow);
    alpha *= 1.0 + 0.85 * glow;
  } else if (cls < 2.5) {
    col = vec3(0.66, 0.64, 0.61);
    alpha = 0.40;
  } else if (cls < 3.5) {
    col = vec3(0.97, 0.93, 0.87);
    alpha = 1.0;
    light = 0.55 + 0.45 * light;
  } else {
    // the blocked branch: the same pale line, broken into dashes
    col = vec3(0.97, 0.93, 0.87);
    alpha = 0.95;
    light = 0.60 + 0.40 * light;
    v_dash = 1.0;
  }
  alpha *= a_a0.z * facing * light * (0.72 + 0.28 * a_cr.y);

  if (u_pass > 2.5) {
    col = vec3(1.0, 0.94, 0.84);
    alpha = 0.05 * glow * facing * a_a0.z;
    v_dash = 0.0;
  } else if (u_pass > 1.5) {
    // the far wall, faintly, as if the muscle were glass
    float back = smoothstep(0.05, -0.35, n.z);
    alpha = cls < 0.5 ? 0.8 * back * a_a0.z * (0.6 + 0.4 * a_cr.y) : 0.0;
  } else if (u_pass > 0.5) {
    col = vec3(0.035, 0.032, 0.030);
    alpha = artery ? 0.82 * a_a0.z * facing : 0.0;
    v_dash = 0.0;
  }
  v_side = a_ts.w;
  v_col = col;
  v_alpha = alpha;
  // dashes along a blocked artery
  v_dash = v_dash > 0.5 ? a_a1.w * 8.0 : -1.0;
}
`;

const LINE_FS = `
precision mediump float;
varying float v_side;
varying vec3 v_col;
varying float v_alpha;
varying float v_dash;
void main() {
  float edge = 1.0 - smoothstep(0.42, 1.0, abs(v_side));
  float dash = v_dash < 0.0 ? 1.0 : step(0.42, fract(v_dash));
  gl_FragColor = vec4(v_col, v_alpha * edge * dash);
}
`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
  return sh;
}
function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const attr = {};
  const uni = {};
  for (let i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES); i++) {
    const a = gl.getActiveAttrib(p, i);
    attr[a.name] = gl.getAttribLocation(p, a.name);
  }
  for (let i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i++) {
    const u = gl.getActiveUniform(p, i);
    uni[u.name] = gl.getUniformLocation(p, u.name);
  }
  return { p, attr, uni };
}

function parse(buf) {
  const view = new DataView(buf);
  const n = view.getUint32(0, true);
  const head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, n)));
  const base = 4 + n;
  const T = { u16: Uint16Array, i8: Int8Array, u8: Uint8Array, f32: Float32Array };
  const arrays = {};
  for (const [name, d] of Object.entries(head.arrays)) arrays[name] = new T[d.type](buf, base + d.offset, d.count * d.size);
  return { head, arrays };
}

// Eq. (45): raised-cosine activation, 0 at end diastole, 1 at peak systole.
function activation(tb) {
  const peak = (0.3 / 0.8) * PERIOD;
  const relax = (0.15 / 0.8) * PERIOD;
  if (tb < peak) return 0.5 * (1 - Math.cos((Math.PI * tb) / peak));
  if (tb < peak + relax) return 0.5 * (1 + Math.cos((Math.PI * (tb - peak)) / relax));
  return 0;
}

// --- small matrix helpers (column-major) ---
function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) / (near - far);
  m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  return m;
}
function mul(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return o;
}
function rotYX(yaw, pitch) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cx = Math.cos(pitch), sx = Math.sin(pitch);
  // R = Rx(pitch) * Ry(yaw), as a 3x3 in column-major order
  return new Float32Array([cy, sx * sy, -cx * sy, 0, cx, sx, sy, -sx * cy, cx * cy]);
}
function modelView(rot, centre, dist) {
  const m = new Float32Array(16);
  m.set([rot[0], rot[1], rot[2], 0, rot[3], rot[4], rot[5], 0, rot[6], rot[7], rot[8], 0]);
  // translate so "centre" sits at the origin, then push back along -z
  m[12] = -(rot[0] * centre[0] + rot[3] * centre[1] + rot[6] * centre[2]);
  m[13] = -(rot[1] * centre[0] + rot[4] * centre[1] + rot[7] * centre[2]);
  m[14] = -(rot[2] * centre[0] + rot[5] * centre[1] + rot[8] * centre[2]) - dist;
  m[15] = 1;
  return m;
}

export async function createHeart(canvas, { src }) {
  const gl = canvas.getContext("webgl", { antialias: true, alpha: false, powerPreference: "low-power" });
  if (!gl) throw new Error("WebGL is not available");
  if (!gl.getExtension("OES_element_index_uint")) throw new Error("32-bit indices are not available");
  const res = await fetch(src);
  if (!res.ok) throw new Error(`heart geometry: ${res.status}`);
  const { head, arrays: A } = parse(await res.arrayBuffer());
  const lo = head.lo;
  const span = head.hi.map((v, i) => v - lo[i]);
  const dq = (arr, i) => [lo[0] + (arr[i * 3] / 65535) * span[0], lo[1] + (arr[i * 3 + 1] / 65535) * span[1], lo[2] + (arr[i * 3 + 2] / 65535) * span[2]];

  // ---- body mesh plus one small sphere per gel depot, in a single buffer ----
  const nBody = A.meshPos.length / 3;
  const nDep = A.depotCentre.length / 3;
  const nSv = A.sphereVert.length / 3;
  const nMeshV = nBody + nDep * nSv;
  const STRIDE = 3 + 3 + 3 + 4 + 3;
  const mv = new Float32Array(nMeshV * STRIDE);
  for (let i = 0; i < nBody; i++) {
    const p = dq(A.meshPos, i);
    const o = i * STRIDE;
    mv[o] = p[0]; mv[o + 1] = p[1]; mv[o + 2] = p[2];
    mv[o + 3] = A.meshNrm[i * 3] / 127; mv[o + 4] = A.meshNrm[i * 3 + 1] / 127; mv[o + 5] = A.meshNrm[i * 3 + 2] / 127;
    mv[o + 9] = A.meshAttr[i * 6] / 255; mv[o + 10] = A.meshAttr[i * 6 + 1] / 255; mv[o + 11] = A.meshAttr[i * 6 + 2] / 255; mv[o + 12] = 0;
    mv[o + 13] = A.meshAttr[i * 6 + 3] / 255; mv[o + 14] = A.meshAttr[i * 6 + 4] / 255; mv[o + 15] = A.meshAttr[i * 6 + 5] / 255;
  }
  const nBodyIdx = A.meshIdx.length;
  const nSphIdx = A.sphereIdx.length;
  const idx = new Uint32Array(nBodyIdx + nDep * nSphIdx);
  idx.set(A.meshIdx);
  for (let d = 0; d < nDep; d++) {
    const c = dq(A.depotCentre, d);
    for (let j = 0; j < nSv; j++) {
      const o = (nBody + d * nSv + j) * STRIDE;
      const sx = A.sphereVert[j * 3], sy = A.sphereVert[j * 3 + 1], sz = A.sphereVert[j * 3 + 2];
      mv[o] = c[0]; mv[o + 1] = c[1]; mv[o + 2] = c[2];
      mv[o + 3] = sx; mv[o + 4] = sy; mv[o + 5] = sz;
      mv[o + 6] = sx * head.depotRadius; mv[o + 7] = sy * head.depotRadius; mv[o + 8] = sz * head.depotRadius;
      mv[o + 9] = A.depotAttr[d * 2] / 255; mv[o + 10] = A.depotAttr[d * 2 + 1] / 255; mv[o + 11] = 1; mv[o + 12] = 1;
      mv[o + 15] = 1;
    }
    for (let j = 0; j < nSphIdx; j++) idx[nBodyIdx + d * nSphIdx + j] = nBody + d * nSv + A.sphereIdx[j];
  }

  // ---- lines: every point becomes two vertices that the vertex shader pushes apart into a ribbon ----
  // 32 bytes per vertex: position (3 floats), tangent + side (4 signed bytes), normal (3 signed bytes),
  // eight per-point values (unsigned bytes), class and a random number (unsigned bytes).
  const K = head.pointsPerLine;
  const nPts = A.linePos.length / 3;
  const nLines = nPts / K;
  const LS = 32;
  const lbuf = new ArrayBuffer(nPts * 2 * LS);
  const lf = new Float32Array(lbuf);
  const li8 = new Int8Array(lbuf);
  const lu8 = new Uint8Array(lbuf);
  for (let i = 0; i < nPts; i++) {
    const p = dq(A.linePos, i);
    for (let s = 0; s < 2; s++) {
      const v = i * 2 + s;
      const o = v * LS;
      lf[o / 4] = p[0]; lf[o / 4 + 1] = p[1]; lf[o / 4 + 2] = p[2];
      li8[o + 12] = A.lineTan[i * 3]; li8[o + 13] = A.lineTan[i * 3 + 1]; li8[o + 14] = A.lineTan[i * 3 + 2]; li8[o + 15] = s ? 127 : -127;
      li8[o + 16] = A.lineNrm[i * 3]; li8[o + 17] = A.lineNrm[i * 3 + 1]; li8[o + 18] = A.lineNrm[i * 3 + 2];
      for (let k = 0; k < 8; k++) lu8[o + 20 + k] = A.lineAttr[i * 8 + k];
      lu8[o + 28] = A.lineClass[i * 2]; lu8[o + 29] = A.lineClass[i * 2 + 1];
    }
  }
  const lidx = new Uint32Array(nLines * (K - 1) * 6);
  let q = 0;
  for (let l = 0; l < nLines; l++) {
    for (let k = 0; k < K - 1; k++) {
      const a = (l * K + k) * 2;
      lidx[q++] = a; lidx[q++] = a + 1; lidx[q++] = a + 3;
      lidx[q++] = a; lidx[q++] = a + 3; lidx[q++] = a + 2;
    }
  }
  const fibreCount = head.fibreLines * (K - 1) * 6;
  const arteryCount = head.coronaryLines * (K - 1) * 6;

  const meshProg = program(gl, MESH_VS, MESH_FS);
  const lineProg = program(gl, LINE_VS, LINE_FS);
  const meshBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, meshBuf);
  gl.bufferData(gl.ARRAY_BUFFER, mv, gl.STATIC_DRAW);
  const idxBuf = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
  const lineBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf);
  gl.bufferData(gl.ARRAY_BUFFER, lbuf, gl.STATIC_DRAW);
  const lineIdxBuf = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lineIdxBuf);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, lidx, gl.STATIC_DRAW);

  const used = new Set();
  const point = (prog, name, size, type, norm, stride, offset) => {
    const loc = prog.attr[name];
    if (loc === undefined || loc < 0) return;
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, type, norm, stride, offset);
    used.add(loc);
  };
  const reset = () => {
    for (const loc of used) gl.disableVertexAttribArray(loc);
    used.clear();
  };

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
  const centre = [0.04, 0.2, 0.0];
  const state = { yaw: -0.24, pitch: 0.12, dragging: false, lastX: 0, lastY: 0, idleAt: 0, t0: performance.now(), lookX: 0, lookY: 0, goalX: 0, goalY: 0, frozen: null };
  let visible = false;
  let raf = 0;
  let w = 0;
  let h = 0;
  // Quality steps down on slow devices: 2 = everything, 1 = one device pixel per CSS pixel,
  // 0 = also without the see-through far wall and the soft light.
  let quality = 2;
  let lastFrame = 0;
  let slow = 0;
  let counted = 0;

  function resize() {
    const dpr = quality > 1 ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    const cw = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const ch = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (cw !== w || ch !== h) {
      w = cw;
      h = ch;
      canvas.width = w;
      canvas.height = h;
    }
  }

  function draw(now) {
    const t = (now - state.t0) / 1000;
    const still = reduce.matches || state.frozen;
    const tb = ((t % PERIOD) + PERIOD) % PERIOD;
    let act = still ? 0 : activation(tb);
    // the band of light: from apex (1) to base (0) as the beat begins
    let wavePos = 2;
    let waveAmp = 0;
    if (!still && tb < SWEEP) {
      const k = tb / SWEEP;
      wavePos = 1.08 - 1.2 * k;
      waveAmp = Math.sin(Math.PI * Math.min(1, k * 1.08)) ** 0.6;
    }
    if (state.frozen) {
      act = state.frozen.act;
      wavePos = state.frozen.wave;
      waveAmp = state.frozen.wave < 1.5 ? 1 : 0;
    }
    let yaw = state.yaw;
    let pitch = state.pitch;
    if (!state.dragging && !still) {
      // a slow sway that keeps the infarct in view; it eases back in after a drag
      const k = Math.min(1, Math.max(0, (now - state.idleAt) / 1600));
      yaw += k * 0.3 * Math.sin(t * 0.26);
      // and a slight lean toward the pointer
      state.lookX += (state.goalX - state.lookX) * 0.06;
      state.lookY += (state.goalY - state.lookY) * 0.06;
      yaw += k * state.lookX;
      pitch += k * state.lookY;
    }
    const rot = rotYX(yaw, pitch);
    const aspect = w / h;
    const fov = (26 * Math.PI) / 180;
    // fit the model in height, or its width on narrow canvases
    const dist = Math.max(1.66 / Math.tan(fov / 2), 1.28 / (Math.tan(fov / 2) * aspect));
    const mvp = mul(perspective(fov, aspect, 1, 40), modelView(rot, centre, dist));

    gl.viewport(0, 0, w, h);
    gl.clearColor(FILM[0], FILM[1], FILM[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);

    const common = (prog) => {
      gl.useProgram(prog.p);
      gl.uniformMatrix4fv(prog.uni.u_mvp, false, mvp);
      gl.uniformMatrix3fv(prog.uni.u_rot, false, rot);
      gl.uniform1f(prog.uni.u_act, act);
      gl.uniform3fv(prog.uni.u_axis, head.axis);
      gl.uniform3fv(prog.uni.u_centre, head.centre);
      gl.uniform1f(prog.uni.u_baseH, head.baseH);
      gl.uniform2f(prog.uni.u_wave, wavePos, waveAmp);
    };

    const bindLines = () => {
      reset();
      common(lineProg);
      gl.uniform2f(lineProg.uni.u_view, w, h);
      gl.uniform1f(lineProg.uni.u_width, Math.max(0.75, (h / 640) * 0.72));
      gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lineIdxBuf);
      point(lineProg, "a_p", 3, gl.FLOAT, false, LS, 0);
      point(lineProg, "a_ts", 4, gl.BYTE, true, LS, 12);
      point(lineProg, "a_nrm", 3, gl.BYTE, true, LS, 16);
      point(lineProg, "a_a0", 4, gl.UNSIGNED_BYTE, true, LS, 20);
      point(lineProg, "a_a1", 4, gl.UNSIGNED_BYTE, true, LS, 24);
      point(lineProg, "a_cr", 2, gl.UNSIGNED_BYTE, false, LS, 28);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);
    };

    // 1. the far wall's fibres, which the body then covers almost completely
    if (quality > 0) {
      bindLines();
      gl.disable(gl.DEPTH_TEST);
      gl.uniform1f(lineProg.uni.u_pass, 2);
      gl.drawElements(gl.TRIANGLES, fibreCount, gl.UNSIGNED_INT, 0);
      gl.enable(gl.DEPTH_TEST);
    }

    // 2. the body and the gel depots
    reset();
    common(meshProg);
    gl.uniform3fv(meshProg.uni.u_film, FILM);
    gl.bindBuffer(gl.ARRAY_BUFFER, meshBuf);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
    const MS = STRIDE * 4;
    point(meshProg, "a_pos", 3, gl.FLOAT, false, MS, 0);
    point(meshProg, "a_nrm", 3, gl.FLOAT, false, MS, 12);
    point(meshProg, "a_off", 3, gl.FLOAT, false, MS, 24);
    point(meshProg, "a_attr", 4, gl.FLOAT, false, MS, 36);
    point(meshProg, "a_tint", 3, gl.FLOAT, false, MS, 52);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);
    gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_INT, 0);

    // 3. the near wall's lines
    bindLines();
    //    a soft light around the band as it passes
    if (waveAmp > 0.01 && quality > 0) {
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.uniform1f(lineProg.uni.u_pass, 3);
      gl.drawElements(gl.TRIANGLES, fibreCount, gl.UNSIGNED_INT, 0);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }
    //    fibres
    gl.uniform1f(lineProg.uni.u_pass, 0);
    gl.drawElements(gl.TRIANGLES, fibreCount, gl.UNSIGNED_INT, 0);
    //    arteries, each over a dark underlay so it reads against the fibres
    gl.uniform1f(lineProg.uni.u_pass, 1);
    gl.drawElements(gl.TRIANGLES, arteryCount, gl.UNSIGNED_INT, fibreCount * 4);
    gl.uniform1f(lineProg.uni.u_pass, 0);
    gl.drawElements(gl.TRIANGLES, arteryCount, gl.UNSIGNED_INT, fibreCount * 4);
    gl.depthMask(true);
  }

  function frame(now) {
    raf = 0;
    // if the first frames come slowly, trade resolution and then detail for smoothness
    if (lastFrame && quality > 0 && !state.frozen) {
      const dt = now - lastFrame;
      if (dt < 400) {
        counted++;
        if (dt > 42) slow++;
        if (counted >= 24) {
          if (slow > 14) {
            quality--;
            w = 0;
            resize();
          }
          counted = 0;
          slow = 0;
        }
      }
    }
    lastFrame = now;
    draw(now);
    if (visible && !document.hidden && !state.frozen && (!reduce.matches || state.dragging)) raf = requestAnimationFrame(frame);
  }
  const kick = () => {
    if (!raf) raf = requestAnimationFrame(frame);
  };

  // drag to turn it; vertical drags on touch screens still scroll the page
  canvas.style.touchAction = "pan-y";
  canvas.style.cursor = "grab";
  canvas.addEventListener("pointerdown", (e) => {
    state.dragging = true;
    state.lastX = e.clientX;
    state.lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = "grabbing";
    kick();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!state.dragging) return;
    state.yaw += (e.clientX - state.lastX) * 0.008;
    state.pitch = Math.max(-0.6, Math.min(0.7, state.pitch + (e.clientY - state.lastY) * 0.006));
    state.lastX = e.clientX;
    state.lastY = e.clientY;
    kick();
  });
  const release = () => {
    if (!state.dragging) return;
    state.dragging = false;
    state.idleAt = performance.now();
    canvas.style.cursor = "grab";
    kick();
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
  canvas.addEventListener("keydown", (e) => {
    const step = { ArrowLeft: [-0.12, 0], ArrowRight: [0.12, 0], ArrowUp: [0, -0.08], ArrowDown: [0, 0.08] }[e.key];
    if (!step) return;
    e.preventDefault();
    state.yaw += step[0];
    state.pitch = Math.max(-0.6, Math.min(0.7, state.pitch + step[1]));
    kick();
  });
  // with a mouse, the heart leans a little toward the pointer
  window.addEventListener(
    "pointermove",
    (e) => {
      if (!visible || !fine.matches || e.pointerType !== "mouse") return;
      const r = canvas.getBoundingClientRect();
      const nx = (e.clientX - (r.left + r.width / 2)) / Math.max(r.width, 1);
      const ny = (e.clientY - (r.top + r.height / 2)) / Math.max(r.height, 1);
      state.goalX = Math.max(-1, Math.min(1, nx)) * 0.16;
      state.goalY = Math.max(-1, Math.min(1, ny)) * 0.07;
    },
    { passive: true }
  );

  const io = new IntersectionObserver((en) => {
    visible = en[0].isIntersecting;
    if (visible) kick();
  }, { rootMargin: "80px" });
  io.observe(canvas);
  const ro = new ResizeObserver(() => {
    resize();
    kick();
  });
  ro.observe(canvas);
  document.addEventListener("visibilitychange", kick);
  reduce.addEventListener?.("change", kick);
  canvas.addEventListener("webglcontextlost", (e) => e.preventDefault());
  resize();
  draw(performance.now());
  kick();

  return {
    // for still images: hold one frame at a chosen angle, contraction (0..1) and
    // position of the band of light (1 apex .. 0 base; 2 = off)
    snapshot({ yaw = -0.24, pitch = 0.12, act = 0, wave = 2 } = {}) {
      state.yaw = yaw;
      state.pitch = pitch;
      state.frozen = { act, wave };
      resize();
      draw(performance.now());
    },
    destroy() {
      io.disconnect();
      ro.disconnect();
      cancelAnimationFrame(raf);
    },
  };
}
