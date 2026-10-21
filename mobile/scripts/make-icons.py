"""Builds Hati's app icons and in-app logo images from the two source PNGs in mobile/assets:

    app-icon.png      1024x1024, the mark on the sage background (#EDF1EE)
    primary-logo.png  the mark + "Hati" + tagline on the same background

Run after replacing either source:

    backend/.venv/Scripts/python mobile/scripts/make-icons.py      (Windows)
    backend/.venv/bin/python mobile/scripts/make-icons.py          (macOS / Linux)

Needs Pillow (already in backend/requirements.txt).

The cut-outs (logo-*.png) are "un-matted": every pixel is matched to the nearest logo color and
given the alpha that blends it out of the background, so edges stay smooth on any surface.
"""

from pathlib import Path

from PIL import Image

ASSETS = Path(__file__).resolve().parent.parent / "assets"
BG = (237, 241, 238)  # sage, colors.bg
# The colors used in the artwork: ink, green, gold, and the tagline's grey.
INKS = [(27, 46, 39), (15, 122, 95), (226, 162, 27), (74, 93, 85)]


def unmatte(img):
    """Background pixels become transparent; artwork keeps its color with a soft alpha edge."""
    src = img.convert("RGB")
    out = Image.new("RGBA", src.size)
    cache = {}
    pixels = []
    for p in src.get_flattened_data() if hasattr(src, "get_flattened_data") else src.getdata():
        if p not in cache:
            best = (float("inf"), (0, 0, 0, 0))
            for f in INKS:
                d = [f[i] - BG[i] for i in range(3)]
                v = [p[i] - BG[i] for i in range(3)]
                a = max(0.0, min(1.0, sum(v[i] * d[i] for i in range(3)) / sum(x * x for x in d)))
                resid = sum((p[i] - (BG[i] + a * d[i])) ** 2 for i in range(3))
                if resid < best[0]:
                    best = (resid, (*f, round(a * 255)))
            cache[p] = best[1]
        pixels.append(cache[p])
    out.putdata(pixels)
    return out


def trim(img, pad=0):
    box = img.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
    img = img.crop(box)
    if pad:
        w, h = img.size
        canvas = Image.new("RGBA", (w + 2 * pad, h + 2 * pad), (0, 0, 0, 0))
        canvas.paste(img, (pad, pad))
        img = canvas
    return img


def square(img, size, fill, scale):
    """`img` centred on a size x size canvas, its longest side `scale` of the canvas."""
    canvas = Image.new("RGBA", (size, size), fill)
    w, h = img.size
    k = size * scale / max(w, h)
    art = img.resize((round(w * k), round(h * k)), Image.LANCZOS)
    canvas.alpha_composite(art, ((size - art.width) // 2, (size - art.height) // 2))
    return canvas


def save(img, name, mode=None):
    if mode:
        img = img.convert(mode)
    img.save(ASSETS / name, optimize=True)
    print("wrote", name, img.size)


icon_src = Image.open(ASSETS / "app-icon.png")
logo_src = Image.open(ASSETS / "primary-logo.png")

mark = trim(unmatte(icon_src))
full = trim(unmatte(logo_src))
# The wordmark without the tagline: clear the area under "Hati", right of the mark.
no_tag = unmatte(logo_src)
W, H = no_tag.size
no_tag.paste((0, 0, 0, 0), (round(W * 0.44), round(H * 0.58), W, H))  # tagline: x > 44%, y > 58%
wordmark = trim(no_tag)

# In-app logo (src/ui/Logo.tsx): 3x a typical size, so they're sharp on every phone.
save(square(mark, 288, (0, 0, 0, 0), 1.0), "logo-mark.png")
save(wordmark.resize((round(wordmark.width * 144 / wordmark.height), 144), Image.LANCZOS), "logo-wordmark.png")
save(full.resize((round(full.width * 240 / full.height), 240), Image.LANCZOS), "logo-full.png")

# App icons.
save(square(mark, 1024, (*BG, 255), 0.56), "icon.png", "RGB")  # iOS rounds the corners itself
# Android adaptive icon: the launcher shows roughly the middle 66%, so the mark stays inside it.
save(Image.new("RGBA", (512, 512), (*BG, 255)), "android-icon-background.png")
save(square(mark, 512, (0, 0, 0, 0), 0.46), "android-icon-foreground.png")
mono = square(mark, 432, (0, 0, 0, 0), 0.46)
mono.putdata([(255, 255, 255, px[3]) for px in mono.getdata()])
save(mono, "android-icon-monochrome.png")
save(square(mark, 1024, (0, 0, 0, 0), 0.6), "splash-icon.png")
save(square(mark, 48, (*BG, 255), 0.7), "favicon.png")
