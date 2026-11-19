"""Replay saved Gemini and Cloud Vision replies through the current parser and agreement, with no API calls, and
compare with the run that saved them.

    PYTHONPATH=src ../RebarTwin/.venv/Scripts/python -X utf8 scripts/replay_agreement.py \
        --pdf ../RebarTwin/uploads/iith-director-residence-structural.pdf --out out/iith-t3000 \
        --pages 7-9,15-20 --tile 3000

Prints agreement per field (the saved run's reading.json and to_check.json against now), the commonest To check
reasons, and a random sample of newly agreed values beside the drawing text near them, for a person to check.
Stops with an error if any reply is missing: it never calls an API. Linking is not replayed (its input changes
whenever agreement does, so its saved reply no longer matches). `--plans 21` also ingests sheet 21 for geometry only
(no Gemini read), so joints from a beam layout and that column layout add their code-made frames_into (plan.py).
`--save DIR` writes this replay's accepted fields and To check items (reading.json, to_check.json) to DIR, and
`--base DIR` compares against such a folder instead of `--out`: save before a change, compare after it, and the
sample is what that change newly accepted.
"""
from __future__ import annotations

import argparse
import json
import random
from collections import Counter
from pathlib import Path

from rebartwin.reader.agree import agree
from rebartwin.reader.gemini import CachingTransport, load_env, read_pages
from rebartwin.reader.ingest import ingest
from rebartwin.reader.ocr import CachingOcr, ocr_pages
from rebartwin.reader.parser import parse_page
from rebartwin.reader.plan import read_plans, support_map

FIELDS = ["section", "main", "links", "top", "top_extra", "bottom", "bottom_extra", "cover", "concrete_grade",
          "steel_grade", "seismic_zone", "exposure", "frames_into"]


def pages_arg(spec: str) -> list[int]:
    out: list[int] = []
    for part in spec.split(","):
        a, _, b = part.partition("-")
        out.extend(range(int(a), int(b or a) + 1))
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True, help="the run folder holding replies/, reading.json")
    ap.add_argument("--pages", required=True)
    ap.add_argument("--tile", type=int, default=3000)
    ap.add_argument("--sample", type=int, default=20)
    ap.add_argument("--seed", type=int, default=17)
    ap.add_argument("--plans", default="", help="extra pages ingested for plan geometry only, e.g. 21")
    ap.add_argument("--base", type=Path, help="compare against this folder's reading.json and to_check.json")
    ap.add_argument("--save", type=Path, help="write this replay's accepted fields and To check items here")
    args = ap.parse_args()
    load_env()                                   # REBARTWIN_REPLIES_DIR: the shared reply folder, when set

    base = args.base or args.out
    old_acc = json.loads((base / "reading.json").read_text(encoding="utf-8"))["accepted"]
    old_tc = json.loads((base / "to_check.json").read_text(encoding="utf-8"))

    sheets = ingest(args.pdf, pages=pages_arg(args.pages))
    cache = CachingTransport(None, args.out / "replies")              # replay only: no transport, no API
    ocr_pages(sheets, CachingOcr(None, args.out / "replies", cache.ledger), args.tile)
    matches = [m for p in sheets for m in parse_page(p)]
    reads = read_pages(sheets, cache, tile_px=args.tile)
    extra = ingest(args.pdf, pages=pages_arg(args.plans)) if args.plans else []
    result = agree(reads, matches, sheets, support_map(sheets + extra))
    plans = read_plans(sheets + extra, result)
    assert all(c.cached for c in cache.ledger), "a live call was made"
    print(f"replayed {len(cache.ledger)} saved replies, 0 live calls; {len(reads)} callouts")
    if args.save:
        args.save.mkdir(parents=True, exist_ok=True)
        (args.save / "reading.json").write_text(json.dumps({"accepted": [
            {"id": a.id, "page": a.page, "member": a.member, "field": a.field, "value": a.value, "level": a.level,
             "at": a.at, "status": a.status} for a in result.accepted]}, indent=0, ensure_ascii=False), encoding="utf-8")
        (args.save / "to_check.json").write_text(json.dumps([t.to_json() for t in result.to_check], indent=0,
                                                            ensure_ascii=False), encoding="utf-8")

    o_acc = Counter(a["field"] for a in old_acc)
    o_all = o_acc + Counter(t["field"] for t in old_tc if "." not in t["field"])
    n_acc = Counter(a.field for a in result.accepted)
    n_all = n_acc + Counter(t.field for t in result.to_check)
    print(f"{'field':15s} {'before':>14s} {'now':>14s}   (accepted/all, before = {base})")
    for f in FIELDS:
        if o_all[f] or n_all[f]:
            print(f"{f:15s} {o_acc[f]:>6d}/{o_all[f]:<7d} {n_acc[f]:>6d}/{n_all[f]:<7d}"
                  f"({100 * n_acc[f] / max(1, n_all[f]):.0f}%)")
    print(f"total agreed {len(old_acc)} -> {len(result.accepted)}; to check {len(old_tc)} -> {len(result.to_check)}; "
          f"unassigned {len(result.unassigned)}")
    print(f"plans: beam layouts {plans['beam_layouts']}, column layouts {plans['column_layouts']}, "
          f"{len(plans['joints'])} beam-column meets, {len(plans['junctions'])} junctions")
    print("commonest To check reasons:")
    for reason, n in Counter(t.detail.split(";")[-1].strip()[:70] for t in result.to_check).most_common(10):
        print(f"  {n:4d}  {reason}")

    before = {(a["page"], a["member"], a["field"], a["value"], a.get("level")) for a in old_acc}
    new = [a for a in result.accepted if (a.page, a.member, a.field, a.value, a.level) not in before]
    print(f"\nnewly agreed: {len(new)}; {min(args.sample, len(new))} at random (seed {args.seed}):")
    random.seed(args.seed)
    by_page = {p.number: p for p in sheets}
    for a in sorted(random.sample(new, min(args.sample, len(new))), key=lambda a: (a.page, a.member)):
        b = a.box
        near = sorted((w for w in by_page[a.page].words if b[0] - 8 <= (w.box[0] + w.box[2]) / 2 <= b[2] + 8
                       and b[1] - 30 <= (w.box[1] + w.box[3]) / 2 <= b[3] + 30), key=lambda w: (w.box[0], w.box[1]))
        extra = (f" joined_from={a.joined_from}" if a.joined_from else "") + \
                (f" ocr_raw={a.ocr_raw!r}" if a.ocr_raw else "")
        print(f"p{a.page} {a.member:6s} {a.field:12s} value={a.value:12s} gemini={a.gemini!r:22s} text={a.text!r}"
              f"{extra}\n      nearby on the sheet: {[w.text for w in near][:8]}  box_2d={[round(v) for v in b]}")


if __name__ == "__main__":
    main()
