// A short-axis cross-section of a left ventricle, drawn as fine radial strokes.
// It is a diagram, not data: the geometry is schematic. Three things are taken
// from the paper so the motion means something:
//   - tissue colours match the legend of Fig. 4
//   - scar develops no active tension and the border zone 0.67 of remote (Section 2.11)
//   - the beat follows the raised-cosine activation of Eq. (45): rise 0.30, relax 0.15
//     of a 0.8 s cycle, slowed here so it is calm to look at

const COLORS = {
  myo: [201, 201, 201],
  bz: [240, 160, 75],
  scar: [232, 84, 122],
  gel: [69, 196, 189],
  line: [241, 238, 232],
  film: [13, 12, 11],
};

const TAU = Math.PI * 2;
const STROKES = 264;
const SCAR_CENTER = (140 * Math.PI) / 180; // lower left on screen
const SCAR_HALF = (30 * Math.PI) / 180;
const BZ_WIDTH = (22 * Math.PI) / 180;
const PERIOD = 1.7; // seconds per beat on screen

// Named states. Every field is tweened.
export const STATES = {
  healthy: { infarct: 0, thin: 0, dilate: 0, stress: 0, depots: 0, guess: 0 },
  infarct: { infarct: 1, thin: 0, dilate: 0, stress: 0, depots: 0, guess: 0 },
  permanent: { infarct: 1, thin: 0.15, dilate: 0.1, stress: 0, depots: 0, guess: 0 },
  remodel: { infarct: 1, thin: 1, dilate: 1, stress: 1, depots: 0, guess: 0 },
  gel: { infarct: 1, thin: 1, dilate: 1, stress: 0.25, depots: 1, guess: 0 },
  guess: { infarct: 1, thin: 1, dilate: 1, stress: 0.6, depots: 0, guess: 1 },
  hero: { infarct: 1, thin: 0.55, dilate: 0.3, stress: 0, depots: 1, guess: 0 },
};

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => a + (b - a) * t;
const mixColor = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

function angDist(a, b) {
  let d = Math.abs(a - b) % TAU;
  return d > Math.PI ? TAU - d : d;
}

// Scar and border-zone membership of an angle, each 0..1 with soft edges.
function tissue(theta) {
  const d = angDist(theta, SCAR_CENTER);
  const edge = (3 * Math.PI) / 180;
  const scar = 1 - smooth(SCAR_HALF - edge, SCAR_HALF + edge, d);
  const outer = 1 - smooth(SCAR_HALF + BZ_WIDTH - edge, SCAR_HALF + BZ_WIDTH + edge, d);
  return { scar, bz: Math.max(0, outer - scar) };
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

export function createVentricle(canvas, initial = "healthy") {
  const ctx = canvas.getContext("2d");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const cur = { ...STATES[initial] };
  let from = { ...cur };
  let to = { ...cur };
  let tweenStart = 0;
  let tweenDur = 0;
  let visible = false;
  let raf = 0;
  let size = 0;

  function resize() {
    const css = canvas.clientWidth || 360;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const px = Math.round(css * dpr);
    if (px !== size) {
      size = px;
      canvas.width = px;
      canvas.height = px;
    }
  }

  function draw(now) {
    const t = now / 1000;
    if (tweenDur > 0) {
      const k = Math.min(1, (now - tweenStart) / tweenDur);
      const e = k * k * (3 - 2 * k);
      for (const key in cur) cur[key] = mix(from[key], to[key], e);
      if (k >= 1) tweenDur = 0;
    }
    const beat = reduce.matches ? 0 : activation(t);
    const S = size;
    const c = S / 2;
    const u = S / 2;
    ctx.clearRect(0, 0, S, S);
    ctx.lineCap = "butt";

    const ri0 = (0.5 + 0.07 * cur.dilate) * u;
    const h0 = 0.255 * u;
    const inner = new Array(STROKES);
    const outer = new Array(STROKES);

    for (let i = 0; i < STROKES; i++) {
      const th = (i / STROKES) * TAU;
      const tz = tissue(th);
      const s = tz.scar * cur.infarct;
      const b = tz.bz * cur.infarct;
      const contract = 1 - s - 0.33 * b; // scar 0, border zone 0.67, remote 1
      let h = h0 * (1 - cur.thin * (0.5 * s + 0.16 * b));
      // a depot adds wall thickness where it sits
      h *= 1 + 0.2 * cur.depots * tz.bz;
      // a faint, slow irregularity so the ring is not a perfect circle
      const wob = 1 + 0.018 * Math.sin(3 * th + 0.6) + 0.012 * Math.sin(5 * th + 2.1);
      const bulge = 0.02 * u * s * beat; // the scar is pushed outward a little in systole
      const ri = ri0 * wob - beat * contract * 0.085 * u + bulge + 0.03 * u * cur.thin * s;
      const hh = h * (1 + beat * contract * 0.3);
      inner[i] = ri;
      outer[i] = ri + hh;

      let col = COLORS.myo;
      if (b > 0.02) col = mixColor(col, COLORS.bz, Math.min(1, b));
      if (s > 0.02) col = mixColor(col, COLORS.scar, Math.min(1, s));
      const loaded = cur.stress * (b + 0.35 * (1 - s - b) * (1 - smooth(0.2, 1.3, angDist(th, SCAR_CENTER) - SCAR_HALF - BZ_WIDTH)));
      const alpha = 0.58 + 0.4 * Math.max(s, b) + 0.3 * loaded;
      ctx.strokeStyle = rgba(col, Math.min(1, alpha));
      ctx.lineWidth = Math.max(1, S / 440) * (1 + 0.8 * loaded);
      const cos = Math.cos(th);
      const sin = Math.sin(th);
      ctx.beginPath();
      ctx.moveTo(c + cos * (ri + 1), c + sin * (ri + 1));
      ctx.lineTo(c + cos * (ri + hh - 1), c + sin * (ri + hh - 1));
      ctx.stroke();
    }

    // endocardial and epicardial contours
    ctx.lineWidth = Math.max(1.25, S / 420);
    ctx.strokeStyle = rgba(COLORS.line, 0.92);
    for (const ring of [inner, outer]) {
      ctx.beginPath();
      for (let i = 0; i <= STROKES; i++) {
        const th = (i / STROKES) * TAU;
        const r = ring[i % STROKES];
        const x = c + Math.cos(th) * r;
        const y = c + Math.sin(th) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }

    const at = (th) => {
      const f = ((th / TAU) * STROKES + STROKES) % STROKES;
      const i0 = Math.floor(f) % STROKES;
      const i1 = (i0 + 1) % STROKES;
      const k = f - Math.floor(f);
      const ri = mix(inner[i0], inner[i1], k);
      const ro = mix(outer[i0], outer[i1], k);
      return { mid: (ri + ro) / 2, h: ro - ri };
    };

    // "placed by eye": evenly spaced sites all the way round, scar included
    if (cur.guess > 0.01) {
      ctx.lineWidth = Math.max(1.25, S / 420);
      ctx.strokeStyle = rgba(COLORS.gel, 0.9 * cur.guess);
      ctx.fillStyle = rgba(COLORS.film, 0.9 * cur.guess);
      for (let k = 0; k < 16; k++) {
        const th = (k / 16) * TAU + 0.13;
        const g = at(th);
        ctx.beginPath();
        ctx.arc(c + Math.cos(th) * g.mid, c + Math.sin(th) * g.mid, 0.026 * u, 0, TAU);
        ctx.fill();
        ctx.stroke();
      }
    }

    // gel depots: mid-wall, inside the border zones, clear of the scar
    if (cur.depots > 0.01) {
      const offs = [SCAR_HALF + BZ_WIDTH * 0.26, SCAR_HALF + BZ_WIDTH * 0.78];
      for (const side of [-1, 1]) {
        for (const off of offs) {
          const th = SCAR_CENTER + side * off;
          const g = at(th);
          const x = c + Math.cos(th) * g.mid;
          const y = c + Math.sin(th) * g.mid;
          const grow = cur.depots;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(th + Math.PI / 2);
          ctx.beginPath();
          ctx.ellipse(0, 0, 0.052 * u * grow, Math.min(0.044 * u, g.h * 0.3) * grow, 0, 0, TAU);
          ctx.fillStyle = rgba(COLORS.gel, 1);
          ctx.fill();
          ctx.lineWidth = Math.max(1.5, S / 300);
          ctx.strokeStyle = rgba(COLORS.film, 1);
          ctx.stroke();
          ctx.restore();
        }
      }
    }
  }

  function frame(now) {
    raf = 0;
    draw(now);
    if (visible && !document.hidden && (!reduce.matches || tweenDur > 0)) raf = requestAnimationFrame(frame);
  }
  function kick() {
    if (!raf) raf = requestAnimationFrame(frame);
  }

  const io = new IntersectionObserver(
    (entries) => {
      visible = entries[0].isIntersecting;
      if (visible) kick();
    },
    { rootMargin: "80px" }
  );
  io.observe(canvas);
  const ro = new ResizeObserver(() => {
    resize();
    kick();
  });
  ro.observe(canvas);
  document.addEventListener("visibilitychange", kick);
  reduce.addEventListener?.("change", kick);
  resize();
  kick();

  return {
    setState(name) {
      const target = STATES[name];
      if (!target) return;
      from = { ...cur };
      to = { ...target };
      if (reduce.matches) {
        Object.assign(cur, to);
        tweenDur = 0;
      } else {
        tweenStart = performance.now();
        tweenDur = 800;
      }
      kick();
    },
    destroy() {
      io.disconnect();
      ro.disconnect();
      cancelAnimationFrame(raf);
    },
  };
}
