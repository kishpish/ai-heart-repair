#!/usr/bin/env python3
"""Build the geometry for the 3D heart drawn in the hero (assets/heart/heart.bin).

Usage:
    python3 tools/build_heart.py

Needs numpy and scikit-image (pip install numpy scikit-image).

The heart is an illustration, not patient data. Its shape is a smooth blend of
simple solids (two ventricles, two atria, the great vessels). Three things are
taken from the paper so the picture says something true about the work:
  - fibre strokes wind around the ventricles at the epicardial helix angle of the
    rule-based fibre field (-60 degrees; circumferential in scar, halved in the
    border zone; Section 2.7)
  - scar develops no active tension and the border zone 0.67 of remote (Section 2.11)
  - nine gel depots sit in the border zone, clear of the scar (Fig. 4)

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

STEP = 0.032  # marching-cubes grid spacing
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
    d = smin(lv, rv, 0.16)
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
    "rpa": ([(0.21, 1.02, 0.07), (-0.22, 0.99, -0.26), (-0.72, 0.98, -0.56), (-1.30, 0.98, -0.95)], [0.115, 0.105, 0.095, 0.090]),
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
    print(f"mesh: {len(verts)} vertices, {len(faces)} triangles")

    # ---- fibre strokes ------------------------------------------------------------------
    tri = verts[faces]
    area = 0.5 * np.linalg.norm(np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]), axis=1)
    n_cand = 140_000
    pick = RNG.choice(len(faces), size=n_cand, p=area / area.sum())
    r1, r2 = RNG.random(n_cand), RNG.random(n_cand)
    s1 = np.sqrt(r1)
    cand = (1 - s1)[:, None] * tri[pick, 0] + (s1 * (1 - r2))[:, None] * tri[pick, 1] + (s1 * r2)[:, None] * tri[pick, 2]
    cw, cc, cf, cs, cb, ckind = attributes(cand)
    is_vent = ckind == 0
    is_atrium = (ckind == 1) | (ckind == 2)
    radius = np.where(is_vent, 0.0215, np.where(is_atrium, 0.034, 0.036))
    radius = np.where((cs + cb) > 0.5, 0.0190, radius)  # the infarct is drawn a little denser
    cand_ok = cf > 0.03
    keep = poisson(cand[cand_ok], radius[cand_ok])
    P = cand[cand_ok][keep]
    pw, pc, pf, ps, pb, pkind = attributes(P)
    N = gradient(P)
    is_vent = pkind == 0

    comp_axis = np.array([c[2] for c in COMPONENTS])[pkind]
    circ = np.cross(comp_axis, N)
    circ /= np.maximum(np.linalg.norm(circ, axis=1, keepdims=True), 1e-9)
    longi = np.cross(N, circ)
    # epicardial helix angle: -60 degrees remote, halved in the border zone, 0 in scar
    alpha = np.deg2rad(-60.0) * (1.0 - ps) * (1.0 - 0.5 * pb)
    is_vessel = pkind >= 3
    # muscle is hatched along its fibres, atria around their girth, vessels along their length
    alpha = np.where(is_vent, alpha + np.deg2rad(RNG.normal(0, 3.0, len(P))), np.where(is_vessel, np.pi / 2, 0.0) + np.deg2rad(RNG.normal(0, 3.0, len(P))))
    D = np.cos(alpha)[:, None] * circ + np.sin(alpha)[:, None] * longi
    half = np.where(is_vent, 0.056, np.where(is_vessel, 0.060, 0.044)) * (0.75 + 0.5 * RNG.random(len(P)))
    lift = 0.011
    p0 = project(P - half[:, None] * D, iters=3)
    p1 = project(P + half[:, None] * D, iters=3)
    p0 += lift * gradient(p0)
    p1 += lift * gradient(p1)
    tag = np.where(ps > 0.5, 2, np.where(pb > 0.5, 1, np.where(is_vent, 0, 3))).astype(np.uint8)
    print(f"strokes: {len(P)}  (remote {np.sum(tag == 0)}, border zone {np.sum(tag == 1)}, scar {np.sum(tag == 2)}, other {np.sum(tag == 3)})")

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
    # no strokes across the depots
    mid = 0.5 * (p0 + p1)
    clear = np.min(np.linalg.norm(mid[:, None, :] - centres[None], axis=2), axis=1) > depot_r + 0.022
    p0, p1, N, pw, pc, pf, tag = p0[clear], p1[clear], N[clear], pw[clear], pc[clear], pf[clear], tag[clear]
    P = P[clear]

    # ---- write --------------------------------------------------------------------------
    blobs: list[bytes] = []
    header = {
        "lo": LO.tolist(), "hi": HI.tolist(),
        "axis": AXIS.tolist(), "centre": VC.tolist(), "baseH": BASE_H,
        "scarCentre": SCAR_C.tolist(), "depotRadius": depot_r,
        "arrays": {},
    }
    offset = 0

    def add(name, arr, kind, size):
        nonlocal offset
        raw = np.ascontiguousarray(arr).tobytes()
        pad = (-len(raw)) % 4
        header["arrays"][name] = {"type": kind, "size": size, "offset": offset, "count": int(arr.size // size)}
        blobs.append(raw + b"\0" * pad)
        offset += len(raw) + pad

    add("meshPos", q16(verts), "u16", 3)
    add("meshNrm", i8(normals), "i8", 3)
    add("meshAttr", np.stack([u8(w), u8(contract), u8(fade), u8(scar), u8(bz), np.zeros(len(verts), np.uint8)], axis=1), "u8", 6)
    add("meshIdx", faces.astype(np.uint16), "u16", 1)
    add("strokeP0", q16(p0), "u16", 3)
    add("strokeP1", q16(p1), "u16", 3)
    add("strokeNrm", i8(N), "i8", 3)
    add("strokeAttr", np.stack([u8(pw), u8(pc), u8(pf), tag, u8(RNG.random(len(P)))], axis=1), "u8", 5)
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
