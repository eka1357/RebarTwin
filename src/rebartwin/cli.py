"""`rebartwin check examples/c4_b12.json [--zone III] [--out out/C4xB12]`: check a joint, find fixes that pass every
rule, and write report.md, bundle.json (for the viewer), joint.ifc, fixed.ifc and issues.bcf."""
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
    args = p.parse_args(argv)

    joint = Joint.model_validate_json(args.joint.read_text(encoding="utf-8"))
    if args.zone:
        joint.settings.seismic_zone = args.zone
    out = args.out or Path("out") / joint.id
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
    if not args.no_ifc:
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


if __name__ == "__main__":
    raise SystemExit(main())
