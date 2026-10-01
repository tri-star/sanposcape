#!/usr/bin/env python3
"""Export the approved icon. Requires Pillow==11.3.0 (see README.md)."""

import json
import math
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

from PIL import Image


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT.parent / "icon-concepts" / "sanposcape-icon-v2.png"


def main():
    with Image.open(SOURCE) as original:
        if original.width != original.height or original.width < 1024:
            raise ValueError("The source must be square and at least 1024px.")
        source = original.convert("RGB")

    exported = []

    def export(relative, size):
        path = ROOT / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        source.resize((size, size), Image.Resampling.LANCZOS).save(path, optimize=True)
        exported.append({"file": relative, "width": size, "height": size, "mode": "RGB"})

    export("sanposcape-icon-1024.png", 1024)
    for density, size in [("mdpi", 48), ("hdpi", 72), ("xhdpi", 96), ("xxhdpi", 144), ("xxxhdpi", 192)]:
        export(f"android/mipmap-{density}/ic_launcher.png", size)
    export("android/play-store-icon-512.png", 512)

    # Generated cutout and scenery are retained as inputs; resizing is deterministic.
    with Image.open(ROOT.parent / "icon-concepts/adaptive-walker-source.png") as original:
        walker = original.convert("RGBA")
    alpha = walker.getchannel("A")
    if alpha.getextrema() != (0, 255):
        raise ValueError("The walker source must have a transparent background.")
    # Generated cutouts can contain isolated alpha=1 specks far from the subject.
    # Ignore these nearly invisible pixels when measuring and centering the figure.
    alpha = alpha.point(lambda value: 0 if value <= 1 else value)
    walker.putalpha(alpha)
    walker = walker.crop(alpha.getbbox())
    radius = max(
        math.hypot(x + 0.5 - walker.width / 2, y + 0.5 - walker.height / 2)
        for y in range(walker.height)
        for x in range(walker.width)
        if walker.getpixel((x, y))[3] > 0
    )
    # 300px radius is inside the 66/108 safe circle (~313px at 1024px).
    factor = 300 / radius
    walker = walker.resize((round(walker.width * factor), round(walker.height * factor)), Image.Resampling.LANCZOS)
    foreground = Image.new("RGBA", (1024, 1024))
    foreground.paste(walker, ((1024 - walker.width) // 2, (1024 - walker.height) // 2))
    monochrome = Image.new("RGBA", (1024, 1024), "white")
    monochrome.putalpha(foreground.getchannel("A"))
    with Image.open(ROOT.parent / "icon-concepts/adaptive-scenery-source.png") as original:
        background = original.convert("RGB").resize((1024, 1024), Image.Resampling.LANCZOS)
    for filename, image in [("adaptive-foreground.png", foreground), ("adaptive-background.png", background), ("adaptive-monochrome.png", monochrome)]:
        relative = f"android/{filename}"
        image.save(ROOT / relative, optimize=True)
        exported.append({"file": relative, "width": 1024, "height": 1024, "mode": image.mode})

    slots = []
    for idiom, points, scales in [
        ("iphone", 20, [2, 3]),
        ("iphone", 29, [2, 3]),
        ("iphone", 40, [2, 3]),
        ("iphone", 60, [2, 3]),
        ("ipad", 20, [1, 2]),
        ("ipad", 29, [1, 2]),
        ("ipad", 40, [1, 2]),
        ("ipad", 76, [1, 2]),
        ("ipad", 83.5, [2]),
        ("ios-marketing", 1024, [1]),
    ]:
        for scale in scales:
            pixels = int(points * scale)
            filename = f"icon-{pixels}.png"
            relative = f"ios/AppIcon.appiconset/{filename}"
            if not any(item["file"] == relative for item in exported):
                export(relative, pixels)
            slots.append({"idiom": idiom, "size": f"{points}x{points}", "scale": f"{scale}x", "filename": filename})

    catalog = ROOT / "ios/AppIcon.appiconset/Contents.json"
    catalog.write_text(json.dumps({"images": slots, "info": {"version": 1, "author": "xcode"}}, indent=2) + "\n")
    manifest = ROOT / "manifest.json"
    manifest.write_text(json.dumps({"source": "../icon-concepts/sanposcape-icon-v2.png", "adaptive_sources": ["../icon-concepts/adaptive-walker-source.png", "../icon-concepts/adaptive-scenery-source.png"], "resampling": "Lanczos", "images": exported}, indent=2) + "\n")

    for item in exported:
        with Image.open(ROOT / item["file"]) as icon:
            assert icon.size == (item["width"], item["height"])
            assert icon.mode == item.get("mode", "RGB") and icon.format == "PNG"
            icon.verify()

    with ZipFile(ROOT / "sanposcape-app-icons.zip", "w", ZIP_DEFLATED) as archive:
        for relative in [item["file"] for item in exported] + ["ios/AppIcon.appiconset/Contents.json", "manifest.json", "README.md", "generate.py"]:
            archive.write(ROOT / relative, relative)
    print(f"Exported and verified {len(exported)} PNG files and {len(slots)} iOS catalog slots.")


if __name__ == "__main__":
    main()
