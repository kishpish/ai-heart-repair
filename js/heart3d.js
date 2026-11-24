// The 3D heart in the hero: a dark, softly lit surface wound with long fibre lines and
// crossed by the coronary arteries, drawn with plain WebGL (geometry from
// tools/build_heart.py). It tells a three-part story on a loop:
//
//   1. Scarred: a sunken patch of scar, matted with crimped crimson collagen, sits
//      downstream of a blocked (dashed) artery. It does not contract and bulges a little
//      as the rest of the wall squeezes. Ochre border-zone fibres surround it.
//   2. Hydrogel: nine gel depots are injected into the border zone one by one; each sends
//      out a ripple and the gel spreads along the fibres around it.
//   3. Restored: a healing front sweeps in from the edge of the border zone. Behind it the
//      healthy fibres knit back in and the wall rises and contracts again; ahead of it the
//      scar strands flare and dissolve; the depots shrink as the gel degrades. This stage is
//      the long-term goal the work points toward, not a result of the paper.
//
// Taken from the paper: healthy fibres wind at -60 degrees, scar collagen runs
// circumferentially and the border zone at half the healthy angle (Section 2.7); scar
// develops no active tension and the border zone 0.67 of remote (Section 2.11); depots
// sit in the border zone, clear of the scar (Fig. 4); the beat follows the raised-cosine
// activation of Eq. (45), slowed for display.
//
// createHeart(canvas, { src, onStage }) resolves to a controller, or rejects if WebGL or
// the geometry is unavailable, so the caller can fall back to the 2D drawing.

const PERIOD = 1.7; // seconds per beat on screen (matches js/ventricle.js)
const SWEEP = 0.34; // seconds the band of light takes to travel from apex to base

// The story, in seconds of the loop
const T_INJECT = 3.6; // depots start to go in
const T_HEAL = 6.6; // healing starts
const T_RESTORED = 10.6; // fully restored
const T_FADE = 13.4; // fade to dark before the loop restarts
const LOOP = 13.9;
export const STAGE_STARTS = [0, T_INJECT, T_HEAL];
const STAGE_ENDS = [T_INJECT, T_HEAL, LOOP];
// representative moments for still frames (reduced motion, share image)
export const STAGE_STILLS = [1.2, 6.4, 11.8];

const FILM = [13 / 255, 12 / 255, 11 / 255];
const N_DEP = 9;
const R_SCAR = (0.265 / 0.38).toFixed(4); // scar radius over the outer border-zone radius

// Shared by both vertex shaders: the beat, the healing front and the gel
const COMMON = `
uniform float u_act;
uniform vec3 u_axis;
uniform vec3 u_centre;
uniform float u_baseH;
uniform float u_heal;     // 0..1
uniform float u_gelOn;    // 1 while any gel is present
uniform vec3 u_dep[${N_DEP}];
uniform float u_depS[${N_DEP}];   // depot size, 0..1
uniform float u_depR[${N_DEP}];   // ripple progress after injection, 0..1
const float R_SCAR = ${R_SCAR};

// 0 at the base of the ventricles, 1 at the apex
float along(vec3 p) {
  return clamp((u_baseH - dot(p - u_centre, u_axis)) / 1.55, 0.0, 1.0);
}
// The healing front, in units of the outer border-zone radius: it starts just outside the
// border zone and ends past the scar centre.
float front() { return 1.02 - u_heal * 1.14; }
float healedAt(float rn) { float f = front(); return smoothstep(f - 0.045, f + 0.045, rn); }
float scarAt(float rn) { return 1.0 - smoothstep(R_SCAR - 0.02, R_SCAR + 0.02, rn); }
float bzAt(float rn) { return max(1.0 - smoothstep(0.90, 1.04, rn) - scarAt(rn), 0.0); }

// Systole: the wall moves toward the long axis, the base descends toward the apex and the
// apex twists. w = how much this point belongs to the ventricles, c = contractility
// (scar 0, border zone 0.67, remote 1). Tissue that cannot contract is pushed outward.
vec3 deform(vec3 p, float w, float c) {
  float k = u_act * w;
  vec3 q = p - u_centre;
  float h = dot(q, u_axis);
  vec3 r = q - h * u_axis;
  float t = clamp((u_baseH - h) / 1.55, 0.0, 1.0);
  r *= 1.0 - 0.115 * k * c + 0.045 * k * (1.0 - c);
  float a = 0.16 * k * t;
  r = r * cos(a) + cross(u_axis, r) * sin(a);
  h -= 0.085 * k * (1.0 - 0.75 * t);
  return u_centre + h * u_axis + r;
}

// gel near the depots, and the ripple each one sends out as it goes in
vec2 gelAt(vec3 p) {
  float gel = 0.0;
  float ring = 0.0;
  if (u_gelOn > 0.5) {
    for (int i = 0; i < ${N_DEP}; i++) {
      float d = distance(p, u_dep[i]);
      gel += u_depS[i] * exp(-d * d / 0.0075);
      float rp = u_depR[i];
      float x = (d - 0.03 - rp * 0.20) / 0.022;
      ring += step(0.001, rp) * step(rp, 0.999) * exp(-x * x) * (1.0 - rp) * (1.0 - rp);
    }
  }
  return vec2(min(gel, 1.0), min(ring, 1.0));
}
`;

const MESH_VS = `
attribute vec3 a_pos;
attribute vec3 a_nrm;
attribute vec3 a_off;
attribute vec4 a_attr;   // w, c, fade, paint (1 = gel depot)
attribute vec3 a_tint;   // distance from scar centre (/2), occlusion, depot index
uniform mat4 u_mvp;
uniform mat3 u_rot;
uniform vec2 u_wave;     // position of the band of light along the axis, strength
varying vec3 v_n;
varying vec3 v_p;
varying vec4 v_attr;     // w, c, fade, paint
varying vec4 v_s;        // distance from scar centre, occlusion, gel, ripple
varying float v_glow;
${COMMON}
void main() {
  float w = a_attr.x;
  float rn = a_tint.x * 2.0;
  float healed = healedAt(rn);
  float c = mix(a_attr.y, 1.0, healed);
  vec3 off = a_off;
  vec2 g = vec2(0.0);
  if (a_attr.w > 0.5) {
    float s = 0.0;
    for (int i = 0; i < ${N_DEP}; i++) {
      if (abs(a_tint.z - float(i)) < 0.5) s = u_depS[i];
    }
    off *= s;
  } else {
    g = gelAt(a_pos) * w;
  }
  // the scar is thinned wall: it sits below the surface until it heals
  float sunk = a_attr.w > 0.5 ? 0.0 : (0.022 * scarAt(rn) + 0.006 * bzAt(rn)) * (1.0 - healed) * w;
  vec3 p = deform(a_pos - a_nrm * sunk, w, c) + off;
  v_n = u_rot * a_nrm;
  v_p = a_pos;
  v_attr = vec4(w, c, a_attr.z, a_attr.w);
  v_s = vec4(rn, a_tint.y, g);
  float d = (along(a_pos) - u_wave.x) / 0.16;
  v_glow = exp(-d * d) * u_wave.y * w * c;
  gl_Position = u_mvp * vec4(p, 1.0);
}
`;

const MESH_FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec3 v_n;
varying vec3 v_p;
varying vec4 v_attr;
varying vec4 v_s;
varying float v_glow;
uniform vec3 u_film;
uniform float u_heal;
uniform float u_fade;
const float R_SCAR = ${R_SCAR};

// smooth, low-frequency variation for the scar (no grain)
float mottle(vec3 p) {
  return 0.5 + 0.25 * sin(dot(p, vec3(21.0, 13.0, 17.0)) + 1.7) * sin(dot(p, vec3(-11.0, 23.0, 9.0)))
             + 0.25 * sin(dot(p, vec3(7.0, -15.0, 25.0)) + 0.4);
}

void main() {
  vec3 n = normalize(v_n);
  vec3 l = normalize(vec3(-0.45, 0.62, 0.64));
  float diff = max(dot(n, l), 0.0);
  float rim = pow(1.0 - max(n.z, 0.0), 2.4);
  float spec = pow(max(dot(reflect(-l, n), vec3(0.0, 0.0, 1.0)), 0.0), 22.0);
  vec3 teal = vec3(0.27, 0.77, 0.74);
  vec3 col;
  float alpha = 1.0;
  if (v_attr.w > 0.5) {
    // gel depot: a glossy bead of teal with a bright edge
    col = teal * (0.30 + 0.74 * diff) + vec3(0.62) * spec + vec3(0.42, 0.95, 0.90) * 0.40 * rim;
  } else {
    float rn = v_s.x;
    float ao = mix(0.30, 1.0, v_s.y);
    // the tissue, per pixel so the edges stay crisp
    float f = 1.02 - u_heal * 1.14;
    float healed = smoothstep(f - 0.03, f + 0.03, rn);
    float scar = (1.0 - smoothstep(R_SCAR - 0.012, R_SCAR + 0.012, rn)) * v_attr.x * (1.0 - healed);
    float bz = max(1.0 - smoothstep(0.90, 1.04, rn) - (1.0 - smoothstep(R_SCAR - 0.012, R_SCAR + 0.012, rn)), 0.0) * v_attr.x * (1.0 - healed);

    vec3 body = mix(vec3(0.042, 0.039, 0.036), vec3(0.158, 0.146, 0.134), diff) * ao;
    body += vec3(0.135, 0.126, 0.116) * rim * mix(0.55, 1.0, v_s.y);
    body += vec3(0.060) * spec * ao;
    // scar: a deep, slightly mottled crimson that gets darker toward its centre
    float m = mottle(v_p);
    float core = smoothstep(R_SCAR, 0.0, rn);
    vec3 scarc = mix(vec3(0.44, 0.07, 0.16), vec3(0.22, 0.03, 0.08), core * 0.7) * mix(0.82, 1.12, m) * (0.40 + 0.70 * diff);
    vec3 bzc = mix(vec3(0.40, 0.21, 0.06), vec3(0.20, 0.12, 0.05), smoothstep(R_SCAR, 1.04, rn)) * (0.40 + 0.70 * diff);
    body = mix(body, bzc, bz * 0.7);
    body = mix(body, scarc, scar * 0.92);
    // a fine bright edge where scar meets border zone
    float edge = (rn - R_SCAR) / 0.013;
    body += vec3(0.95, 0.30, 0.45) * exp(-edge * edge) * 0.55 * v_attr.x * (1.0 - healed);
    // the beat's band of light, the gel and its ripple, and the healing front
    body += vec3(0.080, 0.074, 0.066) * v_glow;
    body += teal * (v_s.z * 0.16 + v_s.w * 0.55);
    float fx = (rn - f) / 0.035;
    body += vec3(0.62, 0.98, 0.88) * exp(-fx * fx) * sin(3.14159 * clamp(u_heal, 0.0, 1.0)) * 0.55 * v_attr.x * step(rn, 1.25);
    col = mix(u_film, body, v_attr.z);
    // healthy ventricular wall lets a little of the far wall show through; the infarct,
    // atria and vessels do not
    alpha = 1.0 - 0.15 * v_attr.x * (1.0 - clamp(scar + bz, 0.0, 1.0));
  }
  col = mix(u_film, col, u_fade);
  gl_FragColor = vec4(col, alpha);
}
`;

const LINE_VS = `
attribute vec3 a_p;
attribute vec4 a_ts;     // tangent, side
attribute vec3 a_nrm;
attribute vec4 a_a0;     // w, c, fade, distance from scar centre (/2)
attribute vec4 a_a1;     // occlusion, width, position along the line, spare
attribute vec2 a_cr;     // class, random
uniform mat4 u_mvp;
uniform mat3 u_rot;
uniform vec2 u_view;     // viewport in device px
uniform float u_width;   // half-width of a fibre line in device px
uniform vec2 u_wave;
uniform float u_fade;
uniform float u_pass;    // 0 lines, 1 dark underlay for arteries, 2 far-side fibres seen through the wall, 3 soft light around the band
varying float v_side;
varying vec3 v_col;
varying float v_alpha;
varying float v_dash;
${COMMON}
void main() {
  float w = a_a0.x;
  float cls = a_cr.x;
  float rnd = a_cr.y / 255.0;
  float rn = a_a0.w * 2.0;
  bool healthy = cls < 0.5;
  bool infarct = cls > 4.5;
  bool artery = cls > 2.5 && cls < 4.5;
  float healed = healedAt(rn);
  float c = mix(a_a0.y, 1.0, healed);
  // healthy fibres show only where the wall has healed (all of it, outside the infarct);
  // infarct strands only where it has not
  float vis = healthy ? healed : infarct ? 1.0 - healed : 1.0;
  float f = front();
  float fx = (rn - f) / 0.05;
  float frontGlow = (healthy || infarct) ? exp(-fx * fx) * sin(3.14159 * clamp(u_heal, 0.0, 1.0)) : 0.0;
  float scar = infarct ? scarAt(rn) : 0.0;

  float sunk = (healthy || infarct) ? (0.022 * scarAt(rn) + 0.006 * bzAt(rn)) * (1.0 - healed) * w : 0.0;
  vec3 base = a_p - a_nrm * sunk;
  vec4 a = u_mvp * vec4(deform(base, w, c), 1.0);
  vec4 b = u_mvp * vec4(deform(base + a_ts.xyz * 0.03, w, c), 1.0);
  vec2 d = normalize((b.xy / b.w - a.xy / a.w) * u_view + vec2(1e-5));
  vec2 side = vec2(-d.y, d.x) * a_ts.w;

  float d0 = (along(a_p) - u_wave.x) / 0.15;
  float glow = healthy ? exp(-d0 * d0) * u_wave.y * w * c : 0.0;
  vec2 g = (healthy || infarct) ? gelAt(a_p) : vec2(0.0);

  float px = u_width * a_a1.y * (artery ? 2.1 : infarct ? mix(1.0, 0.85, scar) : 1.0) * (1.0 + 0.6 * glow + 0.7 * frontGlow);
  if (u_pass > 0.5 && u_pass < 1.5) px = px * 2.2 + u_width * 1.2;
  if (u_pass > 2.5) px = px * 4.0;
  a.xy += side * px / u_view * 2.0 * a.w;
  a.z -= (artery ? (u_pass > 0.5 ? 0.00062 : 0.00074) : 0.00048) * a.w;
  gl_Position = a;

  vec3 n = normalize(u_rot * a_nrm);
  float diff = max(dot(n, normalize(vec3(-0.45, 0.62, 0.64))), 0.0);
  float facing = (healthy || infarct) ? smoothstep(-0.05, 0.30, n.z) : smoothstep(0.04, 0.42, n.z);
  float light = (0.32 + 0.68 * diff) * mix(0.42, 1.0, a_a1.x);

  vec3 col;
  float alpha;
  v_dash = 0.0;
  if (healthy) {
    col = vec3(0.84, 0.83, 0.81);
    alpha = 1.0;
    col = mix(col, vec3(1.0, 0.975, 0.93), 0.62 * glow);
  } else if (infarct) {
    // scar collagen in crimson, border-zone fibres in ochre
    vec3 scarc = mix(vec3(0.98, 0.42, 0.56), vec3(0.86, 0.24, 0.38), rnd);
    col = mix(vec3(0.97, 0.65, 0.30), scarc, scar);
    alpha = 1.0;
  } else if (cls < 2.5) {
    col = vec3(0.66, 0.64, 0.61);
    alpha = 1.0;
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
  // gel spreading along the fibres, the ripple, the healing front
  col = mix(col, vec3(0.45, 0.92, 0.88), clamp(g.x * 0.75 + g.y, 0.0, 1.0));
  alpha *= 1.0 + 0.5 * g.x + 0.8 * g.y;
  col = mix(col, vec3(0.80, 1.0, 0.94), clamp(frontGlow, 0.0, 1.0) * 0.85);
  alpha *= 1.0 + 1.2 * frontGlow;
  // lines stay at full strength except where they turn away or fall into deep shadow
  alpha *= vis * a_a0.z * min(1.0, facing * light * 25.0);

  if (u_pass > 2.5) {
    col = vec3(1.0, 0.94, 0.84);
    alpha = 0.05 * glow * facing * a_a0.z * vis;
    v_dash = 0.0;
  } else if (u_pass > 1.5) {
    // the far wall, faintly, as if the muscle were glass
    float back = smoothstep(0.05, -0.35, n.z);
    alpha = healthy ? min(1.0, back * 40.0) * a_a0.z * vis : 0.0;
  } else if (u_pass > 0.5) {
    col = vec3(0.035, 0.032, 0.030);
    alpha = artery ? 0.82 * a_a0.z * facing : 0.0;
    v_dash = 0.0;
  }
  v_side = a_ts.w;
  v_col = col;
  v_alpha = alpha * u_fade;
  // dashes along a blocked artery
  v_dash = v_dash > 0.5 ? a_a1.z * 8.0 : -1.0;
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
    const t1 = T_HEAL + 1.4 + i * 0.16;
    const shrink = 1 - smooth(t1, t1 + 1.8, t);
    depS[i] = (grow > 0 ? easeOutBack(grow) : 0) * shrink;
    depR[i] = t < t0 ? 0 : clamp01((t - t0) / 1.1);
  }
  const heal = smooth(T_HEAL + 0.25, T_RESTORED, t);
  const gelOn = t > T_INJECT && t < T_RESTORED + 0.5 ? 1 : 0;
  const stage = t < T_INJECT ? 0 : t < T_HEAL ? 1 : 2;
  const progress = clamp01((t - STAGE_STARTS[stage]) / (STAGE_ENDS[stage] - STAGE_STARTS[stage]));
  const fade = 1 - smooth(T_FADE, LOOP, t);
  return { depS, depR, heal, gelOn, stage, progress, fade };
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
  if (!gl.getExtension("OES_element_index_uint")) throw new Error("32-bit indices are not available");
  const res = await fetch(src);
  if (!res.ok) throw new Error(`heart geometry: ${res.status}`);
  const { head, arrays: A } = parse(await res.arrayBuffer());
  const lo = head.lo;
  const span = head.hi.map((v, i) => v - lo[i]);
  const dq = (arr, i) => [lo[0] + (arr[i * 3] / 65535) * span[0], lo[1] + (arr[i * 3 + 1] / 65535) * span[1], lo[2] + (arr[i * 3 + 2] / 65535) * span[2]];

  // ---- body mesh plus one small sphere per gel depot, in a single buffer ----
  const nBody = A.meshPos.length / 3;
  const nSv = A.sphereVert.length / 3;
  const nMeshV = nBody + N_DEP * nSv;
  const STRIDE = 3 + 3 + 3 + 4 + 3;
  const mv = new Float32Array(nMeshV * STRIDE);
  for (let i = 0; i < nBody; i++) {
    const p = dq(A.meshPos, i);
    const o = i * STRIDE;
    mv[o] = p[0]; mv[o + 1] = p[1]; mv[o + 2] = p[2];
    mv[o + 3] = A.meshNrm[i * 3] / 32767; mv[o + 4] = A.meshNrm[i * 3 + 1] / 32767; mv[o + 5] = A.meshNrm[i * 3 + 2] / 32767;
    mv[o + 9] = A.meshAttr[i * 6] / 255; mv[o + 10] = A.meshAttr[i * 6 + 1] / 255; mv[o + 11] = A.meshAttr[i * 6 + 2] / 255; mv[o + 12] = 0;
    mv[o + 13] = A.meshAttr[i * 6 + 3] / 255; mv[o + 14] = A.meshAttr[i * 6 + 4] / 255; mv[o + 15] = -1;
  }
  const depots = [];
  for (let d = 0; d < N_DEP; d++) {
    const c = dq(A.depotCentre, d);
    depots.push(c);
    for (let j = 0; j < nSv; j++) {
      const o = (nBody + d * nSv + j) * STRIDE;
      const sx = A.sphereVert[j * 3], sy = A.sphereVert[j * 3 + 1], sz = A.sphereVert[j * 3 + 2];
      mv[o] = c[0]; mv[o + 1] = c[1]; mv[o + 2] = c[2];
      mv[o + 3] = sx; mv[o + 4] = sy; mv[o + 5] = sz;
      mv[o + 6] = sx * head.depotRadius; mv[o + 7] = sy * head.depotRadius; mv[o + 8] = sz * head.depotRadius;
      mv[o + 9] = A.depotAttr[d * 2] / 255; mv[o + 10] = A.depotAttr[d * 2 + 1] / 255; mv[o + 11] = 1; mv[o + 12] = 1;
      mv[o + 13] = 0.85 / 2; mv[o + 14] = 1; mv[o + 15] = d;
    }
  }
  const nBodyIdx = A.meshIdx.length;
  const nSphIdx = A.sphereIdx.length;
  const idx = new Uint32Array(nBodyIdx + N_DEP * nSphIdx);
  idx.set(A.meshIdx);
  for (let d = 0; d < N_DEP; d++) for (let j = 0; j < nSphIdx; j++) idx[nBodyIdx + d * nSphIdx + j] = nBody + d * nSv + A.sphereIdx[j];
  const depFlat = new Float32Array(depots.flat());

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
      const o = (i * 2 + s) * LS;
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
  const per = (K - 1) * 6;
  const fibreCount = head.fibreLines * per;
  const infarctCount = head.infarctLines * per;
  const arteryCount = head.coronaryLines * per;

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
  // Quality steps down on slow devices: 2 = everything, 1 = one device pixel per CSS pixel,
  // 0 = also without the see-through far wall and the soft light.
  let quality = 2;
  let lastNow = 0;
  let slow = 0;
  let counted = 0;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const scale = quality > 1 ? Math.min(dpr, 2) : 1;
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
      // a slow sway that keeps the infarct in view; it eases back in after a drag
      const k = clamp01((performance.now() - state.idleAt) / 1600);
      yaw += k * 0.28 * Math.sin(state.clock * 0.24);
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
      gl.uniform1f(prog.uni.u_heal, st.heal);
      gl.uniform1f(prog.uni.u_gelOn, st.gelOn);
      gl.uniform3fv(prog.uni.u_dep, depFlat);
      gl.uniform1fv(prog.uni.u_depS, st.depS);
      gl.uniform1fv(prog.uni.u_depR, st.depR);
      gl.uniform1f(prog.uni.u_fade, st.fade);
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
    //    healthy fibres and the infarct strands
    gl.uniform1f(lineProg.uni.u_pass, 0);
    gl.drawElements(gl.TRIANGLES, fibreCount + infarctCount, gl.UNSIGNED_INT, 0);
    //    arteries, each over a dark underlay so it reads against the fibres
    const artOff = (fibreCount + infarctCount) * 4;
    gl.uniform1f(lineProg.uni.u_pass, 1);
    gl.drawElements(gl.TRIANGLES, arteryCount, gl.UNSIGNED_INT, artOff);
    gl.uniform1f(lineProg.uni.u_pass, 0);
    gl.drawElements(gl.TRIANGLES, arteryCount, gl.UNSIGNED_INT, artOff);
    gl.depthMask(true);
    reset();
    if (!fr) report(st);
  }

  function frame(now) {
    raf = 0;
    const dt = lastNow ? Math.min(0.1, (now - lastNow) / 1000) : 0;
    // if frames come slowly, trade resolution and then detail for smoothness
    if (lastNow && quality > 0 && dt > 0 && dt < 0.1) {
      counted++;
      if (dt > 0.042) slow++;
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
