#!/usr/bin/env python3
"""Put a render (left) next to a baseline (right) and write a diff mask. Usage: compare.py ours.png baseline.png out.png"""
import sys
from PIL import Image, ImageChops, ImageDraw
ours, ref, out = sys.argv[1:4]
a, b = Image.open(ours).convert("RGBA"), Image.open(ref).convert("RGBA")
bg = (24, 24, 24, 255)
def flat(im):
    base = Image.new("RGBA", im.size, bg); base.alpha_composite(im); return base.convert("RGB")
a, b = flat(a), flat(b)
h = max(a.height, b.height)
canvas = Image.new("RGB", (a.width + b.width + 40, h + 60), (60, 60, 60))
canvas.paste(a, (0, 60)); canvas.paste(b, (a.width + 40, 60))
d = ImageDraw.Draw(canvas)
d.text((10, 10), f"render {a.size}", fill=(255, 255, 255)); d.text((a.width + 50, 10), f"baseline {b.size}", fill=(255, 255, 255))
canvas.save(out)
if a.size == b.size:
    diff = ImageChops.difference(a, b).convert("L")
    px = sum(1 for v in diff.tobytes() if v > 48)
    print(f"{out}: size match, {100*px/(a.width*a.height):.2f}% pixels differ by >48")
    diff.point(lambda v: 255 if v > 48 else 0).save(out.replace(".png", "-diff.png"))
else:
    print(f"{out}: size mismatch render={a.size} baseline={b.size}")
