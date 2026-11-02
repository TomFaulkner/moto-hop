#!/usr/bin/env python3
"""Generate Moto Hop's rider sprites (original art made for this project).

The rider is built from a small joint skeleton in bike-sprite pixels, so it
lines up with the 81x43 assembled bike (seat ~(30,10), footpeg ~(38,27),
handlebar grip ~(55,2)). Each body part is rasterised without antialiasing,
outlined 1px, and composited back to front, which keeps the result crisp
pixel art. Run: python tools/make_rider.py
"""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "assets" / "rider"
# Canvas covers bike-sprite x 18..66, y -24..32. Game.RIDER = { x: 18, y: -24 }.
OX, OY, W, H = 18, -24, 48, 56

OUTLINE = (20, 20, 26, 255)
PANTS = (72, 72, 82, 255)
PANTS_HI = (104, 104, 116, 255)
BOOT = (236, 236, 236, 255)
BOOT_SOLE = (40, 40, 46, 255)
GLOVE = (40, 40, 46, 255)
VISOR = (30, 40, 56, 255)
VISOR_HI = (150, 190, 230, 255)

COLOURS = {  # helmet, jersey, jersey shade, accent
    "blue":   ((40, 100, 232), (36, 88, 216), (22, 56, 144), (252, 252, 252)),
    "red":    ((224, 56, 56), (216, 48, 48), (144, 32, 36), (252, 252, 252)),
    "green":  ((56, 184, 72), (44, 160, 60), (26, 104, 44), (248, 232, 88)),
    "yellow": ((236, 212, 48), (220, 196, 36), (150, 128, 20), (56, 48, 120)),
    "purple": ((160, 80, 208), (144, 64, 192), (88, 40, 120), (248, 232, 88)),
}

# Joints in bike-sprite pixels.
POSES = {
    # Attack position: butt just off the seat, back flat, elbows out.
    "crouch": dict(hip=(29, 7), knee=(42, 13), ankle=(37, 25), shoulder=(42, -3),
                   head=(47, -7), elbow=(45, 5), hand=(55, 2)),
    # Wheelie: weight back, torso upright, arms long to the bars.
    "lean":   dict(hip=(27, 7), knee=(40, 12), ankle=(37, 25), shoulder=(31, -7),
                   head=(34, -14), elbow=(43, -1), hand=(55, 2)),
    # Nose-down / air: chest over the tank, head low behind the number plate.
    "tuck":   dict(hip=(33, 6), knee=(43, 12), ankle=(37, 25), shoulder=(46, -1),
                   head=(51, -5), elbow=(49, 6), hand=(55, 2)),
}


def P(pt):
    return (pt[0] - OX, pt[1] - OY)


def layer():
    return Image.new("RGBA", (W, H), (0, 0, 0, 0))


def outlined(img):
    """Add a 1px outline around the opaque pixels of img."""
    src = img.load()
    out = img.copy()
    o = out.load()
    for y in range(H):
        for x in range(W):
            if src[x, y][3]:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < W and 0 <= ny < H and src[nx, ny][3]:
                    o[x, y] = OUTLINE
                    break
    return out


def limb(a, b, width, colour, hi=None):
    im = layer()
    d = ImageDraw.Draw(im)
    d.line([P(a), P(b)], fill=colour, width=width)
    r = width // 2
    for c in (a, b):
        x, y = P(c)
        d.ellipse([x - r, y - r, x - r + width - 1, y - r + width - 1], fill=colour)
    if hi:
        d.line([(P(a)[0], P(a)[1] - r + 1), (P(b)[0], P(b)[1] - r + 1)], fill=hi, width=1)
    return im


def render(pose, colour):
    j = POSES[pose]
    helmet, jersey, shade, accent = [c + (255,) if len(c) == 3 else c for c in COLOURS[colour]]
    parts = []
    # Torso: thick jersey block from hip to shoulder, shaded underside, stripe.
    torso = limb(j["hip"], j["shoulder"], 8, jersey)
    td = ImageDraw.Draw(torso)
    hx, hy = P(j["hip"]); sx, sy = P(j["shoulder"])
    td.line([(hx - 1, hy + 3), (sx - 1, sy + 3)], fill=shade, width=2)
    mx, my = (hx + sx) // 2, (hy + sy) // 2
    td.line([(hx, hy - 1), (sx, sy - 1)], fill=accent, width=1)
    td.point([(mx, my + 1), (mx + 1, my + 1)], fill=shade)
    parts.append(torso)
    # Leg: thigh and shin, then the boot on the peg.
    parts.append(limb(j["hip"], j["knee"], 6, PANTS, PANTS_HI))
    parts.append(limb(j["knee"], j["ankle"], 5, PANTS))
    boot = layer()
    d = ImageDraw.Draw(boot)
    ax, ay = P(j["ankle"])
    d.rectangle([ax - 2, ay - 3, ax + 2, ay + 1], fill=BOOT)
    d.rectangle([ax - 2, ay + 2, ax + 4, ay + 3], fill=BOOT)
    d.line([(ax - 2, ay + 3), (ax + 4, ay + 3)], fill=BOOT_SOLE)
    d.line([(ax - 2, ay - 1), (ax + 2, ay - 1)], fill=accent)
    parts.append(boot)
    # Helmet with visor and a peak.
    hel = layer()
    d = ImageDraw.Draw(hel)
    cx, cy = P(j["head"])
    d.ellipse([cx - 5, cy - 5, cx + 5, cy + 5], fill=helmet)
    d.line([(cx - 4, cy - 2), (cx + 2, cy - 4)], fill=accent, width=1)
    d.rectangle([cx + 2, cy - 1, cx + 5, cy + 2], fill=VISOR)
    d.point([(cx + 4, cy - 1)], fill=VISOR_HI)
    d.polygon([(cx + 2, cy - 4), (cx + 8, cy - 3), (cx + 7, cy - 1), (cx + 2, cy - 2)], fill=helmet)
    d.rectangle([cx + 2, cy + 3, cx + 6, cy + 5], fill=helmet)  # chin guard
    parts.append(hel)
    # Near arm over everything: upper arm, forearm, glove on the grip.
    parts.append(limb(j["shoulder"], j["elbow"], 4, jersey))
    parts.append(limb(j["elbow"], j["hand"], 4, shade))
    glove = layer()
    gx, gy = P(j["hand"])
    ImageDraw.Draw(glove).rectangle([gx - 1, gy - 1, gx + 2, gy + 2], fill=GLOVE)
    parts.append(glove)

    img = layer()
    for part in parts:
        img = Image.alpha_composite(img, outlined(part))
    return img


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("rider_*.png"):
        old.unlink()
    for pose in POSES:
        for colour in COLOURS:
            p = OUT / f"rider_{pose}_{colour}.png"
            render(pose, colour).save(p)
            print(p)


if __name__ == "__main__":
    main()
