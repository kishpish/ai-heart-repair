#!/usr/bin/env python3
"""Build the geometry for the 3D heart drawn in the hero (assets/heart/heart.bin.gz).

Usage:
    python3 tools/build_heart.py [--out PATH]

Writes assets/heart/heart.bin.gz. The file is gzipped because static hosts rarely
compress binary files; js/heart3d.js unpacks it.

Needs numpy and scikit-image (pip install numpy scikit-image).

The heart is an illustration, not patient data. Its shape is built by blending
simple solids (two ventricles, two atria, the great vessels), crossed by the main
coronary arteries. The muscle fibres are not geometry: js/heart3d.js draws them
per pixel as the level lines of a phase that this script prepares for every
vertex, so they stay crisp at any size. The hero plays the heart as a story: a
scarred heart, hydrogel depots injected into the border zone, and the wall
healed and restored, which is the long-term goal the work points toward.

Taken from the paper so the picture says something true about the work:
  - healthy fibres wind at the epicardial helix angle of the rule-based field
    (-60 degrees); scar collagen runs circumferentially and the border zone at
    half the healthy angle (Section 2.7)
  - scar develops no active tension and the border zone 0.67 of remote (Section 2.11)
  - nine depots sit at mid-wall in the border zone, clear of the core scar (Fig. 4),
    each an ellipsoid whose long axis lies in the wall (Section 2.14)
  - the infarct lies downstream of a blocked coronary artery (Section 1.1)
  - scar is thinner than healthy wall (Table 2), so it sits a little lower
Only the fibres on the ventricles follow the paper; those on the atria are decorative.

Output layout: uint32 length of a JSON header, the header (padded to 4 bytes),
then the typed arrays the header describes. js/heart3d.js reads it.
"""
from __future__ import annotations

import argparse
import gzip
import json
import struct
from pathlib import Path

import numpy as np
from skimage import measure

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "heart" / "heart.bin.gz"
RNG = np.random.default_rng(7)

STEP = 0.027  # marching-cubes grid spacing
LO = np.array([-1.40, -1.50, -1.00])
HI = np.array([1.50, 2.10, 0.90])
N_FIBRES = 152  # fibres around the long axis; a multiple of 8, so the pattern closes on itself at every level of detail
HELIX = np.deg2rad(60.0)  # epicardial helix angle (magnitude), Section 2.7

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
    # a tighter blend than before leaves a visible groove between the two ventricles
    d = smin(lv, rv, 0.075)
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

SEGMENTS = []
for _name, (_pts, _radii) in VESSELS.items():
    for _i in range(len(_pts) - 1):
        SEGMENTS.append((np.array(_pts[_i]), np.array(_pts[_i + 1]), _radii[_i], _radii[_i + 1]))


def parts(p):
    """Distance to every component, shape (n_components, N): ventricles, two atria, vessel segments."""
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
SCAR_N = gradient(SCAR_C[None])[0]
SCAR_R, BZ_W = 0.265, 0.115
# a frame on the wall at the scar centre: V along the long axis, U around the heart
SCAR_V = AXIS - (AXIS @ SCAR_N) * SCAR_N
SCAR_V /= np.linalg.norm(SCAR_V)
SCAR_U = np.cross(SCAR_V, SCAR_N)


def scar_radius(p):
    """Distance from the scar centre in units of the outer border-zone radius. The outline is
    lobed and stretched toward the apex, so the scar does not read as a perfect oval."""
    q = p - SCAR_C
    u, v, w = q @ SCAR_U, q @ SCAR_V, q @ SCAR_N
    v = np.where(v < 0.0, v / 1.18, v / 1.02)
    ang = np.arctan2(v, u)
    lobes = 1.0 + 0.045 * np.sin(2 * ang + 1.7) + 0.05 * np.sin(3 * ang + 0.9) + 0.03 * np.sin(5 * ang + 2.6)
    wob = 0.02 * np.sin(9.0 * q[:, 0] + 1.3) * np.cos(8.0 * q[:, 1] - 0.4) + 0.015 * np.sin(13.0 * q[:, 2] + 11.0 * q[:, 1])
    return (np.sqrt(u * u + v * v + w * w) * lobes + wob) / (SCAR_R + BZ_W)


def tissue(p):
    """Scar and border-zone membership, each 0..1."""
    r = scar_radius(p) * (SCAR_R + BZ_W)
    scar = 1.0 - smoothstep(SCAR_R - 0.025, SCAR_R + 0.025, r)
    outer = 1.0 - smoothstep(SCAR_R + BZ_W - 0.025, SCAR_R + BZ_W + 0.025, r)
    return scar, np.maximum(outer - scar, 0.0)


def attributes(p):
    """Per point: ventricle weight (for motion), contractility, fade, and shading weights for atria and vessels."""
    d = parts(p)
    w = 1.0 - smoothstep(0.0, 0.30, d[0])
    scar, bz = tissue(p)
    on_vent = 1.0 - smoothstep(0.0, 0.05, d[0])
    scar, bz = scar * on_vent, bz * on_vent
    contract = 1.0 - scar - 0.33 * bz  # scar 0, border zone 0.67, remote 1
    # vessels dissolve with distance from the heart; the ventricles never fade
    m = np.linalg.norm((p - FADE_C) / np.array([0.95, 1.12, 1.0]), axis=1)
    fade = np.maximum(1.0 - smoothstep(0.98, 1.42, m), w)
    # which kind of tissue a point shows: a soft choice between the closest groups
    groups = np.stack([d[0], np.minimum(d[1], d[2]), d[3:].min(axis=0)])
    e = np.exp(-(groups - groups.min(axis=0)) / 0.018)
    e /= e.sum(axis=0)
    return w, contract, fade, e[1], e[2]


def u8(x):
    return np.clip(np.round(np.asarray(x) * 255.0), 0, 255).astype(np.uint8)


def i16(x):
    return np.clip(np.round(x * 32767.0), -32767, 32767).astype(np.int16)


def q16(p):
    return np.clip(np.round((p - LO) / (HI - LO) * 65535.0), 0, 65535).astype(np.uint16)


def occlusion(p, n):
    """Cheap ambient occlusion from the distance field: 1 in the open, lower in creases."""
    acc = np.zeros(len(p))
    for d, wgt in ((0.05, 0.50), (0.11, 0.27), (0.20, 0.15), (0.32, 0.08)):
        acc += wgt * np.clip((d - field(p + d * n)) / d, 0.0, 1.0)
    return np.clip(1.0 - 1.35 * acc, 0.0, 1.0)


# --- the fibre phase -------------------------------------------------------------------
# On the ventricles the fibres are the level lines of  phi = N * theta + G(h),  with theta the
# angle around the long axis and h the height along it. G is chosen so that the lines cross
# the circumferential direction at the epicardial helix angle on the wall around the infarct.
def lv_coords(p):
    q = p - VC
    return q @ EX, q @ AXIS, q @ EZ


def helix_table(verts, wv):
    x, h, z = lv_coords(verts)
    r = np.hypot(x, z)
    theta = np.arctan2(z, x)
    _, _, sz = lv_coords(SCAR_C[None])
    th_s = np.arctan2(sz[0], lv_coords(SCAR_C[None])[0][0])
    near = np.abs((theta - th_s + np.pi) % (2 * np.pi) - np.pi) < np.deg2rad(45)
    sel = (wv > 0.9) & near
    hs, rs = h[sel], r[sel]
    edges = np.linspace(hs.min(), hs.max(), 90)
    mids = 0.5 * (edges[1:] + edges[:-1])
    prof = np.full(len(mids), np.nan)
    for i in range(len(mids)):
        m = (hs >= edges[i]) & (hs < edges[i + 1])
        if m.sum() > 4:
            prof[i] = np.median(rs[m])
    ok = ~np.isnan(prof)
    prof = np.interp(mids, mids[ok], prof[ok])
    prof = np.convolve(np.pad(prof, 3, mode="edge"), np.ones(7) / 7, mode="valid")
    table_h = np.linspace(h.min() - 0.05, h.max() + 0.05, 1200)
    rad = np.maximum(np.interp(table_h, mids, prof), 0.045)
    dsdh = np.sqrt(1.0 + np.gradient(rad, table_h) ** 2)
    # along a fibre at the helix angle: dtheta / ds = cot(helix) / r. Integrated from the top down.
    dG = N_FIBRES * dsdh / (rad * np.tan(HELIX))
    G = np.concatenate([[0.0], np.cumsum(0.5 * (dG[1:] + dG[:-1]) * np.diff(table_h))])
    G = G[-1] - G  # G = integral from h to the top
    return table_h, G


def phase(p, table):
    x, h, z = lv_coords(p)
    return N_FIBRES * np.arctan2(z, x) + np.interp(h, *table)


def twirl_offset(verts, table):
    """Phase offset that turns the fibres around the infarct to half the healthy helix angle.

    The healthy pattern is rotated about the scar centre, within the plane of the wall, by 30
    degrees across the border zone (and the scar, where scar collagen is drawn instead), easing
    to no rotation a little outside it, so the fibres bend smoothly around the infarct.
    """
    rn = scar_radius(verts)
    psi = HELIX / 2 * (1.0 - smoothstep(0.98, 1.30, rn))
    v = verts - SCAR_C
    a = -psi
    k = SCAR_N
    src = SCAR_C + v * np.cos(a)[:, None] + np.cross(k, v) * np.sin(a)[:, None] + k[None] * (v @ k)[:, None] * (1 - np.cos(a))[:, None]
    x0, h0, z0 = lv_coords(verts)
    x1, h1, z1 = lv_coords(src)
    dth = (np.arctan2(z1, x1) - np.arctan2(z0, x0) + np.pi) % (2 * np.pi) - np.pi
    out = N_FIBRES * dth + np.interp(h1, *table) - np.interp(h0, *table)
    return np.where(psi > 1e-6, out, 0.0)


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
# name: (control points, radius factor at start, at end, blocked?)
CORONARIES = {
    "lad": ([(107, 0.34), (105, 0.18), (102, -0.05), (98, -0.32), (94, -0.60), (89, -0.84), (84, -1.00)], 1.00, 0.45, False),
    "diagonal": ([(105, 0.20), (92, 0.14), (76, 0.09), (61, 0.03)], 0.72, 0.60, False),
    "diagonal-blocked": ([(61, 0.03), (55, -0.12), (50, -0.28), (47, -0.45), (45, -0.60)], 0.62, 0.42, True),
    "septal": ([(104, 0.02), (117, -0.10), (130, -0.26), (139, -0.40)], 0.55, 0.32, False),
    "circumflex": ([(104, 0.46), (84, 0.49), (58, 0.47), (30, 0.45), (2, 0.44), (-24, 0.42)], 0.90, 0.50, False),
    "marginal": ([(22, 0.45), (15, 0.26), (9, 0.08), (4, -0.10)], 0.60, 0.32, False),
    "rca": ([(116, 0.47), (138, 0.48), (162, 0.47), (186, 0.45), (210, 0.44), (232, 0.43)], 0.90, 0.50, False),
    "acute": ([(166, 0.46), (161, 0.22), (153, -0.02), (144, -0.26)], 0.60, 0.32, False),
}
ARTERY_R = 0.0165  # radius of an artery with factor 1


def coronary_tubes():
    """Each artery as a closed tube lying half sunk in the wall. Returns vertices, normals,
    the point on the wall each vertex belongs to, position along the artery, blocked flag, faces."""
    M = 8
    V, Nrm, Wall, U, B, F = [], [], [], [], [], []
    count = 0
    for ctrl, r0, r1, blocked in CORONARIES.values():
        ctrl = np.array(ctrl, float)
        rough = on_ventricle(ctrl[:, 0], ctrl[:, 1])
        length = np.sum(np.linalg.norm(np.diff(rough, axis=0), axis=1))
        n = max(16, int(length / 0.013))
        path = catmull(ctrl, n)
        pts = on_ventricle(path[:, 0], path[:, 1])
        for _ in range(4):
            pts[1:-1] = 0.25 * pts[:-2] + 0.5 * pts[1:-1] + 0.25 * pts[2:]
        pts = project(pts, iters=4)
        nrm = gradient(pts)
        seg = np.linalg.norm(np.diff(pts, axis=0), axis=1)
        along = np.concatenate([[0.0], np.cumsum(seg)]) / max(seg.sum(), 1e-9)
        radius = ARTERY_R * (r0 + (r1 - r0) * along)
        dist = along * seg.sum()
        # round off both ends
        radius *= np.sqrt(np.clip(np.minimum(dist / 0.012, (seg.sum() - dist) / 0.05), 0.0, 1.0))
        tan = np.gradient(pts, axis=0)
        tan /= np.maximum(np.linalg.norm(tan, axis=1, keepdims=True), 1e-9)
        side = np.cross(tan, nrm)
        side /= np.maximum(np.linalg.norm(side, axis=1, keepdims=True), 1e-9)
        up = np.cross(side, tan)
        centre = pts + up * (radius * 0.35)[:, None]
        for i in range(len(pts)):
            for j in range(M):
                a = 2 * np.pi * j / M
                d = np.cos(a) * up[i] + np.sin(a) * side[i]
                V.append(centre[i] + radius[i] * d)
                Nrm.append(d)
                Wall.append(pts[i])
                U.append(along[i])
                B.append(blocked)
        for i in range(len(pts) - 1):
            for j in range(M):
                a = count + i * M + j
                b = count + i * M + (j + 1) % M
                F.append((a, b, a + M))
                F.append((b, b + M, a + M))
        count += len(pts) * M
    return np.array(V), np.array(Nrm), np.array(Wall), np.array(U), np.array(B), np.array(F)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=OUT)
    out_path = ap.parse_args().out

    # ---- surface mesh -------------------------------------------------------------------
    axes = [np.arange(LO[i], HI[i] + STEP, STEP) for i in range(3)]
    gx, gy, gz = np.meshgrid(*axes, indexing="ij")
    grid = np.stack([gx, gy, gz], axis=-1).reshape(-1, 3)
    vol = np.concatenate([field(chunk) for chunk in np.array_split(grid, 60)]).reshape(gx.shape)
    verts, faces, _, _ = measure.marching_cubes(vol, level=0.0, spacing=(STEP, STEP, STEP))
    verts = project(verts + LO, iters=2)
    normals = gradient(verts)
    w, contract, fade, w_atrium, w_vessel = attributes(verts)
    # drop triangles that have completely faded out
    alive = fade[faces].max(axis=1) > 0.004
    faces = faces[alive]
    used = np.unique(faces)
    remap = -np.ones(len(verts), dtype=np.int64)
    remap[used] = np.arange(len(used))
    verts, normals = verts[used], normals[used]
    w, contract, fade, w_atrium, w_vessel = w[used], contract[used], fade[used], w_atrium[used], w_vessel[used]
    faces = remap[faces]
    ao = occlusion(verts, normals)
    rn_mesh = scar_radius(verts)
    w_vent = np.clip(1.0 - w_atrium - w_vessel, 0, 1)
    table = helix_table(verts, w_vent)
    g_phase = np.interp(lv_coords(verts)[1], *table)
    twirl = twirl_offset(verts, table)
    print(f"mesh: {len(verts)} vertices, {len(faces)} triangles; G up to {g_phase.max():.0f}, twirl offset up to {np.abs(twirl).max():.0f} radians")

    # ---- coronary arteries ----------------------------------------------------------------
    tv, tn, twall, tu, tb, tf = coronary_tubes()
    aw, ac, af, _, _ = attributes(twall)
    a_ao = occlusion(twall, gradient(twall))
    a_rn = scar_radius(twall)
    print(f"arteries: {len(tv)} vertices, {len(tf)} triangles")

    # ---- gel depots: nine, in the middle of the border zone, clear of the scar ---------
    ang = np.linspace(0, 2 * np.pi, 9, endpoint=False) + 0.35 + RNG.normal(0, 0.06, 9)
    entries = []
    for a_ in ang:
        radii = np.linspace(SCAR_R - 0.10, SCAR_R + BZ_W + 0.35, 160)
        ray = project(SCAR_C + radii[:, None] * (np.cos(a_) * SCAR_U + np.sin(a_) * SCAR_V) + 0.12 * SCAR_N, iters=10)
        inside = np.flatnonzero(tissue(ray)[1] > 0.97)
        # spread the depots across the width of the band instead of along one circle
        entries.append(ray[inside[int(len(inside) * RNG.uniform(0.25, 0.75))]])
    entries = np.array(entries)
    # visit them in order around the scar, starting at the top
    order = np.argsort(-((entries - SCAR_C) @ SCAR_V))
    first = order[0]
    angle = np.arctan2((entries - SCAR_C) @ SCAR_V, (entries - SCAR_C) @ SCAR_U)
    order = np.argsort((angle - angle[first]) % (2 * np.pi))
    entries = entries[order]
    dn = gradient(entries)
    # long axis in the wall, along the border-zone fibres with some scatter (Section 2.14)
    base_dir = []
    for p_, n_ in zip(entries, dn):
        e = 1e-3
        t1 = np.cross(AXIS, n_)
        t1 /= np.linalg.norm(t1)
        # direction of a fibre: along the level line of the twirled phase
        offs = np.array([p_ + e * t1, p_ - e * t1, p_ + e * np.cross(n_, t1), p_ - e * np.cross(n_, t1)])
        ph = phase(offs, table) + twirl_offset(offs, table)
        g = (ph[0] - ph[1]) / (2 * e) * t1 + (ph[2] - ph[3]) / (2 * e) * np.cross(n_, t1)
        f_dir = np.cross(n_, g)
        base_dir.append(f_dir / np.linalg.norm(f_dir))
    base_dir = np.array(base_dir)
    tilt = np.deg2rad(RNG.normal(0, 14, 9))
    long_ax = np.cos(tilt)[:, None] * base_dir + np.sin(tilt)[:, None] * np.cross(dn, base_dir)
    short_ax = np.cross(dn, long_ax)
    semi = np.array([0.080, 0.040])
    dw, dc, _, _, _ = attributes(entries)
    print("depot border-zone membership:", np.round(tissue(entries)[1], 2))

    # ---- write --------------------------------------------------------------------------
    n_mesh = len(verts)
    all_v = np.concatenate([verts, tv])
    all_n = np.concatenate([normals, tn])
    kind = np.concatenate([np.zeros(n_mesh), np.where(tb, 2, 1)])
    attr = np.stack([
        np.concatenate([w, aw]),
        np.concatenate([contract, ac]),
        np.concatenate([fade, af]),
        np.clip(np.concatenate([rn_mesh, a_rn]) / 2.0, 0, 1),
        np.concatenate([ao, a_ao]),
        np.concatenate([w_atrium, tu]),
        np.concatenate([w_vessel, np.zeros(len(tv))]),
        kind / 255.0,
    ], axis=1)
    tw = np.concatenate([twirl, np.zeros(len(tv))])
    tw_scale = float(np.abs(tw).max()) / 32767.0
    all_f = np.concatenate([faces, tf + n_mesh])
    assert len(all_v) < 65536, len(all_v)

    blobs: list[bytes] = []
    header = {
        "lo": LO.tolist(), "hi": HI.tolist(),
        "axis": AXIS.tolist(), "ex": EX.tolist(), "ez": EZ.tolist(), "centre": VC.tolist(), "baseH": BASE_H,
        "fibres": N_FIBRES,
        # G(h) sampled evenly along the long axis, and the scale of the stored infarct offsets
        "helix": {"h0": float(table[0][0]), "step": float(table[0][2] - table[0][0]), "g": [round(float(g), 3) for g in table[1][::2]]},
        "twirlScale": tw_scale,
        "scar": {"centre": SCAR_C.tolist(), "normal": SCAR_N.tolist(), "u": SCAR_U.tolist(), "v": SCAR_V.tolist()},
        "depots": {
            "entry": entries.tolist(), "normal": dn.tolist(),
            "long": (long_ax / semi[0]).tolist(), "short": (short_ax / semi[1]).tolist(),
            "contract": dc.tolist(), "rn": scar_radius(entries).tolist(),
        },
        "meshTriangles": int(len(faces)), "arteryTriangles": int(len(tf)),
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

    add("pos", q16(all_v), "u16", 3)
    add("nrm", i16(all_n), "i16", 3)
    # per vertex: ventricle weight, contractility, fade, distance from the scar centre (0..2 mapped
    # to 0..1), occlusion, atrium weight (position along an artery), vessel weight, kind
    # (0 wall, 1 artery, 2 blocked artery)
    add("attr", u8(attr), "u8", 8)
    # per vertex: the extra fibre phase that turns the fibres around the infarct (times twirlScale)
    add("twirl", np.round(tw / max(tw_scale, 1e-12)).astype(np.int16), "i16", 1)
    add("idx", all_f.astype(np.uint16), "u16", 1)

    head = json.dumps(header, separators=(",", ":")).encode()
    head += b" " * ((-len(head)) % 4)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    raw = struct.pack("<I", len(head)) + head + b"".join(blobs)
    out_path.write_bytes(gzip.compress(raw, 9, mtime=0))
    print(f"wrote {out_path}  {out_path.stat().st_size / 1024:.0f} KB ({len(raw) / 1024:.0f} KB unpacked)")


if __name__ == "__main__":
    main()
