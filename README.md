# RebarTwin

Indian buildings are built from 2D drawings, so rebar clashes and code violations at beam-column joints stay
hidden until the concrete is poured. RebarTwin rebuilds every bar at a joint in 3D from the drawing's own numbers,
proves which IS 456 and IS 13920 detailing rules it breaks, and finds fixes that pass every rule. Gemini reads and
proposes; geometry decides. Advisory: the engineer of record decides.

Team Building Bad, Google DeepMind × Google Cloud Startup Buildathon India 2026.

## Try it

```
pip install -e ".[ifc]" pytest
rebartwin check examples/c4_b12.json --out out/C4xB12
rebartwin check examples/c4_b12.json --zone III --out out/C4xB12-zone3
pytest
```

Or with uv: `uv sync --extra ifc`, then `uv run rebartwin check ...` and `uv run pytest`.

To open the 3D viewer on the checked joint (`out/C4xB12/`):

```
cd web
npm install
npm run dev
```

Without IfcOpenShell, add `--no-ifc`: every check still runs.

## What the worked example shows

The deck's joint, C4 (300 × 300, 8-16) and B12 (230 × 450, top 5-20):

- Zone II: the top bars are 16 mm apart where IS 456 cl. 26.3.2 needs 25 mm, and the middle top bar runs 18 mm into
  C4's middle bars on two faces. Best fix: 2-25 over 2-20 in a second layer, 1,610 mm² against 1,571 mm², with the
  effective depth drop (407 to 386 mm) flagged for the engineer. IfcOpenShell's own geometry kernel finds the same
  two clashes in the exported model.
- Zone III: IS 13920 cl. 7.1.1 also fails (a 300 mm column with 20 mm beam bars needs 400 mm), and no bar change
  alone passes. The smallest redesign is C4 at 325 × 300 with top 4-16 over 4-16. That is the engineer's call.

## Outputs

`report.md` (what fails, the clause, measured against the limit, the fixes, every assumption), `bundle.json` (for
the viewer), `joint.ifc` and `fixed.ifc` (failing bars in red), `issues.bcf` (one BCF 2.1 issue per failure).

## Layout

```
src/rebartwin/
  model.py       the joint as drawn: members, bars, settings (the contract the reader fills)
  layout.py      every bar placed in 3D, deterministically
  geometry.py    exact bar-to-bar distances
  rules.py       IS 456 and IS 13920 rules, each with its clause and the source it was checked against
  check.py       runs the rules: the only source of numbers
  fixes.py       propose, re-check every rule, retry, rank (the loop's shape follows ORCA's)
  export_ifc.py  IFC4 model, plus the IfcOpenShell kernel cross-check
  export_bcf.py  BCF 2.1 issues
  report.py      markdown report and the viewer bundle
  cli.py         rebartwin check
web/             Vite + React + TypeScript + three.js + web-ifc 3D viewer
docs/            orca-teardown.md, rules.md
prompts/         antigravity-build-prompt.md: the reader, the Gemini proposer, the API and the viewer
```

## Status

Built, tested, and deployed:
- **Live public demo (`DEMO_ONLY=true` on Cloud Run):** https://rebartwin-17371270384.asia-south1.run.app (`/demo/iit` for the real IIT Hyderabad Director's Residence joint `C1 × XB17`, `/demo` for the 5-beat guided tour on `C4 × B12` across Zone II and Zone III, and `/demo/iit/report` for the printable A4 pre-pour report).
- **Engine (`src/rebartwin/`):** 3D bar placement, exact segment-to-segment distances, IS 456 and IS 13920 rules, fix loop with column face-bar placement and `GeminiProposer`, IFC4 (with IfcOpenShell kernel cross-check), BCF 2.1, Markdown report, and `bundle.json`.
- **Reader (`src/rebartwin/reader/`):** PyMuPDF ingest, AutoCAD SHX comment extraction, Cloud Vision OCR with Ø repair, two-channel agreement (`read_v2` + grammar parser), plan geometry alignment (`plan.py`), and cross-sheet linking (`link_v5`) with code-side verification of every number.
- **API & Web (`src/rebartwin/api.py`, `web/`):** FastAPI service with SSE reading progress and To check queue resolution, plus React, TypeScript, Tailwind v4, Radix/shadcn, Motion, and three.js 3D workspace.

Not modelled yet: anchorage, laps, confining ties, exterior and corner joints, and inverted beams (see `docs/rules.md`). The rule texts were checked against secondary sources and an IIT Gandhinagar worked-examples document, not yet the BIS originals.

See `PROVENANCE.md` for who built what, `docs/DEMO.md` for the presentation runbook, and `THIRD_PARTY_NOTICES.md` for ORCA's MIT notice.
