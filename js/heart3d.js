// The 3D heart in the hero: a dark, softly lit surface wound with fine fibre
// strokes. It is an illustration (geometry from tools/build_heart.py), drawn with
// plain WebGL so nothing has to be vendored.
//
//   - strokes follow the epicardial fibre angle of the paper's rule-based field
//   - the crimson patch is scar and does not contract; the ochre rim is border zone
//     and contracts at 0.67 of remote muscle (Section 2.11)
//   - teal spheres are gel depots in the border zone, clear of the scar (Fig. 4)
//   - the beat follows the raised-cosine activation of Eq. (45), slowed for display
//
// createHeart(canvas, { src }) resolves to a controller, or rejects if WebGL or the
// geometry is unavailable, so the caller can fall back to the 2D drawing.

const PERIOD = 1.7; // seconds per beat on screen (matches js/ventricle.js)
const FILM = [13 / 255, 12 / 255, 11 / 255];

const DEFORM = `
uniform float u_act;
uniform vec3 u_axis;
uniform vec3 u_centre;
uniform float u_baseH;

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
attribute vec2 a_tint;   // scar, border zone
uniform mat4 u_mvp;
uniform mat3 u_rot;
varying vec3 v_n;
varying vec4 v_attr;
varying vec2 v_tint;
${DEFORM}
void main() {
  vec3 p = deform(a_pos, a_attr.x, a_attr.y) + a_off;
  v_n = u_rot * a_nrm;
  v_attr = a_attr;
  v_tint = a_tint;
  gl_Position = u_mvp * vec4(p, 1.0);
}
`;

const MESH_FS = `
precision mediump float;
varying vec3 v_n;
varying vec4 v_attr;
varying vec2 v_tint;
uniform vec3 u_film;
void main() {
  vec3 n = normalize(v_n);
  vec3 l = normalize(vec3(-0.45, 0.62, 0.64));
  float diff = max(dot(n, l), 0.0);
  float rim = pow(1.0 - max(n.z, 0.0), 2.6);
  vec3 col;
  if (v_attr.w > 0.5) {
    // gel depot
    vec3 teal = vec3(0.27, 0.77, 0.74);
    float spec = pow(max(dot(reflect(-l, n), vec3(0.0, 0.0, 1.0)), 0.0), 24.0);
    col = teal * (0.34 + 0.78 * diff) + vec3(0.55) * spec + teal * 0.25 * rim;
  } else {
    vec3 body = mix(vec3(0.050, 0.046, 0.043), vec3(0.150, 0.138, 0.128), diff);
    body += vec3(0.115, 0.108, 0.100) * rim;
    vec3 scar = vec3(0.34, 0.07, 0.15) * (0.35 + 0.75 * diff);
    vec3 bz = vec3(0.36, 0.20, 0.06) * (0.35 + 0.75 * diff);
    body = mix(body, bz, v_tint.y * 0.62);
    body = mix(body, scar, v_tint.x * 0.72);
    col = mix(u_film, body, v_attr.z);
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

const STROKE_VS = `
attribute vec3 a_p;       // this end
attribute vec3 a_o;       // the other end
attribute vec3 a_nrm;
attribute vec2 a_corner;  // x: +1 if this is the far end, y: side
attribute vec4 a_attr;    // w, c, fade, tag
attribute float a_rand;
uniform mat4 u_mvp;
uniform mat3 u_rot;
uniform vec2 u_view;      // viewport in device px
uniform float u_width;    // stroke half-width in device px
varying float v_side;
varying float v_tag;
varying float v_alpha;
${DEFORM}
void main() {
  vec4 a = u_mvp * vec4(deform(a_p, a_attr.x, a_attr.y), 1.0);
  vec4 b = u_mvp * vec4(deform(a_o, a_attr.x, a_attr.y), 1.0);
  vec2 d = (b.xy / b.w - a.xy / a.w) * u_view * a_corner.x;
  d = normalize(d + vec2(1e-5));
  vec2 nrm = vec2(-d.y, d.x) * a_corner.y;
  a.xy += nrm * u_width / u_view * 2.0 * a.w;
  a.z -= 0.0022 * a.w;
  gl_Position = a;
  vec3 n = u_rot * a_nrm;
  float diff = max(dot(normalize(n), normalize(vec3(-0.45, 0.62, 0.64))), 0.0);
  float facing = smoothstep(-0.05, 0.30, n.z);
  v_side = a_corner.y;
  v_tag = a_attr.w;
  v_alpha = a_attr.z * facing * (0.36 + 0.64 * diff) * (0.72 + 0.28 * a_rand);
}
`;

const STROKE_FS = `
precision mediump float;
varying float v_side;
varying float v_tag;
varying float v_alpha;
void main() {
  vec3 col;
  float a;
  if (v_tag < 0.5) { col = vec3(0.83, 0.82, 0.80); a = 0.80; }        // remote myocardium
  else if (v_tag < 1.5) { col = vec3(0.96, 0.64, 0.30); a = 1.0; }    // border zone
  else if (v_tag < 2.5) { col = vec3(0.93, 0.34, 0.49); a = 1.0; }    // scar
  else { col = vec3(0.64, 0.62, 0.59); a = 0.40; }                    // atria and vessels
  float edge = 1.0 - smoothstep(0.45, 1.0, abs(v_side));
  gl_FragColor = vec4(col, a * v_alpha * edge);
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
function activation(t) {
  const tb = ((t % PERIOD) + PERIOD) % PERIOD;
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
  const STRIDE = 3 + 3 + 3 + 4 + 2;
  const mv = new Float32Array(nMeshV * STRIDE);
  for (let i = 0; i < nBody; i++) {
    const p = dq(A.meshPos, i);
    const o = i * STRIDE;
    mv[o] = p[0]; mv[o + 1] = p[1]; mv[o + 2] = p[2];
    mv[o + 3] = A.meshNrm[i * 3] / 127; mv[o + 4] = A.meshNrm[i * 3 + 1] / 127; mv[o + 5] = A.meshNrm[i * 3 + 2] / 127;
    mv[o + 9] = A.meshAttr[i * 6] / 255; mv[o + 10] = A.meshAttr[i * 6 + 1] / 255; mv[o + 11] = A.meshAttr[i * 6 + 2] / 255; mv[o + 12] = 0;
    mv[o + 13] = A.meshAttr[i * 6 + 3] / 255; mv[o + 14] = A.meshAttr[i * 6 + 4] / 255;
  }
  const nBodyIdx = A.meshIdx.length;
  const nSphIdx = A.sphereIdx.length;
  const useUint = nMeshV > 65535;
  if (useUint && !gl.getExtension("OES_element_index_uint")) throw new Error("mesh too large for this device");
  const idx = new (useUint ? Uint32Array : Uint16Array)(nBodyIdx + nDep * nSphIdx);
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
    }
    for (let j = 0; j < nSphIdx; j++) idx[nBodyIdx + d * nSphIdx + j] = nBody + d * nSv + A.sphereIdx[j];
  }

  // ---- strokes: two triangles each, expanded to a ribbon in the vertex shader ----
  const nS = A.strokeP0.length / 3;
  const SS = 3 + 3 + 3 + 2 + 4 + 1;
  const sv = new Float32Array(nS * 6 * SS);
  const corners = [[-1, -1], [-1, 1], [1, 1], [-1, -1], [1, 1], [1, -1]]; // (end, side)
  for (let i = 0; i < nS; i++) {
    const p0 = dq(A.strokeP0, i);
    const p1 = dq(A.strokeP1, i);
    for (let k = 0; k < 6; k++) {
      const [end, side] = corners[k];
      const a = end < 0 ? p0 : p1;
      const b = end < 0 ? p1 : p0;
      const o = (i * 6 + k) * SS;
      sv[o] = a[0]; sv[o + 1] = a[1]; sv[o + 2] = a[2];
      sv[o + 3] = b[0]; sv[o + 4] = b[1]; sv[o + 5] = b[2];
      sv[o + 6] = A.strokeNrm[i * 3] / 127; sv[o + 7] = A.strokeNrm[i * 3 + 1] / 127; sv[o + 8] = A.strokeNrm[i * 3 + 2] / 127;
      // the ribbon's side vector flips with the direction of travel, so flip it back at the far end
      sv[o + 9] = end < 0 ? 1 : -1; sv[o + 10] = end < 0 ? side : -side;
      sv[o + 11] = A.strokeAttr[i * 5] / 255; sv[o + 12] = A.strokeAttr[i * 5 + 1] / 255; sv[o + 13] = A.strokeAttr[i * 5 + 2] / 255; sv[o + 14] = A.strokeAttr[i * 5 + 3];
      sv[o + 15] = A.strokeAttr[i * 5 + 4] / 255;
    }
  }

  const meshProg = program(gl, MESH_VS, MESH_FS);
  const strokeProg = program(gl, STROKE_VS, STROKE_FS);
  const meshBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, meshBuf);
  gl.bufferData(gl.ARRAY_BUFFER, mv, gl.STATIC_DRAW);
  const idxBuf = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
  const strokeBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, strokeBuf);
  gl.bufferData(gl.ARRAY_BUFFER, sv, gl.STATIC_DRAW);

  const bind = (prog, layout, stride) => {
    let off = 0;
    for (const [name, size] of layout) {
      const loc = prog.attr[name];
      if (loc !== undefined && loc >= 0) {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride * 4, off * 4);
      }
      off += size;
    }
  };

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const centre = [0.04, 0.20, 0.0];
  const state = { yaw: -0.24, pitch: 0.12, vy: 0, dragging: false, lastX: 0, lastY: 0, idleAt: 0, t0: performance.now() };
  let visible = false;
  let raf = 0;
  let w = 0;
  let h = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
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
    const still = reduce.matches;
    const act = still ? 0 : activation(t);
    let yaw = state.yaw;
    let pitch = state.pitch;
    if (!state.dragging && !still) {
      // a slow sway that keeps the infarct in view; it eases back in after a drag
      const k = Math.min(1, Math.max(0, (now - state.idleAt) / 1600));
      yaw += k * 0.30 * Math.sin(t * 0.26);
    }
    const rot = rotYX(yaw, pitch);
    const aspect = w / h;
    const fov = (26 * Math.PI) / 180;
    // fit the 3.5-unit-tall model in height, or its width on narrow canvases
    const dist = Math.max(1.70 / Math.tan(fov / 2), 1.30 / (Math.tan(fov / 2) * aspect));
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
    };

    common(meshProg);
    gl.uniform3fv(meshProg.uni.u_film, FILM);
    gl.bindBuffer(gl.ARRAY_BUFFER, meshBuf);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
    bind(meshProg, [["a_pos", 3], ["a_nrm", 3], ["a_off", 3], ["a_attr", 4], ["a_tint", 2]], STRIDE);
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);
    gl.drawElements(gl.TRIANGLES, idx.length, useUint ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);

    common(strokeProg);
    gl.uniform2f(strokeProg.uni.u_view, w, h);
    gl.uniform1f(strokeProg.uni.u_width, Math.max(1.0, (h / 620) * 1.05));
    gl.bindBuffer(gl.ARRAY_BUFFER, strokeBuf);
    bind(strokeProg, [["a_p", 3], ["a_o", 3], ["a_nrm", 3], ["a_corner", 2], ["a_attr", 4], ["a_rand", 1]], SS);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.drawArrays(gl.TRIANGLES, 0, nS * 6);
    gl.depthMask(true);
  }

  function frame(now) {
    raf = 0;
    draw(now);
    if (visible && !document.hidden && (!reduce.matches || state.dragging)) raf = requestAnimationFrame(frame);
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
    // for still images: draw one frame at a chosen moment and angle
    snapshot({ yaw = -0.18, pitch = 0.12, act = 0 } = {}) {
      state.yaw = yaw;
      state.pitch = pitch;
      state.dragging = true;
      state.t0 = performance.now() - (act > 0 ? ((0.3 / 0.8) * PERIOD * 1000 * Math.acos(1 - 2 * act)) / Math.PI : 0);
      draw(performance.now());
    },
    destroy() {
      io.disconnect();
      ro.disconnect();
      cancelAnimationFrame(raf);
    },
  };
}
