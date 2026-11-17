"""`rebartwin read`: ingest, both channels, agreement, linking, and the files the API and web app read.

    out/pages/page-<n>.png    rendered pages, for Source crops
    out/joints/<id>.json      one Joint per joint (blocked joints too, so a person can see what was linked)
    out/provenance.json       [{joint, fields: {path: {page, box_2d, text, gemini, parser, status}}}]
    out/to_check.json         every item a person must decide, tied to the joint it blocks
    out/reading.json          the run: models, prompt versions, counts, every accepted field, unassigned values
"""
from __future__ import annotations

import json
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Callable

from .agree import Agreement, agree
from .gemini import READ_PROMPT, Read, Transport, read_page
from .ingest import ingest
from .link import LINK_PROMPT, Linked, link
from .parser import parse_page


@dataclass
class Result:
    out: Path
    pages: int
    agreement: Agreement
    linked: Linked
    blocked: dict[str, int] = field(default_factory=dict)     # joint id -> unresolved items

    @property
    def ready(self) -> list[str]:
        return [v.joint.id for v in self.linked.joints if not self.blocked.get(v.joint.id)]


def read(pdf: Path, out: Path, transport: Transport, *, pages: list[int] | None = None, dpi: int = 200,
         tile_px: int = 3000, read_model: str | None = None, link_model: str | None = None,
         sleep: Callable[[float], None] = time.sleep) -> Result:
    out.mkdir(parents=True, exist_ok=True)
    sheets = ingest(pdf, out, dpi=dpi, pages=pages)
    reads: list[Read] = []
    matches = []
    for page in sheets:
        matches.extend(parse_page(page))
        reads.extend(read_page(page, transport, read_model, tile_px=tile_px, sleep=sleep))
    agreement = agree(reads, matches, sheets)
    linked = link(agreement, transport, link_model, sleep=sleep)

    joints_dir = out / "joints"
    joints_dir.mkdir(exist_ok=True)
    for v in linked.joints:
        (joints_dir / f"{v.joint.id}.json").write_text(v.joint.model_dump_json(indent=1), encoding="utf-8")
    provenance = [{"joint": v.joint.id, "fields": v.provenance, "link_notes": linked.link_notes.get(v.joint.id, [])}
                  for v in linked.joints]
    (out / "provenance.json").write_text(json.dumps(provenance, indent=1, ensure_ascii=False), encoding="utf-8")
    items = [t.to_json() for t in linked.to_check]
    (out / "to_check.json").write_text(json.dumps(items, indent=1, ensure_ascii=False), encoding="utf-8")
    blocked: dict[str, int] = {}
    for t in linked.to_check:
        if t.joint and t.resolution is None:
            blocked[t.joint] = blocked.get(t.joint, 0) + 1
    reading = {
        "pdf": pdf.name, "pages": [p.number for p in sheets], "dpi": dpi,
        "prompts": {"read": READ_PROMPT, "link": LINK_PROMPT}, "link_model": linked.model,
        "counts": {"callouts": len(reads), "parser_matches": len(matches), "accepted": len(agreement.accepted),
                   "to_check": len(linked.to_check), "unassigned": len(agreement.unassigned),
                   "joints": len(linked.joints)},
        "accepted": [{**asdict(a), "box": list(a.box), "gemini_box": list(a.gemini_box)} for a in agreement.accepted],
        "unassigned": [t.to_json() for t in agreement.unassigned],
    }
    (out / "reading.json").write_text(json.dumps(reading, indent=1, ensure_ascii=False), encoding="utf-8")
    return Result(out, len(sheets), agreement, linked, blocked)
