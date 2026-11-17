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

Built and tested: the engine for interior joints with one beam per direction, and the 3D web viewer (`web/`) for
`bundle.json`, `joint.ifc`, `fixed.ifc`, and `issues.bcf`. Next, in Antigravity: the Gemini reader, the Gemini fix
proposer, and the API on Cloud Run. Not modelled yet: anchorage, laps,
confining ties, exterior and corner joints (see `docs/rules.md`). The rule texts were checked against secondary
sources and an IIT Gandhinagar worked-examples document, not yet the BIS originals.

See `PROVENANCE.md` for who built what, and `THIRD_PARTY_NOTICES.md` for ORCA's MIT notice.
