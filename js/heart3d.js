// The 3D heart in the hero, drawn with plain WebGL from the geometry that
// tools/build_heart.py writes. The heart is a solid, lit surface; its muscle fibres
// are drawn per pixel as fine, rounded strands that follow the fibre field, so they
// stay crisp at any size. It tells a three-part story on a loop:
//
// It is an illustration, not patient data.
//
//   1. Scar: each loop opens on a healthy wall, and the infarct spreads out below a
//      blocked branch of an artery. The scar is a sunken patch of crimped crimson collagen
//      strands that run around the heart; it does not contract and bulges a little as the
//      rest of the wall squeezes. Around it, the border-zone fibres turn ochre.
//   2. Gel: a fine needle on a catheter line injects nine depots of gel into the border
//      zone, one by one. Each depot shows through the wall as a soft ellipse.
//   3. Goal: a healing front closes in on the scar. New fibres grow in strand by strand
//      ahead of it, the wall rises and contracts again, and the gel fades as it degrades.
//      The healed heart is also the frame the loop opens on, so the loop never cuts. This
//      stage is the long-term goal the work points toward, not a result of the paper.
//
// Taken from the paper: on the outer surface healthy fibres wind at -60 degrees (the
// epicardial helix angle), the border zone at half that angle and scar collagen
// circumferentially (Section 2.7); scar develops no active tension and the border zone
// 0.67 of remote (Section 2.11); scar is thinner than healthy wall, which is why it sits
// lower (Table 2); nine depots sit at mid-wall in the border zone, clear of the scar, each
// an ellipsoid whose long axis lies in the wall (Fig. 4, Section 2.14); the beat follows
// the raised-cosine activation of Eq. (45), slowed for display. The needle, the gel's
// glow, the healing front and the light that runs with each beat are illustrative.
//
// createHeart(canvas, { src, geometry, onStage }) resolves to a controller, or rejects if
// WebGL or the geometry is unavailable, so the caller can fall back to the 2D drawing.
// geometry, if given, is a fetch of src that is already under way.

const PERIOD = 1.7; // seconds per beat on screen (matches js/ventricle.js)
const SWEEP = 0.34; // seconds the band of light takes to travel from apex to base

// The story, in seconds of the loop
const T_SPREAD = 1.1; // the infarct has spread
const T_NEEDLE = 3.4; // the needle comes in
const T_FIRST = 4.0; // the first injection
const N_DEP = 9;
// seconds for each injection: the first slowly, so it reads, then a steady rhythm
const DUR = [1.0, 0.64, 0.56, 0.52, 0.5, 0.5, 0.5, 0.5, 0.52];
const STARTS = DUR.map((_, i) => T_FIRST + DUR.slice(0, i).reduce((a, b) => a + b, 0));
// within one injection, as fractions of its time: glide over, go in, inject, come out
const P_GLIDE = 0.27;
const P_IN = 0.45;
const P_OUT = 0.8;
const gelStart = (i) => STARTS[i] + P_IN * DUR[i];
const T_OUT = STARTS[N_DEP - 1] + DUR[N_DEP - 1]; // the needle leaves
const T_HEAL = 9.9; // healing starts
const T_RESTORED = 13.6; // fully restored
const LOOP = 16.8;
export const STAGE_STARTS = [0, T_NEEDLE, T_HEAL];
const STAGE_ENDS = [T_NEEDLE, T_HEAL, LOOP];
// representative moments for still frames (reduced motion, share image)
export const STAGE_STILLS = [1.6, gelStart(6) + 0.3 * DUR[6], 15.0];

const FILM = [13 / 255, 12 / 255, 11 / 255];
// the front, in units of the outer border-zone radius: outside all the infarct touches, at
// the edge of the border zone, and past the scar centre (everything healed)
const F_IN = 1.43;
const F_EDGE = 1.06;
const F_OUT = -0.17;
const MINT = [0.45, 0.95, 0.82];
const CRIMSON = [0.95, 0.3, 0.42];
const R_SCAR = (0.265 / 0.38).toFixed(4); // scar radius over the outer border-zone radius

// needle, in its own frame: the tip at the origin, the shaft along +z
const NEEDLE_LEN = 0.40;
const NEEDLE_R = 0.0100;
const BEVEL = 0.03;
const HUB_END = NEEDLE_LEN + 0.06;
const DEPTH = 0.034; // how far the tip goes into the wall
const HOVER = 0.075; // how far above the wall the tip waits

const COMMON = `
uniform float u_act;
uniform vec3 u_axis;
uniform vec3 u_centre;
uniform float u_baseH;
uniform float u_front;    // the healing front, in units of the outer border-zone radius
uniform float u_glow;     // 1 while the front is moving
uniform vec3 u_frontCol;  // its colour: crimson as the infarct spreads, mint as it heals
uniform float u_flash;    // a soft flash as the scar closes
uniform vec3 u_scarN;
uniform vec3 u_dep[${N_DEP}];
uniform vec3 u_depA[${N_DEP}];   // long axis over its semi-axis
uniform vec3 u_depB[${N_DEP}];   // short axis over its semi-axis
uniform vec4 u_depS[${N_DEP}];   // size 0..1, ripple 0..1, swelling 0..1, spare
const float R_SCAR = ${R_SCAR};

// 0 at the base of the ventricles, 1 at the apex
float along(vec3 p) {
  return clamp((u_baseH - dot(p - u_centre, u_axis)) / 1.55, 0.0, 1.0);
}
// The healing front starts a little outside the border zone and ends past the scar centre.
float front() { return u_front; }
float healedAt(float rn) { float f = front(); return smoothstep(f - 0.10, f - 0.02, rn); }
float scarAt(float rn) { return 1.0 - smoothstep(R_SCAR - 0.02, R_SCAR + 0.02, rn); }
float bzAt(float rn) { return max(1.0 - smoothstep(0.90, 1.04, rn) - scarAt(rn), 0.0); }
// how far the thinned wall sits below the surface
float sinkAt(float rn) {
  float f = front();
  return (0.024 * (1.0 - smoothstep(R_SCAR - 0.07, R_SCAR + 0.03, rn)) + 0.006 * (1.0 - smoothstep(0.86, 1.06, rn)))
         * (1.0 - smoothstep(f - 0.14, f - 0.02, rn));
}
`;

const HEART_VS = `
attribute vec3 a_pos;
attribute vec3 a_nrm;
attribute vec4 a_a0;     // ventricle weight, contractility, fade, distance from the scar centre (/2)
attribute vec4 a_a1;     // occlusion, atrium weight (or position along an artery), vessel weight, kind
attribute vec2 a_ph;     // fibre phase offset, infarct offset
uniform mat4 u_proj;
uniform mat4 u_mv;
uniform mat3 u_rot;
uniform vec2 u_wave;     // position of the band of light along the axis, strength
varying vec3 v_obj;
varying vec3 v_eye;
varying vec3 v_n;
varying vec4 v_a0;
varying vec4 v_a1;
varying vec2 v_ph;
varying float v_band;
${COMMON}
// Systole: the wall moves toward the long axis, the base descends toward the apex and the
// apex twists. w = how much this point belongs to the ventricles, c = how well it
// contracts (0 in the scar, 1 in healthy wall), m = how far it is carried by the twist and
// the descent. Tissue that cannot contract is pushed outward.
vec3 deform(vec3 p, float w, float c, float m) {
  float k = u_act * w;
  vec3 q = p - u_centre;
  float h = dot(q, u_axis);
  vec3 r = q - h * u_axis;
  float t = clamp((u_baseH - h) / 1.55, 0.0, 1.0);
  r *= 1.0 - 0.115 * k * c + 0.045 * k * (1.0 - c);
  float a = 0.16 * k * t * m;
  r = r * cos(a) + cross(u_axis, r) * sin(a);
  h -= 0.085 * k * (1.0 - 0.75 * t) * m;
  return u_centre + h * u_axis + r;
}
// fresh gel swells the wall a little over each depot
float blebAt(vec3 p) {
  float b = 0.0;
  for (int i = 0; i < ${N_DEP}; i++) {
    if (u_depS[i].z > 0.001) {
      vec3 d = p - u_dep[i];
      float ea = dot(d, u_depA[i]);
      float eb = dot(d, u_depB[i]);
      float s = max(u_depS[i].x, 0.08);
      b += u_depS[i].z * exp(-1.4 * (ea * ea + eb * eb) / (s * s));
    }
  }
  return 0.010 * min(b, 1.2);
}
void main() {
  float w = a_a0.x;
  float rn = a_a0.w * 2.0;
  float healed = healedAt(rn);
  float c = mix(a_a0.y, 1.0, healed);
  // for the motion: no contraction in the scar, rising across the border zone (0.67 on
  // average, as in the paper), full once healed
  float cs = max(smoothstep(0.45, 1.05, rn), healed);
  float wall = a_a1.w * 255.0 < 0.5 ? 1.0 : 0.0;
  vec3 p = a_pos - u_scarN * sinkAt(rn) * w + a_nrm * blebAt(a_pos) * w * wall;
  p = deform(p, w, cs, mix(0.3, 1.0, cs));
  vec4 e = u_mv * vec4(p, 1.0);
  gl_Position = u_proj * e;
  v_eye = e.xyz;
  v_obj = a_pos;
  v_n = u_rot * a_nrm;
  v_a0 = vec4(w, c, a_a0.z, rn);
  v_a1 = a_a1;
  v_ph = a_ph;
  float d = (along(a_pos) - u_wave.x) / 0.15;
  v_band = exp(-d * d) * u_wave.y * w * c;
}
`;

const HEART_FS = `#extension GL_OES_standard_derivatives : enable
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec3 v_obj;
varying vec3 v_eye;
varying vec3 v_n;
varying vec4 v_a0;
varying vec4 v_a1;
varying vec2 v_ph;
varying float v_band;
uniform vec3 u_ex;
uniform vec3 u_ez;
uniform float u_N;
uniform vec3 u_scarC;
uniform vec3 u_scarU;
uniform vec3 u_scarV;
uniform vec3 u_film;
uniform float u_detail;   // 1 = fibres, 0 = smooth (no high precision)
uniform vec4 u_tip;       // needle tip in model space; w = needle shown
uniform vec3 u_back;      // the other end of the needle's shaft
uniform vec3 u_lightM;    // toward the key light, in model space
uniform vec2 u_flow;      // a pulse of blood along the open arteries: position, strength
${COMMON}
const float TAU = 6.2831853;
const vec3 L1 = vec3(-0.4466, 0.6153, 0.6351);
const vec3 L2 = vec3(0.8402, -0.1680, 0.5156);

float hash(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
// a gentle meander, so the strands are not ruler-straight (in fibres)
float meander(vec3 p) {
  return 0.40 * sin(dot(p, vec3(7.1, 5.3, -6.2)) + 0.7) + 0.28 * sin(dot(p, vec3(-3.7, 9.9, 4.4)) + 2.1)
       + 0.16 * sin(dot(p, vec3(12.3, -6.1, 8.8)) + 4.0);
}

// Round fibres along the level lines of s (s counts fibres); a runs along them. fw = fibres
// per pixel: the detail fades out before it can alias. Each strand is a run of fibres of
// different lengths and brightness. Returns: x = how much fibre shows (0 in the gaps),
// y = position across the fibre (-1..1), z = detail left, w = a random number for the strand.
vec4 fibresAt(float s, float fw, float n, float a, float m) {
  // m > 1 keeps every m-th strand only, each m times as wide
  s = (s - 0.5) / m + 0.5;
  fw /= m;
  float k = (1.0 - smoothstep(0.22, 0.55, fw)) * u_detail;
  float id = floor(s);
  float sid = mod(id * m, n);
  float r = hash(sid);
  float hw = 0.40 + 0.06 * r;            // half-width of a fibre, in periods
  float u = (s - id - 0.5) / hw;
  float pu = fw / hw;                    // one pixel, across the fibre
  float cov = 1.0 - smoothstep(1.0 - pu, 1.0 + pu, abs(u));
  float dome = sqrt(max(0.0, 1.0 - u * u));
  // along a strand: a slow swell in brightness, and now and then the end of one fibre
  // and the start of the next
  float aa = a * (0.6 + 0.5 * r) + r * 23.0;
  float cell = floor(aa);
  float fa = aa - cell;
  float ends = step(0.82, hash(sid * 3.7 + cell * 1.31 + 0.2));
  float brk = 1.0 - ends * (1.0 - smoothstep(0.0, 0.09, fa) * smoothstep(1.0, 0.91, fa));
  float b = (0.80 + 0.20 * r) * (0.86 + 0.14 * sin(aa * 2.1 + r * 6.0)) * brk;
  float prof = cov * mix(0.50, 1.0, dome) * b;
  return vec4(mix(0.60, prof, k), clamp(u, -1.0, 1.0) * cov * k, k, mix(0.5, r, k));
}
// Where the wall narrows toward the apex the fibres crowd together; lod > 0 drops strands
// in turn (real fibres end and merge too) so the spacing stays about the same.
vec4 fibres(float s, float fw, float n, float a, float lod) {
  float L = floor(lod);
  float m = exp2(L);
  vec4 f0 = fibresAt(s, fw, n, a, m);
  float t = lod - L;
  if (t < 0.001) return f0;
  return mix(f0, fibresAt(s, fw, n, a, m * 2.0), smoothstep(0.0, 1.0, t));
}

vec3 shade(vec3 alb, vec3 n, vec3 V, float ao, float gloss, float spec, float sheen, vec3 T) {
  float nl = dot(n, L1);
  float d1 = max((nl + 0.25) / 1.25, 0.0);
  float d2 = max(dot(n, L2), 0.0);
  vec3 H = normalize(L1 + V);
  float s1 = pow(max(dot(n, H), 0.0), gloss) * spec;
  // a soft sheen across the fibres, as on silk
  float th = dot(T, H);
  float s2 = pow(sqrt(max(1.0 - th * th, 0.0)), 28.0) * sheen * smoothstep(-0.25, 0.35, nl);
  float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
  vec3 c = alb * (0.11 * ao + 0.96 * d1 * mix(0.55, 1.0, ao) + 0.20 * d2 * ao);
  c += vec3(1.0, 0.965, 0.92) * (s1 + s2) * ao;
  c += vec3(0.50, 0.58, 0.66) * fres * 0.28 * ao;
  return c;
}

void main() {
  vec3 n0 = normalize(v_n);
  vec3 V = normalize(-v_eye);
  float w = v_a0.x;
  float fade = v_a0.z;
  float rn = v_a0.w;
  float ao = v_a1.x;
  float kind = floor(v_a1.w * 255.0 + 0.5);

  // Every screen-space derivative is taken here, outside any branch, where WebGL defines them.
  // Position on screen, for surface gradients of anything drawn on the wall:
  vec3 px = dFdx(v_eye);
  vec3 py = dFdy(v_eye);
  vec3 r1 = cross(py, n0);
  vec3 r2 = cross(n0, px);
  float det = dot(px, r1);
  det = abs(det) < 1e-14 ? 1e-14 : det;
  // the helical fibres on the ventricles: angle around the long axis, plus G(h), plus a meander
  vec3 q = v_obj - u_centre;
  float x = dot(q, u_ex);
  float z = dot(q, u_ez);
  float rr = max(x * x + z * z, 1e-6);
  float tx = (x * dFdx(z) - z * dFdx(x)) / rr;
  float ty = (x * dFdy(z) - z * dFdy(x)) / rr;
  float mea = meander(v_obj);
  float hx = (u_N * tx + dFdx(v_ph.x)) / TAU + dFdx(mea);
  float hy = (u_N * ty + dFdy(v_ph.x)) / TAU + dFdy(mea);
  float ix = hx + dFdx(v_ph.y) / TAU;
  float iy = hy + dFdy(v_ph.y) / TAU;
  // scar collagen: crimped strands that run around the heart
  vec3 qs = v_obj - u_scarC;
  float su = dot(qs, u_scarU);
  float sv = dot(qs, u_scarV);
  float sS = (sv + 0.0030 * sin(su * 88.0 + sv * 31.0) + 0.0013 * sin(su * 197.0 - sv * 64.0 + 1.3)) * 118.0;
  float sx = dFdx(sS);
  float sy = dFdy(sS);
  // the atria: bundles that run around them
  float sA = (v_obj.y + 0.030 * sin(v_obj.x * 5.0 + v_obj.z * 3.0)) * 92.0;
  float ax = dFdx(sA);
  float ay = dFdy(sA);
  // the dip of the thinned scar
  float drx = dFdx(rn);
  float dry = dFdy(rn);

  // the needle's shadow, from the key light
  float shadow = 1.0;
  if (u_tip.w > 0.5) {
    vec3 a = u_tip.xyz;
    vec3 ab = u_back - a;
    vec3 L = u_lightM;
    vec3 w0 = a - v_obj;
    float A = dot(ab, ab);
    float B = dot(ab, L);
    float D = dot(ab, w0);
    float E = dot(L, w0);
    float s = clamp((B * E - D) / max(A - B * B, 1e-7), 0.0, 1.0);
    float t = max(dot(a + s * ab - v_obj, L), 0.0);
    s = clamp(dot(v_obj + t * L - a, ab) / A, 0.0, 1.0);
    float dist = length(a + s * ab - (v_obj + t * L));
    float soft = 0.006 + 0.09 * t;
    shadow = 1.0 - 0.5 * (1.0 - smoothstep(0.008, 0.008 + soft, dist)) * (1.0 - smoothstep(0.25, 0.7, t));
  }

  vec3 col;
  if (kind > 0.5) {
    // a coronary artery: a smooth, glossy tube
    float u = v_a1.y;
    bool blocked = kind > 1.5;
    // past the clot the blocked branch carries no blood: a pale, empty vessel
    vec3 alb = blocked ? vec3(0.50, 0.47, 0.45) : vec3(0.42, 0.13, 0.13);
    if (blocked) alb = mix(vec3(0.20, 0.03, 0.05), alb, smoothstep(0.04, 0.12, u));
    col = shade(alb, n0, V, mix(0.6, 1.0, ao), 60.0, blocked ? 0.25 : 0.60, 0.0, vec3(0.0)) * shadow;
    if (!blocked) {
      float d = (u - u_flow.x) / 0.08;
      col += vec3(0.85, 0.22, 0.24) * exp(-d * d) * u_flow.y * 0.45;
    }
  } else {
    float wA = v_a1.y;
    float wS = v_a1.z;
    float wV = clamp(1.0 - wA - wS, 0.0, 1.0);
    // the thinned wall of the scar sits in a shallow dip: tilt the normal on its slopes
    float slope = (sinkAt(rn + 0.004) - sinkAt(rn - 0.004)) / 0.008 * w;
    vec3 n = normalize(n0 + (r1 * drx + r2 * dry) / det * slope);

    vec3 alb = vec3(0.0);
    vec3 nn = vec3(0.0);
    vec3 T = vec3(0.0);
    vec3 emit = vec3(0.0);
    float gloss = 0.0;
    float spec = 0.0;
    float sheen = 0.0;

    if (wV > 0.003) {
      // ---- the ventricles: helical fibres --------------------------------------------
      float sH = (u_N * atan(z, x) + v_ph.x) / TAU + mea;
      float alongV = dot(q, u_axis) / 0.085;
      // fewer, wider strands where the wall narrows toward the apex, and wherever the
      // strands would be too fine to see on this screen
      float lod = clamp(max(log2(0.34 / sqrt(rr)), log2((abs(hx) + abs(hy)) / 0.26)), 0.0, 3.0);
      vec4 fH = fibres(sH, abs(hx) + abs(hy), u_N, alongV, lod);
      vec3 bH = normalize((r1 * hx + r2 * hy) / det + n * 1e-6);
      // the infarct's own patterns, only near the infarct (elsewhere they equal the healthy one)
      vec4 fI = fH;
      vec3 bI = bH;
      vec4 fS = vec4(0.0);
      vec3 bS = bH;
      if (rn < 1.34) {
        fI = fibres(sH + v_ph.y / TAU, abs(ix) + abs(iy), u_N, alongV, lod);
        bI = normalize((r1 * ix + r2 * iy) / det + n * 1e-6);
        if (rn < R_SCAR + 0.03) {
          fS = fibres(sS, abs(sx) + abs(sy), 4096.0, su / 0.045, 0.0);
          bS = normalize((r1 * sx + r2 * sy) / det + n * 1e-6);
        }
      }

      float scar = (1.0 - smoothstep(R_SCAR - 0.010, R_SCAR + 0.010, rn)) * w;
      float bz = max(1.0 - smoothstep(0.90, 1.04, rn) - (1.0 - smoothstep(R_SCAR - 0.010, R_SCAR + 0.010, rn)), 0.0) * w;
      float f = front();
      float healing = u_glow * (1.0 - smoothstep(1.0, 1.25, rn));
      // each new strand grows in at its own pace; the gaps between strands follow
      float tip = f - 0.11 * fH.w;
      float grown = smoothstep(tip - 0.006, tip + 0.006, rn);
      float bg = smoothstep(f - 0.03, f + 0.07, rn);

      vec3 fib = vec3(0.98, 0.95, 0.90);
      vec3 gap = vec3(0.13, 0.10, 0.094);
      vec3 oFib = vec3(0.94, 0.63, 0.28);
      vec3 oGap = vec3(0.24, 0.135, 0.05);
      vec3 cFib = vec3(0.74, 0.16, 0.26);
      vec3 cGap = vec3(0.17, 0.025, 0.06);
      float core = smoothstep(R_SCAR, 0.0, rn);
      // the wall as it is before healing: fibres turned in the infarct, collagen in the scar
      vec3 inf = mix(mix(gap, oGap, bz), mix(fib, oFib, bz), fI.x);
      vec3 sc = mix(cGap, cFib, fS.x) * (1.0 - 0.32 * core);
      inf = mix(inf, sc, scar);
      // healthy wall: strands show once grown, the gaps between them once the front has passed
      vec3 hw = mix(gap, fib, fH.x);
      float useH = mix(bg, grown, fH.x);
      vec3 vAlb = mix(inf, hw, useH);
      vec3 bInf = scar > 0.5 ? bS : bI;
      float uInf = scar > 0.5 ? fS.y : fI.y;
      vec3 nInf = normalize(n + bInf * uInf * 0.62);
      vec3 nH = normalize(n + bH * fH.y * 0.62);
      vec3 nV = normalize(mix(nInf, nH, useH));
      vec3 tV = normalize(cross(nV, mix(bInf, bH, useH)));
      float fibAmt = mix(scar > 0.5 ? fS.x : fI.x, fH.x, useH);

      // gel: each depot shows through the wall as a soft ellipse with a brighter shell
      if (rn < 1.6) {
        float gel = 0.0;
        float shell = 0.0;
        float ring = 0.0;
        for (int i = 0; i < ${N_DEP}; i++) {
          vec4 S = u_depS[i];
          if (S.x > 0.002 || S.y > 0.0) {
            vec3 d = v_obj - u_dep[i];
            float ea = dot(d, u_depA[i]);
            float eb = dot(d, u_depB[i]);
            float e = sqrt(ea * ea + eb * eb);
            float es = e / max(S.x, 0.002);
            float amt = min(1.0, S.x * 3.0);
            gel = max(gel, (1.0 - smoothstep(0.0, 1.08, es)) * amt);
            float sh = (es - 1.0) / 0.12;
            shell = max(shell, exp(-sh * sh) * amt);
            float rx = (e - 0.7 - S.y * 2.2) / 0.20;
            ring += S.y > 0.0 && S.y < 1.0 ? exp(-rx * rx) * (1.0 - S.y) * (1.0 - S.y) : 0.0;
          }
        }
        ring = min(ring, 1.0);
        vec3 teal = vec3(0.30, 0.82, 0.78);
        vAlb = mix(vAlb, mix(teal * 0.62, mix(vAlb, teal, 0.45), fibAmt), gel * 0.85 * w);
        emit += teal * (gel * 0.30 + shell * 0.10 + ring * 0.40) * w;
      }

      // the beat's band of light runs along the fibres
      emit += vec3(1.0, 0.95, 0.86) * v_band * 0.30 * fibAmt;
      // the front: bright tips on the strands as they grow in (or die back), a soft glow on
      // the front itself, and a flash as the scar closes
      float tg = rn - tip;
      float trail = tg > 0.0 ? exp(-tg / 0.03) : exp(-tg * tg / 0.00006);
      emit += u_frontCol * trail * fH.x * fH.z * healing * (1.0 - bg) * 0.55 * w;
      float fg = (rn - f) / 0.05;
      emit += u_frontCol * exp(-fg * fg) * healing * 0.07 * w;
      emit += u_frontCol * u_flash * exp(-rn * rn / 0.025) * 0.55 * w;
      // a fine bright line where the scar meets the border zone
      float ed = (rn - R_SCAR) / 0.011;
      emit += vec3(0.95, 0.32, 0.46) * exp(-ed * ed) * 0.30 * (1.0 - bg) * w;

      alb += vAlb * wV;
      nn += nV * wV;
      T += tV * wV;
      gloss += 36.0 * wV;
      spec += 0.42 * wV;
      sheen += 0.22 * wV;
    }
    if (wA > 0.003) {
      // ---- the atria: finer bundles that run around them ---------------------------------
      vec4 fA = fibres(sA, abs(ax) + abs(ay), 4096.0, v_obj.x / 0.07, 0.0);
      vec3 bA = normalize((r1 * ax + r2 * ay) / det + n * 1e-6);
      alb += mix(vec3(0.085, 0.078, 0.072), vec3(0.46, 0.43, 0.40), fA.x) * wA;
      vec3 nA = normalize(n + bA * fA.y * 0.5);
      nn += nA * wA;
      T += normalize(cross(nA, bA)) * wA;
      gloss += 24.0 * wA;
      spec += 0.18 * wA;
      sheen += 0.10 * wA;
    }
    if (wS > 0.003) {
      // ---- the great vessels: smooth, satin walls ----------------------------------------
      alb += vec3(0.25, 0.235, 0.22) * wS;
      nn += n * wS;
      T += normalize(cross(n, vec3(0.0, 0.0, 1.0)) + 1e-6) * wS;
      gloss += 40.0 * wS;
      spec += 0.22 * wS;
    }
    nn = normalize(nn);
    col = shade(alb, nn, V, mix(0.35, 1.0, ao), gloss, spec, sheen, normalize(T + 1e-6)) * shadow + emit;
  }
  col = mix(u_film, col, fade);
  gl_FragColor = vec4(col, 1.0);
}
`;

// The needle (steel shaft and a clear hub) and the catheter line it hangs from
const NEEDLE_VS = `
attribute vec3 a_p;
attribute vec3 a_n;
attribute float a_m;      // 0 steel, 1 hub
uniform mat4 u_proj;
uniform mat4 u_mv;
uniform mat3 u_rot;
uniform mat4 u_model;     // needle frame to model space
varying vec3 v_eye;
varying vec3 v_n;
varying float v_m;
void main() {
  vec4 p = u_model * vec4(a_p, 1.0);
  vec4 e = u_mv * p;
  gl_Position = u_proj * e;
  v_eye = e.xyz;
  v_n = u_rot * (mat3(u_model[0].xyz, u_model[1].xyz, u_model[2].xyz) * a_n);
  v_m = a_m;
}
`;

const LINE_VS = `
attribute vec2 a_uv;      // position along the line 0..1, angle around it
uniform mat4 u_proj;
uniform mat4 u_mv;
uniform mat3 u_rot;
uniform vec3 u_b0;
uniform vec3 u_b1;
uniform vec3 u_b2;
uniform vec3 u_b3;
uniform float u_r;
varying vec3 v_eye;
varying vec3 v_n;
varying float v_u;
vec3 bez(float t) {
  float s = 1.0 - t;
  return s * s * s * u_b0 + 3.0 * s * s * t * u_b1 + 3.0 * s * t * t * u_b2 + t * t * t * u_b3;
}
void main() {
  float t = a_uv.x;
  vec3 p = bez(t);
  vec3 tg = normalize(bez(min(t + 0.01, 1.0)) - bez(max(t - 0.01, 0.0)));
  vec3 ref = abs(tg.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 sd = normalize(cross(tg, ref));
  vec3 up = cross(sd, tg);
  vec3 d = cos(a_uv.y) * up + sin(a_uv.y) * sd;
  vec4 e = u_mv * vec4(p + d * u_r, 1.0);
  gl_Position = u_proj * e;
  v_eye = e.xyz;
  v_n = u_rot * d;
  v_u = t;
}
`;

const NEEDLE_FS = `
precision mediump float;
varying vec3 v_eye;
varying vec3 v_n;
varying float v_m;
uniform float u_alpha;
uniform float u_gel;      // how full of gel the hub looks
const vec3 L1 = vec3(-0.4466, 0.6153, 0.6351);
void main() {
  vec3 n = normalize(v_n);
  vec3 V = normalize(-v_eye);
  if (dot(n, V) < 0.0) n = -n;
  vec3 R = reflect(-V, n);
  float fres = pow(1.0 - max(dot(n, V), 0.0), 2.0);
  vec3 col;
  float alpha = 1.0;
  if (v_m < 0.5) {
    // brushed steel: a soft studio light above, a dark floor, a sharp highlight
    float env = smoothstep(-0.5, 0.7, R.y);
    float box = pow(max(dot(R, normalize(vec3(-0.45, 0.75, 0.48))), 0.0), 6.0);
    float hi = pow(max(dot(R, L1), 0.0), 60.0);
    col = vec3(0.78, 0.80, 0.83) * (0.30 + 0.75 * env) + vec3(1.0) * (0.85 * box + 1.3 * hi);
    col *= 0.75 + 0.25 * (1.0 - fres);
  } else {
    // a clear hub with gel inside
    float hi = pow(max(dot(R, L1), 0.0), 50.0);
    vec3 teal = vec3(0.30, 0.82, 0.78);
    col = mix(vec3(0.55, 0.60, 0.62), teal, u_gel * 0.8) * (0.35 + 0.5 * max(dot(n, L1), 0.0)) + vec3(1.0) * hi * 0.9 + vec3(0.8, 0.9, 0.95) * fres * 0.5;
    alpha = 0.55 + 0.4 * fres;
  }
  gl_FragColor = vec4(col, alpha * u_alpha);
}
`;

const LINE_FS = `
precision mediump float;
varying vec3 v_eye;
varying vec3 v_n;
varying float v_u;
uniform float u_alpha;
uniform vec2 u_pulse;     // gel moving down the line: position (1 at the far end, 0 at the hub), strength
const vec3 L1 = vec3(-0.4466, 0.6153, 0.6351);
void main() {
  vec3 n = normalize(v_n);
  vec3 V = normalize(-v_eye);
  float nv = abs(dot(n, V));
  float fres = pow(1.0 - nv, 2.0);
  vec3 teal = vec3(0.30, 0.82, 0.78);
  float d = (v_u - u_pulse.x) / 0.05;
  float pulse = exp(-d * d) * u_pulse.y;
  vec3 R = reflect(-V, n);
  float hi = pow(max(dot(R, L1), 0.0), 40.0);
  // a clear tube with a core of gel
  vec3 col = mix(teal * (0.42 + 0.9 * pulse), vec3(0.78, 0.84, 0.86), fres) + vec3(1.0) * hi * 0.8;
  float alpha = 0.42 + 0.5 * fres + 0.4 * pulse;
  gl_FragColor = vec4(col, alpha * u_alpha);
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
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutBack = (t) => {
  const c = 1.4;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

// vector helpers
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => scale(a, 1 / Math.max(1e-9, Math.hypot(a[0], a[1], a[2])));
const lerp = (a, b, t) => add(a, scale(sub(b, a), t));

// Everything the story needs at loop time t
function story(t) {
  const depS = new Float32Array(N_DEP * 4);
  for (let i = 0; i < N_DEP; i++) {
    const t0 = gelStart(i); // gel starts to flow
    const grow = clamp01((t - t0) / (0.5 * DUR[i]));
    // each depot degrades during healing, a little after its neighbour
    const t1 = T_HEAL + 0.9 + i * 0.14;
    const shrink = 1 - smooth(t1, t1 + 2.2, t);
    depS[i * 4] = (grow > 0 ? easeOutBack(grow) : 0) * shrink;
    depS[i * 4 + 1] = t < t0 || t > t0 + 1 ? 0 : (t - t0) / 1.0;
    // the wall swells as the gel goes in, then relaxes
    depS[i * 4 + 2] = grow > 0 ? (0.35 + 0.65 * Math.exp(-Math.max(0, t - t0 - 0.34) / 0.6)) * Math.min(1, grow * 1.5) * shrink : 0;
  }
  let front = F_IN;
  let glow = 0;
  let flash = 0;
  let col = MINT;
  if (t < T_SPREAD + 0.2) {
    // each loop opens on the restored wall, and the infarct spreads out from its core
    const k = smooth(0.1, T_SPREAD, t);
    front = F_OUT + (F_IN - F_OUT) * k;
    glow = 0.9 * Math.sin(Math.PI * k);
    col = CRIMSON;
  } else if (t > T_HEAL - 0.5) {
    // the front reaches the edge of the border zone as the needle leaves, then closes in,
    // a little faster toward the end
    if (t < T_HEAL) front = F_IN + (F_EDGE - F_IN) * ((t - T_HEAL + 0.5) / 0.5);
    else {
      const x = clamp01((t - T_HEAL) / (T_RESTORED - T_HEAL));
      front = F_EDGE + (F_OUT - F_EDGE) * x * (0.8 + 0.2 * x);
      flash = Math.exp(-(((front - 0.02) / 0.08) ** 2));
    }
    glow = smooth(T_HEAL - 0.5, T_HEAL, t) * (1 - smooth(T_RESTORED - 0.3, T_RESTORED, t));
  }
  const stage = t < T_NEEDLE ? 0 : t < T_HEAL ? 1 : 2;
  const progress = clamp01((t - STAGE_STARTS[stage]) / (STAGE_ENDS[stage] - STAGE_STARTS[stage]));
  return { depS, front, glow, flash, col, stage, progress };
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

// The needle: a steel shaft with a bevelled tip, and a clear hub. Tip at the origin, shaft along +z.
function needleMesh() {
  const P = [], N = [], M = [], I = [];
  const seg = 20;
  const vert = (p, n, m) => {
    P.push(...p);
    N.push(...n);
    M.push(m);
    return M.length - 1;
  };
  const tube = (z0f, z1, r0, r1, m) => {
    // z0f(angle) gives the front end, so the shaft can end in a bevel
    const base = M.length;
    for (let j = 0; j <= seg; j++) {
      const a = (2 * Math.PI * j) / seg;
      const c = Math.cos(a), s = Math.sin(a);
      const slope = (r0 - r1) / Math.max(1e-6, z1 - z0f(0.0));
      const nr = norm([c, s, slope]);
      vert([c * r0, s * r0, z0f(a)], nr, m);
      vert([c * r1, s * r1, z1], nr, m);
    }
    for (let j = 0; j < seg; j++) {
      const a = base + j * 2;
      I.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  };
  // the bevel: the front of the shaft is cut by a slanted plane, sharp at y = -r
  const bevelZ = (a) => BEVEL * (0.5 + 0.5 * Math.sin(a));
  tube(bevelZ, NEEDLE_LEN, NEEDLE_R, NEEDLE_R, 0);
  // the bevel face
  const bn = norm([0, BEVEL / (2 * NEEDLE_R), -1]);
  const c0 = vert([0, 0, BEVEL * 0.5], bn, 0);
  const rim = [];
  for (let j = 0; j <= seg; j++) {
    const a = (2 * Math.PI * j) / seg;
    rim.push(vert([Math.cos(a) * NEEDLE_R, Math.sin(a) * NEEDLE_R, bevelZ(a)], bn, 0));
  }
  for (let j = 0; j < seg; j++) I.push(c0, rim[j + 1], rim[j]);
  // the hub: a short cone, then a collar
  tube(() => NEEDLE_LEN - 0.004, NEEDLE_LEN + 0.012, NEEDLE_R * 1.15, 0.0135, 1);
  tube(() => NEEDLE_LEN + 0.012, HUB_END - 0.008, 0.0135, 0.0150, 1);
  tube(() => HUB_END - 0.008, HUB_END, 0.0185, 0.0185, 1);
  // close the back of the hub
  const hb = vert([0, 0, HUB_END], [0, 0, 1], 1);
  const ring = [];
  for (let j = 0; j <= seg; j++) {
    const a = (2 * Math.PI * j) / seg;
    ring.push(vert([Math.cos(a) * 0.0185, Math.sin(a) * 0.0185, HUB_END], [0, 0, 1], 1));
  }
  for (let j = 0; j < seg; j++) I.push(hb, ring[j], ring[j + 1]);
  return { P: new Float32Array(P), N: new Float32Array(N), M: new Float32Array(M), I: new Uint16Array(I) };
}

// let input through between the longer steps of starting up
const breathe = () => new Promise((r) => setTimeout(r, 0));

export async function createHeart(canvas, { src, geometry, onStage } = {}) {
  const gl = canvas.getContext("webgl", { antialias: true, alpha: false, powerPreference: "default" });
  if (!gl) throw new Error("WebGL is not available");
  if (!gl.getExtension("OES_standard_derivatives")) throw new Error("derivatives are not available");
  const hp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
  const detail = hp && hp.precision > 0 ? 1 : 0;
  const res = await (geometry || fetch(src));
  if (!res.ok) throw new Error(`heart geometry: ${res.status}`);
  let buf = await res.arrayBuffer();
  // shipped gzipped (hosts rarely compress binary files); unpack it unless the server already did
  const magic = new Uint8Array(buf, 0, 2);
  if (magic[0] === 0x1f && magic[1] === 0x8b) {
    buf = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
  }
  const { head, arrays: A } = parse(buf);
  const lo = head.lo;
  const span = head.hi.map((v, i) => v - lo[i]);
  await breathe();

  // ---- the heart and its arteries, one buffer ----
  // 36 bytes per vertex: position (3 floats), normal (3 shorts + pad), 8 bytes of attributes,
  // and two fibre phases: G(h), from the table in the header, and the turn around the infarct
  const nV = A.pos.length / 3;
  const VS = 36;
  const vbuf = new ArrayBuffer(nV * VS);
  const vf = new Float32Array(vbuf);
  const vi16 = new Int16Array(vbuf);
  const vu8 = new Uint8Array(vbuf);
  const g = head.helix;
  const G = (hh) => {
    const x = Math.min(g.g.length - 1.001, Math.max(0, (hh - g.h0) / g.step));
    const i = Math.floor(x);
    return g.g[i] + (g.g[i + 1] - g.g[i]) * (x - i);
  };
  const [ax, ay, az] = head.axis;
  const [cx, cy, cz] = head.centre;
  for (let i = 0; i < nV; i++) {
    const o = i * VS;
    for (let k = 0; k < 3; k++) vf[o / 4 + k] = lo[k] + (A.pos[i * 3 + k] / 65535) * span[k];
    for (let k = 0; k < 3; k++) vi16[o / 2 + 6 + k] = A.nrm[i * 3 + k];
    for (let k = 0; k < 8; k++) vu8[o + 20 + k] = A.attr[i * 8 + k];
    const hh = (vf[o / 4] - cx) * ax + (vf[o / 4 + 1] - cy) * ay + (vf[o / 4 + 2] - cz) * az;
    vf[o / 4 + 7] = A.attr[i * 8 + 7] === 0 ? G(hh) : 0;
    vf[o / 4 + 8] = A.twirl[i] * head.twirlScale;
  }
  const nIdx = A.idx.length;
  await breathe();

  const heartProg = program(gl, HEART_VS, HEART_FS);
  const needleProg = program(gl, NEEDLE_VS, NEEDLE_FS);
  const lineProg = program(gl, LINE_VS, LINE_FS);
  await breathe();
  const heartBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, heartBuf);
  gl.bufferData(gl.ARRAY_BUFFER, vbuf, gl.STATIC_DRAW);
  const heartIdx = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, heartIdx);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, A.idx, gl.STATIC_DRAW);

  const nd = needleMesh();
  const nBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, nBuf);
  const nData = new Float32Array((nd.P.length / 3) * 7);
  for (let i = 0; i < nd.P.length / 3; i++) {
    nData.set([nd.P[i * 3], nd.P[i * 3 + 1], nd.P[i * 3 + 2], nd.N[i * 3], nd.N[i * 3 + 1], nd.N[i * 3 + 2], nd.M[i]], i * 7);
  }
  gl.bufferData(gl.ARRAY_BUFFER, nData, gl.STATIC_DRAW);
  const nIdxBuf = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, nIdxBuf);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, nd.I, gl.STATIC_DRAW);
  // the catheter line: a tube along a curve the vertex shader evaluates
  const LU = 64, LA = 10;
  const lData = new Float32Array((LU + 1) * (LA + 1) * 2);
  for (let i = 0; i <= LU; i++) for (let j = 0; j <= LA; j++) lData.set([i / LU, (2 * Math.PI * j) / LA], (i * (LA + 1) + j) * 2);
  const lIdx = [];
  for (let i = 0; i < LU; i++)
    for (let j = 0; j < LA; j++) {
      const a = i * (LA + 1) + j;
      lIdx.push(a, a + LA + 1, a + 1, a + 1, a + LA + 1, a + LA + 2);
    }
  const lBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, lBuf);
  gl.bufferData(gl.ARRAY_BUFFER, lData, gl.STATIC_DRAW);
  const lIdxBuf = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lIdxBuf);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(lIdx), gl.STATIC_DRAW);

  // ---- depots and the needle's path ----
  const dep = head.depots;
  const depFlat = new Float32Array(dep.entry.flat());
  const depA = new Float32Array(dep.long.flat());
  const depB = new Float32Array(dep.short.flat());
  // the needle comes in from the upper right, in front, tilted 40 degrees from the wall's normal
  const pref = norm([0.38, 0.62, 0.70]);
  const sites = dep.entry.map((e, i) => {
    const n = dep.normal[i];
    const tng = norm(sub(pref, scale(n, dot(pref, n))));
    const back = norm(add(scale(n, Math.cos(0.70)), scale(tng, Math.sin(0.70))));
    // how well the wall there contracts during the treatment (as in the vertex shader)
    const cs = smooth(0.45, 1.05, dep.rn[i]);
    return { entry: e, n, dir: scale(back, -1), cs };
  });

  const used = new Set();
  const point = (prog, name, size, type, normed, stride, offset) => {
    const loc = prog.attr[name];
    if (loc === undefined || loc < 0) return;
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, type, normed, stride, offset);
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
    yaw: -0.24, pitch: 0.12, dragging: false, lastX: 0, lastY: 0, downYaw: 0, downPitch: 0,
    lookX: 0, lookY: 0, goalX: 0, goalY: 0,
    sway: 0, // the slow turn that follows the story
    clock: 0, // seconds of animation shown so far (drives the beat)
    loopT: 0, // position in the story loop
    playing: !reduce.matches,
    frozen: null,
    lastStage: -1,
    lastProgress: -1,
  };
  if (!state.playing) state.loopT = STAGE_STILLS[1];
  let visible = false;
  let raf = 0;
  let w = 0;
  let h = 0;
  // Quality steps down on slow devices: 2 = up to two device pixels per CSS pixel,
  // 1 = one, 0 = three quarters of one.
  let quality = 2;
  let lastNow = 0;
  let slow = 0;
  let counted = 0;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const s = quality > 1 ? Math.min(dpr, 2) : quality > 0 ? 1 : 0.75;
    const cw = Math.max(1, Math.round(canvas.clientWidth * s));
    const ch = Math.max(1, Math.round(canvas.clientHeight * s));
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

  // the same contraction as the vertex shader, for the needle to ride along with the wall
  function deformPoint(p, c, act) {
    const axis = head.axis;
    const m = 0.3 + 0.7 * c;
    const q = sub(p, head.centre);
    let hh = dot(q, axis);
    let r = sub(q, scale(axis, hh));
    const t = clamp01((head.baseH - hh) / 1.55);
    r = scale(r, 1 - 0.115 * act * c + 0.045 * act * (1 - c));
    const a = 0.16 * act * t * m;
    r = add(scale(r, Math.cos(a)), scale(cross(axis, r), Math.sin(a)));
    hh -= 0.085 * act * (1 - 0.75 * t) * m;
    return add(head.centre, add(scale(axis, hh), r));
  }

  // Where the needle is at loop time t: tip, direction into the wall, how far the gel in the
  // line has come, whether it is shown at all.
  function needle(t, act) {
    if (t < T_NEEDLE || t > T_OUT + 0.7) return null;
    const hover = (i) => sub(sites[i].entry, scale(sites[i].dir, HOVER));
    let tip, dir, ride, pulse = [2, 0];
    if (t < T_FIRST) {
      const k = easeInOut(clamp01((t - T_NEEDLE) / (T_FIRST - T_NEEDLE)));
      dir = sites[0].dir;
      tip = lerp(sub(hover(0), scale(dir, 1.3)), hover(0), k);
      ride = 0;
    } else if (t >= T_OUT) {
      const k = clamp01((t - T_OUT) / 0.7);
      dir = sites[N_DEP - 1].dir;
      tip = sub(hover(N_DEP - 1), scale(dir, 1.3 * k * k));
      ride = 0;
    } else {
      let i = N_DEP - 1;
      while (i > 0 && t < STARTS[i]) i--;
      const u = (t - STARTS[i]) / DUR[i];
      const s = sites[i];
      const deep = add(s.entry, scale(s.dir, DEPTH));
      dir = s.dir;
      if (u < P_GLIDE) {
        tip = hover(i);
        if (i > 0) {
          // glide over from the last site, lifting a little on the way
          const k = easeInOut(u / P_GLIDE);
          const prev = sites[i - 1];
          dir = norm(lerp(prev.dir, s.dir, k));
          tip = lerp(hover(i - 1), hover(i), k);
          tip = add(tip, scale(norm(add(prev.n, s.n)), 0.03 * Math.sin(Math.PI * k)));
        }
        ride = 0;
      } else if (u < P_IN) {
        const k = easeInOut((u - P_GLIDE) / (P_IN - P_GLIDE));
        tip = lerp(hover(i), deep, k);
        ride = k;
      } else if (u < P_OUT) {
        tip = deep;
        ride = 1;
      } else {
        const k = easeInOut((u - P_OUT) / (1 - P_OUT));
        tip = lerp(deep, hover(i), k);
        ride = 1 - k;
      }
      // gel runs down the line just before it goes in
      pulse = [1 - clamp01((u - 0.04) / (P_IN - 0.04)), u < P_IN + 0.1 ? 1 : 0];
      // ride along with the beating wall
      const d = sub(deformPoint(s.entry, s.cs, act), s.entry);
      tip = add(tip, scale(d, 0.35 + 0.65 * ride));
    }
    return { tip, dir, pulse };
  }

  function draw() {
    const fr = state.frozen;
    const t = fr ? fr.time : state.loopT;
    const st = story(t);
    const tb = ((state.clock % PERIOD) + PERIOD) % PERIOD;
    // a pause holds the frame as it is: the beat, its light and the turn stop with the clock
    const act = fr ? fr.act : activation(tb);
    let wavePos = 2;
    let waveAmp = 0;
    if (!fr && tb < SWEEP) {
      const k = tb / SWEEP;
      wavePos = 1.08 - 1.2 * k;
      waveAmp = Math.sin(Math.PI * Math.min(1, k * 1.08)) ** 0.6;
    }
    // coronary flow, mostly while the heart relaxes
    const fk = (tb - 0.5 * PERIOD) / (0.5 * PERIOD);
    const flow = !fr && fk > 0 && fk < 1 ? [fk * 1.25, Math.sin(Math.PI * fk)] : [-1, 0];
    let yaw = state.yaw;
    let pitch = state.pitch;
    if (!fr) {
      // a slow turn that follows the story (toward the scar while it is treated and heals,
      // back again for the restored heart) and a slight lean toward the pointer. Both hold
      // still while paused or dragged, so nothing jumps when a pause or a drag starts or ends.
      if (state.playing && !state.dragging) {
        const goal = -0.17 * (1 - Math.cos((2 * Math.PI * (t - 2.85)) / LOOP));
        state.sway += (goal - state.sway) * 0.05;
        state.lookX += (state.goalX - state.lookX) * 0.06;
        state.lookY += (state.goalY - state.lookY) * 0.06;
      }
      yaw += state.sway + state.lookX;
      pitch += state.lookY;
    }
    const rot = rotYX(yaw, pitch);
    const aspect = w / h;
    const fov = (26 * Math.PI) / 180;
    // fit the model in height, or its width on narrow canvases
    const dist = Math.max(1.66 / Math.tan(fov / 2), 1.28 / (Math.tan(fov / 2) * aspect));
    const proj = perspective(fov, aspect, 1, 40);
    const mv = modelView(rot, centre, dist);
    // the key light, carried back into model space for the needle's shadow
    const Lv = [-0.4466, 0.6153, 0.6351];
    const lightM = [rot[0] * Lv[0] + rot[1] * Lv[1] + rot[2] * Lv[2], rot[3] * Lv[0] + rot[4] * Lv[1] + rot[5] * Lv[2], rot[6] * Lv[0] + rot[7] * Lv[1] + rot[8] * Lv[2]];
    const nd_ = needle(t, act);

    gl.viewport(0, 0, w, h);
    gl.clearColor(FILM[0], FILM[1], FILM[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.BLEND);
    gl.depthMask(true);

    // 1. the heart and its arteries
    reset();
    const P = heartProg;
    gl.useProgram(P.p);
    gl.uniformMatrix4fv(P.uni.u_proj, false, proj);
    gl.uniformMatrix4fv(P.uni.u_mv, false, mv);
    gl.uniformMatrix3fv(P.uni.u_rot, false, rot);
    gl.uniform1f(P.uni.u_act, act);
    gl.uniform3fv(P.uni.u_axis, head.axis);
    gl.uniform3fv(P.uni.u_ex, head.ex);
    gl.uniform3fv(P.uni.u_ez, head.ez);
    gl.uniform3fv(P.uni.u_centre, head.centre);
    gl.uniform1f(P.uni.u_baseH, head.baseH);
    gl.uniform1f(P.uni.u_N, head.fibres);
    gl.uniform3fv(P.uni.u_scarC, head.scar.centre);
    gl.uniform3fv(P.uni.u_scarN, head.scar.normal);
    gl.uniform3fv(P.uni.u_scarU, head.scar.u);
    gl.uniform3fv(P.uni.u_scarV, head.scar.v);
    gl.uniform2f(P.uni.u_wave, wavePos, waveAmp);
    gl.uniform2f(P.uni.u_flow, flow[0], flow[1]);
    gl.uniform1f(P.uni.u_front, st.front);
    gl.uniform1f(P.uni.u_glow, st.glow);
    gl.uniform1f(P.uni.u_flash, st.flash);
    gl.uniform3fv(P.uni.u_frontCol, st.col);
    gl.uniform3fv(P.uni.u_dep, depFlat);
    gl.uniform3fv(P.uni.u_depA, depA);
    gl.uniform3fv(P.uni.u_depB, depB);
    gl.uniform4fv(P.uni.u_depS, st.depS);
    gl.uniform3fv(P.uni.u_film, FILM);
    gl.uniform1f(P.uni.u_detail, detail);
    gl.uniform3fv(P.uni.u_lightM, lightM);
    if (nd_) {
      gl.uniform4f(P.uni.u_tip, nd_.tip[0], nd_.tip[1], nd_.tip[2], 1);
      gl.uniform3fv(P.uni.u_back, sub(nd_.tip, scale(nd_.dir, NEEDLE_LEN)));
    } else gl.uniform4f(P.uni.u_tip, 0, 0, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, heartBuf);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, heartIdx);
    point(P, "a_pos", 3, gl.FLOAT, false, VS, 0);
    point(P, "a_nrm", 3, gl.SHORT, true, VS, 12);
    point(P, "a_a0", 4, gl.UNSIGNED_BYTE, true, VS, 20);
    point(P, "a_a1", 4, gl.UNSIGNED_BYTE, true, VS, 24);
    point(P, "a_ph", 2, gl.FLOAT, false, VS, 28);
    gl.enable(gl.CULL_FACE);
    gl.drawElements(gl.TRIANGLES, nIdx, gl.UNSIGNED_SHORT, 0);
    gl.disable(gl.CULL_FACE);

    // 2. the needle and its line
    if (nd_) {
      const z = scale(nd_.dir, -1);
      const x = norm(cross([0, 1, 0], z));
      const y = cross(z, x);
      const model = new Float32Array([x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, nd_.tip[0], nd_.tip[1], nd_.tip[2], 1]);
      reset();
      const N = needleProg;
      gl.useProgram(N.p);
      gl.uniformMatrix4fv(N.uni.u_proj, false, proj);
      gl.uniformMatrix4fv(N.uni.u_mv, false, mv);
      gl.uniformMatrix3fv(N.uni.u_rot, false, rot);
      gl.uniformMatrix4fv(N.uni.u_model, false, model);
      gl.uniform1f(N.uni.u_alpha, 1);
      gl.uniform1f(N.uni.u_gel, 1);
      gl.bindBuffer(gl.ARRAY_BUFFER, nBuf);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, nIdxBuf);
      point(N, "a_p", 3, gl.FLOAT, false, 28, 0);
      point(N, "a_n", 3, gl.FLOAT, false, 28, 12);
      point(N, "a_m", 1, gl.FLOAT, false, 28, 24);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawElements(gl.TRIANGLES, nd.I.length, gl.UNSIGNED_SHORT, 0);
      // the line leaves the hub along the needle, then bends away up and to the right
      const hub = add(nd_.tip, scale(z, HUB_END));
      const anchor = [2.6, 2.7, 1.6];
      reset();
      const Lp = lineProg;
      gl.useProgram(Lp.p);
      gl.uniformMatrix4fv(Lp.uni.u_proj, false, proj);
      gl.uniformMatrix4fv(Lp.uni.u_mv, false, mv);
      gl.uniformMatrix3fv(Lp.uni.u_rot, false, rot);
      gl.uniform3fv(Lp.uni.u_b0, hub);
      gl.uniform3fv(Lp.uni.u_b1, add(hub, scale(z, 0.45)));
      gl.uniform3fv(Lp.uni.u_b2, add(anchor, [-0.6, -0.9, -0.2]));
      gl.uniform3fv(Lp.uni.u_b3, anchor);
      gl.uniform1f(Lp.uni.u_r, 0.0075);
      gl.uniform1f(Lp.uni.u_alpha, 1);
      gl.uniform2f(Lp.uni.u_pulse, nd_.pulse[0], nd_.pulse[1]);
      gl.bindBuffer(gl.ARRAY_BUFFER, lBuf);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lIdxBuf);
      point(Lp, "a_uv", 2, gl.FLOAT, false, 8, 0);
      gl.depthMask(false);
      gl.drawElements(gl.TRIANGLES, lIdx.length, gl.UNSIGNED_SHORT, 0);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }
    reset();
    if (!fr) report(st);
  }

  function frame(now) {
    raf = 0;
    const dt = lastNow ? Math.min(0.1, (now - lastNow) / 1000) : 0;
    // if frames come slowly, trade resolution for smoothness
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
      if (state.loopT >= LOOP) state.loopT -= LOOP;
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
    state.downYaw = state.yaw;
    state.downPitch = state.pitch;
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
    canvas.style.cursor = "grab";
    kick();
  };
  canvas.addEventListener("pointerup", release);
  // the browser took the gesture to scroll the page: undo the few pixels it passed on first
  canvas.addEventListener("pointercancel", () => {
    if (!state.dragging) return;
    state.yaw = state.downYaw;
    state.pitch = state.downPitch;
    release();
  });
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
