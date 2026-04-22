#!/usr/bin/env python3
"""
Trim transparent rows/columns from the edges of a PNG so the illustration
hugs its bounding box. Used to anchor flora (seaweed, coral, rocks) to the
pond floor — they were floating because cutout.py leaves the original
1024x1024 canvas intact.

Usage:
  python3 scripts/trim_transparent.py assets/env/seaweed.png
  python3 scripts/trim_transparent.py assets/env/*.png

Default: trims bottom only (other edges unchanged) so the illustration
baseline ends up at y=height. Pass --all-edges to trim all four sides.
"""
import sys
from PIL import Image

ALPHA_THRESHOLD = 10  # pixels with alpha <= this count as "transparent"


def trim(path: str, all_edges: bool = False) -> None:
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    pixels = im.load()

    def row_opaque(y: int) -> bool:
        for x in range(w):
            if pixels[x, y][3] > ALPHA_THRESHOLD:
                return True
        return False

    def col_opaque(x: int) -> bool:
        for y in range(h):
            if pixels[x, y][3] > ALPHA_THRESHOLD:
                return True
        return False

    # Find the last opaque row (bottom of illustration).
    bottom = h - 1
    while bottom > 0 and not row_opaque(bottom):
        bottom -= 1

    if all_edges:
        top = 0
        while top < h - 1 and not row_opaque(top):
            top += 1
        left = 0
        while left < w - 1 and not col_opaque(left):
            left += 1
        right = w - 1
        while right > 0 and not col_opaque(right):
            right -= 1
        box = (left, top, right + 1, bottom + 1)
    else:
        # Only chop the transparent bottom padding.
        box = (0, 0, w, bottom + 1)

    if box == (0, 0, w, h):
        print(f"skip (already tight): {path}")
        return

    out = im.crop(box)
    out.save(path, optimize=True)
    print(f"trim: {path}  {w}x{h} -> {out.size[0]}x{out.size[1]}")


def main(argv):
    all_edges = "--all-edges" in argv
    paths = [a for a in argv[1:] if not a.startswith("--")]
    if not paths:
        print(__doc__, file=sys.stderr)
        sys.exit(1)
    for p in paths:
        trim(p, all_edges=all_edges)


if __name__ == "__main__":
    main(sys.argv)
