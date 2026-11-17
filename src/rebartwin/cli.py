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
from .fixes import apply, resolve
from .model import Joint
from .report import bundle, markdown


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
    r = sub.add_parser("read", help="read a drawing PDF into joints, provenance and a To check list, then check "
                                    "every joint with nothing left to check")
    r.add_argument("pdf", type=Path)
    r.add_argument("--out", type=Path, required=True, help="project folder, e.g. out/<project>")
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
    return run_check(joint, args.out or Path("out") / joint.id, args.no_ifc)


def run_check(joint: Joint, out: Path, no_ifc: bool = False) -> int:
    """Check one joint, find verified fixes, and write report.md, bundle.json, issues.bcf and the IFC files."""
    out.mkdir(parents=True, exist_ok=True)
    report, cage = check(joint)
    fix = resolve(joint)
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

    logging.basicConfig(level=logging.INFO, format="%(message)s")
    load_env()
    try:
        result = read(args.pdf, args.out, GenAITransport(), pages=_pages(args.pages), dpi=args.dpi,
                      tile_px=args.tile)
    except ReadError as e:
        print(f"Read stopped: {e}")
        return 2
    a = result.agreement
    print(f"Read {result.pages} page(s) of {args.pdf.name}: {len(a.accepted)} values agreed, "
          f"{len(result.linked.to_check)} to check, {len(a.unassigned)} parser values Gemini did not report.")
    status = 0
    for v in result.linked.joints:
        jid = v.joint.id
        if result.blocked.get(jid):
            print(f"{jid}: To check ({result.blocked[jid]} item(s)); not checked")
            status = max(status, 2)
            continue
        if not args.no_check:
            status = max(status, run_check(v.joint, args.out / "joints" / jid, args.no_ifc))
    if not result.linked.joints:
        print("No joints linked.")
        status = 2
    print(f"Wrote joints/, provenance.json, to_check.json, reading.json and pages/ to {args.out}")
    return status


if __name__ == "__main__":
    raise SystemExit(main())
