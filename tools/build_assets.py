#!/usr/bin/env python3
"""Rebuild the site's image assets from the source PDFs.

Usage:
    python3 tools/build_assets.py                  # everything
    python3 tools/build_assets.py figures          # paper figures only
    python3 tools/build_assets.py posters bibm     # only posters whose name contains "bibm"

Needs: poppler-utils (pdftoppm, pdfimages) and Pillow.

What it does
  1. Extracts the embedded figures from the two papers at their native
     resolution (assets/figures/original/*.png, kept for download).
  2. Writes responsive WebP copies (assets/figures/*.webp).
  3. Renders each poster page and cuts it into Deep Zoom (DZI) tile pyramids
     for the zoom viewer (assets/posters/).

Everything it writes is committed, so the site itself has no build step.
Run it again only when a source PDF changes.
"""
from __future__ import annotations

import math
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

Image.MAX_IMAGE_PIXELS = None

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "assets" / "docs"
FIG = ROOT / "assets" / "figures"
POSTERS = ROOT / "assets" / "posters"

PAPER = DOCS / "potluri-2026-second-beat-full-paper.pdf"
IEEE = DOCS / "potluri-2026-ieee-bibm-short-paper.pdf"

# Posters: (pdf, page number, output name, rendered width in px)
POSTER_PAGES = [
    (DOCS / "potluri-2026-ieee-bibm-poster.pdf", 1, "ieee-bibm-poster", 6000),
    (DOCS / "potluri-2026-second-beat-poster.pdf", 1, "second-beat-poster-panel-1", 8000),
    (DOCS / "potluri-2026-second-beat-poster.pdf", 2, "second-beat-poster-panel-2", 8000),
]

# pdfimages index -> output name. Index 2 is the soft mask of Fig. 2.
PAPER_FIGS = {
    1: "fig2-mri-contours",
    3: "fig3-three-zone-field",
    4: "fig4-substrate-depots",
    5: "fig5-fiber-stress",
}
IEEE_FIGS = {0: "ieee-fig1-imaging-to-mechanics"}

# Crops of Fig. 4 and Fig. 2 used inside the method diagram. (left, top, right, bottom)
CROPS = {
    "fig4a-tissue-tags": ("fig4-substrate-depots", (0, 128, 1007, 1071)),
    "fig4b-fibre-field": ("fig4-substrate-depots", (1007, 128, 2014, 1071)),
    "fig4c-depots": ("fig4-substrate-depots", (2014, 128, 3000, 1071)),
    "fig4d-cross-section": ("fig4-substrate-depots", (0, 1264, 1478, 2528)),
    "fig4e-infarct-sector": ("fig4-substrate-depots", (1650, 1264, 3000, 2507)),
    "fig2-slice3": ("fig2-mri-contours", (1296, 24, 1930, 658)),
}

WIDTHS = (640, 1280, 2000)
TILE = 512


def run(*cmd: str) -> None:
    subprocess.run(cmd, check=True)


def extract(pdf: Path, mapping: dict[int, str], tmp: Path, prefix: str) -> None:
    run("pdfimages", "-png", str(pdf), str(tmp / prefix))
    for idx, name in mapping.items():
        src = tmp / f"{prefix}-{idx:03d}.png"
        im = Image.open(src).convert("RGB")
        out = FIG / "original" / f"{name}.png"
        im.save(out, optimize=True)
        print("figure", out.relative_to(ROOT), im.size)


def responsive(name: str, im: Image.Image) -> None:
    for w in WIDTHS:
        if w > im.width and w != WIDTHS[0]:
            continue
        ww = min(w, im.width)
        hh = round(im.height * ww / im.width)
        im.resize((ww, hh), Image.LANCZOS).save(FIG / f"{name}-{w}.webp", quality=82, method=6)


def deep_zoom(im: Image.Image, name: str) -> None:
    """Write a DZI pyramid: <name>.dzi and <name>_files/<level>/<col>_<row>.webp"""
    out = POSTERS / f"{name}_files"
    if out.exists():
        shutil.rmtree(out)
    w, h = im.size
    max_level = math.ceil(math.log2(max(w, h)))
    for level in range(max_level, -1, -1):
        scale = 2 ** (max_level - level)
        lw, lh = max(1, math.ceil(w / scale)), max(1, math.ceil(h / scale))
        if lw < 256 and lh < 256 and level < max_level - 6:
            # still write tiny levels: OpenSeadragon requests them for the overview
            pass
        lim = im if scale == 1 else im.resize((lw, lh), Image.LANCZOS)
        d = out / str(level)
        d.mkdir(parents=True, exist_ok=True)
        for col in range(math.ceil(lw / TILE)):
            for row in range(math.ceil(lh / TILE)):
                box = (col * TILE, row * TILE, min((col + 1) * TILE, lw), min((row + 1) * TILE, lh))
                lim.crop(box).save(d / f"{col}_{row}.webp", quality=80, method=4)
    (POSTERS / f"{name}.dzi").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<Image xmlns="http://schemas.microsoft.com/deepzoom/2008" Format="webp" Overlap="0" TileSize="{TILE}">\n'
        f'  <Size Width="{w}" Height="{h}"/>\n</Image>\n'
    )
    print("tiles", name, im.size, "levels", max_level + 1)


def page_width_pt(pdf: Path, page: int) -> float:
    out = subprocess.run(["pdfinfo", "-f", str(page), "-l", str(page), str(pdf)], check=True, capture_output=True, text=True).stdout
    for line in out.splitlines():
        if line.startswith("Page") and "size:" in line:
            return float(line.split("size:")[1].split("x")[0])
    raise RuntimeError(f"no page size for {pdf}")


def build_figures(tmp: Path) -> None:
    extract(PAPER, PAPER_FIGS, tmp, "paper")
    extract(IEEE, IEEE_FIGS, tmp, "ieee")
    for name in list(PAPER_FIGS.values()) + list(IEEE_FIGS.values()):
        responsive(name, Image.open(FIG / "original" / f"{name}.png"))
    for name, (src, box) in CROPS.items():
        im = Image.open(FIG / "original" / f"{src}.png").crop(box)
        for w in (480, 960):
            ww = min(w, im.width)
            im.resize((ww, round(im.height * ww / im.width)), Image.LANCZOS).save(
                FIG / f"{name}-{w}.webp", quality=84, method=6
            )
        print("crop", name, im.size)


def build_posters(tmp: Path, only: str | None = None) -> None:
    for pdf, page, name, width in POSTER_PAGES:
        if only and only not in name:
            continue
        dpi = width / (page_width_pt(pdf, page) / 72)
        stem = tmp / name
        run("pdftoppm", "-r", f"{dpi:.2f}", "-f", str(page), "-l", str(page), "-singlefile", "-png", str(pdf), str(stem))
        im = Image.open(f"{stem}.png").convert("RGB")
        deep_zoom(im, name)
        # Full-resolution download and light previews for no-JS use
        im.save(POSTERS / f"{name}-full.jpg", quality=88, optimize=True, progressive=True)
        for w in (1200, 2400):
            im.resize((w, round(im.height * w / im.width)), Image.LANCZOS).save(
                POSTERS / f"{name}-{w}.webp", quality=80, method=6
            )


def main() -> int:
    """python3 tools/build_assets.py [figures|posters] [name-filter]"""
    what = sys.argv[1] if len(sys.argv) > 1 else "all"
    only = sys.argv[2] if len(sys.argv) > 2 else None
    for d in (FIG / "original", POSTERS):
        d.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as t:
        tmp = Path(t)
        if what in ("all", "figures"):
            build_figures(tmp)
        if what in ("all", "posters"):
            build_posters(tmp, only)
    return 0


if __name__ == "__main__":
    sys.exit(main())
