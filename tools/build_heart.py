#!/usr/bin/env python3
"""Build the geometry for the 3D heart drawn in the hero (assets/heart/heart.bin).

Usage:
    python3 tools/build_heart.py

Needs numpy, scipy and scikit-image (pip install numpy scipy scikit-image).

The heart is an illustration, not patient data. Its shape is a smooth blend of
simple solids (two ventricles, two atria, the great vessels) with the main
coronary arteries laid over it as tubes. The hero animates it in three stages:
a scarred heart, hydrogel depots injected into the border zone, and the wall
healed and restored, which is the long-term goal the work points toward.

Three things are taken from the paper so the picture says something true:
  - scar develops no active tension and the border zone 0.67 of remote (Section 2.11)
  - nine gel depots sit in the border zone, clear of the scar (Fig. 4)
  - the surface sheen follows the epicardial helix angle of the rule-based fibre
    field (-60 degrees; circumferential in scar, halved in the border zone; Section 2.7)

Output layout: uint32 length of a JSON header, the header (padded to 4 bytes),
then the typed arrays the header describes. js/heart3d.js reads it.
"""
from __future__ import annotations

import json
import struct
from pathlib import Path

import numpy as np
from scipy import sparse
from skimage import measure

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "heart" / "heart.bin"
RNG = np.random.default_rng(7)

STEP = 0.0285  # marching-cubes grid spacing
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
    d = smin(lv, rv, 0.085)
    return smax(d, l[..., 1] - BASE_H, 0.15), lv, rv


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
    body = smin(smin(d[0], d[1], 0.13), d[2], 0.13)
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
    fade = np.maximum(1.0 - smoothstep(0.86, 1.30, m), w)
    return w, contract, fade, scar, bz, kind


def u8(x):
    return np.clip(np.round(x * 255.0), 0, 255).astype(np.uint8)


def i8(x):
    return np.clip(np.round(x * 127.0), -127, 127).astype(np.int8)


def q16(p):
    return np.clip(np.round((p - LO) / (HI - LO) * 65535.0), 0, 65535).astype(np.uint16)


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


def i16(x):
    return np.clip(np.round(x * 32767.0), -32767, 32767).astype(np.int16)


def taubin(verts, faces, iters=12, lam=0.5, mu=-0.53):
    """Even out the marching-cubes triangles without shrinking the shape."""
    n = len(verts)
    i = np.concatenate([faces[:, 0], faces[:, 1], faces[:, 2], faces[:, 1], faces[:, 2], faces[:, 0]])
    j = np.concatenate([faces[:, 1], faces[:, 2], faces[:, 0], faces[:, 0], faces[:, 1], faces[:, 2]])
    A = sparse.coo_matrix((np.ones(len(i)), (i, j)), shape=(n, n)).tocsr()
    A.data[:] = 1.0
    deg = np.asarray(A.sum(axis=1)).ravel()
    W = sparse.diags(1.0 / np.maximum(deg, 1)) @ A
    v = verts.copy()
    for _ in range(iters):
        v = v + lam * (W @ v - v)
        v = v + mu * (W @ v - v)
    return v


def scar_radius(p):
    """Distance from the scar centre, with the same irregular edge as tissue(), in units of the outer border-zone radius."""
    q = p - SCAR_C
    r = np.linalg.norm(q, axis=1)
    wob = 0.035 * np.sin(9.0 * q[:, 0] + 1.3) * np.cos(8.0 * q[:, 1] - 0.4) + 0.025 * np.sin(13.0 * q[:, 2] + 11.0 * q[:, 1])
    return (r + wob) / (SCAR_R + BZ_W)


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
# name: (control points, width at start, width at end, fraction of the length after which it is blocked, or False)
CORONARIES = {
    "lad": ([(107, 0.34), (105, 0.18), (102, -0.05), (98, -0.32), (94, -0.60), (89, -0.84), (84, -1.00)], 1.00, 0.45, False),
    # the branch that feeds the infarct; past the blockage (from 45% of its length) it is drawn darker
    "diagonal": ([(105, 0.20), (92, 0.14), (76, 0.09), (62, 0.02), (54, -0.12), (49, -0.30), (46, -0.47), (45, -0.60)], 0.78, 0.42, 0.45),
    "septal": ([(104, 0.02), (117, -0.10), (130, -0.26), (139, -0.40)], 0.55, 0.32, False),
    "circumflex": ([(104, 0.46), (84, 0.49), (58, 0.47), (30, 0.45), (2, 0.44), (-24, 0.42)], 0.90, 0.50, False),
    "marginal": ([(22, 0.45), (15, 0.26), (9, 0.08), (4, -0.10)], 0.60, 0.32, False),
    "rca": ([(116, 0.47), (138, 0.48), (162, 0.47), (186, 0.45), (210, 0.44), (232, 0.43)], 0.90, 0.50, False),
    "acute": ([(166, 0.46), (161, 0.22), (153, -0.02), (144, -0.26)], 0.60, 0.32, False),
}


def coronary_tubes(sides=12):
    """The coronary arteries as smooth tubes half sunk into the surface."""
    V, N, P, R, F, B = [], [], [], [], [], []
    base = 0
    for ctrl, w0, w1, blocked in CORONARIES.values():
        ctrl = np.array(ctrl, float)
        rough = on_ventricle(ctrl[:, 0], ctrl[:, 1])
        length = np.sum(np.linalg.norm(np.diff(rough, axis=0), axis=1))
        n = max(8, int(length / 0.018))
        path = catmull(ctrl, n)
        c = on_ventricle(path[:, 0], path[:, 1])
        # smooth the centreline a little, then put it back on the surface
        for _ in range(3):
            c[1:-1] = 0.25 * c[:-2] + 0.5 * c[1:-1] + 0.25 * c[2:]
        c = project(c, iters=3)
        nrm = gradient(c)
        along = np.linspace(0.0, 1.0, len(c))
        radius = 0.024 * (w0 + (w1 - w0) * along)
        radius *= np.minimum(1.0, np.minimum(along, 1.0 - along) / 0.06 + 0.35)  # rounded ends
        centre = c + 0.35 * radius[:, None] * nrm
        tan = np.gradient(centre, axis=0)
        tan /= np.linalg.norm(tan, axis=1, keepdims=True)
        side = np.cross(tan, nrm)
        side /= np.linalg.norm(side, axis=1, keepdims=True)
        up = np.cross(side, tan)
        ang = np.linspace(0, 2 * np.pi, sides, endpoint=False)
        for k in range(len(c)):
            ring_n = np.cos(ang)[:, None] * side[k] + np.sin(ang)[:, None] * up[k]
            V.append(centre[k] + radius[k] * ring_n)
            N.append(ring_n)
            P.append(np.repeat(c[k][None], sides, axis=0))
            B.append(np.full(sides, float(smoothstep(blocked - 0.02, blocked + 0.02, along[k])) if blocked is not False else 0.0))
        for k in range(len(c) - 1):
            for s_ in range(sides):
                a = base + k * sides + s_
                b = base + k * sides + (s_ + 1) % sides
                F.append([a, a + sides, b])
                F.append([b, a + sides, b + sides])
        base += len(c) * sides
    return np.concatenate(V), np.concatenate(N), np.concatenate(P), np.array(F), np.concatenate(B)


def main() -> None:
    # ---- surface mesh -------------------------------------------------------------------
    axes = [np.arange(LO[i], HI[i] + STEP, STEP) for i in range(3)]
    gx, gy, gz = np.meshgrid(*axes, indexing="ij")
    grid = np.stack([gx, gy, gz], axis=-1).reshape(-1, 3)
    vol = np.concatenate([field(chunk) for chunk in np.array_split(grid, 60)]).reshape(gx.shape)
    verts, faces, _, _ = measure.marching_cubes(vol, level=0.0, spacing=(STEP, STEP, STEP))
    verts = verts + LO
    _, _, fade0, _, _, _ = attributes(verts)
    alive = fade0[faces].max(axis=1) > 0.004
    faces = faces[alive]
    used = np.unique(faces)
    remap = -np.ones(len(verts), dtype=np.int64)
    remap[used] = np.arange(len(used))
    verts, faces = verts[used], remap[faces]
    verts = project(taubin(verts, faces), iters=3)
    normals = gradient(verts)
    w, contract, fade, scar, bz, kind = attributes(verts)
    ao = occlusion(verts, normals)
    rn = scar_radius(verts)
    # the sheen uses the healthy fibre field everywhere, so the restored wall reads as one surface
    axis_ = np.array([c[2] for c in COMPONENTS])[kind]
    circ = np.cross(axis_, normals)
    circ /= np.maximum(np.linalg.norm(circ, axis=1, keepdims=True), 1e-9)
    longi = np.cross(normals, circ)
    a_ = np.where(klass(kind) == 0, np.deg2rad(-60.0), 0.0)
    fib = np.cos(a_)[:, None] * circ + np.sin(a_)[:, None] * longi
    mat = np.where(klass(kind) == 0, 0, 1)
    print(f"surface: {len(verts)} vertices, {len(faces)} triangles")

    # ---- coronary arteries --------------------------------------------------------------
    tv, tn, tp, tf, tb = coronary_tubes()
    t_w, t_c, t_fade, t_s, t_b, _ = attributes(tp)
    t_ao = np.clip(occlusion(tp, gradient(tp)) + 0.25, 0, 1)
    t_rn = scar_radius(tp)
    t_tan = np.gradient(tp.reshape(-1, 12, 3)[:, 0], axis=0)
    t_tan = np.repeat(t_tan / np.maximum(np.linalg.norm(t_tan, axis=1, keepdims=True), 1e-9), 12, axis=0)
    print(f"arteries: {len(tv)} vertices, {len(tf)} triangles")

    V = np.concatenate([verts, tv])
    Nn = np.concatenate([normals, tn])
    T = np.concatenate([fib, t_tan])
    F = np.concatenate([faces, tf + len(verts)])
    attr = np.stack([
        np.concatenate([w, t_w]),
        np.concatenate([contract, t_c]),
        np.concatenate([fade, t_fade]),
        np.concatenate([scar, np.zeros(len(tv))]),
        np.concatenate([bz, np.zeros(len(tv))]),
        np.concatenate([ao, t_ao]),
        np.concatenate([np.clip(rn / 2.0, 0, 1), np.clip(t_rn / 2.0, 0, 1)]),
        np.concatenate([1.0 - smoothstep(0.0, 0.05, parts(verts)[0]), tb]),
    ], axis=1)
    matc = np.concatenate([mat, np.full(len(tv), 2)]).astype(np.uint8)
    assert len(V) < 65536, len(V)

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
        centres.append(ray[inside[int(len(inside) * RNG.uniform(0.2, 0.8))]])
    centres = np.array(centres)
    centres -= 0.016 * gradient(centres)
    sv, sf = icosphere(3)
    depot_r = 0.040
    dw, dc, _, _, _, _ = attributes(centres)
    print("depot border-zone membership:", np.round(tissue(centres)[1], 2))

    # ---- write --------------------------------------------------------------------------
    blobs: list[bytes] = []
    header = {
        "lo": LO.tolist(), "hi": HI.tolist(),
        "axis": AXIS.tolist(), "centre": VC.tolist(), "baseH": BASE_H,
        "scarCentre": SCAR_C.tolist(), "depotRadius": depot_r,
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

    add("pos", q16(V), "u16", 3)
    add("nrm", i16(Nn), "i16", 3)
    add("tan", np.concatenate([i8(T), matc[:, None].astype(np.int8)], axis=1), "i8", 4)
    # per vertex: ventricle weight, contractility, fade, scar, border zone, occlusion,
    # distance from the scar centre (0..2 mapped to 0..1), and on the surface how much the
    # point lies on the ventricles (on the arteries: whether this is the blocked branch)
    add("attr", np.concatenate([u8(attr[:, :7]), u8(attr[:, 7:8])], axis=1), "u8", 8)
    add("idx", F.astype(np.uint16), "u16", 1)
    add("depotCentre", q16(centres), "u16", 3)
    add("depotAttr", np.stack([u8(dw), u8(dc)], axis=1), "u8", 2)
    add("sphereVert", sv.astype(np.float32), "f32", 3)
    add("sphereIdx", sf.astype(np.uint16), "u16", 1)

    head_ = json.dumps(header, separators=(",", ":")).encode()
    head_ += b" " * ((-len(head_)) % 4)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_bytes(struct.pack("<I", len(head_)) + head_ + b"".join(blobs))
    print(f"wrote {OUT.relative_to(ROOT)}  {OUT.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
