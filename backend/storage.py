"""Local-disk object storage (factsheet PDFs, About-page images).

Replaces the former Emergent Object Storage integration with files stored
under UPLOADS_DIR (default: ./uploads next to this file). Keeps the same
interface used by analyst.py / about.py / server.py, so a future swap to
S3/Cloudflare R2 only needs to touch this module.
"""
from __future__ import annotations

import os
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

APP_NAME = "basketly"  # kept: existing DB records reference paths under this prefix

UPLOADS_DIR = Path(os.environ.get("UPLOADS_DIR") or (Path(__file__).parent / "uploads")).resolve()


def _resolve(path: str) -> Path:
    full = (UPLOADS_DIR / path).resolve()
    if not str(full).startswith(str(UPLOADS_DIR)):
        raise ValueError("Invalid storage path")
    return full


def init_storage() -> str:
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    logger.info("Local object storage at %s", UPLOADS_DIR)
    return str(UPLOADS_DIR)


def put_object(path: str, data: bytes, content_type: str) -> dict:
    full = _resolve(path)
    full.parent.mkdir(parents=True, exist_ok=True)
    full.write_bytes(data)
    return {"path": path, "size": len(data), "content_type": content_type}


def get_object(path: str) -> tuple[bytes, str]:
    full = _resolve(path)
    if not full.is_file():
        raise FileNotFoundError(path)
    import mimetypes

    ct = mimetypes.guess_type(str(full))[0] or "application/octet-stream"
    return full.read_bytes(), ct
