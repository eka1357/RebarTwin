---
trigger: glob
globs: "src/rebartwin/**, tests/**, examples/**"
description: "RebarTwin engine invariants: numbers, rules, units, contracts, and when to hand over to Claude Code."
---

# Engine rules

- The engine is the only source of numbers: `check()` measures, `resolve()` proposes and re-checks. Nothing else
  decides pass or fail.
- Changing `model.py`, `layout.py`, `geometry.py`, `rules.py`, `check.py`, `fixes.py` or their tests is a Claude
  Code task. Stop and say "This is a Claude Code task: <id>, <why>".
- Every rule records its clause and basis; every rule change has a test with a hand-checked number in its
  docstring. Never loosen a test.
- Millimetres, Z up; bar ids like `C4/V3` and `B12/T1-3`.
- `bundle.json` is a contract: add fields freely, but renaming or removing one updates ARCHITECTURE.md and
  `web/src/types` in the same change.
- Additive work outside the core (`api.py`, report formatting, CLI flags) is fine for Gemini, with tests.
- `uv run pytest` passes before any delivery.
