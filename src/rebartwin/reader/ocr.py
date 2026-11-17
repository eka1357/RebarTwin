"""OCR for pages whose text was exported as lines: no text layer and no comments (`Page.needs_ocr`).

Google Cloud Vision DOCUMENT_TEXT_DETECTION reads each tile (the same tiles Gemini reads); its word boxes become
`Word`s with `source` "ocr" in page box_2d units, and the parser reads them like any text layer. OCR words never go
into Gemini's prompt, so on these pages the two readings stay independent: Gemini sees only the image.

Like Gemini's replies, every Vision response is saved under `out/<project>/replies/` (keyed by a hash of the tile and
the feature) and replayed on a re-run. The REST call uses the standard library: no new dependency. The key is
`VISION_API_KEY` from `.env`; it goes in a header, never the URL, so it cannot reach a log line.
"""
from __future__ import annotations

import base64
import hashlib
import json
import logging
import os
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Protocol

from .gemini import CallRecord, ReadError, Tile, tiles, to_page
from .ingest import Page, Word

log = logging.getLogger("rebartwin.reader")

FEATURE = "DOCUMENT_TEXT_DETECTION"
VISION_URL = "https://vision.googleapis.com/v1/images:annotate"


class OcrTransport(Protocol):
    def annotate(self, *, key: str, png: bytes) -> dict: ...


class VisionTransport:
    """Cloud Vision over REST. Retries 429 and 5xx three times with backoff; anything else is raised."""

    def __init__(self, api_key: str | None = None, timeout: float = 120.0):
        self.api_key = api_key or os.environ.get("VISION_API_KEY")
        if not self.api_key:
            raise ReadError("set VISION_API_KEY in .env to read pages that have no text layer")
        self.timeout = timeout

    def annotate(self, *, key: str, png: bytes) -> dict:
        body = json.dumps({"requests": [{"image": {"content": base64.b64encode(png).decode()},
                                         "features": [{"type": FEATURE}]}]}).encode()
        for attempt in range(1, 4):
            request = urllib.request.Request(VISION_URL, data=body, method="POST", headers={
                "Content-Type": "application/json", "X-Goog-Api-Key": self.api_key})
            try:
                with urllib.request.urlopen(request, timeout=self.timeout) as r:
                    return json.loads(r.read())
            except urllib.error.HTTPError as e:
                if e.code in (429, 500, 502, 503, 504) and attempt < 3:
                    log.warning("vision %s attempt=%d code=%d", key, attempt, e.code)
                    time.sleep(2 ** attempt)
                    continue
                log.error("vision %s failed code=%d", key, e.code)
                raise ReadError(f"{key}: Cloud Vision returned {e.code}") from None
        raise ReadError(f"{key}: Cloud Vision did not answer")


class RecordedOcr:
    """Replays `<dir>/<key>.json` (a Vision response body). A missing recording is an error."""

    def __init__(self, directory: Path):
        self.directory = directory
        self.calls: list[str] = []

    def annotate(self, *, key: str, png: bytes) -> dict:
        self.calls.append(key)
        path = self.directory / f"{key}.json"
        if not path.is_file():
            raise ReadError(f"no recorded OCR reply {path.name}")
        return json.loads(path.read_text(encoding="utf-8"))


class CachingOcr:
    """Saves each response as `<dir>/<hash>.json` and replays it. With `inner` None it only replays."""

    def __init__(self, inner: OcrTransport | None, directory: Path, ledger: list[CallRecord] | None = None):
        self.inner, self.directory = inner, directory
        self.directory.mkdir(parents=True, exist_ok=True)
        self.ledger = ledger if ledger is not None else []
        self._lock = threading.Lock()

    def annotate(self, *, key: str, png: bytes) -> dict:
        digest = hashlib.sha256(FEATURE.encode() + b"\0" + png).hexdigest()[:32]
        path = self.directory / f"{digest}.json"
        t0 = time.perf_counter()
        if path.is_file():
            body, cached = json.loads(path.read_text(encoding="utf-8")), True
        else:
            if self.inner is None:
                raise ReadError(f"{key}: no saved OCR reply and no VISION_API_KEY")
            body, cached = self.inner.annotate(key=key, png=png), False
            path.write_text(json.dumps(body, ensure_ascii=False), encoding="utf-8")
        ms = round(1000 * (time.perf_counter() - t0))
        with self._lock:
            self.ledger.append(CallRecord(key, f"vision:{FEATURE}", cached, None, None, ms))
        log.info("vision %s cached=%s latency_ms=%d", key, cached, ms)
        return body


def words_from(body: dict, tile: Tile, page_number: int) -> list[Word]:
    """Vision's word boxes (pixels in the tile image, possibly rotated quadrilaterals; a 0 coordinate is omitted) as
    axis-aligned page box_2d words. textAnnotations[0] is the whole text and is skipped."""
    import pymupdf

    response = (body.get("responses") or [{}])[0]
    if "error" in response:
        raise ReadError(f"Cloud Vision error {response['error'].get('code')}")
    pix = pymupdf.Pixmap(tile.png)
    out = []
    for k, ann in enumerate(response.get("textAnnotations", [])[1:]):
        vs = ann.get("boundingPoly", {}).get("vertices", [])
        if not vs or not ann.get("description", "").strip():
            continue
        xs, ys = [v.get("x", 0) for v in vs], [v.get("y", 0) for v in vs]
        in_tile = (round(1000 * min(ys) / pix.height), round(1000 * min(xs) / pix.width),
                   round(1000 * max(ys) / pix.height), round(1000 * max(xs) / pix.width))
        y0, x0, y1, x1 = to_page(in_tile, tile.box)
        out.append(Word(ann["description"].strip(), (y0, x0, max(y1, y0 + 1), max(x1, x0 + 1)), page_number,
                        (-2, tile.index * 100000 + k), "ocr"))
    return out


def ocr_pages(pages: list[Page], transport: OcrTransport, tile_px: int = 3000, concurrency: int = 3) -> list[int]:
    """OCR every page marked `needs_ocr`, adding its words. Returns the pages that could not be read (no key and no
    saved reply); their parser channel stays empty and their values go to To check as missing."""
    from .agree import same_place

    jobs = [(p, t) for p in pages if p.needs_ocr for t in tiles(p, tile_px)]

    def run(job):
        page, t = job
        try:
            return words_from(transport.annotate(key=f"ocr-p{page.number}-t{t.index}", png=t.png), t, page.number)
        except ReadError as e:
            log.warning("ocr page %d tile %d skipped: %s", page.number, t.index, type(e).__name__)
            return None

    with ThreadPoolExecutor(max_workers=max(1, concurrency)) as pool:
        results = list(pool.map(run, jobs))
    skipped: set[int] = set()
    for (page, _), words in zip(jobs, results):
        if words is None:
            skipped.add(page.number)
            continue
        mine = [w for w in page.words if w.source == "ocr"]
        for w in words:                                # tiles overlap: keep one of each word
            if not any(o.text == w.text and same_place(o.box, w.box) for o in mine):
                page.words.append(w)
                mine.append(w)
        page.ocr_words = len(mine)
    return sorted(skipped)
