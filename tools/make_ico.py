#!/usr/bin/env python3
"""Write favicon.ico from assets/meta/icon-32.png (run after make_meta.mjs)."""
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent
Image.open(root / "assets/meta/icon-32.png").save(root / "favicon.ico", sizes=[(32, 32)])
print("wrote favicon.ico")
