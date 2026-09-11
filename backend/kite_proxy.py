"""Optional fixed-IP egress for every Kite Connect call.

Zerodha whitelists the IP an app places orders from (SEBI algo framework, 2025). Render's outbound
addresses are a shared pool, so production routes Kite traffic through a tiny proxy with one dedicated
IP (Hostinger VPS, tinyproxy with basic auth; set KITE_PROXY_URL on Render, e.g.
http://user:pass@1.2.3.4:8888). Locally the variable is unset and calls go direct.
"""
from __future__ import annotations

import os


def kite_kwargs() -> dict:
    url = (os.environ.get("KITE_PROXY_URL") or "").strip()
    return {"proxies": {"http": url, "https": url}} if url else {}


def proxy_configured() -> bool:
    return bool((os.environ.get("KITE_PROXY_URL") or "").strip())
