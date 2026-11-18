"""`rebartwin check examples/c4_b12.json [--zone III] [--out out/C4xB12]`: check a joint, find fixes that pass every
rule, and write report.md, bundle.json (for the viewer), joint.ifc, fixed.ifc and issues.bcf.

`rebartwin read drawing.pdf --out out/<project>`: read a drawing into joints (reader/pipeline.py), then check each
joint that has nothing left to check."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .check import check
from .export_bcf import export_bcf
from .fixes import Enumerator, Proposer, apply, resolve
from .model import Joint
from .report import bundle, markdown


def _build_proposers(use_gemini: bool, replay: bool, replies_dir: Path | None) -> list[Proposer] | None:
    if not use_gemini:
        return None
    from .gemini_proposer import GeminiProposer
    from .reader.gemini import CachingTransport, GenAITransport, load_env

    load_env()
    cache_dir = replies_dir or (Path("out") / "_replies")
    transport = None if replay else GenAITransport()
    return [GeminiProposer(CachingTransport(transport, cache_dir)), Enumerator()]


def main(argv: list[str] | None = None) -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")   # Windows consoles: × and ² in the messages
    except (AttributeError, ValueError):
        pass
    p = argparse.ArgumentParser(prog="rebartwin", description="Prove beam-column joint detailing with geometry.")
    sub = p.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("check", help="check a joint, find verified fixes, write the report, IFC and BCF")
    c.add_argument("joint", type=Path, help="joint JSON (see examples/c4_b12.json)")
    c.add_argument("--zone", choices=["II", "III", "IV", "V"], help="override the joint's seismic zone")
    c.add_argument("--out", type=Path, help="output folder (default out/<joint id>)")
    c.add_argument("--no-ifc", action="store_true", help="skip the IFC files (no IfcOpenShell needed)")
    c.add_argument("--gemini", action="store_true", help="run Gemini fix proposer alongside the enumerator")
    c.add_argument("--replay", action="store_true", help="with --gemini, use cached replies only; never call the API")
    c.add_argument("--replies", type=Path, help="cache folder for Gemini replies (default out/_replies)")
    r = sub.add_parser("read", help="read a drawing PDF into joints, provenance and a To check list, then check "
                                    "every joint with nothing left to check")
    r.add_argument("pdf", type=Path)
    r.add_argument("--out", type=Path, help="project folder, e.g. out/<project> (required unless --probe)")
    r.add_argument("--probe", action="store_true", help="count text-layer words and annotations per page, then stop")
    r.add_argument("--concurrency", type=int, default=3, help="tiles read at once")
    r.add_argument("--replay", action="store_true", help="use saved replies only; never call the API")
    r.add_argument("--pages", help="1-based pages to read, e.g. 1,3-5 (default all)")
    r.add_argument("--dpi", type=int, default=200)
    r.add_argument("--tile", type=int, default=3000, help="largest tile side in pixels sent to Gemini")
    r.add_argument("--no-check", action="store_true", help="read only; do not run check on the joints")
    r.add_argument("--no-ifc", action="store_true", help="skip the IFC files when checking")
    args = p.parse_args(argv)
    if args.cmd == "read":
        return read_command(args)

    joint = Joint.model_validate_json(args.joint.read_text(encoding="utf-8"))
    if args.zone:
        joint.settings.seismic_zone = args.zone
    proposers = _build_proposers(args.gemini, args.replay, args.replies)
    return run_check(joint, args.out or Path("out") / joint.id, args.no_ifc, proposers=proposers)


def run_check(joint: Joint, out: Path, no_ifc: bool = False, *, proposers: list[Proposer] | None = None) -> int:
    """Check one joint, find verified fixes, and write report.md, bundle.json, issues.bcf and the IFC files."""
    out.mkdir(parents=True, exist_ok=True)
    report, cage = check(joint)
    fix = resolve(joint, proposers=proposers)
    (out / "report.md").write_text(markdown(joint, report, fix), encoding="utf-8")
    (out / "bundle.json").write_text(json.dumps(bundle(joint, report, fix, cage), indent=1), encoding="utf-8")
    note = None
    if fix.options:
        best = fix.options[0]
        note = f"Verified fix ({fix.status}): {best.candidate.title}. " + " ".join(best.flags)
    topics = export_bcf(joint, report, out / "issues.bcf", fix_note=note)

    print(f"{joint.id}: {report.verdict} (zone {joint.settings.seismic_zone}, IS 13920 "
          f"{'on' if report.is13920 else 'off'})")
    for f in report.failures:
        print(f"  FAIL {f.clause}: {f.message}")
    print(f"Fix: {fix.summary}")
    for k, o in enumerate(fix.options, 1):
        print(f"  {k}. {o.candidate.title}")
        for flag in o.flags:
            print(f"     recheck: {flag}")
    written = ["report.md", "bundle.json", f"issues.bcf ({topics} issues)"]
    if not no_ifc:
        try:
            from .export_ifc import export_ifc
            export_ifc(joint, out / "joint.ifc", report, cage)
            written.append("joint.ifc")
            if fix.options:
                export_ifc(apply(joint, fix.options[0].candidate), out / "fixed.ifc")
                written.append("fixed.ifc")
        except RuntimeError as e:
            print(f"IFC skipped: {e}")
    print(f"Wrote {', '.join(written)} to {out}")
    return 1 if report.failures else 0


def _pages(spec: str | None) -> list[int] | None:
    if not spec:
        return None
    pages: list[int] = []
    for part in spec.split(","):
        a, _, b = part.partition("-")
        pages.extend(range(int(a), int(b or a) + 1))
    return pages


def read_command(args) -> int:
    """`rebartwin read`: see reader/pipeline.py. Exit 0 when every joint was read and checked clean, 1 when a joint
    fails a rule, 2 when something is left to check."""
    import logging

    from .reader.gemini import GenAITransport, ReadError, load_env
    from .reader.pipeline import read

    if args.probe:
        from .reader.ingest import probe
        for row in probe(args.pdf):
            notes = ", ".join(f"{n} by {a}" for a, n in sorted(row["annotations"].items())) or "none"
            print(f"page {row['page']}: {row['size_pt'][0]} x {row['size_pt'][1]} pt, rotation {row['rotation']}, "
                  f"{row['words']} words, comments: {notes} ({row['comments']} merged as words), "
                  f"{row['paths']} vector paths{'; needs OCR' if row['needs_ocr'] else ''}")
        return 0
    if args.out is None:
        print("rebartwin read: --out is required")
        return 2

    import os

    from .reader.ocr import VisionTransport
    from .reader.pipeline import attach_sources

    logging.basicConfig(level=logging.INFO, format="%(message)s")
    load_env()
    try:
        transport = None if args.replay else GenAITransport()
        ocr = None if args.replay or not os.environ.get("VISION_API_KEY") else VisionTransport()
        result = read(args.pdf, args.out, transport, ocr=ocr, pages=_pages(args.pages), dpi=args.dpi,
                      tile_px=args.tile,
                      concurrency=args.concurrency)
    except ReadError as e:
        print(f"Read stopped: {e}")
        return 2
    except Exception as e:  # noqa: BLE001 - an API refusal (billing, quota, auth) ends the run with a sentence
        code = getattr(e, "code", None)
        if not isinstance(code, int):
            raise
        status = getattr(e, "status", None) or ""
        print(f"Read stopped: the model API refused the call ({code} {status}). Replies so far are saved under "
              f"{args.out / 'replies'} and replay on the next run.")
        return 2
    a = result.agreement
    live = [c for c in result.calls if not c["cached"]]
    print(f"Read {result.pages} page(s) of {args.pdf.name} in {result.seconds:g} s: {len(a.accepted)} values agreed, "
          f"{len(result.linked.to_check)} to check, {len(a.unassigned)} parser values Gemini did not report. "
          f"{len(live)} model call(s), {len(result.calls) - len(live)} replayed; "
          f"{sum(c['prompt_tokens'] or 0 for c in live)} prompt and {sum(c['output_tokens'] or 0 for c in live)} "
          f"output tokens.")
    fields = {f.id: f for f in a.accepted}
    status = 0
    for v in result.linked.joints:
        jid = v.joint.id
        if result.blocked.get(jid):
            print(f"{jid}: To check ({result.blocked[jid]} item(s)); not checked")
            status = max(status, 2)
            continue
        if not args.no_check:
            status = max(status, run_check(v.joint, args.out / "joints" / jid, args.no_ifc))
            attach_sources(args.out / "joints" / jid / "bundle.json", v, fields, args.out)
    if not result.linked.joints:
        print("No joints linked.")
        status = 2
    print(f"Wrote joints/, provenance.json, to_check.json, reading.json and pages/ to {args.out}")
    return status


if __name__ == "__main__":
    raise SystemExit(main())
