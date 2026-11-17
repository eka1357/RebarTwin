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
import re
from dataclasses import replace
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

from .gemini import CallRecord, ReadError, Tile, tiles
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
        th, tw = tile.box[2] - tile.box[0], tile.box[3] - tile.box[1]
        y0, y1 = tile.box[0] + th * min(ys) / pix.height, tile.box[0] + th * max(ys) / pix.height
        x0, x1 = tile.box[1] + tw * min(xs) / pix.width, tile.box[1] + tw * max(xs) / pix.width
        out.append(Word(ann["description"].strip(), (y0, x0, max(y1, y0 + 0.1), max(x1, x0 + 0.1)), page_number,
                        (-2, tile.index * 100000 + k), "ocr"))
    return repair(out)


# --- Ø misreads -----------------------------------------------------------------------------------------------------
# OCR reads the diameter sign as 0, O, Q, •, θ (or Θ). A repair is made only when exactly one reading gives a standard
# callout, only on OCR words (never the text layer or comments), and the raw text is kept. Agreement is unchanged: a
# repaired value is accepted only if Gemini, reading the image alone, gives the same value at the same place.

MISREAD = "0OQ•θΘ"
REPAIR_BAR_DIAS = {8, 10, 12, 16, 20, 25, 28, 32, 36, 40}
REPAIR_LINK_DIAS = {6, 8, 10, 12}
_LINK = re.compile(rf"[{MISREAD}](\d{{1,2}})(?:@(\d{{2,3}})(.*))?")
_SPACING = re.compile(r"(\d{2,3})(?![\d.])")


def bar_reading(token: str) -> str | None:
    """'4016' -> '4Ø16': count 1 to 24, a misread Ø, a standard bar size; None unless exactly one split works."""
    if not re.fullmatch(rf"\d[\d{MISREAD}]*\d", token):
        return None
    found = []
    for i in range(1, len(token) - 1):
        n, d = token[:i], token[i + 1:]
        if token[i] in MISREAD and n.isdigit() and d.isdigit() and n[0] != "0" and d[0] != "0" \
                and 1 <= int(n) <= 24 and int(d) in REPAIR_BAR_DIAS:
            found.append(f"{int(n)}Ø{int(d)}")
    return found[0] if len(found) == 1 else None


def _spacing_ok(text: str) -> bool:
    m = _SPACING.match(text)
    return bool(m) and 50 <= int(m.group(1)) <= 300 and int(m.group(1)) % 5 == 0


def repair(words: list[Word]) -> list[Word]:
    """Repair misread Ø in bars ('4016' -> '4Ø16') and links ('Q8 @ 200', '08@200' -> 'Ø8 @ 200'), in Vision's
    reading order so a link's '@' and spacing are the next words. Each repaired word keeps `raw`."""
    out = list(words)
    for i, w in enumerate(out):
        fixed = bar_reading(w.text)
        if fixed is None:
            m = _LINK.fullmatch(w.text)
            if m and int(m.group(1)) in REPAIR_LINK_DIAS and m.group(1)[0] != "0":
                if m.group(2):
                    ok = _spacing_ok(m.group(2) + (m.group(3) or ""))
                else:
                    ok = i + 2 < len(out) and out[i + 1].text == "@" and _spacing_ok(out[i + 2].text)
                if ok:
                    fixed = "Ø" + w.text[1:]
        if fixed is not None:
            out[i] = replace(w, text=fixed, raw=w.text)
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
        page.ocr_repairs = sum(1 for w in mine if w.raw)
    return sorted(skipped)
