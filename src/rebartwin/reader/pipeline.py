"""`rebartwin read`: ingest, both channels, agreement, linking, and the files the API and web app read.

    out/pages/page-<n>.png    rendered pages, for Source crops
    out/replies/<hash>.json   every model reply, replayed on a re-run (no API wait)
    out/joints/<id>.json      one Joint per joint (blocked joints too, so a person can see what was linked)
    out/joints/<id>/          for each checked joint: the check outputs, bundle.json with `provenance` and `pages`,
                              and the page images it cites (see `attach_sources`)
    out/provenance.json       [{joint, fields: {path: {page, box_2d, text, gemini, parser, status}}, link_notes}]
    out/to_check.json         every item a person must decide; joint null + member ALL = project-level
    out/reading.json          the run: models, prompt versions, counts, calls (tokens, latency, cached), accepted
                              fields, unassigned values
"""
from __future__ import annotations

import json
import shutil
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path

from .agree import Accepted, Agreement, agree
from .gemini import READ_PROMPT, CachingTransport, Transport, read_pages
from .ingest import ingest
from .ocr import CachingOcr, OcrTransport, ocr_pages
from .link import LINK_PROMPT, Linked, Verified, blocks, link
from .parser import parse_page


@dataclass
class Result:
    out: Path
    pages: int
    agreement: Agreement
    linked: Linked
    seconds: float = 0.0
    calls: list[dict] = field(default_factory=list)
    blocked: dict[str, int] = field(default_factory=dict)     # joint id -> unresolved items

    @property
    def ready(self) -> list[str]:
        return [v.joint.id for v in self.linked.joints if not self.blocked.get(v.joint.id)]


def read(pdf: Path, out: Path, transport: Transport | None, *, ocr: OcrTransport | None = None,
         pages: list[int] | None = None, dpi: int = 200, tile_px: int = 3000, concurrency: int = 3,
         read_model: str | None = None,
         link_model: str | None = None) -> Result:
    """Read a drawing. `transport` None replays saved Gemini replies only; `ocr` None replays saved OCR replies
    only (a page with neither is left without a parser channel and listed in reading.json)."""
    t0 = time.perf_counter()
    out.mkdir(parents=True, exist_ok=True)
    cache = CachingTransport(transport, out / "replies")
    sheets = ingest(pdf, out, dpi=dpi, pages=pages)
    ocr_skipped = ocr_pages(sheets, CachingOcr(ocr, out / "replies", cache.ledger), tile_px, concurrency) \
        if any(p.needs_ocr for p in sheets) else []
    matches = [m for page in sheets for m in parse_page(page)]
    reads = read_pages(sheets, cache, read_model, tile_px=tile_px, concurrency=concurrency)
    agreement = agree(reads, matches, sheets)
    linked = link(agreement, cache, link_model)

    joints_dir = out / "joints"
    joints_dir.mkdir(exist_ok=True)
    for v in linked.joints:
        (joints_dir / f"{v.joint.id}.json").write_text(v.joint.model_dump_json(indent=1), encoding="utf-8")
    provenance = [{"joint": v.joint.id, "fields": v.provenance, "link_notes": linked.link_notes.get(v.joint.id, [])}
                  for v in linked.joints]
    (out / "provenance.json").write_text(json.dumps(provenance, indent=1, ensure_ascii=False), encoding="utf-8")
    items = [t.to_json() for t in linked.to_check]
    (out / "to_check.json").write_text(json.dumps(items, indent=1, ensure_ascii=False), encoding="utf-8")
    blocked = {v.joint.id: n for v in linked.joints
               if (n := sum(blocks(t, v.joint.id) for t in linked.to_check))}
    calls = [asdict(c) for c in cache.ledger]
    seconds = round(time.perf_counter() - t0, 1)
    reading = {
        "pdf": pdf.name, "pages": [p.number for p in sheets], "dpi": dpi, "tile_px": tile_px,
        "prompts": {"read": READ_PROMPT, "link": LINK_PROMPT}, "link_model": linked.model, "seconds": seconds,
        "text_layer": [{"page": p.number, "words": p.text_words, "annotations": p.annotations,
                        "comments": p.comments, "ocr": p.needs_ocr, "ocr_words": p.ocr_words} for p in sheets],
        "ocr_skipped": ocr_skipped,
        "counts": {"callouts": len(reads), "parser_matches": len(matches), "accepted": len(agreement.accepted),
                   "to_check": len(linked.to_check), "unassigned": len(agreement.unassigned),
                   "joints": len(linked.joints)},
        "tokens": {"prompt": sum(c["prompt_tokens"] or 0 for c in calls if not c["cached"]),
                   "output": sum(c["output_tokens"] or 0 for c in calls if not c["cached"])},
        "calls": calls,
        "accepted": [{**asdict(a), "box": list(a.box), "gemini_box": list(a.gemini_box)} for a in agreement.accepted],
        "unassigned": [t.to_json() for t in agreement.unassigned],
    }
    (out / "reading.json").write_text(json.dumps(reading, indent=1, ensure_ascii=False), encoding="utf-8")
    return Result(out, len(sheets), agreement, linked, seconds, calls, blocked)


def source_entries(v: Verified, fields: dict[str, Accepted]) -> list[dict]:
    """The Source contract for one joint: every value with where it came from. Agreed values carry the drawing's box
    and page image; defaults carry neither."""
    entries = []
    for path, prov in v.provenance.items():
        for p in prov if isinstance(prov, list) else [prov]:
            a = fields.get(p.get("field_id", ""))
            entries.append({
                "path": path, "member": a.member if a else None, "field": a.field if a else None,
                "layer": a.layer if a else None, "page": p["page"], "box_2d": p["box_2d"], "text": p["text"],
                "gemini": p["gemini"], "parser": p["parser"], "status": p["status"],
                "page_image": f"pages/page-{p['page']}.png"})
    for path, value in v.defaults.items():
        entries.append({"path": path, "member": None, "field": None, "layer": None, "page": None, "box_2d": None,
                        "text": None, "gemini": None, "parser": value, "status": "default", "page_image": None})
    return entries


def attach_sources(bundle_path: Path, v: Verified, fields: dict[str, Accepted], out: Path) -> None:
    """Add `provenance` and `pages` to a checked joint's bundle.json and copy the cited page images beside it, so the
    bundle folder is self-contained (paths relative to bundle.json)."""
    bundle = json.loads(bundle_path.read_text(encoding="utf-8"))
    entries = source_entries(v, fields)
    pages = sorted({e["page"] for e in entries if e["page"]})
    (bundle_path.parent / "pages").mkdir(exist_ok=True)
    for n in pages:
        shutil.copyfile(out / "pages" / f"page-{n}.png", bundle_path.parent / "pages" / f"page-{n}.png")
    bundle["provenance"] = entries
    bundle["pages"] = {str(n): f"pages/page-{n}.png" for n in pages}
    bundle_path.write_text(json.dumps(bundle, indent=1, ensure_ascii=False), encoding="utf-8")
