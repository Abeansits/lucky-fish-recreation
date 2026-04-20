#!/usr/bin/env python3
"""Flood-fill the outer white background of generated PNGs into alpha=0.

The fish/rod/badge sticker graphics sit on a solid white image backdrop.
Because the sticker has its own dark outline separating the outer bg from
any internal white, a simple BFS flood-fill from the four corners cleanly
removes only the outer white without eating internal whites.

Usage: cutout.py <file> [file ...]
"""
from __future__ import annotations
import sys
from collections import deque
from PIL import Image

WHITE_THRESHOLD = 215  # treat R,G,B all >= this as "outer white" (Ideogram emits ~233-236 gray)

def cut(path: str) -> None:
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    px = im.load()

    def is_white(x: int, y: int) -> bool:
        r, g, b, a = px[x, y]
        return a > 0 and r >= WHITE_THRESHOLD and g >= WHITE_THRESHOLD and b >= WHITE_THRESHOLD

    visited = bytearray(w * h)

    def push(q, x, y):
        if 0 <= x < w and 0 <= y < h and not visited[y * w + x] and is_white(x, y):
            visited[y * w + x] = 1
            q.append((x, y))

    q = deque()
    for (sx, sy) in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        push(q, sx, sy)

    while q:
        x, y = q.popleft()
        px[x, y] = (0, 0, 0, 0)
        push(q, x + 1, y)
        push(q, x - 1, y)
        push(q, x, y + 1)
        push(q, x, y - 1)

    im.save(path, "PNG")
    print(f"cut: {path}")

if __name__ == "__main__":
    for p in sys.argv[1:]:
        try:
            cut(p)
        except Exception as e:
            print(f"error {p}: {e}", file=sys.stderr)
