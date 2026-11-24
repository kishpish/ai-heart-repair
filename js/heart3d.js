// The 3D heart in the hero, drawn with plain WebGL (geometry from tools/build_heart.py).
//
// It tells a three-part story on a loop:
//   1. Scarred: a patch of scar on the left ventricle does not contract and bulges
//      a little as the rest of the wall squeezes; an ochre border zone surrounds it.
//   2. Hydrogel: nine gel depots are injected into the border zone, one by one,
//      and the gel spreads into the wall around them.
//   3. Restored: the scar heals from its edge inward, the gel slowly degrades, and
//      the whole wall contracts again. This last stage is the long-term goal the
//      work points toward, not a result of the paper.
//
// Taken from the paper: scar develops no active tension and the border zone 0.67 of
// remote (Section 2.11); depots sit in the border zone, clear of the scar (Fig. 4);
// the beat follows the raised-cosine activation of Eq. (45), slowed for display; the
// surface sheen follows the epicardial fibre angle of the rule-based field (Section 2.7).
//
// createHeart(canvas, { src, onStage }) resolves to a controller, or rejects if WebGL
// or the geometry is unavailable, so the caller can fall back to the 2D drawing.

const PERIOD = 1.7; // seconds per beat on screen (matches js/ventricle.js)
const SWEEP = 0.34; // seconds the band of light takes to travel from apex to base

// The story, in seconds of the loop
const T_INJECT = 3.6; // depots start to go in
const T_HEAL = 6.6; // healing starts
const T_RESTORED = 10.4; // fully restored
const T_FADE = 13.4; // fade to dark before the loop restarts
const LOOP = 13.9;
export const STAGE_STARTS = [0, T_INJECT, T_HEAL];
const STAGE_ENDS = [T_INJECT, T_HEAL, LOOP];
// representative moments for still frames (reduced motion, share image)
export const STAGE_STILLS = [1.2, 6.4, 11.5];

const FILM = [13 / 255, 12 / 255, 11 / 255];
const N_DEP = 9;

const VS = `
attribute vec3 a_pos;
attribute vec3 a_off;
attribute vec3 a_nrm;
attribute vec4 a_tan;    // fibre direction, material (0 muscle, 1 atria and vessels, 2 artery, 3 gel depot)
attribute vec4 a_a;      // ventricle weight, contractility, fade, occlusion
attribute vec4 a_b;      // scar, border zone, distance from scar centre (/2), on-ventricle mask
attribute float a_d;     // depot index
uniform mat4 u_mvp;
uniform mat3 u_rot;
uniform float u_act;
uniform vec3 u_axis;
uniform vec3 u_centre;
uniform float u_baseH;
uniform vec2 u_wave;     // position of the band of light along the axis (1 apex .. 0 base), strength
uniform vec3 u_dep[${N_DEP}];
uniform float u_depS[${N_DEP}];   // depot size, 0..1
uniform float u_depR[${N_DEP}];   // ripple progress after injection, 0..1
uniform float u_heal;    // 0..1
varying vec3 v_n;
varying vec3 v_t;
varying vec3 v_p;
varying vec4 v_a;        // w, c, fade, occlusion
varying vec4 v_m;        // distance from scar centre, on-ventricle mask, gel, ripple
varying vec2 v_k;        // material, band glow

float along(vec3 p) {
  return clamp((u_baseH - dot(p - u_centre, u_axis)) / 1.55, 0.0, 1.0);
}

// Systole: the wall moves toward the long axis, the base descends toward the apex and
// the apex twists. Tissue that cannot contract (c = 0) is pushed outward instead.
vec3 deform(vec3 p, float w, float c) {
  float k = u_act * w;
  vec3 q = p - u_centre;
  float h = dot(q, u_axis);
  vec3 r = q - h * u_axis;
  float t = clamp((u_baseH - h) / 1.55, 0.0, 1.0);
  r *= 1.0 - 0.12 * k * c + 0.05 * k * (1.0 - c);
  float a = 0.16 * k * t;
  r = r * cos(a) + cross(u_axis, r) * sin(a);
  h -= 0.085 * k * (1.0 - 0.75 * t);
  return u_centre + h * u_axis + r;
}

void main() {
  float mat = a_tan.w;
  float w = a_a.x;
  float rn = a_b.z * 2.0;
  // the healing front moves from the outer edge of the border zone to the scar centre
  float front = 1.2 - u_heal * 1.45;
  float healed = smoothstep(front - 0.08, front + 0.08, rn);
  float scar = a_b.x * (1.0 - healed);
  float bz = a_b.y * (1.0 - healed);
  float c = mix(a_a.y, 1.0, healed);

  vec3 off = a_off;
  float gel = 0.0;
  float ring = 0.0;
  if (mat > 2.5) {
    float s = 0.0;
    for (int i = 0; i < ${N_DEP}; i++) {
      if (abs(a_d - float(i)) < 0.5) s = u_depS[i];
    }
    off *= s;
  } else if (mat < 0.5) {
    for (int i = 0; i < ${N_DEP}; i++) {
      float d = distance(a_pos, u_dep[i]);
      gel += u_depS[i] * exp(-d * d / 0.0085);
      float rp = u_depR[i];
      float x = (d - 0.03 - rp * 0.18) / 0.02;
      ring += step(0.001, rp) * step(rp, 0.999) * exp(-x * x) * (1.0 - rp) * (1.0 - rp);
    }
    gel = min(gel, 1.0) * w;
    ring = min(ring, 1.0) * w;
  }

  // scar is thinned wall: it sits a little below the surface until it heals
  vec3 base = a_pos - a_nrm * (0.020 * scar + 0.006 * bz);
  vec3 p = deform(base, w, c) + off;
  v_n = u_rot * a_nrm;
  v_t = u_rot * a_tan.xyz;
  v_p = a_pos;
  v_a = vec4(w, c, a_a.z, a_a.w);
  // y: on the muscle, how much the point lies on the ventricles; on an artery, whether it is past the blockage
  v_m = vec4(rn, mat < 0.5 || (mat > 1.5 && mat < 2.5) ? a_b.w : 0.0, gel, ring);
  float d0 = (along(a_pos) - u_wave.x) / 0.17;
  float glow = mat < 0.5 ? exp(-d0 * d0) * u_wave.y * w * c : 0.0;
  v_k = vec2(mat, glow);
  gl_Position = u_mvp * vec4(p, 1.0);
}
`;

const FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec3 v_n;
varying vec3 v_t;
varying vec3 v_p;
varying vec4 v_a;
varying vec4 v_m;
varying vec2 v_k;
uniform vec3 u_film;
uniform float u_fade;
uniform float u_heal;

const float R_SCAR = ${(0.265 / 0.38).toFixed(4)};   // scar radius over the outer border-zone radius

vec3 lin(vec3 c) { return c * c; }
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
// smooth, low-frequency variation for the scar (no grain)
float mottle(vec3 p) {
  return 0.5 + 0.25 * sin(dot(p, vec3(21.0, 13.0, 17.0)) + 1.7) * sin(dot(p, vec3(-11.0, 23.0, 9.0)))
             + 0.25 * sin(dot(p, vec3(7.0, -15.0, 25.0)) + 0.4);
}

void main() {
  vec3 N = normalize(v_n);
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 L1 = normalize(vec3(-0.74, 0.56, 0.38));   // key, warm, from the upper left
  vec3 L2 = normalize(vec3(0.86, -0.12, 0.34));   // fill, cool, from the right
  float mat = v_k.x;
  float ao = v_a.w;
  float rn = v_m.x;
  float vm = v_m.y;
  float gel = v_m.z;

  // tissue, computed per pixel so the edges stay crisp
  float front = 1.2 - u_heal * 1.45;
  float healed = smoothstep(front - 0.035, front + 0.035, rn);
  float e = 0.018;
  float onv = mat < 0.5 ? vm : 0.0;
  float scar0 = (1.0 - smoothstep(R_SCAR - e, R_SCAR + e, rn)) * onv;
  float bz0 = max((1.0 - smoothstep(0.86, 1.06, rn)) * onv - scar0, 0.0);
  float scar = scar0 * (1.0 - healed);
  float bz = bz0 * (1.0 - healed);
  float fx = (rn - front) / 0.045;
  float frontGlow = exp(-fx * fx) * sin(3.14159 * clamp(u_heal, 0.0, 1.0)) * onv * step(rn, 1.3);

  vec3 teal = lin(vec3(0.27, 0.77, 0.74));
  vec3 alb;
  float ks = 0.22;
  float shin = 38.0;
  float sheen = 0.0;
  float rim = 1.0;
  if (mat < 0.5) {
    // ventricular muscle: pale pearl, with scar and border zone painted in
    alb = lin(vec3(0.76, 0.735, 0.705));
    float m = mottle(v_p);
    vec3 bzc = mix(lin(vec3(0.82, 0.45, 0.16)), lin(vec3(0.88, 0.66, 0.42)), smoothstep(R_SCAR, 1.02, rn));
    vec3 scarc = mix(lin(vec3(0.46, 0.06, 0.15)), lin(vec3(0.70, 0.15, 0.27)), m);
    alb = mix(alb, bzc, bz);
    alb = mix(alb, scarc, scar);
    alb = mix(alb, mix(alb, teal, 0.6), gel * 0.65);
    ks = mix(0.22, 0.06, scar);
    shin = mix(38.0, 14.0, scar);
    sheen = (1.0 - scar) * (1.0 - bz * 0.5) * v_a.x;
  } else if (mat < 1.5) {
    // atria and great vessels, quieter so the ventricles lead; near the ventricles they
    // take on the same pearl so the base does not read as a separate lid
    alb = mix(lin(vec3(0.25, 0.235, 0.225)), lin(vec3(0.62, 0.595, 0.57)), smoothstep(0.05, 0.75, v_a.x));
    ks = 0.06;
    shin = 18.0;
    rim = 0.65;
  } else if (mat < 2.5) {
    // coronary arteries
    alb = mix(lin(vec3(0.64, 0.45, 0.42)), lin(vec3(0.30, 0.20, 0.20)), vm);
    ks = mix(0.30, 0.12, vm);
    shin = 56.0;
  } else {
    // gel depot: a glossy bead set into the wall
    alb = teal * 0.85;
    ks = 0.9;
    shin = 80.0;
  }

  float wrap = 0.18;
  float d1 = max((dot(N, L1) + wrap) / (1.0 + wrap), 0.0);
  d1 = d1 * d1 * (3.0 - 2.0 * d1);  // a softer, rounder turn from light to shadow
  float d2 = max(dot(N, L2), 0.0);
  float fres = pow(1.0 - max(N.z, 0.0), 3.2);
  vec3 H = normalize(L1 + V);
  float spec = pow(max(dot(N, H), 0.0), shin) * ks;

  // a silky highlight along the muscle fibres
  vec3 T = v_t - N * dot(v_t, N);
  float tl = length(T);
  float aniso = 0.0;
  if (tl > 1e-4) {
    T /= tl;
    float th = dot(T, H);
    aniso = pow(sqrt(max(1.0 - th * th, 0.0)), 110.0) * 0.20 * sheen;
  }

  float occ = mix(0.22, 1.0, ao);
  float sky = 0.5 + 0.5 * N.y;   // a little more light from above than below
  vec3 col = alb * (mix(0.025, 0.075, sky) * occ + 0.98 * d1 * mix(0.40, 1.0, ao) * vec3(1.0, 0.95, 0.89) + 0.17 * d2 * occ * vec3(0.78, 0.87, 1.0));
  col += vec3(spec + aniso) * occ;
  col += vec3(0.36, 0.44, 0.52) * fres * 0.50 * rim * occ;

  // light: the band that travels with each beat, the gel, its ripple, the healing front
  col += lin(vec3(1.0, 0.92, 0.80)) * v_k.y * 0.20;
  col += teal * (gel * 0.16 + v_m.w * 0.70);
  col += lin(vec3(0.72, 0.98, 0.90)) * frontGlow * 0.45;
  if (mat > 2.5) col += teal * (0.06 + 0.55 * fres);

  col = sqrt(aces(col));
  col = mix(u_film, col, v_a.z);
  col = mix(u_film, col, u_fade);
  // a whisper of dither so the dark gradients do not band
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  col += (n - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
`;

// A soft glow behind the heart that falls to the page colour at the edges
const BG_VS = `
attribute vec2 a_xy;
varying vec2 v_xy;
void main() { v_xy = a_xy; gl_Position = vec4(a_xy, 0.0, 1.0); }
`;
const BG_FS = `
precision mediump float;
varying vec2 v_xy;
uniform vec2 u_c;
uniform vec2 u_aspect;
uniform vec3 u_film;
uniform vec3 u_tint;
uniform float u_fade;
void main() {
  vec2 d = (v_xy - u_c) * u_aspect;
  float g = exp(-dot(d, d) * 2.6) * u_fade;
  vec3 col = u_film + u_tint * g;
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  col += (n - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
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
    uni[u.name.replace(/\[0\]$/, "")] = gl.getUniformLocation(p, u.name);
  }
  return { p, attr, uni };
}

function parse(buf) {
  const view = new DataView(buf);
  const n = view.getUint32(0, true);
  const head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, n)));
  const base = 4 + n;
  const T = { u16: Uint16Array, i16: Int16Array, i8: Int8Array, u8: Uint8Array, f32: Float32Array };
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

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const easeOutBack = (t) => {
  const c = 1.6;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

// Everything the story needs at loop time t
function story(t) {
  const depS = new Float32Array(N_DEP);
  const depR = new Float32Array(N_DEP);
  for (let i = 0; i < N_DEP; i++) {
    const t0 = T_INJECT + 0.25 + i * 0.24;
    const grow = clamp01((t - t0) / 0.55);
    // each depot degrades during healing, a little after its neighbour
    const t1 = T_HEAL + 1.5 + i * 0.16;
    const shrink = 1 - smooth(t1, t1 + 1.6, t);
    depS[i] = (grow > 0 ? easeOutBack(grow) : 0) * shrink;
    depR[i] = t < t0 ? 0 : clamp01((t - t0) / 1.1);
  }
  const heal = smooth(T_HEAL + 0.2, T_RESTORED, t);
  const gel = smooth(T_INJECT, T_HEAL, t) * (1 - smooth(T_HEAL + 1.5, T_RESTORED, t));
  const stage = t < T_INJECT ? 0 : t < T_HEAL ? 1 : 2;
  const progress = clamp01((t - STAGE_STARTS[stage]) / (STAGE_ENDS[stage] - STAGE_STARTS[stage]));
  const fade = 1 - smooth(T_FADE, LOOP, t);
  return { depS, depR, heal, gel, stage, progress, fade };
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
  m[12] = -(rot[0] * centre[0] + rot[3] * centre[1] + rot[6] * centre[2]);
  m[13] = -(rot[1] * centre[0] + rot[4] * centre[1] + rot[7] * centre[2]);
  m[14] = -(rot[2] * centre[0] + rot[5] * centre[1] + rot[8] * centre[2]) - dist;
  m[15] = 1;
  return m;
}

export async function createHeart(canvas, { src, onStage } = {}) {
  const gl = canvas.getContext("webgl", { antialias: true, alpha: false, powerPreference: "default" });
  if (!gl) throw new Error("WebGL is not available");
  const res = await fetch(src);
  if (!res.ok) throw new Error(`heart geometry: ${res.status}`);
  const { head, arrays: A } = parse(await res.arrayBuffer());
  const lo = head.lo;
  const span = head.hi.map((v, i) => v - lo[i]);
  const dq = (arr, i) => [lo[0] + (arr[i * 3] / 65535) * span[0], lo[1] + (arr[i * 3 + 1] / 65535) * span[1], lo[2] + (arr[i * 3 + 2] / 65535) * span[2]];

  // ---- one interleaved buffer: the surface, the arteries and nine depot spheres ----
  const nV = A.pos.length / 3;
  const nSv = A.sphereVert.length / 3;
  const nAll = nV + N_DEP * nSv;
  const S = 3 + 3 + 3 + 4 + 4 + 4 + 1;
  const vb = new Float32Array(nAll * S);
  for (let i = 0; i < nV; i++) {
    const p = dq(A.pos, i);
    const o = i * S;
    vb[o] = p[0]; vb[o + 1] = p[1]; vb[o + 2] = p[2];
    vb[o + 6] = A.nrm[i * 3] / 32767; vb[o + 7] = A.nrm[i * 3 + 1] / 32767; vb[o + 8] = A.nrm[i * 3 + 2] / 32767;
    vb[o + 9] = A.tan[i * 4] / 127; vb[o + 10] = A.tan[i * 4 + 1] / 127; vb[o + 11] = A.tan[i * 4 + 2] / 127; vb[o + 12] = A.tan[i * 4 + 3];
    // a: ventricle weight, contractility, fade, occlusion
    vb[o + 13] = A.attr[i * 8] / 255; vb[o + 14] = A.attr[i * 8 + 1] / 255; vb[o + 15] = A.attr[i * 8 + 2] / 255; vb[o + 16] = A.attr[i * 8 + 5] / 255;
    // b: scar, border zone, distance from the scar centre, blocked artery
    vb[o + 17] = A.attr[i * 8 + 3] / 255; vb[o + 18] = A.attr[i * 8 + 4] / 255; vb[o + 19] = A.attr[i * 8 + 6] / 255; vb[o + 20] = A.attr[i * 8 + 7] / 255;
    vb[o + 21] = -1;
  }
  const depots = [];
  for (let d = 0; d < N_DEP; d++) {
    const c = dq(A.depotCentre, d);
    depots.push(c);
    for (let j = 0; j < nSv; j++) {
      const o = (nV + d * nSv + j) * S;
      const sx = A.sphereVert[j * 3], sy = A.sphereVert[j * 3 + 1], sz = A.sphereVert[j * 3 + 2];
      vb[o] = c[0]; vb[o + 1] = c[1]; vb[o + 2] = c[2];
      vb[o + 3] = sx * head.depotRadius; vb[o + 4] = sy * head.depotRadius; vb[o + 5] = sz * head.depotRadius;
      vb[o + 6] = sx; vb[o + 7] = sy; vb[o + 8] = sz;
      vb[o + 12] = 3;
      vb[o + 13] = A.depotAttr[d * 2] / 255; vb[o + 14] = A.depotAttr[d * 2 + 1] / 255; vb[o + 15] = 1; vb[o + 16] = 1;
      vb[o + 19] = 0.85 / 2;
      vb[o + 21] = d;
    }
  }
  const nIdx = A.idx.length;
  const nSi = A.sphereIdx.length;
  const big = nAll > 65535;
  if (big && !gl.getExtension("OES_element_index_uint")) throw new Error("mesh too large for this device");
  const ib = new (big ? Uint32Array : Uint16Array)(nIdx + N_DEP * nSi);
  ib.set(A.idx);
  for (let d = 0; d < N_DEP; d++) for (let j = 0; j < nSi; j++) ib[nIdx + d * nSi + j] = nV + d * nSv + A.sphereIdx[j];
  const depFlat = new Float32Array(depots.flat());

  const prog = program(gl, VS, FS);
  const bg = program(gl, BG_VS, BG_FS);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, vb, gl.STATIC_DRAW);
  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, ib, gl.STATIC_DRAW);
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  const used = new Set();
  const point = (p, name, size, offset) => {
    const loc = p.attr[name];
    if (loc === undefined || loc < 0) return;
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, S * 4, offset * 4);
    used.add(loc);
  };
  const reset = () => {
    for (const loc of used) gl.disableVertexAttribArray(loc);
    used.clear();
  };

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
  const centre = [0.04, 0.2, 0.0];
  const state = {
    yaw: -0.24, pitch: 0.12, dragging: false, lastX: 0, lastY: 0, idleAt: -1e9,
    lookX: 0, lookY: 0, goalX: 0, goalY: 0,
    clock: 0, // seconds of animation shown so far (drives the beat)
    loopT: 0, // position in the story loop
    playing: !reduce.matches,
    looped: false,
    frozen: null,
    lastStage: -1,
    lastProgress: -1,
  };
  if (!state.playing) state.loopT = STAGE_STILLS[1];
  let visible = false;
  let raf = 0;
  let w = 0;
  let h = 0;
  let quality = 2;
  let lastNow = 0;
  let slow = 0;
  let counted = 0;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    // render a little above screen resolution where it is cheap, for clean edges
    const scale = quality > 1 ? Math.min(2, Math.max(dpr, 1.5)) : Math.min(dpr, 1);
    const cw = Math.max(1, Math.round(canvas.clientWidth * scale));
    const ch = Math.max(1, Math.round(canvas.clientHeight * scale));
    if (cw !== w || ch !== h) {
      w = cw;
      h = ch;
      canvas.width = w;
      canvas.height = h;
    }
  }

  function report(st) {
    if (!onStage) return;
    if (st.stage !== state.lastStage || Math.abs(st.progress - state.lastProgress) > 0.004) {
      state.lastStage = st.stage;
      state.lastProgress = st.progress;
      onStage(st.stage, st.progress, state.playing);
    }
  }

  function draw() {
    const fr = state.frozen;
    const t = fr ? fr.time : state.loopT;
    const st = story(t);
    if (state.looped && !fr) st.fade = Math.min(st.fade, smooth(0, 0.5, t));
    const tb = ((state.clock % PERIOD) + PERIOD) % PERIOD;
    const moving = state.playing && !fr;
    const act = fr ? fr.act : moving ? activation(tb) : 0;
    let wavePos = 2;
    let waveAmp = 0;
    if (moving && tb < SWEEP) {
      const k = tb / SWEEP;
      wavePos = 1.08 - 1.2 * k;
      waveAmp = Math.sin(Math.PI * Math.min(1, k * 1.08)) ** 0.6;
    }
    let yaw = state.yaw;
    let pitch = state.pitch;
    if (!state.dragging && moving) {
      const k = clamp01((performance.now() - state.idleAt) / 1600);
      yaw += k * 0.26 * Math.sin(state.clock * 0.24);
      state.lookX += (state.goalX - state.lookX) * 0.06;
      state.lookY += (state.goalY - state.lookY) * 0.06;
      yaw += k * state.lookX;
      pitch += k * state.lookY;
    }
    const rot = rotYX(yaw, pitch);
    const aspect = w / h;
    const fov = (26 * Math.PI) / 180;
    const dist = Math.max(1.66 / Math.tan(fov / 2), 1.28 / (Math.tan(fov / 2) * aspect));
    const mvp = mul(perspective(fov, aspect, 1, 40), modelView(rot, centre, dist));

    gl.viewport(0, 0, w, h);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);

    // the glow behind the heart, centred on the ventricles
    const vc = head.centre;
    const cx = mvp[0] * vc[0] + mvp[4] * vc[1] + mvp[8] * vc[2] + mvp[12];
    const cy = mvp[1] * vc[0] + mvp[5] * vc[1] + mvp[9] * vc[2] + mvp[13];
    const cw = mvp[3] * vc[0] + mvp[7] * vc[1] + mvp[11] * vc[2] + mvp[15];
    reset();
    gl.useProgram(bg.p);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(bg.attr.a_xy);
    gl.vertexAttribPointer(bg.attr.a_xy, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(bg.uni.u_c, cx / cw, cy / cw + 0.12);
    gl.uniform2f(bg.uni.u_aspect, Math.min(1, aspect), Math.min(1, 1 / aspect));
    gl.uniform3fv(bg.uni.u_film, FILM);
    const warm = 0.035 + 0.02 * st.heal;
    gl.uniform3f(bg.uni.u_tint, warm * 1.05 - 0.01 * st.gel, warm * 0.98 + 0.012 * st.gel, warm * 0.92 + 0.012 * st.gel);
    gl.uniform1f(bg.uni.u_fade, st.fade);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disableVertexAttribArray(bg.attr.a_xy);

    // the heart
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.CULL_FACE);
    gl.useProgram(prog.p);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    point(prog, "a_pos", 3, 0);
    point(prog, "a_off", 3, 3);
    point(prog, "a_nrm", 3, 6);
    point(prog, "a_tan", 4, 9);
    point(prog, "a_a", 4, 13);
    point(prog, "a_b", 4, 17);
    point(prog, "a_d", 1, 21);
    gl.uniformMatrix4fv(prog.uni.u_mvp, false, mvp);
    gl.uniformMatrix3fv(prog.uni.u_rot, false, rot);
    gl.uniform1f(prog.uni.u_act, act);
    gl.uniform3fv(prog.uni.u_axis, head.axis);
    gl.uniform3fv(prog.uni.u_centre, head.centre);
    gl.uniform1f(prog.uni.u_baseH, head.baseH);
    gl.uniform2f(prog.uni.u_wave, wavePos, waveAmp);
    gl.uniform3fv(prog.uni.u_dep, depFlat);
    gl.uniform1fv(prog.uni.u_depS, st.depS);
    gl.uniform1fv(prog.uni.u_depR, st.depR);
    gl.uniform1f(prog.uni.u_heal, st.heal);
    gl.uniform3fv(prog.uni.u_film, FILM);
    gl.uniform1f(prog.uni.u_fade, st.fade);
    gl.drawElements(gl.TRIANGLES, ib.length, big ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
    reset();
    if (!fr) report(st);
  }

  function frame(now) {
    raf = 0;
    const dt = lastNow ? Math.min(0.1, (now - lastNow) / 1000) : 0;
    // if frames come slowly, trade resolution for smoothness
    if (lastNow && quality > 1 && dt > 0 && dt < 0.1) {
      counted++;
      if (dt > 0.042) slow++;
      if (counted >= 30) {
        if (slow > 18) {
          quality = 1;
          resize();
        }
        counted = 0;
        slow = 0;
      }
    }
    lastNow = now;
    if (state.playing && !state.frozen) {
      state.clock += dt;
      state.loopT += dt;
      if (state.loopT >= LOOP) {
        state.loopT -= LOOP;
        state.looped = true;
      }
    }
    draw();
    if (visible && !document.hidden && !state.frozen && (state.playing || state.dragging)) raf = requestAnimationFrame(frame);
    else lastNow = 0;
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
    if (!state.playing) draw();
    kick();
  });
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
    draw();
    kick();
  });
  ro.observe(canvas);
  document.addEventListener("visibilitychange", kick);
  canvas.addEventListener("webglcontextlost", (e) => e.preventDefault());
  resize();
  draw();
  kick();

  const controller = {
    get playing() {
      return state.playing;
    },
    play() {
      state.playing = true;
      state.lastProgress = -1;
      kick();
    },
    pause() {
      state.playing = false;
      state.lastProgress = -1;
      draw();
    },
    // jump to a stage; when paused, show that stage's representative moment
    setStage(i) {
      state.looped = false;
      state.loopT = state.playing ? STAGE_STARTS[i] : STAGE_STILLS[i];
      state.lastStage = -1;
      draw();
      kick();
    },
    // for still images: hold one frame at a chosen angle, contraction (0..1) and loop time
    snapshot({ yaw = -0.24, pitch = 0.12, act = 0, time = STAGE_STILLS[1] } = {}) {
      state.yaw = yaw;
      state.pitch = pitch;
      state.frozen = { act, time };
      resize();
      draw();
    },
    destroy() {
      io.disconnect();
      ro.disconnect();
      cancelAnimationFrame(raf);
    },
  };
  reduce.addEventListener?.("change", () => {
    if (reduce.matches) controller.pause();
  });
  return controller;
}
