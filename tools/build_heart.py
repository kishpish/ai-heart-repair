#!/usr/bin/env python3
"""Build the geometry for the 3D heart drawn in the hero (assets/heart/heart.bin).

Usage:
    python3 tools/build_heart.py

Needs numpy and scikit-image (pip install numpy scikit-image).

The heart is an illustration, not patient data. Its shape is a smooth blend of
simple solids (two ventricles, two atria, the great vessels), wound with long
fibre lines and crossed by the main coronary arteries. Four things are taken
from the paper so the picture says something true about the work:
  - fibre lines wind around the ventricles at the epicardial helix angle of the
    rule-based fibre field (-60 degrees; circumferential in scar, halved in the
    border zone; Section 2.7)
  - scar develops no active tension and the border zone 0.67 of remote (Section 2.11)
  - nine gel depots sit in the border zone, clear of the scar (Fig. 4)
  - the infarct lies downstream of a blocked coronary artery (Section 1.1)

Output layout: uint32 length of a JSON header, the header (padded to 4 bytes),
then the typed arrays the header describes. js/heart3d.js reads it.
"""
from __future__ import annotations

import json
import struct
from pathlib import Path

import numpy as np
from skimage import measure

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "heart" / "heart.bin"
RNG = np.random.default_rng(7)

STEP = 0.034  # marching-cubes grid spacing
K = 17  # points per fibre line
LO = np.array([-1.40, -1.50, -1.00])
HI = np.array([1.50, 2.10, 0.90])

# --- ventricle frame: long axis from apex to base, in viewer coordinates -----------------
AXIS = np.array([-0.42, 0.88, -0.22])
AXIS /= np.linalg.norm(AXIS)
EX = np.array([1.0, 0.0, 0.0]) - AXIS[0] * AXIS
EX /= np.linalg.norm(EX)
EZ = np.cross(EX, AXIS)
VC = np.array([0.05, -0.25, 0.05])  # ventricle frame origin
BASE_H = 0.52  # height of the base plane along the axis
FADE_C = np.array([0.0, 0.30, 0.0])  # vessels dissolve with distance from here


def smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0.0, 1.0)
    return b + (a - b) * h - k * h * (1.0 - h)


def smax(a, b, k):
    return -smin(-a, -b, k)


def ellipsoid(p, c, r):
    q = p - np.asarray(c)
    r = np.asarray(r)
    k0 = np.linalg.norm(q / r, axis=-1)
    k1 = np.linalg.norm(q / (r * r), axis=-1)
    return k0 * (k0 - 1.0) / np.maximum(k1, 1e-9)


def capsule(p, a, b, ra, rb):
    a = np.asarray(a, float)
    b = np.asarray(b, float)
    pa = p - a
    ba = b - a
    h = np.clip((pa @ ba) / (ba @ ba), 0.0, 1.0)
    return np.linalg.norm(pa - h[..., None] * ba, axis=-1) - (ra + (rb - ra) * h)


def to_local(p):
    q = p - VC
    return np.stack([q @ EX, q @ AXIS, q @ EZ], axis=-1)


def ventricles(p):
    l = to_local(p)
    # narrow the lower half toward the apex so it reads as a cone, not an egg
    t = np.clip(-l[..., 1], 0.0, 1.1) / 1.1
    taper = 1.0 - 0.36 * t * t
    w = l.copy()
    w[..., 0] /= taper
    w[..., 2] /= taper
    lv = ellipsoid(w, (0.12, -0.06, -0.05), (0.56, 1.06, 0.55))
    # the right ventricle wraps the front and right of the left one and stops short of the apex
    rv = ellipsoid(w, (-0.33, 0.20, 0.17), (0.47, 0.70, 0.46))
    d = smin(lv, rv, 0.12)
    return smax(d, l[..., 1] - BASE_H, 0.10), lv, rv


# Vessel centrelines: (points, radii). Each consecutive pair is one tapered capsule.
VESSELS = {
    "aorta": ([(-0.20, 0.30, 0.05), (-0.25, 0.88, 0.02), (-0.15, 1.14, -0.07), (0.10, 1.27, -0.21), (0.38, 1.22, -0.35), (0.54, 1.00, -0.46), (0.58, 0.35, -0.56), (0.58, -0.70, -0.62)],
              [0.185, 0.175, 0.170, 0.160, 0.155, 0.150, 0.140, 0.135]),
    "brachiocephalic": ([(-0.11, 1.18, -0.08), (-0.20, 2.10, -0.04)], [0.075, 0.068]),
    "carotid": ([(0.12, 1.27, -0.21), (0.14, 2.10, -0.19)], [0.060, 0.055]),
    "subclavian": ([(0.34, 1.23, -0.33), (0.47, 2.10, -0.33)], [0.066, 0.058]),
    "pulmonary": ([(-0.04, 0.34, 0.30), (0.10, 0.82, 0.23), (0.21, 1.02, 0.07)], [0.180, 0.168, 0.155]),
    "lpa": ([(0.21, 1.02, 0.07), (0.56, 1.10, -0.12), (0.98, 1.30, -0.36), (1.50, 1.62, -0.55)], [0.120, 0.105, 0.095, 0.090]),
    "rpa": ([(0.21, 1.02, 0.07), (-0.22, 0.99, -0.26), (-0.54, 0.98, -0.48)], [0.115, 0.105, 0.095]),
    "svc": ([(-0.60, 0.66, -0.06), (-0.57, 2.10, -0.10)], [0.130, 0.118]),
    "ivc": ([(-0.62, 0.20, -0.20), (-0.62, -0.55, -0.34)], [0.125, 0.120]),
}

# Each component: (name, group, axis used to orient its strokes)
COMPONENTS: list[tuple[str, str, np.ndarray]] = [("ventricles", "vent", AXIS)]
COMPONENTS += [("ra", "atrium", np.array([0.0, 1.0, 0.0])), ("la", "atrium", np.array([0.0, 1.0, 0.0]))]
SEGMENTS = []
for name, (pts, radii) in VESSELS.items():
    for i in range(len(pts) - 1):
        a, b = np.array(pts[i]), np.array(pts[i + 1])
        SEGMENTS.append((a, b, radii[i], radii[i + 1]))
        axis = (b - a) / np.linalg.norm(b - a)
        COMPONENTS.append((f"{name}{i}", "vessel", axis))


def parts(p):
    """Distance to every component, shape (n_components, N)."""
    dv, _, _ = ventricles(p)
    ra = smin(ellipsoid(p, (-0.58, 0.37, -0.08), (0.32, 0.38, 0.31)), ellipsoid(p, (-0.36, 0.56, 0.20), (0.24, 0.15, 0.17)), 0.10)
    la = smin(ellipsoid(p, (-0.05, 0.50, -0.42), (0.52, 0.33, 0.31)), ellipsoid(p, (0.40, 0.47, 0.02), (0.22, 0.15, 0.18)), 0.10)
    out = [dv, ra, la]
    out += [capsule(p, a, b, ra_, rb_) for a, b, ra_, rb_ in SEGMENTS]
    return np.stack(out)


def field(p):
    d = parts(p)
    body = smin(smin(d[0], d[1], 0.09), d[2], 0.09)
    vessels = d[3]
    for i in range(4, d.shape[0]):
        vessels = smin(vessels, d[i], 0.045)
    return smin(body, vessels, 0.06)


def gradient(p, e=1e-3):
    g = np.empty_like(p)
    for i in range(3):
        o = np.zeros(3)
        o[i] = e
        g[:, i] = field(p + o) - field(p - o)
    return g / np.maximum(np.linalg.norm(g, axis=1, keepdims=True), 1e-12)


def project(p, iters=6):
    """Move points onto the surface."""
    p = p.copy()
    for _ in range(iters):
        p -= field(p)[:, None] * gradient(p)
    return p


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


# --- the infarct: a patch on the anterior wall of the left ventricle, toward the apex ------
def scar_centre():
    az = np.deg2rad(62.0)
    origin = VC + 0.14 * EX - 0.42 * AXIS - 0.04 * EZ
    direction = np.cos(az) * EX + np.sin(az) * EZ
    t = np.linspace(0.1, 1.2, 600)
    pts = origin + t[:, None] * direction
    d = field(pts)
    i = int(np.argmax(d > 0))
    return project(pts[i : i + 1])[0]


SCAR_C = scar_centre()
SCAR_R, BZ_W = 0.265, 0.115


def tissue(p):
    """Scar and border-zone membership, each 0..1 with an irregular edge."""
    q = p - SCAR_C
    r = np.linalg.norm(q, axis=1)
    wob = 0.035 * np.sin(9.0 * q[:, 0] + 1.3) * np.cos(8.0 * q[:, 1] - 0.4) + 0.025 * np.sin(13.0 * q[:, 2] + 11.0 * q[:, 1])
    r = r + wob
    scar = 1.0 - smoothstep(SCAR_R - 0.025, SCAR_R + 0.025, r)
    outer = 1.0 - smoothstep(SCAR_R + BZ_W - 0.025, SCAR_R + BZ_W + 0.025, r)
    return scar, np.maximum(outer - scar, 0.0)


def attributes(p):
    """Per-point: ventricle weight, contractility, fade, scar, border zone, component index."""
    d = parts(p)
    kind = np.argmin(d, axis=0)
    w = 1.0 - smoothstep(0.0, 0.30, d[0])
    scar, bz = tissue(p)
    on_vent = 1.0 - smoothstep(0.0, 0.05, d[0])
    scar, bz = scar * on_vent, bz * on_vent
    contract = 1.0 - scar - 0.33 * bz  # scar 0, border zone 0.67, remote 1
    # vessels dissolve with distance from the heart; the ventricles never fade
    m = np.linalg.norm((p - FADE_C) / np.array([0.95, 1.12, 1.0]), axis=1)
    fade = np.maximum(1.0 - smoothstep(0.98, 1.42, m), w)
    return w, contract, fade, scar, bz, kind


def u8(x):
    return np.clip(np.round(x * 255.0), 0, 255).astype(np.uint8)


def i8(x):
    return np.clip(np.round(x * 127.0), -127, 127).astype(np.int8)


def q16(p):
    return np.clip(np.round((p - LO) / (HI - LO) * 65535.0), 0, 65535).astype(np.uint16)


def poisson(points, radius):
    """Greedy thinning: keep a point only if no kept point lies within its radius."""
    cell = radius.max()
    keys = np.floor(points / cell).astype(np.int64)
    grid: dict[tuple, list[int]] = {}
    keep = []
    for i in RNG.permutation(len(points)):
        k = tuple(keys[i])
        ok = True
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    for j in grid.get((k[0] + dx, k[1] + dy, k[2] + dz), ()):
                        if np.sum((points[i] - points[j]) ** 2) < radius[i] ** 2:
                            ok = False
                            break
                    if not ok:
                        break
                if not ok:
                    break
            if not ok:
                break
        if ok:
            keep.append(i)
            grid.setdefault(k, []).append(i)
    return np.array(keep)


def icosphere(level=2):
    t = (1 + 5**0.5) / 2
    v = np.array([[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]], float)
    f = np.array([[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]])
    v /= np.linalg.norm(v, axis=1, keepdims=True)
    for _ in range(level):
        cache: dict[tuple, int] = {}
        verts = list(v)

        def mid(a, b):
            key = (min(a, b), max(a, b))
            if key not in cache:
                m = (verts[a] + verts[b]) / 2
                verts.append(m / np.linalg.norm(m))
                cache[key] = len(verts) - 1
            return cache[key]

        nf = []
        for a, b, c in f:
            ab, bc, ca = mid(a, b), mid(b, c), mid(c, a)
            nf += [[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]]
        v, f = np.array(verts), np.array(nf)
    return v, f


def occlusion(p, n):
    """Cheap ambient occlusion from the distance field: 1 in the open, lower in creases."""
    acc = np.zeros(len(p))
    for d, wgt in ((0.05, 0.50), (0.11, 0.27), (0.20, 0.15), (0.32, 0.08)):
        acc += wgt * np.clip((d - field(p + d * n)) / d, 0.0, 1.0)
    return np.clip(1.0 - 1.35 * acc, 0.0, 1.0)


def direction(p, n, kind, jitter):
    """Unit tangent that a line follows at p: fibres on the ventricles, girth on the atria, length on vessels."""
    axis = np.array([c[2] for c in COMPONENTS])[kind]
    circ = np.cross(axis, n)
    circ /= np.maximum(np.linalg.norm(circ, axis=1, keepdims=True), 1e-9)
    longi = np.cross(n, circ)
    scar, bz = tissue(p)
    is_vent = kind == 0
    is_vessel = kind >= 3
    # epicardial helix angle: -60 degrees remote, halved in the border zone, 0 in scar
    alpha = np.deg2rad(-60.0) * (1.0 - scar) * (1.0 - 0.5 * bz)
    alpha = np.where(is_vent, alpha, np.where(is_vessel, np.pi / 2, 0.0)) + jitter
    return np.cos(alpha)[:, None] * circ + np.sin(alpha)[:, None] * longi


def klass(kind):
    return np.where(kind == 0, 0, np.where(kind <= 2, 1, 2))


def trace(seeds, length, jitter):
    """Trace one line through each seed, K points long, following direction(). Returns points and a live mask."""
    n_lines = len(seeds)
    pts = np.zeros((n_lines, K, 3))
    live = np.zeros((n_lines, K), bool)
    mid = K // 2
    kind0 = np.argmin(parts(seeds), axis=0)
    k0 = klass(kind0)
    pts[:, mid] = seeds
    live[:, mid] = True
    ds = length / (K - 1)
    for sign, order in ((1.0, range(mid + 1, K)), (-1.0, range(mid - 1, -1, -1))):
        p = seeds.copy()
        alive = np.ones(n_lines, bool)
        prev = None
        for i in order:
            nrm = gradient(p)
            kind = np.argmin(parts(p), axis=0)
            d = direction(p, nrm, kind, jitter) * sign
            if prev is not None:
                d = np.where((np.sum(d * prev, axis=1) < 0)[:, None], -d, d)
            # midpoint step, then back onto the surface
            pm = project(p + 0.5 * ds[:, None] * d, iters=1)
            km = np.argmin(parts(pm), axis=0)
            dm = direction(pm, gradient(pm), km, jitter) * sign
            dm = np.where((np.sum(dm * d, axis=1) < 0)[:, None], -dm, dm)
            q = project(p + ds[:, None] * dm, iters=2)
            kq = np.argmin(parts(q), axis=0)
            _, _, fade_q, _, _, _ = attributes(q)
            alive &= (klass(kq) == k0) & (fade_q > 0.02)
            q = np.where(alive[:, None], q, p)
            pts[:, i] = q
            live[:, i] = alive
            prev = np.where(alive[:, None], dm, d)
            p = q
    return pts, live


def select(pts, live, sep, blockers):
    """Keep lines so that none runs closer than its separation to one already kept.

    Lines are taken in random order and trimmed where they would crowd an earlier
    line, which leaves an even hatch with staggered ends. Returns the kept line
    indices and a trimmed live mask.
    """
    cell = float(sep.max())
    grid: dict[tuple, list[np.ndarray]] = {}
    mid = K // 2

    def crowded(q, r):
        k = np.floor(q / cell).astype(int)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    for o in grid.get((k[0] + dx, k[1] + dy, k[2] + dz), ()):
                        if (q[0] - o[0]) ** 2 + (q[1] - o[1]) ** 2 + (q[2] - o[2]) ** 2 < r * r:
                            return True
        return False

    def insert(q):
        grid.setdefault(tuple(np.floor(q / cell).astype(int)), []).append(q)

    for b in blockers:
        insert(b)
    kept, masks = [], []
    for i in RNG.permutation(len(pts)):
        r = sep[i]
        if crowded(pts[i, mid], r):
            continue
        lo = hi = mid
        for step, bound in ((1, K), (-1, -1)):
            j = mid
            while j + step != bound and live[i, j + step]:
                a, b = pts[i, j], pts[i, j + step]
                if crowded(0.5 * (a + b), r) or crowded(b, r):
                    break
                j += step
            if step == 1:
                hi = j
            else:
                lo = j
        if hi - lo < 3:
            continue
        m = np.zeros(K, bool)
        m[lo : hi + 1] = True
        for j in range(lo, hi + 1):
            insert(pts[i, j])
            if j < hi:
                insert(0.5 * (pts[i, j] + pts[i, j + 1]))
                insert(0.25 * pts[i, j] + 0.75 * pts[i, j + 1])
                insert(0.75 * pts[i, j] + 0.25 * pts[i, j + 1])
        kept.append(i)
        masks.append(m)
    return np.array(kept), np.array(masks)


def catmull(ctrl, n):
    """Catmull-Rom through control points, n samples."""
    c = np.asarray(ctrl, float)
    c = np.vstack([2 * c[0] - c[1], c, 2 * c[-1] - c[-2]])
    out = []
    segs = len(c) - 3
    for t in np.linspace(0, segs, n, endpoint=False):
        i = min(int(t), segs - 1)
        u = t - i
        p0, p1, p2, p3 = c[i], c[i + 1], c[i + 2], c[i + 3]
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u**3))
    out.append(c[-2])
    return np.array(out)


def on_ventricle(phi_deg, h):
    """Surface point at azimuth phi around the long axis and height h along it."""
    phi = np.deg2rad(phi_deg)
    origin = VC + h[:, None] * AXIS
    d = np.cos(phi)[:, None] * EX + np.sin(phi)[:, None] * EZ
    t = np.linspace(0.02, 1.5, 260)
    out = np.zeros((len(h), 3))
    for i in range(len(h)):
        ray = origin[i] + t[:, None] * d[i]
        inside = ventricles(ray)[0] < 0
        j = np.flatnonzero(inside)
        out[i] = ray[j[-1]] if len(j) else ray[0]
    return project(out, iters=6)


# Coronary arteries as (azimuth in degrees, height) paths on the ventricles:
# name: (control points, width at start, width at end, blocked?)
CORONARIES = {
    "lad": ([(107, 0.34), (105, 0.18), (102, -0.05), (98, -0.32), (94, -0.60), (89, -0.84), (84, -1.00)], 1.00, 0.45, False),
    "diagonal": ([(105, 0.20), (92, 0.14), (76, 0.09), (61, 0.03)], 0.72, 0.60, False),
    "diagonal-blocked": ([(58, 0.00), (52, -0.14), (48, -0.30), (46, -0.47), (45, -0.60)], 0.80, 0.55, True),
    "septal": ([(104, 0.02), (117, -0.10), (130, -0.26), (139, -0.40)], 0.55, 0.32, False),
    "circumflex": ([(104, 0.46), (84, 0.49), (58, 0.47), (30, 0.45), (2, 0.44), (-24, 0.42)], 0.90, 0.50, False),
    "marginal": ([(22, 0.45), (15, 0.26), (9, 0.08), (4, -0.10)], 0.60, 0.32, False),
    "rca": ([(116, 0.47), (138, 0.48), (162, 0.47), (186, 0.45), (210, 0.44), (232, 0.43)], 0.90, 0.50, False),
    "acute": ([(166, 0.46), (161, 0.22), (153, -0.02), (144, -0.26)], 0.60, 0.32, False),
}


def coronary_lines():
    """Arteries as K-point lines (long paths are cut into consecutive pieces that share an end point)."""
    P, W, C, U, CONT = [], [], [], [], []
    for ctrl, w0, w1, blocked in CORONARIES.values():
        ctrl = np.array(ctrl, float)
        rough = on_ventricle(ctrl[:, 0], ctrl[:, 1])
        length = np.sum(np.linalg.norm(np.diff(rough, axis=0), axis=1))
        pieces = max(1, int(np.ceil(length / 0.34)))
        n = pieces * (K - 1) + 1
        path = catmull(ctrl, n - 1)
        pts = on_ventricle(path[:, 0], path[:, 1])
        pts += 0.017 * gradient(pts)
        along = np.linspace(0.0, 1.0, n)
        width = w0 + (w1 - w0) * along
        for j in range(pieces):
            sl = slice(j * (K - 1), j * (K - 1) + K)
            P.append(pts[sl])
            W.append(width[sl])
            U.append(along[sl])
            C.append(4 if blocked else 3)
            CONT.append(j > 0)
    return np.array(P), np.array(W), np.array(C), np.array(U), np.array(CONT)


def main() -> None:
    # ---- surface mesh -------------------------------------------------------------------
    axes = [np.arange(LO[i], HI[i] + STEP, STEP) for i in range(3)]
    gx, gy, gz = np.meshgrid(*axes, indexing="ij")
    grid = np.stack([gx, gy, gz], axis=-1).reshape(-1, 3)
    vol = np.concatenate([field(chunk) for chunk in np.array_split(grid, 40)]).reshape(gx.shape)
    verts, faces, _, _ = measure.marching_cubes(vol, level=0.0, spacing=(STEP, STEP, STEP))
    verts = project(verts + LO, iters=2)
    normals = gradient(verts)
    w, contract, fade, scar, bz, _ = attributes(verts)
    # drop triangles that have completely faded out
    alive = fade[faces].max(axis=1) > 0.004
    faces = faces[alive]
    used = np.unique(faces)
    remap = -np.ones(len(verts), dtype=np.int64)
    remap[used] = np.arange(len(used))
    verts, normals = verts[used], normals[used]
    w, contract, fade, scar, bz = w[used], contract[used], fade[used], scar[used], bz[used]
    faces = remap[faces]
    assert len(verts) < 65536, len(verts)
    ao = occlusion(verts, normals)
    print(f"mesh: {len(verts)} vertices, {len(faces)} triangles")

    # ---- gel depots: nine, in the middle of the border zone, clear of the scar ---------
    n0 = gradient(SCAR_C[None])[0]
    t1 = np.cross(n0, AXIS)
    t1 /= np.linalg.norm(t1)
    t2 = np.cross(n0, t1)
    ang = np.linspace(0, 2 * np.pi, 9, endpoint=False) + 0.35 + RNG.normal(0, 0.06, 9)
    centres = []
    for a_ in ang:
        radii = np.linspace(SCAR_R - 0.05, SCAR_R + BZ_W + 0.10, 80)
        ray = project(SCAR_C + radii[:, None] * (np.cos(a_) * t1 + np.sin(a_) * t2) + 0.12 * n0, iters=10)
        inside = np.flatnonzero(tissue(ray)[1] > 0.97)
        # spread the depots across the width of the band instead of along one circle
        centres.append(ray[inside[int(len(inside) * RNG.uniform(0.2, 0.8))]])
    centres = np.array(centres)
    sv, sf = icosphere(2)
    depot_r = 0.042
    dw, dc, _, _, _, _ = attributes(centres)
    print("depot border-zone membership:", np.round(tissue(centres)[1], 2))

    # ---- fibre lines --------------------------------------------------------------------
    tri = verts[faces]
    area = 0.5 * np.linalg.norm(np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]), axis=1)
    n_cand = 90_000
    pick = RNG.choice(len(faces), size=n_cand, p=area / area.sum())
    r1, r2 = RNG.random(n_cand), RNG.random(n_cand)
    s1 = np.sqrt(r1)
    cand = (1 - s1)[:, None] * tri[pick, 0] + (s1 * (1 - r2))[:, None] * tri[pick, 1] + (s1 * r2)[:, None] * tri[pick, 2]
    _, _, cf, cs, cb, ckind = attributes(cand)
    kc = klass(ckind)
    # more candidate seeds than lines will be kept, so that select() can fill the gaps
    radius = np.where(kc == 0, 0.0125, np.where(kc == 1, 0.022, 0.020))
    ok = cf > 0.05
    seeds = cand[ok][poisson(cand[ok], radius[ok])]
    kind = np.argmin(parts(seeds), axis=0)
    ks = klass(kind)
    scar_s, _ = tissue(seeds)
    in_scar = (ks == 0) & (scar_s > 0.5)
    n = len(seeds)
    length = np.where(ks == 0, RNG.uniform(0.55, 1.05, n), np.where(ks == 1, RNG.uniform(0.34, 0.62, n), RNG.uniform(0.50, 0.95, n)))
    length = np.where(in_scar, RNG.uniform(0.20, 0.40, n), length)  # scar: short and disordered
    jitter = np.deg2rad(np.where(in_scar, RNG.normal(0, 16.0, n), RNG.normal(0, 1.5, n)))
    pts, live = trace(seeds, length, jitter)
    # spacing between neighbouring lines; scar lines may cross one another
    sep = np.where(ks == 0, 0.0175, np.where(ks == 1, 0.034, 0.029))
    sep = np.where(in_scar, 0.0095, sep)
    kept, live = select(pts, live, sep, [c for c in centres] + [c + 0.02 * g for c, g in zip(centres, gradient(centres))])
    pts, ks = pts[kept], ks[kept]
    # width tapers to nothing at both ends of the live stretch
    first = np.argmax(live, axis=1)
    last = K - 1 - np.argmax(live[:, ::-1], axis=1)
    idx = np.arange(K)[None, :]
    span = np.maximum(last - first, 1)[:, None]
    u_live = np.clip((idx - first[:, None]) / span, 0.0, 1.0)
    width = np.where(live, np.sin(np.pi * u_live) ** 0.5, 0.0)
    # collapse the unused points onto the nearest live one so the ribbon has no stray tail
    for i in range(len(pts)):
        pts[i, : first[i]] = pts[i, first[i]]
        pts[i, last[i] + 1 :] = pts[i, last[i]]
    cls = ks.astype(np.uint8)
    print(f"fibre lines: {len(pts)}  (ventricles {np.sum(cls == 0)}, atria {np.sum(cls == 1)}, vessels {np.sum(cls == 2)})")

    cp, cw, cc, cu, ccont = coronary_lines()
    print(f"coronary pieces: {len(cp)}")
    n_fibre = len(pts)
    all_pts = np.concatenate([pts, cp]).reshape(-1, 3)
    all_w = np.concatenate([width, cw]).reshape(-1)
    all_u = np.concatenate([u_live, cu]).reshape(-1)
    all_cls = np.repeat(np.concatenate([cls, cc.astype(np.uint8)]), K)
    rand = np.repeat(RNG.random(n_fibre + len(cp)), K)

    nrm = gradient(all_pts)
    lw, lc, lf, ls, lb, _ = attributes(all_pts)
    lao = occlusion(all_pts, nrm)
    lifted = all_pts + np.where(all_cls >= 3, 0.0, 0.010)[:, None] * nrm  # arteries were lifted already
    # tangent by central differences along each line
    L = lifted.reshape(-1, K, 3)
    tan = np.zeros_like(L)
    tan[:, 1:-1] = L[:, 2:] - L[:, :-2]
    tan[:, 0] = L[:, 1] - L[:, 0]
    tan[:, -1] = L[:, -1] - L[:, -2]
    # where a line has stopped, reuse the last moving direction so the ribbon does not twist
    lens = np.linalg.norm(tan, axis=2, keepdims=True)
    for i in range(1, K):
        tan[:, i] = np.where(lens[:, i] < 1e-6, tan[:, i - 1], tan[:, i])
    for i in range(K - 2, -1, -1):
        tan[:, i] = np.where(np.linalg.norm(tan[:, i], axis=1, keepdims=True) < 1e-6, tan[:, i + 1], tan[:, i])
    # arteries are cut into pieces; make the direction continuous across the joins
    for j, cont in enumerate(ccont):
        if cont:
            i = n_fibre + j
            t = L[i, 1] - L[i - 1, K - 2]
            tan[i, 0] = t
            tan[i - 1, K - 1] = t
    tan /= np.maximum(np.linalg.norm(tan, axis=2, keepdims=True), 1e-9)
    # no fibre lines across the depots
    near = np.min(np.linalg.norm(lifted[:, None, :] - centres[None], axis=2), axis=1) < depot_r + 0.006
    all_w = np.where(near & (all_cls < 3), 0.0, all_w)

    # ---- write --------------------------------------------------------------------------
    blobs: list[bytes] = []
    header = {
        "lo": LO.tolist(), "hi": HI.tolist(),
        "axis": AXIS.tolist(), "centre": VC.tolist(), "baseH": BASE_H,
        "scarCentre": SCAR_C.tolist(), "depotRadius": depot_r,
        "pointsPerLine": K, "fibreLines": int(n_fibre), "coronaryLines": int(len(cp)),
        "arrays": {},
    }
    offset = 0

    def add(name, arr, kind_, size):
        nonlocal offset
        raw = np.ascontiguousarray(arr).tobytes()
        pad = (-len(raw)) % 4
        header["arrays"][name] = {"type": kind_, "size": size, "offset": offset, "count": int(arr.size // size)}
        blobs.append(raw + b"\0" * pad)
        offset += len(raw) + pad

    add("meshPos", q16(verts), "u16", 3)
    add("meshNrm", i8(normals), "i8", 3)
    add("meshAttr", np.stack([u8(w), u8(contract), u8(fade), u8(scar), u8(bz), u8(ao)], axis=1), "u8", 6)
    add("meshIdx", faces.astype(np.uint16), "u16", 1)
    add("linePos", q16(lifted), "u16", 3)
    add("lineTan", i8(tan.reshape(-1, 3)), "i8", 3)
    add("lineNrm", i8(nrm), "i8", 3)
    # per point: ventricle weight, contractility, fade, scar, border zone, occlusion, width, position along the line
    add("lineAttr", np.stack([u8(lw), u8(lc), u8(lf), u8(ls), u8(lb), u8(lao), u8(all_w), u8(all_u)], axis=1), "u8", 8)
    add("lineClass", np.stack([all_cls, u8(rand)], axis=1), "u8", 2)
    add("depotCentre", q16(centres), "u16", 3)
    add("depotAttr", np.stack([u8(dw), u8(dc)], axis=1), "u8", 2)
    add("sphereVert", sv.astype(np.float32), "f32", 3)
    add("sphereIdx", sf.astype(np.uint16), "u16", 1)

    head = json.dumps(header, separators=(",", ":")).encode()
    head += b" " * ((-len(head)) % 4)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_bytes(struct.pack("<I", len(head)) + head + b"".join(blobs))
    print(f"wrote {OUT.relative_to(ROOT)}  {OUT.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
