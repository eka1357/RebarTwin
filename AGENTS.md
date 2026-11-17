# AGENTS.md

Rules for every coding agent on RebarTwin: Gemini 4 Hydrogen Extra in Google Antigravity for most tasks, Claude
Code for the tasks IMPLEMENTATION_PLAN.md marks **Claude Code**. Read this first, then the doc for your area.

## What we build

RebarTwin reads Indian structural drawing PDFs, rebuilds the steel at each beam-column joint in 3D, proves with
geometry which IS 456 and IS 13920 detailing rules it breaks, and finds fixes that pass every rule. Advisory: the
engineer of record decides. Buildathon: Hyderabad round 20 to 21 November 2026, showcase 27 November, finale
2 December. A working demo beats a complete one.

## Where things are

| Area | Path | Read first |
|---|---|---|
| Product intent, users, demo story | PRODUCT.md | |
| System, contracts, decisions | ARCHITECTURE.md | |
| Tokens, components, motion, accessibility | DESIGN_SYSTEM.md | docs/UI_RESEARCH.md |
| Tasks, owners, order | IMPLEMENTATION_PLAN.md | |
| Engine (Python, built) | src/rebartwin/ | docs/rules.md |
| Reader (Python, to build) | src/rebartwin/reader/ | ARCHITECTURE.md, Reader |
| API (FastAPI, to build) | src/rebartwin/api.py | ARCHITECTURE.md, API |
| Web app | web/ | DESIGN_SYSTEM.md; `.agents/rules/web-ui.md` |

## Commands

```
uv sync --extra ifc --extra reader       # or: .venv\Scripts\python -m pip install -e ".[ifc,reader]" pytest
uv run pytest                            # engine and reader tests (235); no key needed
uv run rebartwin check examples/c4_b12.json --out out/C4xB12
uv run rebartwin read uploads/<drawing>.pdf --out out/<project>   # needs GEMINI_API_KEY in .env
cd web && npm install && npm run dev     # web app
npm run lint && npm run typecheck && npm test && npm run build   # before any delivery (scripts added in W1)
```

## Never break these

1. **The engine is the only source of numbers.** Measurements, limits, pass, fail and fix metrics come from
   `check()` and `resolve()`. The web app formats them and computes nothing. No model output is shown as a number.
2. **Rules change only with a hand-checked test**, and tests are never loosened. Any change under
   `src/rebartwin/{model,layout,geometry,rules,check,fixes}.py` is a Claude Code task.
3. **Every read value has provenance**: page, `box_2d`, text, channel. Disagreements go to To check; never pick one.
4. **Units and axes**: the engine is millimetres, Z up. The web converts once, in `web/src/lib/coords.ts`.
5. **No secrets or drawings in git.** Keys come from `.env` (see `.env.example`); drawings live in `uploads/`.
6. **Accessibility is part of done**: WCAG 2.2 AA, keyboard for everything, status never by colour alone, reduced
   motion honoured.
7. **Tokens only** in UI code: no raw hex, no arbitrary pixel font sizes, no ad-hoc shadows or durations.
8. **Orange means "fails"** in the workspace and nothing else.

## How to work

- Antigravity works only in C:\Projects\RebarTwin, Claude Code only in C:\Projects\RebarTwin-R. Never switch
  branches or edit tracked files in the other folder. Branch from the latest master; merge to master only at a gate,
  when the other agent is idle.
- Take one task id from IMPLEMENTATION_PLAN.md. Branch `feature/<id>-<slug>`. Small commits. Do not merge to `main`
  without the owner's OK.
- Before coding, write a short plan: files you will touch, the contract you rely on, how you will verify.
- Reuse before you write: the v0 viewer's `coords.ts` and label projection, shadcn primitives, the engine's JSON.
- Outside components (21st.dev, React Bits, Skiper UI, Watermelon UI) are copied in, reviewed for keyboard and
  screen readers, restyled to tokens, and credited in a comment.
- Keep docs true in the same change: contracts in ARCHITECTURE.md, components in DESIGN_SYSTEM.md, a dated line in
  PROVENANCE.md when a task is done.
- Verify before you say done: run the commands; for UI also check keyboard only, reduced motion, 320 px width and
  both themes.

## Stop and hand over to Claude Code when

- the task touches engine rules, geometry, layout, the fix loop or their tests;
- it is the reader's parser, agreement or linking (R2 to R5) or its evaluation (R6);
- the same failure comes back after two honest attempts;
- it needs a judgement about engineering correctness or a code clause;
- it touches Google Cloud auth, keys or deleting user data.

Say exactly: "This is a Claude Code task: <id>, <why>", leave the branch clean, and stop.

## Style

- **Python**: 3.10 or newer, pydantic v2, type hints, pytest, docstrings that say why. No new dependency without a
  reason in the commit message.
- **TypeScript**: strict, no `any`, named exports, components under about 200 lines with logic in hooks, Zustand for
  workspace state, TanStack Query for server data, URL for shareable state.
- **Copy**: plain, precise, calm. Numbers always with units ("16 mm", "1,610 mm²"); clauses as "IS 456 cl. 26.3.2";
  status words Fails, Passes, To check, Recheck, Redesign; no exclamation marks; no em dashes.

## Done means

The task's "done when" in IMPLEMENTATION_PLAN.md holds; tests, lint, typecheck and build pass; UI checks pass; docs
updated; committed on the task's branch with a message that names the task id.
