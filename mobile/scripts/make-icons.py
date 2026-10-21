"""Draws Hati's app icons into mobile/assets from the logo geometry in src/ui/Logo.tsx.

The mark: a coin split in two (white + mint) on a deep forest tile. Run after changing it:

    backend/.venv/Scripts/python mobile/scripts/make-icons.py      (Windows)
    backend/.venv/bin/python mobile/scripts/make-icons.py          (macOS / Linux)

Needs Pillow (already in backend/requirements.txt).
"""

from pathlib import Path

from PIL import Image, ImageDraw

ASSETS = Path(__file__).resolve().parent.parent / "assets"
INK = (0x1B, 0x2E, 0x27, 255)  # colors.ink
WHITE = (255, 255, 255, 255)  # colors.onInk
MINT = (0x7E, 0xDD, 0xB6, 255)  # colors.onInkGood
CLEAR = (0, 0, 0, 0)
SS = 4  # draw 4x bigger, then shrink: smooth edges


def coin(draw, size, radius, gap, left=WHITE, right=MINT):
    """Two half discs around the centre, pulled apart by `gap` (fractions of size)."""
    c, r, g = size / 2, radius * size, gap * size
    draw.pieslice([c - g - r, c - r, c - g + r, c + r], 90, 270, fill=left)
    draw.pieslice([c + g - r, c - r, c + g + r, c + r], 270, 90, fill=right)


def make(name, size, background, radius, gap, tile_corner=None, colors=(WHITE, MINT), mode="RGBA"):
    big = size * SS
    im = Image.new("RGBA", (big, big), CLEAR)
    d = ImageDraw.Draw(im)
    if background and tile_corner is None:
        d.rectangle([0, 0, big, big], fill=background)
    elif background:
        d.rounded_rectangle([0, 0, big - 1, big - 1], radius=tile_corner * big, fill=background)
    if radius:
        coin(d, big, radius, gap, *colors)
    im = im.resize((size, size), Image.LANCZOS)
    if mode == "RGB":
        im = im.convert("RGB")
    im.save(ASSETS / name)
    print("wrote", name, im.size)


# Same proportions as the SVG (viewBox 100): coin radius 26, halves 4 apart from the centre.
make("icon.png", 1024, INK, 0.26, 0.04, mode="RGB")  # iOS: full square, the system rounds it
# Android adaptive icon: the launcher crops to the middle ~66%, so the coin stays inside that.
make("android-icon-background.png", 512, INK, 0, 0)
make("android-icon-foreground.png", 512, None, 0.2, 0.03)
make("android-icon-monochrome.png", 432, None, 0.2, 0.03, colors=(WHITE, WHITE))
make("splash-icon.png", 1024, INK, 0.26, 0.04, tile_corner=0.28)
make("favicon.png", 48, INK, 0.26, 0.04, tile_corner=0.28)
