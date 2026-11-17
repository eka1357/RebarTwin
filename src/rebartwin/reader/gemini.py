"""R3: the Gemini channel. Reads a page image plus its text layer and returns callouts with `box_2d`.

The model call sits behind a `Transport` so tests replay recorded replies with no key and no network. Every call uses
a JSON response schema and is logged as model, tokens and latency only: drawing text never reaches the log.

No sampling parameters are sent. Gemini 3.6 and later ignore temperature, top_p and top_k, flag them as deprecated and
will reject them; the response schema is what keeps the output stable.

One retry layer each: google-genai retries 408, 429 and 5xx with backoff (`RETRY`); `call` retries only replies that
fail validation. A key that cannot use a model (403, 404, or a 429 whose quota limit is 0) raises `ModelNotFound` at
once, so linking falls back to the next model.

`CachingTransport` saves every reply under `out/<project>/replies/`, keyed by a hash of the model and everything
sent (tile image, prompt version and prompt text), and replays it on a re-run: the demo never waits on the API.

Large sheets are read in overlapping tiles. An A1 sheet at 200 dpi is about 6600 x 4700 px, and small callout text
does not survive the model's downsampling of a whole sheet; each tile's boxes are mapped back to page coordinates.
Tiles run concurrently (`concurrency`, default 3).
"""
from __future__ import annotations

import hashlib
import json
import logging
import math
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Literal, Protocol

from pydantic import BaseModel, Field, ValidationError

from .ingest import Box, Page, Word
from .parser import union, visual_lines

log = logging.getLogger("rebartwin.reader")

PROMPTS = Path(__file__).parent / "prompts"
READ_PROMPT = "read_v2"
DEFAULT_READ_MODEL = "gemini-3.8-flash"
RETRY = {"attempts": 4, "initial_delay": 1.0, "max_delay": 60.0, "http_status_codes": [408, 429, 500, 502, 503, 504]}

FieldName = Literal["section", "top", "top_extra", "bottom", "bottom_extra", "main", "links", "cover",
                    "concrete_grade", "steel_grade", "seismic_zone", "exposure", "frames_into"]
FIELD_KIND: dict[str, str] = {
    "section": "section", "top": "bars", "top_extra": "bars", "bottom": "bars", "bottom_extra": "bars",
    "main": "bars", "links": "links", "cover": "cover", "concrete_grade": "concrete_grade",
    "steel_grade": "steel_grade", "seismic_zone": "seismic_zone", "exposure": "exposure", "frames_into": "member"}
GLOBAL_MEMBERS = {"ALL", "ALL_BEAMS", "ALL_COLUMNS"}


class Callout(BaseModel):
    """One value on the drawing, as Gemini read it."""
    member: str = Field(description="member id exactly as written (B12, C4, FB3); ALL, ALL_BEAMS or ALL_COLUMNS "
                                    "for a general note")
    field: FieldName
    layer: int = Field(default=1, ge=1, le=3, description="bar layer for top and bottom bars, 1 = outermost")
    level: str | None = Field(default=None, description="as written: for a column schedule value, the storey header "
                                                        "it sits under ('FOUNDATION TO FIRST FLOOR'); for a beam "
                                                        "value or frames_into, the floor of the schedule or plan "
                                                        "('FIRST FLOOR'); null when the sheet gives none")
    value: str = Field(description="the value exactly as written on the drawing, e.g. '5-20', '230x450', "
                                   "'8φ @ 150 c/c'; for frames_into, the column id")
    box_2d: list[int] = Field(min_length=4, max_length=4, description="[ymin, xmin, ymax, xmax], 0 to 1000")
    page: int = Field(default=1, description="page number")


class PageReading(BaseModel):
    callouts: list[Callout]


@dataclass
class Reply:
    text: str
    model: str
    prompt_tokens: int | None = None
    output_tokens: int | None = None


class Transport(Protocol):
    def generate(self, *, key: str, model: str, parts: list[tuple[str, Any]], schema: dict,
                 high_res: bool = False) -> Reply: ...


class ModelNotFound(RuntimeError):
    """This key cannot use this model: missing, not allowed, or no quota (no free tier)."""


class ReadError(RuntimeError):
    pass


def load_env(path: Path = Path(".env")) -> None:
    """Fill unset environment variables from `.env`. No dependency: KEY=VALUE lines, # comments, empty values skipped."""
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        k, v = k.strip(), v.strip().strip('"').strip("'")
        if v and k not in os.environ:
            os.environ[k] = v


def make_client():
    """AI Studio with GEMINI_API_KEY locally; Vertex AI when GOOGLE_GENAI_USE_VERTEXAI=true (Cloud Run)."""
    from google import genai
    from google.genai import types

    options = types.HttpOptions(retry_options=types.HttpRetryOptions(**RETRY))
    if os.environ.get("GOOGLE_GENAI_USE_VERTEXAI", "").lower() in ("1", "true", "yes"):
        project = os.environ.get("GOOGLE_CLOUD_PROJECT")
        if not project:
            raise ReadError("GOOGLE_GENAI_USE_VERTEXAI is true but GOOGLE_CLOUD_PROJECT is not set")
        return genai.Client(vertexai=True, project=project, http_options=options,
                            location=os.environ.get("GOOGLE_CLOUD_LOCATION", "global"))
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        raise ReadError("set GEMINI_API_KEY in .env (see .env.example), or GOOGLE_GENAI_USE_VERTEXAI=true")
    return genai.Client(api_key=key, http_options=options)


class GenAITransport:
    """The real thing: google-genai, structured JSON output, the SDK's own retries."""

    def __init__(self, client=None):
        self.client = client or make_client()

    def generate(self, *, key: str, model: str, parts: list[tuple[str, Any]], schema: dict,
                 high_res: bool = False) -> Reply:
        from google.genai import types

        contents = [types.Part.from_text(text=p) if kind == "text" else types.Part.from_bytes(data=p, mime_type=kind)
                    for kind, p in parts]
        config = types.GenerateContentConfig(
            response_mime_type="application/json", response_json_schema=schema,
            media_resolution=types.MediaResolution.MEDIA_RESOLUTION_HIGH if high_res else None)
        r = self.client.models.generate_content(model=model, contents=contents, config=config)
        u = r.usage_metadata
        return Reply(r.text or "", getattr(r, "model_version", None) or model,
                     getattr(u, "prompt_token_count", None), getattr(u, "candidates_token_count", None))


class RecordedTransport:
    """Replays `<dir>/<key>.json`: {"text": "...", "model": "...", "prompt_tokens": n, "output_tokens": n}, or the
    reply body itself as JSON. A missing recording is an error, so a test never silently reads nothing."""

    def __init__(self, directory: Path):
        self.directory = directory
        self.calls: list[dict] = []

    def generate(self, *, key: str, model: str, parts: list[tuple[str, Any]], schema: dict,
                 high_res: bool = False) -> Reply:
        self.calls.append({"key": key, "model": model, "parts": parts, "schema": schema})
        path = self.directory / f"{key}.json"
        if not path.is_file():
            raise ReadError(f"no recorded reply {path.name}")
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict) and "text" in data:
            return Reply(data["text"], data.get("model", model), data.get("prompt_tokens"), data.get("output_tokens"))
        return Reply(json.dumps(data), model)


@dataclass
class CallRecord:
    key: str
    model: str
    cached: bool
    prompt_tokens: int | None
    output_tokens: int | None
    latency_ms: int


def reply_hash(model: str, parts: list[tuple[str, Any]]) -> str:
    """The cache key: the model and every part sent. The prompt text carries its version and the page's words, the
    image part is the tile, so a changed prompt, tile or model is a new key."""
    h = hashlib.sha256(model.encode())
    for kind, p in parts:
        h.update(b"\0" + kind.encode() + b"\0")
        h.update(p if isinstance(p, bytes) else str(p).encode("utf-8"))
    return h.hexdigest()[:32]


class CachingTransport:
    """Saves each reply as `<dir>/<hash>.json` and replays it next time. Keeps a ledger of calls for reading.json.
    With `inner` None it only replays. A reply that fails validation is still saved; delete the file to ask again."""

    def __init__(self, inner: Transport | None, directory: Path):
        self.inner, self.directory = inner, directory
        self.directory.mkdir(parents=True, exist_ok=True)
        self.ledger: list[CallRecord] = []
        self._lock = threading.Lock()

    def generate(self, *, key: str, model: str, parts: list[tuple[str, Any]], schema: dict,
                 high_res: bool = False) -> Reply:
        path = self.directory / f"{reply_hash(model, parts)}.json"
        t0 = time.perf_counter()
        if path.is_file():
            d = json.loads(path.read_text(encoding="utf-8"))
            reply, cached = Reply(d["text"], d["model"], d.get("prompt_tokens"), d.get("output_tokens")), True
        else:
            if self.inner is None:
                raise ReadError(f"{key}: no saved reply and no model access (replay only)")
            reply, cached = self.inner.generate(key=key, model=model, parts=parts, schema=schema,
                                                high_res=high_res), False
            path.write_text(json.dumps({"key": key, "model": reply.model, "text": reply.text,
                                        "prompt_tokens": reply.prompt_tokens,
                                        "output_tokens": reply.output_tokens}, ensure_ascii=False), encoding="utf-8")
        with self._lock:
            self.ledger.append(CallRecord(key, reply.model, cached, reply.prompt_tokens, reply.output_tokens,
                                          round(1000 * (time.perf_counter() - t0))))
        return reply


def _status(e: Exception) -> int | None:
    code = getattr(e, "code", None) or getattr(e, "status_code", None)
    return code if isinstance(code, int) else None


def unavailable(e: Exception) -> bool:
    """This key cannot use this model: 403, 404, or a 429 whose quota limit is 0 (no free tier). Retrying is useless."""
    code = _status(e)
    return code in (403, 404) or (code == 429 and "limit: 0" in str(e))


def dropped(e: Exception) -> bool:
    """A connection that broke with no HTTP answer (reset, timeout, 'server disconnected'). The SDK's retries cover
    status codes only, so these are retried here; they carry no status code, so the two layers never overlap."""
    if _status(e) is not None:
        return False
    if isinstance(e, (ConnectionError, TimeoutError)):
        return True
    return type(e).__module__.split(".")[0] in ("httpx", "httpx2", "httpcore") and type(e).__name__ in (
        "RemoteProtocolError", "ReadError", "WriteError", "ConnectError", "ReadTimeout", "WriteTimeout",
        "ConnectTimeout", "PoolTimeout")


def call(transport: Transport, *, key: str, model: str, parts: list[tuple[str, Any]], schema: dict,
         validate: Callable[[str], Any], high_res: bool = False, attempts: int = 3,
         sleep: Callable[[float], None] = time.sleep) -> Any:
    """One model call. Retries replies that fail `validate` and connections that dropped with no HTTP answer (the
    SDK retries status codes). Logs ids, model, tokens and latency; never the parts or the reply."""
    last: Exception | None = None
    for attempt in range(1, attempts + 1):
        t0 = time.perf_counter()
        try:
            reply = transport.generate(key=key, model=model, parts=parts, schema=schema, high_res=high_res)
        except Exception as e:  # noqa: BLE001 - classified, then re-raised
            if unavailable(e):
                log.warning("gemini %s model=%s unavailable to this key (code=%s)", key, model, _status(e))
                raise ModelNotFound(model) from e
            if dropped(e) and attempt < attempts:
                log.warning("gemini %s model=%s attempt=%d connection dropped (%s)", key, model, attempt,
                            type(e).__name__)
                last = e
                sleep(2 ** attempt)
                continue
            log.error("gemini %s model=%s failed: %s code=%s", key, model, type(e).__name__, _status(e))
            raise
        ms = round(1000 * (time.perf_counter() - t0))
        try:
            result = validate(reply.text)
        except (ValueError, ValidationError) as e:
            log.warning("gemini %s model=%s attempt=%d invalid reply (%s) latency_ms=%d", key, model, attempt,
                        type(e).__name__, ms)
            last = e
            continue
        log.info("gemini %s model=%s attempt=%d prompt_tokens=%s output_tokens=%s latency_ms=%d", key, reply.model,
                 attempt, reply.prompt_tokens, reply.output_tokens, ms)
        return result
    raise ReadError(f"{key}: no valid reply from {model} after {attempts} attempts ({type(last).__name__})")


# --- tiling -----------------------------------------------------------------------------------------------------

@dataclass(frozen=True)
class Tile:
    index: int
    box: Box                       # the tile on the page, box_2d units
    png: bytes = field(repr=False)


def tile_boxes(width_px: int, height_px: int, tile_px: int = 3000, overlap: float = 0.08) -> list[Box]:
    """A grid of overlapping tiles no larger than about `tile_px`, in page box_2d units.

    Overlap keeps a callout that straddles a seam whole in at least one tile."""
    cols, rows = max(1, math.ceil(width_px / tile_px)), max(1, math.ceil(height_px / tile_px))
    boxes = []
    for r in range(rows):
        for c in range(cols):
            y0, y1 = 1000 * r / rows, 1000 * (r + 1) / rows
            x0, x1 = 1000 * c / cols, 1000 * (c + 1) / cols
            oy, ox = (overlap * 1000 / rows if rows > 1 else 0), (overlap * 1000 / cols if cols > 1 else 0)
            boxes.append((max(0, round(y0 - oy)), max(0, round(x0 - ox)), min(1000, round(y1 + oy)),
                          min(1000, round(x1 + ox))))
    return boxes


def tiles(page: Page, tile_px: int = 3000) -> list[Tile]:
    import pymupdf

    full = pymupdf.Pixmap(page.png)
    out = []
    for i, b in enumerate(tile_boxes(full.width, full.height, tile_px)):
        if b == (0, 0, 1000, 1000):
            out.append(Tile(i, b, page.png))
            continue
        rect = pymupdf.IRect(round(b[1] * full.width / 1000), round(b[0] * full.height / 1000),
                             round(b[3] * full.width / 1000), round(b[2] * full.height / 1000))
        part = pymupdf.Pixmap(full.colorspace, rect, full.alpha)
        part.copy(full, rect)
        part.set_origin(0, 0)
        out.append(Tile(i, b, part.tobytes("png")))
    return out


def to_tile(box: Box, tile: Box) -> Box:
    h, w = tile[2] - tile[0], tile[3] - tile[1]
    f = lambda v, o, s: max(0, min(1000, round(1000 * (v - o) / s)))  # noqa: E731
    return f(box[0], tile[0], h), f(box[1], tile[1], w), f(box[2], tile[0], h), f(box[3], tile[1], w)


def to_page(box: Box | list[int], tile: Box) -> Box:
    """Tile box_2d back to page box_2d. Gemini sometimes swaps min and max; sort each axis."""
    h, w = tile[2] - tile[0], tile[3] - tile[1]
    y0, y1 = sorted((box[0], box[2]))
    x0, x1 = sorted((box[1], box[3]))
    return (round(tile[0] + y0 * h / 1000), round(tile[1] + x0 * w / 1000),
            round(tile[0] + y1 * h / 1000), round(tile[1] + x1 * w / 1000))


def _inside(word: Word, tile: Box) -> bool:
    cy, cx = (word.box[0] + word.box[2]) / 2, (word.box[1] + word.box[3]) / 2
    return tile[0] <= cy <= tile[2] and tile[1] <= cx <= tile[3]


def prompt(page: Page, tile: Tile, n_tiles: int) -> str:
    """The read prompt for one tile, with the drawing's own text (text layer and comments). OCR words are left out:
    on a page only OCR can read, Gemini sees just the image, so its reading stays independent of the parser's."""
    from dataclasses import replace

    lines = []
    for line in visual_lines(replace(page, words=[w for w in page.words if w.source != "ocr"])):
        if not any(_inside(w, tile.box) for w in line):
            continue
        b = to_tile(union([w.box for w in line]), tile.box)
        lines.append(f"{' '.join(w.text for w in line)}\t[{b[0]}, {b[1]}, {b[2]}, {b[3]}]")
    template = (PROMPTS / f"{READ_PROMPT}.md").read_text(encoding="utf-8")
    where = f"page {page.number}" + (f", tile {tile.index + 1} of {n_tiles}" if n_tiles > 1 else "")
    return (f"<!-- {READ_PROMPT} -->\n" + template.replace("{where}", where).replace("{page}", str(page.number))
            .replace("{words}", "\n".join(lines) if lines else "(this image has no text layer)"))


@dataclass(frozen=True)
class Read:
    """A callout in page coordinates, with the key of the call that produced it."""
    callout: Callout
    box: Box
    call: str
    model: str


def _overlaps(a: Box, b: Box) -> bool:
    from .agree import same_place
    return same_place(a, b)


def read_pages(pages: list[Page], transport: Transport, model: str | None = None, tile_px: int = 3000,
               concurrency: int = 3) -> list[Read]:
    """Every callout on every page, tiles read `concurrency` at a time, deduplicated across tile overlaps."""
    model = model or os.environ.get("REBARTWIN_MODEL_READ") or DEFAULT_READ_MODEL
    schema = PageReading.model_json_schema()
    jobs = []
    for page in pages:
        parts_of = tiles(page, tile_px)
        jobs.extend((page, t, len(parts_of)) for t in parts_of)

    def run(job):
        page, t, n = job
        return call(transport, key=f"read-p{page.number}-t{t.index}", model=model, schema=schema, high_res=True,
                    parts=[("image/png", t.png), ("text", prompt(page, t, n))],
                    validate=lambda text: PageReading.model_validate_json(text))

    with ThreadPoolExecutor(max_workers=max(1, concurrency)) as pool:
        readings = list(pool.map(run, jobs))           # in job order, so results are deterministic

    found: list[Read] = []
    for (page, t, _), reading in zip(jobs, readings):
        key = f"read-p{page.number}-t{t.index}"
        mine = [r for r in found if r.callout.page == page.number]
        for c in reading.callouts:
            c.page = page.number
            box = to_page(c.box_2d, t.box)
            if any(r.callout.member == c.member and r.callout.field == c.field and r.callout.layer == c.layer
                   and r.callout.value == c.value and _overlaps(r.box, box) for r in mine):
                continue
            r = Read(c, box, key, model)
            found.append(r)
            mine.append(r)
    return found


def read_page(page: Page, transport: Transport, model: str | None = None, tile_px: int = 3000,
              concurrency: int = 3) -> list[Read]:
    return read_pages([page], transport, model, tile_px, concurrency)
