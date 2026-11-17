# IMPLEMENTATION_PLAN.md

Dates: today is Tuesday 17 November 2026. Selections Wednesday 18; Hyderabad round Friday 20 to Saturday 21;
showcase Friday 27; finale at Google Bengaluru Wednesday 2 December.

**Owners.** **Gemini** is Gemini 4 Hydrogen Extra in Google Antigravity. **Claude Code** takes the difficult or
correctness-critical work. **Eka** does what only a person can. An agent that hits a Claude Code condition in
AGENTS.md stops and says so.

## Before anything

Commit the current state so every agent's changes can be reviewed:

```
cd C:\Projects\RebarTwin
git init
git add .
git commit -m "Engine v0.1, v0 viewer, project docs"
```

## Done

| Id | What | Owner |
|---|---|---|
| E0 | Engine: model, layout, rules, fix loop, IFC, BCF, report, CLI, tests | Claude |
| E1 | `scene`, `option_scenes` and `attempt_scenes` in bundle.json; 12 tests pass | Claude |
| W0 | v0 viewer: React, three.js, web-ifc; findings, fixes, workings and source panels | Gemini |
| D0 | Product, architecture, design system, plan, agent rules | Claude |

## M1, Wednesday 18 November: foundations

| Id | Task | Owner | Difficulty | Done when |
|---|---|---|---|---|
| W1 | Design-system foundation: Tailwind v4, `styles/tokens.css` from DESIGN_SYSTEM.md, @fontsource fonts, shadcn/ui init and primitives restyled, `lib/format.ts`, `lib/motion.ts`, ESLint with jsx-a11y, Prettier, Vitest, Playwright with axe; scripts `lint`, `typecheck`, `test`, `build`, `e2e` | Gemini | Medium | All scripts pass; `/styleguide` shows tokens and primitives in both themes; `format.ts` tests cover units, en-IN grouping and "never round a failing value onto its limit" |
| W2 | App shell: routes from ARCHITECTURE.md, top bar with the status island, theme toggle, Cmd K palette, shortcut dialog (`?`), skip link, `MotionConfig reducedMotion="user"` | Gemini | Medium | Every route reachable by keyboard; axe clean; theme persists |
| W3 | Scene renderer: `SceneController` builds the joint from `bundle.scene` (unit cylinders, loops, concrete with edges), materials from DESIGN_SYSTEM.md, picking by bar id, `camera-controls` fly-to and view presets, keyboard orbit and framing; keep `coords.ts`; web-ifc moves behind "Open IFC" | Gemini | Medium-hard | Worked example shows 17 bars, 7 failing; F frames the selection; 60 fps orbit; reduced motion cuts instead of flying |
| R1 | Reader ingest: PyMuPDF pages at 200 dpi, words with boxes, page PNGs for crops | Claude Code | Medium | Unit test on a generated PDF |
| R2 | Parser channel: grammar for Indian notation, mapped to word boxes | Claude Code | Hard | Unit tests for every notation in ARCHITECTURE.md |
| R3 | Gemini channel: `gemini-3.8-flash`, structured output with `box_2d`, prompts versioned | Claude Code | Hard | Recorded-response test runs without a key; one live run on a real sheet |
| P1 | Get one real structural drawing set with permission (the Tirupati house is the first choice); remove names | Eka | | PDF in `uploads/` (git-ignored) |

## M2, Thursday 19 November: the demo path

| Id | Task | Owner | Difficulty | Done when |
|---|---|---|---|---|
| W4 | Callouts: dimension lines with end ticks for gaps, clash rings, stacked labels with leaders, `+n more`, a mirrored list for screen readers | Gemini | Medium | Labels never overlap; each opens its finding |
| W5 | Inspector, Findings and Source tabs: FindingCard, ToleranceGauge, ClauseChip with basis popover, BarChip, SourceCrop (placeholder image until R5) | Gemini | Medium | Selecting a card frames its bars and the reverse; gauges read as sentences |
| W6 | Fix tab: FixOptionCard with SectionGlyphs, flags, Before and After morph from `option_scenes`, "Use in report" | Gemini | Medium | The morph matches bars by id; reduced motion crossfades |
| W7 | Workings replay: WorkingsTimeline driving `attempt_scenes`, play, step, speed, Failed only, `?a=` links | Gemini | Medium | The 34 attempts replay with the rejecting clause shown on each |
| W13 | Demo mode: `/demo` loads bundles from `web/public/demo/` (both zones), a guided tour (Space to advance) through finding, source, fix, replay, zone III | Gemini | Medium | Runs with the network off; the whole story fits in 3 minutes |
| R4 | Agreement and To check: normalisation, box overlap, `to_check.json` | Claude Code | Hard | Disagreements never accepted; tests with crafted conflicts |
| R5 | Linking: `gemini-4-argon` (fallback 3.8 Flash) to `Joint` with the schema; assumptions into `notes`; `provenance.json`; `rebartwin read` CLI | Claude Code | Hard | A real sheet becomes joints that `rebartwin check` accepts |
| A1 | API: `POST /joints/check`, projects, upload, events (SSE), bundle, To check, crops | Gemini | Medium | pytest with the test client; the web app talks to it in dev |
| W8 | Upload and reading: centred drop zone with starter chips, ReadingBoard, ReadingLog, live region | Gemini | Medium | A real PDF shows page progress to done |
| W9 | To check queue: ToCheckCard, keys 1, 2, E, S, J, K, validation against the callout grammar | Gemini | Medium | Resolving every item unlocks the joint |
| P3 | Rehearse the 3-minute demo twice; record a backup screen capture | Eka | | Under 3 minutes, offline |

## Hyderabad round, 20 to 21 November

Run `/demo` locally from a production build. Bring the backup capture. Keep the zone III answer ready: a 300 mm
column cannot take 20 mm beam bars under IS 13920 cl. 7.1.1.

## M3, 22 to 27 November: showcase

| Id | Task | Owner | Difficulty |
|---|---|---|---|
| W10 | Project overview: joints by sheet, failures first, bklit charts (failures by rule, sheets by rule) | Gemini | Medium |
| W11 | Report view, print-ready, with chosen fixes and assumptions | Gemini | Easy |
| W12 | Landing: sections from UI_RESEARCH.md, GSAP scroll story, Lenis, one React Bits text effect | Gemini | Medium |
| W14 | Accessibility and performance pass: zero axe violations, keyboard map, reduced motion, 320 px, Lighthouse at least 90 | Gemini | Medium |
| A2 | Gemini fix proposer implementing `Proposer`, using `feedback_lines` | Gemini | Medium |
| A3 | Cloud Run deployment, Cloud Storage lifecycle, Firestore, Secret Manager | Gemini (Claude Code if auth fights back) | Medium |
| A4 | BigQuery log of every model call | Gemini | Easy |
| R6 | Golden set: Eka labels 60 callouts; Claude Code builds the accuracy report (per field, bklit chart in the app) | Eka + Claude Code | Medium |
| E2 | Check every rule against the BIS originals; update docs/rules.md | Eka + Claude Code | Medium |
| P2 | A practising engineer reviews three real findings; quote for the pitch | Eka | |

## M4, 28 November to 2 December: finale

| Id | Task | Owner | Difficulty |
|---|---|---|---|
| E3 | Exterior and corner joints; anchorage under IS 13920 cl. 6.2.5 | Claude Code | Hard |
| E4 | Batch-check every joint in a project; project-level report | Claude Code | Medium |
| W15 | Polish: empty, error and loading states, microinteractions, copy review | Gemini | Easy |
| P4 | Demo video: Jitter title cards plus screen capture | Eka + Gemini | |
| P5 | Update the deck with real results and the accuracy number | Eka + Claude | |

## If we fall behind, cut in this order

W12 landing (the deck covers it), A3 Cloud Run (run locally), A2 Gemini proposer (the enumerator already finds
fixes), W10 charts, W11 report view. Never cut W3 to W7, W9, W13, or the reader on one real sheet.

## Switching to Claude Code

Open a terminal in `C:\Projects\RebarTwin`, run `claude`, and paste `prompts/claude-code-reader.md` (or describe
the escalated task). Claude Code reads CLAUDE.md, which loads AGENTS.md.

## Done means

The task's "done when" holds; tests, lint, typecheck and build pass; for UI: keyboard only, screen reader spot check,
reduced motion, 320 px width, both themes, axe clean; contracts changed in ARCHITECTURE.md; new components listed in
DESIGN_SYSTEM.md; a dated line in PROVENANCE.md; committed on `feature/<id>-<slug>`.
