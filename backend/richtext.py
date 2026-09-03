"""Rich-text sanitiser for partner-authored HTML (rationale, methodology, posts).
Allow-list only: headings, paragraphs, emphasis, lists, links, line breaks.
Everything else (scripts, styles, iframes, event handlers) is stripped."""
from __future__ import annotations

import re

import bleach

_BLOCKS = re.compile(r"<(script|style|iframe|object|embed)\b[^>]*>.*?</\1\s*>", re.I | re.S)

ALLOWED_TAGS = ["p", "br", "strong", "b", "em", "i", "u", "h2", "h3", "h4", "ul", "ol", "li", "a", "blockquote"]
ALLOWED_ATTRS = {"a": ["href", "title", "rel", "target"]}
ALLOWED_PROTOCOLS = ["http", "https", "mailto"]
MAX_LEN = 40_000


def sanitize_html(html: str | None) -> str:
    if not html:
        return ""
    cleaned = bleach.clean(_BLOCKS.sub("", str(html)[:MAX_LEN]), tags=ALLOWED_TAGS, attributes=ALLOWED_ATTRS, protocols=ALLOWED_PROTOCOLS, strip=True)
    # force safe link behaviour
    return cleaned.replace("<a ", '<a rel="noopener nofollow" target="_blank" ').replace('rel="noopener nofollow" target="_blank" rel=', "rel=")


def plain_text(html: str | None) -> str:
    """Text-only view (for previews, word counts, search)."""
    return bleach.clean(html or "", tags=[], strip=True).strip()
