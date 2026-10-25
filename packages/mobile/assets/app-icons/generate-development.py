#!/usr/bin/env python3
"""Add a DEV ribbon to production assets. Requires Pillow==11.3.0."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "development"
SIZE = (1024, 1024)
ORANGE = "#FFAC33"
NAVY = "#102F60"


def load(relative, mode):
    with Image.open(ROOT / relative) as original:
        if original.size != SIZE:
            raise ValueError(f"{relative} must be 1024 x 1024px.")
        return original.convert(mode)


def ribbon(image, box, font_size, monochrome=False):
    """Use Pillow's bundled font so regeneration needs no system font files."""
    draw = ImageDraw.Draw(image)
    draw.rectangle(box, fill="white" if monochrome else ORANGE)
    font = ImageFont.load_default(size=font_size)
    left, top, right, bottom = draw.textbbox((0, 0), "DEV", font=font, stroke_width=2)
    x = (box[0] + box[2] - (right - left)) // 2 - left
    y = (box[1] + box[3] - (bottom - top)) // 2 - top
    # Transparent letters also distinguish the Android themed icon.
    draw.text((x, y), "DEV", font=font, fill=(0, 0, 0, 0) if monochrome else NAVY,
              stroke_width=2, stroke_fill=(0, 0, 0, 0) if monochrome else NAVY)
    return image


def main():
    images = {
        "sanposcape-icon-1024.png": ribbon(load("sanposcape-icon-1024.png", "RGB"),
                                            (0, 744, 1023, 920), 144),
        # All ribbon corners fit within the 66/108 safe circle (~313px radius).
        "adaptive-foreground.png": ribbon(load("android/adaptive-foreground.png", "RGBA"),
                                          (292, 600, 732, 728), 104),
        "adaptive-monochrome.png": ribbon(load("android/adaptive-monochrome.png", "RGBA"),
                                          (292, 600, 732, 728), 104, monochrome=True),
    }
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for filename, image in images.items():
        image.save(OUTPUT / filename, optimize=True)
    print(f"Generated {len(images)} development icons in {OUTPUT.relative_to(ROOT)}.")


if __name__ == "__main__":
    main()
