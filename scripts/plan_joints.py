"""Print the joints found from geometry on a beam layout and a column layout, with no API calls, for a person to check
against the drawing before any linking.

    PYTHONPATH=src ../RebarTwin/.venv/Scripts/python -X utf8 scripts/plan_joints.py \
        --pdf ../RebarTwin/uploads/iith-director-residence-structural.pdf --beams 15 --columns 21

Prints the grids read on each sheet, the alignment, every joint (column, grid place, beams by direction), the
beam-on-beam junctions, and the problems that would go to To check.
"""
from __future__ import annotations

import argparse
from collections import defaultdict
from pathlib import Path

from rebartwin.reader.ingest import ingest
from rebartwin.reader.plan import grid, meet, plan_title


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf", type=Path, required=True)
    ap.add_argument("--beams", type=int, required=True, help="the beam layout's page number")
    ap.add_argument("--columns", type=int, required=True, help="the column layout's page number")
    args = ap.parse_args()

    pages = {p.number: p for p in ingest(args.pdf, pages=[args.beams, args.columns])}
    beam_page, column_page = pages[args.beams], pages[args.columns]
    for p in (beam_page, column_page):
        g = grid(p)
        print(f"sheet {p.number}: {plan_title(p) or '(no floor title)'}; grid x {' '.join(sorted(g.xs, key=g.xs.get))}"
              f"; grid y {' '.join(sorted(g.ys, key=g.ys.get))}"
              + (f"; bubbles with no line: {', '.join(g.unplaced)}" if g.unplaced else ""))
    r = meet(beam_page, column_page)
    for axis in ("x", "y"):
        a = r.alignment[axis]
        print(f"alignment {axis}: " + (f"scale {a['scale']}, offset {a['offset']} units, {a['labels']} shared labels, "
                                       f"worst residual {a['worst']} units" if a else "none"))
    joints: dict[tuple[str, str], dict[str, set[str]]] = defaultdict(lambda: {"X": set(), "Y": set()})
    for m in r.meets:
        joints[(m.column, m.at)]["X" if m.beam.startswith("XB") else "Y"].add(m.beam)
    print(f"\n{len(joints)} joints ({len(r.meets)} beam-column meets):")
    print(f"  {'column':7s} {'at':12s} {'along X':12s} along Y")
    for (col, at), ways in sorted(joints.items(), key=lambda kv: (kv[0][1], kv[0][0])):
        print(f"  {col:7s} {at:12s} {', '.join(sorted(ways['X'])) or '-':12s} {', '.join(sorted(ways['Y'])) or '-'}")
    print(f"\n{len(r.junctions)} junctions (no joint):")
    for j in r.junctions:
        print(f"  {j['detail']}")
    print(f"\n{len(r.problems)} problems (To check):")
    for p in r.problems:
        print(f"  {p.detail}")


if __name__ == "__main__":
    main()
