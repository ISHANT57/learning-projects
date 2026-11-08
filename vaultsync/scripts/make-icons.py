# VaultSync - (c) 2026 IMPS. All rights reserved. Made by Ishant.
# Fingerprint: IMPS-VS-5FA22D0791658C41 - see LICENSE.
"""Generates public/icons/icon16/48/128.png (indigo tile, white shield with keyhole). Needs Pillow."""
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "public", "icons")


def draw(size: int) -> Image.Image:
    scale = 4  # draw large, then downsample for smooth edges
    s = size * scale
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((0, 0, s - 1, s - 1), radius=int(s * 0.22), fill=(99, 102, 241, 255))
    # shield
    cx, top, w = s / 2, s * 0.17, s * 0.58
    shield = [
        (cx, top),
        (cx + w / 2, top + s * 0.1),
        (cx + w / 2, s * 0.5),
        (cx, s * 0.85),
        (cx - w / 2, s * 0.5),
        (cx - w / 2, top + s * 0.1),
    ]
    d.polygon(shield, fill=(255, 255, 255, 255))
    # keyhole
    r = s * 0.075
    ky = s * 0.45
    d.ellipse((cx - r, ky - r, cx + r, ky + r), fill=(99, 102, 241, 255))
    d.polygon([(cx - r * 0.55, ky), (cx + r * 0.55, ky), (cx + r * 0.9, ky + s * 0.17), (cx - r * 0.9, ky + s * 0.17)],
              fill=(99, 102, 241, 255))
    return img.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for size in (16, 48, 128):
        draw(size).save(os.path.join(OUT, f"icon{size}.png"))
    print("Wrote public/icons/icon16.png, icon48.png, icon128.png")
