"""R3: the Gemini channel. Reads a page image plus its text layer and returns callouts with `box_2d`.

The model call sits behind a `Transport` so tests replay recorded replies with no key and no network. Every call is
temperature 0 with a JSON response schema, retried with backoff on rate limits and server errors, and logged as
model, tokens and latency only: drawing text never reaches the log.

Large sheets are read in overlapping tiles. An A1 sheet at 200 dpi is about 6600 x 4700 px, and small callout text
does not survive the model's downsampling of a whole sheet; each tile's boxes are mapped back to page coordinates.
"""
from __future__ import annotations

import json
import logging
import math
import os
import random
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Literal, Protocol

from pydantic import BaseModel, Field, ValidationError

from .ingest import Box, Page, Word
from .parser import union, visual_lines

log = logging.getLogger("rebartwin.reader")

PROMPTS = Path(__file__).parent / "prompts"
READ_PROMPT = "read_v1"
DEFAULT_READ_MODEL = "gemini-3.8-flash"

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
                 temperature: float = 0.0, high_res: bool = False) -> Reply: ...


class ModelNotFound(RuntimeError):
    pass


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

    if os.environ.get("GOOGLE_GENAI_USE_VERTEXAI", "").lower() in ("1", "true", "yes"):
        project = os.environ.get("GOOGLE_CLOUD_PROJECT")
        if not project:
            raise ReadError("GOOGLE_GENAI_USE_VERTEXAI is true but GOOGLE_CLOUD_PROJECT is not set")
        return genai.Client(vertexai=True, project=project, location=os.environ.get("GOOGLE_CLOUD_LOCATION", "global"))
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        raise ReadError("set GEMINI_API_KEY in .env (see .env.example), or GOOGLE_GENAI_USE_VERTEXAI=true")
    return genai.Client(api_key=key)


class GenAITransport:
    """The real thing: google-genai, structured JSON output."""

    def __init__(self, client=None):
        self.client = client or make_client()

    def generate(self, *, key: str, model: str, parts: list[tuple[str, Any]], schema: dict,
                 temperature: float = 0.0, high_res: bool = False) -> Reply:
        from google.genai import types

        contents = [types.Part.from_text(text=p) if kind == "text" else types.Part.from_bytes(data=p, mime_type=kind)
                    for kind, p in parts]
        config = types.GenerateContentConfig(
            temperature=temperature, response_mime_type="application/json", response_json_schema=schema,
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
                 temperature: float = 0.0, high_res: bool = False) -> Reply:
        self.calls.append({"key": key, "model": model, "parts": parts, "schema": schema, "temperature": temperature})
        path = self.directory / f"{key}.json"
        if not path.is_file():
            raise ReadError(f"no recorded reply {path.name}")
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict) and "text" in data:
            return Reply(data["text"], data.get("model", model), data.get("prompt_tokens"), data.get("output_tokens"))
        return Reply(json.dumps(data), model)


def _status(e: Exception) -> int | None:
    code = getattr(e, "code", None) or getattr(e, "status_code", None)
    return code if isinstance(code, int) else None


def _retryable(e: Exception) -> bool:
    if _status(e) in (408, 429, 500, 502, 503, 504):
        return True
    return isinstance(e, (TimeoutError, ConnectionError)) or type(e).__name__ in (
        "ReadTimeout", "ConnectTimeout", "WriteTimeout", "PoolTimeout", "ConnectError", "RemoteProtocolError")


def _not_found(e: Exception) -> bool:
    return _status(e) in (400, 404) and "not found" in str(e).lower() and "model" in str(e).lower()


def call(transport: Transport, *, key: str, model: str, parts: list[tuple[str, Any]], schema: dict,
         validate: Callable[[str], Any], high_res: bool = False, attempts: int = 4,
         sleep: Callable[[float], None] = time.sleep) -> Any:
    """One model call with retries. `validate` turns the reply text into the result; a reply that fails it is
    retried like a server error. Logs ids, model, tokens and latency; never the parts or the reply."""
    last: Exception | None = None
    for attempt in range(1, attempts + 1):
        t0 = time.perf_counter()
        try:
            reply = transport.generate(key=key, model=model, parts=parts, schema=schema, temperature=0.0,
                                       high_res=high_res)
            ms = round(1000 * (time.perf_counter() - t0))
            try:
                result = validate(reply.text)
            except (ValueError, ValidationError) as e:
                log.warning("gemini %s model=%s attempt=%d invalid reply (%s) latency_ms=%d", key, model, attempt,
                            type(e).__name__, ms)
                last = e
            else:
                log.info("gemini %s model=%s attempt=%d prompt_tokens=%s output_tokens=%s latency_ms=%d", key,
                         reply.model, attempt, reply.prompt_tokens, reply.output_tokens, ms)
                return result
        except Exception as e:  # noqa: BLE001 - classified below, re-raised when not retryable
            if _not_found(e):
                log.warning("gemini %s model=%s not found", key, model)
                raise ModelNotFound(model) from e
            if not _retryable(e):
                log.error("gemini %s model=%s failed: %s code=%s", key, model, type(e).__name__, _status(e))
                raise
            log.warning("gemini %s model=%s attempt=%d %s code=%s", key, model, attempt, type(e).__name__, _status(e))
            last = e
        if attempt < attempts:
            sleep(2 ** (attempt - 1) + random.uniform(0, 0.25))
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
    lines = []
    for line in visual_lines(page):
        if not any(_inside(w, tile.box) for w in line):
            continue
        b = to_tile(union([w.box for w in line]), tile.box)
        lines.append(f"{' '.join(w.text for w in line)}\t[{b[0]}, {b[1]}, {b[2]}, {b[3]}]")
    template = (PROMPTS / f"{READ_PROMPT}.md").read_text(encoding="utf-8")
    where = f"page {page.number}" + (f", tile {tile.index + 1} of {n_tiles}" if n_tiles > 1 else "")
    return (template.replace("{where}", where).replace("{page}", str(page.number))
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


def read_page(page: Page, transport: Transport, model: str | None = None, tile_px: int = 3000,
              sleep: Callable[[float], None] = time.sleep) -> list[Read]:
    """Every callout on a page, deduplicated across tile overlaps."""
    model = model or os.environ.get("REBARTWIN_MODEL_READ") or DEFAULT_READ_MODEL
    schema = PageReading.model_json_schema()
    found: list[Read] = []
    parts_of = tiles(page, tile_px)
    for t in parts_of:
        key = f"read-p{page.number}-t{t.index}"
        reading = call(transport, key=key, model=model, schema=schema, high_res=True,
                       parts=[("image/png", t.png), ("text", prompt(page, t, len(parts_of)))],
                       validate=lambda text: PageReading.model_validate_json(text), sleep=sleep)
        for c in reading.callouts:
            c.page = page.number
            box = to_page(c.box_2d, t.box)
            if any(r.callout.member == c.member and r.callout.field == c.field and r.callout.layer == c.layer
                   and r.callout.value == c.value and _overlaps(r.box, box) for r in found):
                continue
            found.append(Read(c, box, key, model))
    return found
