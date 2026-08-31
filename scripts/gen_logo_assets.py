"""Regenerate all Omnivest raster assets from the refined slim-ellipse SVG mark.
Feature 3 (logo shape) + Feature 2 (share OG image matches header logo)."""
import io
import cairosvg
from PIL import Image, ImageDraw, ImageFont

PUB = "/app/frontend/public"
FONT_BOLD = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
FONT_REG = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"

WHITE_MARK = "/app/frontend/src/assets/omnivest-mark-white.svg"
GRAD_MARK = "/app/frontend/public/favicon.svg"

GRAD = [(0x6C, 0x2B, 0xD9), (0xB1, 0x5C, 0xFF)]  # brand purple diagonal


def render_svg(path, size):
    png = cairosvg.svg2png(url=path, output_width=size, output_height=size)
    return Image.open(io.BytesIO(png)).convert("RGBA")


def diagonal_gradient(w, h, c0, c1):
    base = Image.new("RGB", (w, h), c0)
    top = Image.new("RGB", (w, h), c1)
    mask = Image.new("L", (w, h))
    md = mask.load()
    for y in range(h):
        for x in range(w):
            md[x, y] = int(255 * ((x / w) * 0.5 + (y / h) * 0.5))
    base.paste(top, (0, 0), mask)
    return base.convert("RGBA")


def rounded_mask(w, h, radius):
    m = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, w - 1, h - 1], radius=radius, fill=255)
    return m


def app_icon(size):
    """Purple gradient rounded square + centered white mark (app-icon style, unchanged)."""
    grad = diagonal_gradient(size, size, GRAD[0], GRAD[1])
    mask = rounded_mask(size, size, int(size * 0.22))
    icon = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    icon.paste(grad, (0, 0), mask)
    mk = int(size * 0.66)
    mark = render_svg(WHITE_MARK, mk)
    icon.alpha_composite(mark, ((size - mk) // 2, (size - mk) // 2))
    return icon


# --- Favicons: gradient mark on transparent ---
for s in (16, 32, 48):
    render_svg(GRAD_MARK, s).save(f"{PUB}/favicon-{s}.png")

# --- App icons: gradient rounded square + white mark ---
app_icon(180).save(f"{PUB}/apple-touch-icon.png")
app_icon(192).save(f"{PUB}/icon-192.png")
app_icon(512).save(f"{PUB}/icon-512.png")

# --- OG share image 1200x630: matches header (gradient box + white mark + wordmark) ---
W, H = 1200, 630
og = diagonal_gradient(W, H, GRAD[0], GRAD[1])
draw = ImageDraw.Draw(og)

# rounded gradient card holding the mark (mirrors the header logo box)
box = 260
box_x, box_y = 150, (H - box) // 2
card = diagonal_gradient(box, box, (0x7C, 0x3A, 0xED), (0xC0, 0x6B, 0xFF))
cmask = rounded_mask(box, box, int(box * 0.26))
og.paste(card, (box_x, box_y), cmask)
mk = int(box * 0.7)
mark = render_svg(WHITE_MARK, mk)
og.alpha_composite(mark, (box_x + (box - mk) // 2, box_y + (box - mk) // 2))

# wordmark + tagline
tx = box_x + box + 70
word_font = ImageFont.truetype(FONT_BOLD, 118)
tag_font = ImageFont.truetype(FONT_REG, 42)
draw.text((tx, 232), "Omnivest", font=word_font, fill=(255, 255, 255, 255))
draw.text((tx + 4, 372), "All your investing, in one place", font=tag_font,
          fill=(233, 216, 253, 255))

og.convert("RGB").save(f"{PUB}/omnivest-og-1200x630.png", quality=92)
print("All assets regenerated.")
