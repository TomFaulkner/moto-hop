#!/usr/bin/env python3
"""Recolor only the saturated blue chassis pixels, preserving shading and alpha."""
import colorsys
from pathlib import Path

from PIL import Image

ASSET_DIR = Path(__file__).resolve().parent.parent / "assets" / "reactorcore"
SOURCE = ASSET_DIR / "chassis_blue.png"
# Hue rotations in degrees from the source art's nominal 225-degree blue.
PALETTE = {
    "red": 135,
    "green": -105,
    "yellow": -165,
    "purple": 55,
}


def recolor(image, rotation):
    result = image.convert("RGBA")
    pixels = result.load()
    for y in range(result.height):
        for x in range(result.width):
            r, g, b, a = pixels[x, y]
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if a and 0.52 <= h <= 0.72 and s >= 0.55:
                h = (h + rotation / 360) % 1
                r, g, b = colorsys.hsv_to_rgb(h, s, v)
                pixels[x, y] = (round(r * 255), round(g * 255), round(b * 255), a)
    return result


def main():
    with Image.open(SOURCE) as source:
        for name, rotation in PALETTE.items():
            recolor(source, rotation).save(ASSET_DIR / f"chassis_{name}.png")


if __name__ == "__main__":
    main()
