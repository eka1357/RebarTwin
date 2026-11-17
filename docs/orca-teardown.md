# ORCA teardown: what RebarTwin takes, changes and leaves

Source: [IssueLab-Limited/ORCA-hackathon-2026](https://github.com/IssueLab-Limited/ORCA-hackathon-2026), read on
17 November 2026. MIT licence, IssueLab Inc. Third place, Startup track, Meta Global AI Developer Hackathon 2026.

## What ORCA is

An AI design coordinator for 3D building and machine models. Design teams' IFC or STEP models are loaded together,
ORCA finds where parts collide or lack clearance, a Meta model proposes one to three edits to the real model
elements, and every edit is tested by geometry before anyone sees it: "the conflict is gone, there is clearance,
and nothing new is hit". The coordinator reviews before and after in 3D and exports edited IFC, a PDF and BCF.

Stack: Python 3.13, FastAPI and IfcOpenShell 0.9 on the server (44 modules, about 27,000 lines, 934 tests), React,
three.js and web-ifc in the browser, one container on Modal. The browser previews moves, but only the server's
geometry check supplies clearance numbers.

## The heart: `agent.resolve`

Propose, verify, retry with the failure reason, rank. Each round the model gets the clash, three pictures and the
numbers, plus everything already tried with "passed" or "FAILED, reason at [x, y, z]". Every candidate is applied in
a trial, checked, undone. It stops when a plain geometry fix passes, when any fix passes from round 2, or after
three rounds, then keeps the best three. When nothing may be edited it switches to recommend mode and says why.

## Piece by piece

| ORCA | What it does | RebarTwin | Where |
|---|---|---|---|
| `agent.resolve` loop | propose, verify, retry, rank, keep 3 | **Adapted.** Same loop and stop rule; proposers plug in, a deterministic enumerator first and Gemini next | `fixes.resolve` |
| `_feedback` | tells the model what failed and why | **Adapted** for the Gemini proposer | `fixes.feedback_lines` |
| `verify.check` as the authority | the only source of clearance numbers | **Taken as a rule.** `check` is the only source of numbers; the viewer only reads `bundle.json` | `check.py` |
| Clash tree (`trianglebvh`, intersection not collision) | hard clashes on meshes | **Adapted twice.** Closed-form bar-to-bar distance is primary; IfcOpenShell's kernel re-measures the exported model as a second channel, and the two agree on the worked example | `geometry.py`, `export_ifc.kernel_clashes` |
| Recommend mode | when nothing may be edited, say what would be needed | **Adapted.** Status `redesign` or `no_fix`, with the rules that blocked every candidate | `fixes.FixResult` |
| Requirements file | project rules and per-element policy | **Adapted lightly.** Stock bar sizes, layers, exposure, zone in `Settings`; a project rules file comes later | `model.Settings` |
| `document.bcf_zip` | BCF 2.1 issues with selection, colours and a camera | **Adapted** (zip layout, camera), with the MIT notice | `export_bcf.py` |
| Elements addressed by GlobalId | stable ids across runs | **Taken.** Deterministic GlobalIds per bar | `guid.py` |
| Northbank Rev04 answer key | the designer's own fix as the benchmark | **Taken as method.** Tests use the hand-checked deck joint; next, a real drawing with the engineer's revision as the key | `tests/` |
| Workings view | replays each run: ideas, checks, ranking | **Data built**, view to build. Every attempt and the clause that rejected it is in `fix.attempts` | `bundle.json` |
| Images A, B, C; "severity from numbers, not pixels" | what the model sees | **Taken as a rule** for the reader prompt | Antigravity prompt |
| `BUILT_DURING_HACKATHON.md`, docs-map test | honest provenance, docs kept true | **Taken.** `PROVENANCE.md`; a docs test later | repo root |
| Edit journal, undo and redo | interactive model editing | **Left for now**: no hand editing yet | |
| Navisworks import, STEP, voice, MCP, bulk triage | coordination of big 3D models | **Left**: RebarTwin starts from 2D PDFs | |

## What ORCA cannot do, and RebarTwin must

ORCA needs 3D models that design teams already built. Indian projects usually have only 2D PDF drawings, so
RebarTwin's hard parts are before that loop: reading the drawings (Gemini with boxes, checked by an independent text
parser) and rebuilding each joint's bars in 3D. And ORCA checks clearances only and says it makes no claim of
engineering adequacy; RebarTwin checks code clauses, still advisory.

## Geometry lessons worth keeping (from ORCA's CLAUDE.md)

- Use intersection, not collision, for hard clashes: collision misses an element wholly inside another.
- Never call IfcOpenShell's clash queries with an empty set: it crashes.
- Keep units explicit. ORCA works in metres; RebarTwin works in millimetres and converts only for BCF cameras.
- Cache what doesn't change between checks; ORCA's check runs in about half a second on a full building.
