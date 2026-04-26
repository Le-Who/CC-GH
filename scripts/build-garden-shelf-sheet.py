#!/usr/bin/env python3
"""Build the transparent Garden Shelf plant sheet from the original raster art.

The matte is removed only when background-colored pixels are connected to each
sprite crop edge. That keeps white petals and pot highlights, which a global
"remove light pixels" mask destroys.
"""

from __future__ import annotations

import argparse
import json
from collections import deque
from pathlib import Path

from PIL import Image


def is_background(pixel: tuple[int, int, int]) -> bool:
    r, g, b = pixel
    brightness = (r + g + b) / 3
    spread = max(pixel) - min(pixel)

    # Preserve nearly white foreground details such as daisy petals and pot
    # highlights even when they touch the crop edge.
    if b >= 244 and spread <= 14:
        return False

    warm_cream = r >= g - 8 and g >= b - 18
    low_chroma = spread <= 58
    return warm_cream and low_chroma and brightness >= 158


def clear_connected_background(
    rgb: Image.Image,
    alpha: Image.Image,
    box: tuple[int, int, int, int],
) -> None:
    left, top, right, bottom = box
    width = right - left
    height = bottom - top
    if width <= 0 or height <= 0:
        return

    pixels = rgb.load()
    alpha_pixels = alpha.load()
    seen: set[tuple[int, int]] = set()
    queue: deque[tuple[int, int]] = deque()

    def maybe_add(x: int, y: int) -> None:
        if (x, y) in seen:
            return
        if is_background(pixels[x, y]):
            seen.add((x, y))
            queue.append((x, y))

    for x in range(left, right):
        maybe_add(x, top)
        maybe_add(x, bottom - 1)
    for y in range(top, bottom):
        maybe_add(left, y)
        maybe_add(right - 1, y)

    while queue:
        x, y = queue.popleft()
        alpha_pixels[x, y] = 0
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if nx < left or nx >= right or ny < top or ny >= bottom:
                continue
            maybe_add(nx, ny)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default="public/games/garden-shelf/plants_sheet.png")
    parser.add_argument("--sprites", default="public/games/garden-shelf/sprites.json")
    parser.add_argument("--output", default="public/games/garden-shelf/plants_sheet_clean.png")
    args = parser.parse_args()

    source = Path(args.source)
    sprites_path = Path(args.sprites)
    output = Path(args.output)

    rgb = Image.open(source).convert("RGB")
    alpha = Image.new("L", rgb.size, 0)

    sprites = json.loads(sprites_path.read_text(encoding="utf-8"))["sprites"]
    for sprite in sprites:
        left = max(0, int(sprite["x"]))
        top = max(0, int(sprite["y"]))
        right = min(rgb.width, left + int(sprite["width"]))
        bottom = min(rgb.height, top + int(sprite["height"]))

        # Start with the crop fully opaque, then cut only reachable background.
        for y in range(top, bottom):
            for x in range(left, right):
                alpha.putpixel((x, y), 255)
        clear_connected_background(rgb, alpha, (left, top, right, bottom))

    rgba = rgb.convert("RGBA")
    rgba.putalpha(alpha)
    output.parent.mkdir(parents=True, exist_ok=True)
    rgba.save(output, optimize=True)


if __name__ == "__main__":
    main()
