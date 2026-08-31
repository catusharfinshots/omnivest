"""Generate Omnivest purple-themed raster assets (favicons, app icons, OG card) with the slim-ellipse mark."""
import math, os
from PIL import Image, ImageDraw, ImageFont

OUT = "/app/frontend/public"
PURPLE = (108, 43, 217)
PURPLE2 = (177, 92, 255)
PINK = (226, 63, 160)
WHITE = (255, 255, 255)
SS = 4

def _find_font(bold=True):
    cands = [
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ]
    for c in cands:
        if os.path.exists(c):
            return c
    return None

def draw_mark(size, stroke, heart, bg=None, rounded=False):
    S = size * SS
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if bg is not None:
        if rounded:
            d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=bg)
        else:
            d.rectangle([0, 0, S, S], fill=bg)
    sc = S / 100.0
    cx = cy = 50 * sc
    rx = 25 * sc
    ry = 33 * sc
    w = max(1, int(7 * sc))
    box = [cx - rx, cy - ry, cx + rx, cy + ry]
    d.arc(box, start=14, end=166, fill=stroke, width=w)
    d.arc(box, start=194, end=346, fill=stroke, width=w)
    for ang in (14, 166, 194, 346):
        rad = math.radians(ang)
        px = cx + rx * math.cos(rad)
        py = cy + ry * math.sin(rad)
        rr = w / 2.0
        d.ellipse([px - rr, py - rr, px + rr, py + rr], fill=stroke)
    # heart (unchanged) ~ centered 50,48
    lobe_r = 4.6 * sc
    lx, ly = 45.9 * sc, 44.5 * sc
    rx2, ry2 = 54.1 * sc, 44.5 * sc
    d.ellipse([lx - lobe_r, ly - lobe_r, lx + lobe_r, ly + lobe_r], fill=heart)
    d.ellipse([rx2 - lobe_r, ry2 - lobe_r, rx2 + lobe_r, ry2 + lobe_r], fill=heart)
    d.polygon([(41.5 * sc, 46.8 * sc), (58.5 * sc, 46.8 * sc), (50 * sc, 56.5 * sc)], fill=heart)
    return img.resize((size, size), Image.LANCZOS)

for s in (16, 32, 48):
    draw_mark(s, PURPLE, PINK).save(f"{OUT}/favicon-{s}.png")

def gradient_bg(w, h, c1, c2):
    base = Image.new("RGB", (w, h), c1)
    top = Image.new("RGB", (w, h), c2)
    mask = Image.new("L", (w, h))
    md = mask.load()
    for y in range(h):
        for x in range(w):
            md[x, y] = int(255 * ((x + y) / (w + h)))
    return Image.composite(top, base, mask)

def app_icon(size, rounded=True):
    bg = gradient_bg(size, size, PURPLE, PURPLE2).convert("RGBA")
    if rounded:
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * 0.22), fill=255)
        bg.putalpha(mask)
    mark = draw_mark(int(size * 0.62), WHITE, PINK)
    off = (size - mark.width) // 2
    bg.alpha_composite(mark, (off, off))
    return bg

app_icon(180).save(f"{OUT}/apple-touch-icon.png")
app_icon(192).save(f"{OUT}/icon-192.png")
app_icon(512).save(f"{OUT}/icon-512.png")

W, H = 1200, 630
og = gradient_bg(W, H, PURPLE, PURPLE2).convert("RGBA")
d = ImageDraw.Draw(og)
mark = draw_mark(190, WHITE, PINK)
og.alpha_composite(mark, ((W - mark.width) // 2, 120))
fp = _find_font(True); fp_reg = _find_font(False)
try:
    f_title = ImageFont.truetype(fp, 104); f_tag = ImageFont.truetype(fp_reg or fp, 40)
except Exception:
    f_title = ImageFont.load_default(); f_tag = ImageFont.load_default()

def centered(draw, text, font, y, fill):
    bb = draw.textbbox((0, 0), text, font=font)
    draw.text(((W - (bb[2] - bb[0])) / 2, y), text, font=font, fill=fill)

centered(d, "Omnivest", f_title, 345, WHITE)
centered(d, "All your investing, in one place", f_tag, 480, (243, 232, 255))
og.convert("RGB").save(f"{OUT}/omnivest-og-1200x630.png")
print("Generated:", sorted([f for f in os.listdir(OUT) if f.endswith('.png')]))
