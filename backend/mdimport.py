"""Markdown → article HTML for Learn posts (Finshots-style words-and-pictures pieces written outside the editor).

- python-markdown does the structure; we then turn `<p><img></p>` + a following `<p><em>Figure: …</em></p>`
  into `<figure><img><figcaption>` so captions travel with their picture.
- Image references are relative filenames; `assets` maps basename → served URL. Anything not mapped is
  reported back so the author knows which file to attach.
- Title = first H1, excerpt = first italic paragraph, cover = first image (the caller decides whether to use them).
"""
from __future__ import annotations

import html as _html
import os
import re
from typing import Dict, List, Tuple

import markdown

_IMG = re.compile(r"<p>\s*(<img\b[^>]*>)\s*</p>\s*(?:<p>\s*<em>((?:Figure|Image|Source)\b[^<]*)</em>\s*</p>)?", re.I)
_SRC = re.compile(r'src="([^"]*)"')
_ALT = re.compile(r'alt="([^"]*)"')


def _pieces(md_text: str) -> Tuple[str, str, str]:
    """(title, excerpt, first image basename) pulled from the raw markdown."""
    title, excerpt, first_img = "", "", ""
    for line in md_text.splitlines():
        s = line.strip()
        if not title and s.startswith("# "):
            title = s[2:].strip()
        m = re.match(r"^!\[[^\]]*\]\(([^)\s]+)\)", s)
        if m and not first_img:
            first_img = os.path.basename(m.group(1))
        if not excerpt and len(s) > 20 and s.startswith("*") and s.endswith("*") and not s.startswith("**") and "Figure" not in s and "Source" not in s:
            excerpt = s.strip("*").strip()
    return title, excerpt, first_img


def convert(md_text: str, assets: Dict[str, str]) -> dict:
    """assets: {basename: url}. Returns {html, title, excerpt, cover_name, missing_images[]}."""
    md_text = (md_text or "").replace("\r\n", "\n")
    title, excerpt, first_img = _pieces(md_text)
    # drop the H1 (it becomes the post title) and the opening italic (it becomes the excerpt)
    lines = md_text.split("\n")
    body_lines: List[str] = []
    dropped_h1 = dropped_ex = False
    for ln in lines:
        s = ln.strip()
        if not dropped_h1 and s.startswith("# ") and s[2:].strip() == title:
            dropped_h1 = True
            continue
        if excerpt and not dropped_ex and s.strip("*").strip() == excerpt:
            dropped_ex = True
            continue
        body_lines.append(ln)
    raw = markdown.markdown("\n".join(body_lines), extensions=["extra", "sane_lists"], output_format="html")
    missing: List[str] = []

    def fig(m: re.Match) -> str:
        img, cap = m.group(1), m.group(2)
        src = (_SRC.search(img) or [None, ""])[1] if _SRC.search(img) else ""
        alt = (_ALT.search(img).group(1) if _ALT.search(img) else "")
        name = os.path.basename(src)
        url = assets.get(name) or assets.get(name.lower())
        if not url:
            if src.startswith("http://") or src.startswith("https://") or src.startswith("/api/learn/asset/"):
                url = src
            else:
                if name and name not in missing:
                    missing.append(name)
                url = ""
        if not url:
            return f'<p class="missing-image" data-name="{_html.escape(name)}">[image to attach: {_html.escape(name)}]</p>'
        caption = f"<figcaption>{cap.strip()}</figcaption>" if cap else ""
        return f'<figure><img src="{_html.escape(url)}" alt="{_html.escape(alt)}" loading="lazy" />{caption}</figure>'

    out = _IMG.sub(fig, raw)
    return {"html": out, "title": title, "excerpt": excerpt, "cover_name": first_img, "missing_images": missing}
