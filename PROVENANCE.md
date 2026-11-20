# Provenance

An honest record of what was made when, and from what, kept the way ORCA keeps `BUILT_DURING_HACKATHON.md`.

## 17 November 2026: the engine

Written in a Claude (Cowork) session for Team Building Bad: the joint model, the 3D bar layout, the closed-form
geometry, the IS 456 and IS 13920 rules, the fix loop, the IFC and BCF exports, the report, the command line and
the tests. Built in the cloud workspace, tested there (11 tests), then copied into this folder.

Adapted from ORCA (MIT, IssueLab Inc.): the shape of the fix loop and the BCF zip layout and camera. No ORCA code
runs here; see `THIRD_PARTY_NOTICES.md` and `docs/orca-teardown.md`.

## 17 November 2026: the viewer (Build 4)

Built in Google Antigravity (`web/`): Vite, React, TypeScript, three.js, and web-ifc viewer loading `bundle.json`,
`joint.ifc`, and `fixed.ifc` from `rebartwin check`. Renders failing bars red with see-through concrete, 3D-projected
gap and clash labels (`(x, y, z) -> (x, z, -y)` scaled to metres), bar click inspection (with drawing provenance
crop support for `box_2d`), ranked fixes with Before/After toggle, ORCA-style Workings replay over `fix.attempts`,
and IFC/BCF downloads.

## 17 November 2026: design system foundation (W1)

Built `web/` W1 on `feature/w1-design-system`: Tailwind v4 (`styles/tokens.css`, `styles/globals.css`), self-hosted
`@fontsource-variable` fonts (Inter, Space Grotesk, JetBrains Mono), 18 restyled Radix/shadcn primitives under
`components/ui/`, `StatusPill`, `lib/format.ts` (`en-IN` grouping, non-breaking unit spaces, failing-value precision),
`lib/motion.ts`, `lib/a11y.ts`, `lib/coords.ts`, ESLint + jsx-a11y, Prettier, Vitest, Playwright + axe, and
`/styleguide` in dark and light themes.

## 17 November 2026: app shell and routes (W2)

Built `web/` W2 on `feature/w2-app-shell`: React Router 8 routes (`/`, `/demo`, `/projects/:id`, `/upload`,
`/review`, `/joints/:jointId`, `/report`, `/styleguide`), Zustand workspace store (`stores/workspace.ts`),
TanStack Query + `MotionConfig reducedMotion="user"` providers, 48 px `TopBar` with `StatusIsland`, persisted
dark/light theme toggle, `Cmd/Ctrl+K` `CommandPalette`, `?` `ShortcutDialog`, skip links, and unit + Playwright
axe checks.

## 17 November 2026: scene renderer and demo bundles (W3)

Built `web/` W3 on `feature/w3-scene-renderer`: imperative `SceneController` (`features/workspace/SceneController.ts`)
with three.js + `camera-controls` rendering `bundle.scene` (unit cylinders per bar, stirrup/tie loops, translucent
concrete with edge outlines, 100 mm / 500 mm fading floor grid, theme-reactive tokens, selection rim + 25% dim,
`Iso`/`Plan`/`X Elev`/`Y Elev` presets, `F` framing, `Arrows`/`+`/`-`/`0`/`Esc` keyboard navigation, reduced-motion
instant cuts), `ViewportToolbar`, `JointInspector`, lazy-loaded `OpenIfcDialog` (`web-ifc`), Zone II and Zone III
demo bundles copied into `web/public/demo/`, and retired the unstyled v0 viewer files.

## 17 November 2026: W1-W3 review fixes (`fix/w3-review`)

Fixed workspace height and camera framing on `fix/w3-review`: bounded workspace routes to `100dvh` above `1024 px` with `min-h-0` viewport and inspector internal scrolling, fitted full `sceneBounds` (`concrete` + `bars`) on load, resize, and presets via `camera-controls` `fitToBox`/`getDistanceToFitBox` with 12% padding, added synchronous resize/fullscreen re-rendering and `data-joint-bounds` verification, formatted 3D labels via `lib/format.ts` (`16 mm · needs 25 · IS 456 cl. 26.3.2`, `18 mm overlap · Geometry`), removed duplicate `StatusIsland` count, gated the `Styleguide` link on `import.meta.env.DEV`, added Vite React/Three dedupe, and passed `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run dev -- --force` console verification, and all 9 Playwright + axe checks across `1280x720`, `1440x900`, `1920x1080`, `768x1024`, and `320x720`.

## 17 November 2026: 3D callouts, dimension lines, and clash rings (W4)

Built `web/` W4 on `feature/w4-callouts`: 3D CAD gap dimension lines with extension stems and end ticks between parallel bar surfaces, dual-plane 3D clash rings in `SceneController.ts`, deterministic flush-stack non-overlapping 2D pill layout (`lib/calloutLayout.ts` + Vitest suite), SVG leader lines and anchor dots (`ViewportCallouts.tsx`), `+n more` overflow chip above 8 localized labels, and mirrored screen-reader findings list. Verified across Iso/Plan/Elev views and Labels Failures/All/Off modes.

## 17 November 2026: Inspector, Findings, and Source tabs (W5)

Built `web/` W5 on `feature/w5-inspector`: `ToleranceGauge` (SVG hairline scale, limit tick, diamond marker settling in 160 ms, hatched wrong side and negative overlap zone, plain-sentence `aria-label` via `describeToleranceGauge`), focusable `ClauseChip` (`RuleMeta` basis popover with verification badge and Escape close), `BarChip` (two-way hover/focus highlight and full accessible name), `FindingCard` (two-way selection framing 3D bars and scrolling within inspector `ScrollArea`), warm-paper `SourceCrop` (`data-theme="light" surface-paper`, zoom/pan controls, full-sheet dialog, placeholder drawing crop clearly disclosed until R5), and 4-tab `JointInspector`. Verified with Vitest (13 passed) and Playwright + axe (9 passed across dark/light themes and viewports).

## 17 November 2026: Fix options, SectionGlyphs, and Before/After 3D morph (W6)

Built `web/` W6 on `feature/w6-fixes`: `SectionGlyph` SVG beam cross-sections drawn to scale from scene bar coordinates (`aria-label` listing layers in words), `FixOptionCard` (rank, plain title, Recheck/Redesign pills, Before/After glyphs, steel area and effective depth metrics, flag list, Preview After, Use in report), `FixPanel` with Before/After switcher and Sonner summary toast (`+39 mm², 4 bars instead of 5`), and `SceneController.morphToScene` matching bars by `bar.id` (700 ms tween/shrink/grow; 120 ms crossfade under reduced motion; Zone III column concrete resize tweening). Verified with Vitest (14 passed) and Playwright + axe (9 passed).

## 17 November 2026: Workings solver replay and ?a= deep links (W7)

Built `web/` W7 on `feature/w7-workings`: `WorkingsTimeline` grouped by round (`filled` passed ticks, `hollow` failed ticks), Radix `Slider`, Play/Pause/step, speed (`0.5×`/`1×`/`2×`), `Failed only` filter, polite step announcements, rejecting clause cards with `ClauseChip` and mini `ToleranceGauge`, 400 ms `attempt_scenes` 3D morph (instant under reduced motion) with live rejecting callouts, and `ReplayUrlSync` (`?a=` deep link). Verified with Vitest (15 passed) and Playwright + axe (10 passed).

## 17 November 2026: Offline Demo Mode and Guided Tour (W13)

Built `web/` W13 on `feature/w13-demo-tour`: 5-beat `DemoTour` (Finding -> Source -> Fix -> Replay -> Zone III) with `Space` advance and `Escape` close, prefetching both `zone2` and `zone3` offline bundles under `/demo/` (`staleTime: Infinity`) so the entire 3-minute story runs offline (`context.setOffline(true)`), and full normal and reduced-motion verification. Verified with Vitest (16 passed), ESLint/TypeScript clean, production build, and Playwright + axe (12 passed).

## 17 November 2026: the reader, R1 to R5 (`feature/R-reader`)

Written by Claude Code: `src/rebartwin/reader/` (ingest, the parser grammar, the Gemini channel with versioned
prompts `read_v1` and `link_v1`, agreement, linking with code-side verification of every linked number) and
`rebartwin read`. 125 tests that need no key, against a sheet drawn by PyMuPDF inside the tests and hand-written
stand-ins for Gemini replies in `tests/fixtures/reader/` (no real drawing, no live model output). Not yet run on a
real drawing or a live model.

## 17 November 2026: reader ready for a live run, engine numbers for the web (`feature/R-live`)

Claude Code. Reader: no sampling parameters, one retry layer, fast fallback when a key cannot use a model,
`--probe` and AutoCAD SHX annotations as text, project-level To check items for an unstated zone or exposure, saved
and replayed replies, concurrent tiles, and the Source contract (`provenance`, `pages`) in each checked bundle.
Engine: `Finding.margin` and `span` (IS 13920 cl. 7.1.1), face `area_before`, `n_bars_before`, `n_layers_before`,
and half-up rounding for numbers in text; no rule's limit changed. Demo bundles in `web/public/demo/` regenerated.
167 tests, no key needed; still not run on a real drawing.

## 17 November 2026: comments, OCR and storeys (`feature/R-ocr`)

Claude Code, after Eka's probe of the IIT Hyderabad tender set: comments ("AutoCAD SHX Text") always merged with the
text layer, AutoCAD codes translated, Cloud Vision OCR for sheets with text as lines (kept out of Gemini's prompt),
and storeys: column values tied to their storey header, joints at the floor of their beams' plan, the storey that
ends there chosen by code and noted. Prompts `read_v2`, `link_v2`. 199 tests, no key needed.

## 17 November 2026: cells, Ø repair, XB and YB (`feature/R-ocr`)

Claude Code, on Eka's decisions after the first live attempt (Gemini refused every call: prepaid credit used up;
Cloud Vision read sheets 7 to 9). XB and YB beam ids, with direction checked against the prefix; Ø misreads repaired
in OCR words only, raw text kept; table cells from drawn ruling lines (letter strokes excluded), so the storey
headers on sheets 7 and 8 now read as the three storeys; float boxes inside, integer box_2d in files. 235 tests, no
key needed.

## 17 November 2026: W4-W13 review fixes (`fix/w13-review`)

Applied review fixes on `fix/w13-review`: removed UI arithmetic (`summarizeLayerSpec`, gauge subtraction) in favour of `Finding.margin`, `FaceChange.area_before`, and `n_bars_before` (`1,571 → 1,610 mm² · 5 bars → 4` toast, `short by 9 mm` gauge sentences); placed `ToleranceGauge` measured values directly under their diamond markers and `needs <limit>` / `max <limit>` under limit ticks with automatic collision staggering across Findings and Workings; drew `IS 13920 cl. 7.1.1` spans across the column in `SceneController.ts` so Zone III displays all 7 failing callouts (`300 mm · needs 400 · IS 13920 cl. 7.1.1`); replaced the mock schedule SVG in `SourceCrop.tsx` with either the pitch-deck message or real `provenance` rendering (`entry.member`, bundle-relative `page_image`, `Agreed`/`Resolved`, `Assumed, not on the drawing`, column `Storey`, `OCR read '...'`); added concise accessible labels on `StatusIsland` and `FindingCard` with `aria-describedby` linking and WCAG 2.5.3 compliance; updated `DemoTour` copy; ignored `web/public/live/` in `.gitignore`; and encoded `@` joint ids via `lib/routes.ts`. Verified with `eslint`, `tsc`, Vitest (18 passed), Vite production build, and Playwright + axe (12 passed).

## 17 November 2026: FastAPI service (A1, `feature/a1-api`)

Built `src/rebartwin/api.py` on `feature/a1-api` (optional `[api]` deps `fastapi`, `uvicorn`, `python-multipart`; dev test client `httpx`): stateless `POST /joints/check`, `GET/POST /projects`, `POST /projects/{id}/drawings` multipart PDF upload launching background reader streaming per-page `page_started`, `page_read`, `joint_ready`, `done`, and `error` SSE via `GET /projects/{id}/events`, `GET /projects/{id}` joint/sheet summary, `GET /projects/{id}/to-check` (ordering unresolved project-level items first), `POST .../to-check/{item}/resolve` validating callouts, cascading derived linking items, re-checking unlocked joints, and attaching `resolved` provenance + `level`, `GET .../bundle` + IFC/BCF/report.md exports + PyMuPDF `?crop=ymin,xmin,ymax,xmax` crops, `application/problem+json` error responses, `@` joint id URL encoding support, and Vite `/api` proxy. Verified with `uv run pytest` (238 passed).

## 17 November 2026: Upload, ReadingBoard, ReadingLog, and live project views (W8, `feature/w8-upload`)

Built `web/` W8 on `feature/w8-upload`: typed API client (`lib/api.ts`), Manus-style centered `DropZone` with optional page filter, paste-joint JSON check dialog, and starter chips (`features/reading/DropZone.tsx`), warm-paper `ReadingBoard` with 1.2 s scan line (`Progress` fallback under reduced motion) and polite live announcements (`features/reading/ReadingBoard.tsx`), auto-scrolling `ReadingLog` with `role="log"` (`features/reading/ReadingLog.tsx`), live SSE `UploadRoute.tsx`, and live project/joint routes (`ProjectRoute.tsx`, `JointRoute.tsx`) encoding `@` joint ids and resolving real drawing crops relative to the joint bundle URL. Verified with `eslint`, `tsc`, Vitest (21 passed), and production build.

## 17 November 2026: To check queue and callout grammar (W9, `feature/w9-review`)

Built `web/` W9 on `feature/w9-review`: client callout grammar validator and project-level-first queue sorter (`lib/calloutGrammar.ts`), `ToCheckCard` (`features/review/ToCheckCard.tsx`) on `surface-paper` with live `/pages/{n}.png?crop=` images, Gemini/Parser radio group, quick zone/exposure chips, keys `1`, `2`, `E`, `S`, `J`, `K`, grammar-validated inline editing, and `ReviewRoute.tsx` unlocking and linking directly to checked `@`-encoded joints (`C4xB12@FIRST`). Verified with ESLint, TypeScript, Vitest (24 passed), Vite production build, and Playwright + axe across dark/light themes, reduced motion, and 320 px width (13 passed).

## 18 November 2026: Gemini fix proposer (A2, `feature/a2-gemini-proposer`)

Built `src/rebartwin/gemini_proposer.py` (`GeminiProposer`) and `src/rebartwin/reader/prompts/propose_v1.md` on `feature/a2-gemini-proposer` implementing the `Proposer` protocol from `fixes.py` without changing the fix loop or engine rules. Calls `reader/gemini.py`'s `call()` with `REBARTWIN_MODEL_LINK` and fallback, shares `CachingTransport` retries/caching, caps and validates up to 6 `SetFace` / `ResizeColumn` candidates per round against `settings.stock_dias`, `settings.max_layers`, and known member ids before handing them to `resolve()`, where the engine re-checks and deterministically ranks every candidate. Wired into `cli.py` (`--gemini`, `--replay`, `--replies`) and `api.py` (`_safe_run_check`), updated `WorkingsTimeline.tsx` to show `Gemini` / `Enumerator` source ticks, source badges, and `Gemini rationale`, updated `DemoTour.tsx` Step 4 to read attempt count from the bundle, and regenerated offline `/demo/` bundles (`C4xB12` at 36 attempts, `C4xB12-zone3` at 80 attempts; best fix unchanged for both zones). Verified with offline pytest tests (`tests/test_gemini_proposer.py` using recorded replies, 240 tests total), ESLint, TypeScript, Vitest, Vite production build, and Playwright + axe.

## 18 November 2026: Pre-pour report and Workings 61+ fix (W11, `feature/w11-report`)

Fixed Workings playback past the 60-scene `attempt_scenes` cap (`Viewport.tsx`, `WorkingsTimeline.tsx`) to preserve the last stored 3D scene and display `No 3D for this attempt` (verified through Zone III Attempt 61 in Vitest and Playwright). Built W11 printable pre-pour report (`features/report/PrePourReport.tsx`, `ReportFindings.tsx`, `ReportChosenFix.tsx`, `ReportAssumptionsAndSource.tsx`, `routes/ReportRoute.tsx`, shared `lib/provenance.ts`) reachable from `Report` links (`DemoRoute`, `JointRoute`, `ProjectRoute`) and from `Use in report` (`Open report` in `FixOptionCard` / toast, persisted per joint and `?joint=&variant=&option=` URL params): `Pre-pour check · C4 × B12` A4 layout (warm `--paper` on screen, `--white` in `@media print`), hiding `.app-topbar` / `.no-print` chrome under `@media print`, `Print or save as PDF` button (`window.print()`), header metadata (status pill only; `Recheck`/`Redesign` pill on Chosen fix), verdict (`Fails N checks` / `Passes every check`), identical `(rule, members, measured, limit)` failing checks grouped cleanly on one line with one `ToleranceGauge` (1 A4 page on Zone II), honest `Passes every check that applies` + `IS 13920 is off in zone II` applicability text, chosen fix before/after `SectionGlyph`s, `area_before → area_provided`, effective-depth and redesign advisories (`The engineer of record decides`), `Joint.notes` + provenance defaults (`Assumed, not on the drawing`), provenance ledger (`Agreed` / `Resolved` / `OCR read '...'` or pitch-deck note), `Checked by` / `Engineer of record` / `Date` sign-off block, and `joint.ifc` / `fixed.ifc` / `issues.bcf` download links. Verified with ESLint, TypeScript, Vitest (29 passed), Vite production build, and Playwright + PyMuPDF 1-page A4 PDF text inspection + axe across 320 px width and reduced motion (16 passed).

## 18 November 2026: joints from geometry, item 4 (`feature/R-ocr`)

Claude Code. Master (A1, W8, W9) merged into `feature/R-ocr`. Gemini's Cyrillic Ф and Greek Ά read as Ø in its
values. `plan.py`: grids from bubbles and their lines, sheet alignment, columns on the grid, beam bands, beam-column
meets as code-made `frames_into` (status `geometry`), beam-on-beam junctions; size labels on plans tie by band and
elevation callouts by the title below. Sheets 15 and 21: 35 x and 28 y grid lines on both, aligned to 0.28 units,
45 joints from 82 meets, 10 To check items. Replay of the saved t3000 replies: 104 to 238 accepted (top 0 to 30,
top_extra 0 to 29, frames_into 58). 268 tests, no key needed.

Then, on Eka's check of the joints list: joint ids carry the grid place and are safe as file names
(`C5xXB8@FIRST@F-14`, `@C+C1-25`); extra top bars count only at the support whose grid bubble is under them on the
detail sheet, else To check (sheets 17, 18 and 20 have no such bubbles); slab marks are never bubbles; prompt
`link_v3`; the API runs the geometry step. IS 13920 skip note rewritten for engineers. Live linking run on sheets
7 to 9 and 15 to 21 (7 live calls): 286 agreed, 5 joints linked, 48 of the model's joints rejected (column bar size
0 where the column's bars are still To check), 18 project-level items (cover table, zone, exposure). 276 tests.

Then, on Eka's decisions: drafts for incomplete joints (no placeholder numbers); elevation supports mapped to plan
supports with the count and span-share guard; the clear-cover table read as a table with one project item per
reading; C1's "• 4Ø16 + ○ 4Ø12" (OCR fused the hollow marker); column items carry their storey; Greek "ΤΟ" read
as TO (sheet 9 is the servant quarters, FOUNDATION TO GROUND ROOF); column-layout sizes tie by outline. Replay
(no API): 301 accepted, no project-level items left but zone and exposure, and C1xXB17@FIRST@L1+M+M1-28 has no
blocking item of its own. 282 tests.

Then: a bottom extra counts at a joint only if its drawn bar reaches that support (else noted, or To check when
not shown); Joint and drafts carry `place` and `floor`; every reply cache uses `REBARTWIN_REPLIES_DIR` when set
(saved replies moved there); prompt `link_v4`. 285 tests.

Then: mixed column bars in the engine (corner bars `bar_dia`, face bars `face_dia`), each bar placed and checked at
its own size, the fix loop keeping both; the C4 x B12 demo bundles unchanged (a test compares them); the linking
model's "unresolved" ignored where code proved or defaulted the value; prompt `link_v5`. 290 tests.

Then: engine text never rounds a failing value onto its limit (format.ts's rule; XB17's top bars read 24.7 mm
against 25 mm); demo bundles unchanged. 292 tests.

Then: engine text never rounds a failing value onto its limit (format.ts's rule; XB17's top bars read 24.7 mm
against 25 mm); demo bundles unchanged. 292 tests.

Then: the fix loop can place a column's face bars (symmetric, 5 mm steps, 5 mm clear of crossing beam bars as a
placing tolerance), alone or with a beam change, ranked after beam-only changes and before redesigns. C1 x XB17 at
L1/M/M1-28 is now fixed without a redesign: XB17 top 2-16 over 2-12, C1 face bars at y = +-40 mm. Demo bundles
unchanged. 297 tests.

City-round offline resilience: added `/demo/iit` (`JointRoute preset="iit"`, `/demo/iit/report`, `/projects/iit-demo`, `TopBar` and `CommandPalette` links, plus `OfflineBundleKey = "zone2" | "zone3" | "iit"` in `demoData.ts`) loading `C1xXB17@FIRST@L1+M+M1-28`'s checked bundle, option scenes, `.ifc`/`.bcf` exports, and CAD page crops from git-ignored `web/public/live/iit-demo/` completely offline with the API down, and documented `/demo/iit` as the first fallback in [docs/DEMO.md](docs/DEMO.md).

## 19 November 2026: fixes E, B and A (`feature/R-ocr`)

Claude Code, from docs/handoff/fixes-E-B-A.md. E: a To check item about a column drawn off the grid carries the
place it is near (`place`, "N1-4") and blocks only joints at that place, so none; it stays in to_check.json. Replay
of the first-floor read (no API): 1340 to 1308 items, the six off-grid items (C5, C6, C12) tied to no joint,
C1xXB17@FIRST@L1+M+M1-28 still 9 fails with the same best fix. 301 tests. `scripts/replay_agreement.py` gains
`--save` and `--base` to compare one change's agreement with the state before it.

B: a column value Gemini gave no storey takes the schedule's header as its level only when it sits inside exactly
one ruled storey group and the header names exactly one storey (`levels.one_storey`: one TO, two different floors);
provenance marks it `level_by: "storey from the schedule's table"` and the joint notes say so. A different storey
from Gemini still disagrees. Replay (no API): 287 to 336 accepted (section 41 to 61, main 6 to 20, links 7 to 22),
all 57 "Gemini gave no storey" items settled. 308 tests.
Live linking run after B (`out/iith-B`, one call, 40,478 in and 32,707 out tokens): 53 joints;
C1xXB17@FIRST@L1+M+M1-28 still 9 fails with the same best fix, but blocked this run by the linking model citing
one of two equal fields (C1 200x450 on sheets 7 and 21; the two covers) and writing zone III and moderate exposure
from no field: model variance, flagged by code as before.

A (time-boxed): beam values by span. A size on a plan band and a top or bottom callout on an elevation carry `at`,
the span's two supports ("14/18"); rule 7 keeps spans apart; at a joint only spans ending on the beam's support
line count, equal values either side are one, different values are "the beam changes at the column" (To check).
Elevation supports whose count differs from the plan's are matched at the sheet's scale (median of the sheet's
unambiguous 3+ support matches, at least two agreeing within 2%), a unique fit only. Two-size elevation titles are
not split (drawn depths not read): still To check. Replay (no API): 336 to 383 accepted (section 61 to 103, top 30
to 33, bottom 32 to 34; 43 sections, 13 tops and 13 bottoms now placed by span). A top extra with no clear
nearest support is placed by its drawn bar only when the bar reaches one support or the two ends of one span
(YB14's 2-12 at H1/J; XB12's 2-20 and YB11's 3-16 reach three supports, most likely the continuous bar: still To
check); top extras placed 8 to 9 of 37. Live linking run (`out/iith-A`, before that last step; 43,633 in, 30,192
out tokens): 53 joints (17 drafts), To check 1579 to 983, C1xXB17@FIRST@L1+M+M1-28 checkable with 9 fails and the
same best fix; no other joint checkable (unplaced top extras block most). 313 tests.

## 18 November 2026: Project overview dashboard, draft joints, mixed column UI, and demo runbook (W10, `feature/w10-overview`)

Extended `GET /projects/{id}` and `GET /projects/{id}/to-check` in `src/rebartwin/api.py` with overview `counts` (`found`, `checked`, `failing`, `blocked`, `passing`), `failures_by_rule`, `beam_junctions` (including `reading.plans.junctions`), `blocking_items`, explicit `place` / `floor` / `storey` fields (never splitting ids), `worst_failure`, `failing_rules`, `draft` handling (`*.draft.json`), and separate `blocking_unresolved` vs `non_blocking_unresolved` counts (`blocks_joint` sorted first before non-blocking other readings); routed every reply cache in `api.py` (`CachingTransport`, `CachingOcr`, `_safe_run_check`) through `replies_dir()` (`REBARTWIN_REPLIES_DIR`, default `out/_replies`, no per-project `replies` directory), moved sync blocking API routes off the async event loop with thread-safe PyMuPDF crop caching, deduped cascaded resolved provenance + ambiguous linking cascades, allowed mixed column `main` resolutions (`"4-16 + 4-12"`) writing corner `bar_dia` and `face_dia`, and permitted `+` in `_SAFE_ID_RE`. Built W10 `web/src/features/project/` components showing joint-blocking vs non-blocking counts (`"N block joints · M other readings, none blocking"`), fixed `TopBar.tsx`, `ReviewRoute.tsx`, `StatusIsland.tsx`, and `Geometry` provenance badges, rendered mixed column bars (`"4-16 corners + 4-12 faces"` and per-bar `dia` cross-sections via `formatColumnMainSummary` and `formatAfterColumnSize`) across `JointInspector.tsx`, `SectionGlyph.tsx`, `FixOptionCard.tsx`, `PrePourReport.tsx`, `ReportChosenFix.tsx`, `ProjectJointRow.tsx`, and `calloutGrammar.ts`, handled `place_face_bars` edits alongside `resize_column` without mislabeling face-bar placements as redesigns, updated `DESIGN_SYSTEM.md`, and updated [docs/DEMO.md](docs/DEMO.md) for pre-staging 15 minutes before a 3-minute pitch under `link_v5`.

## Next: built in Google Antigravity

- **18 November 2026: Public Cloud Run deploy (A3 minimal, `feature/a3-cloud-run`)**: Packaged single-service `Dockerfile` (Node 22 + Python 3.12 serving `web/dist` and FastAPI on `$PORT` with `DEMO_ONLY=true` and zero API keys), `.gcloudignore` (shipping git-ignored `web/public/live/iit-demo/` while excluding `.env`, `uploads/`, `out/`, and other `web/public/live/*` projects), `/api/health` + dual `/api/*` & root router mounting with static SPA fallback in `src/rebartwin/api.py`, public-demo guards blocking PDF reading / `To check` writes / Gemini / Vision calls (`403 application/problem+json`), `UploadRoute` public-demo banner in `web/src/routes/UploadRoute.tsx`, API/SPA pytest & Vitest coverage, single-service documentation in [ARCHITECTURE.md](ARCHITECTURE.md), and Cloud Run runbook in [docs/DEMO.md](docs/DEMO.md). Enabled Cloud Run, Cloud Build, and Artifact Registry in GCP project `rebartwin` and deployed revision `rebartwin-00001-2gc` in `asia-south1` at `https://rebartwin-17371270384.asia-south1.run.app`, verified against Playwright across `1440x900`, `390x844`, and `320x720` on `/`, `/demo`, `/demo/iit` (including Fix, Source PNG crops, `.ifc`/`.bcf` downloads), `/demo/iit/report`, `/projects/live-drawing/upload`, `/api/health`, and `403` guards on write endpoints.
- **20 November 2026: Landing showcase and demo-only polish (W12, W14, W15, `feature/w12-landing-polish`)**: Built the full landing page (`CalloutResolver`, `JointPreviewCard` with interactive `Before`/`After` `C1 × XB17` schematic, `LandingSections` covering 2D vs 3D problem, PLE 91% vs 41% evidence, 3-step proof, bounded Google AI model roles, `/demo/iit` + `/demo` live walkthrough cards, and advisory exports footer), adapted CTAs cleanly to `DEMO_ONLY=true`, gated `View styleguide` behind `import.meta.env.DEV`, replaced em dashes with middots in `AppShell` document titles, and fixed `/projects/iit-demo/review` offline handling to avoid 404 requests. Verified across dark and light themes, 320 px / 375 px / 1440 px widths, reduced motion, Vitest, Playwright E2E + axe, and Cloud Run redeploy.
- **20 November 2026: Review polish (`feature/muse-polish`)**: Applied high-impact improvements from `suggestions_muse.md`: excluded non-`iit-demo` live projects from `web/dist/live/` during `vite build` (shrinking `web/dist/` from 61 MB to ~10 MB) and split `vendor-react` chunk; added `ErrorBoundary`, `RouteErrorFallback`, and `*` `NotFoundRoute` (`404`); added `role="status"` to `RouteFallback`; made `StatusIsland` and `TopBar` project-aware (hiding `StatusIsland` on `/` and `/styleguide`); indexed active project joints, failing findings, and fix options in `CommandPalette`; guarded `ReviewRoute` keys `1`/`2`/`E`/`S` when focus is on interactive controls and synced `ToCheckCard` draft state; added `WorkspaceUrlSync` (`?f=`, `?o=`, joint-switch reset) and `/demo?zone=3` URL sync; added `GZipMiddleware`, `X-Content-Type-Options: nosniff`, and immutable asset cache headers in `api.py`; removed the last 4 em dashes; and updated `README.md` and `ARCHITECTURE.md`.
- **20 November 2026: Review audit fixes and upload guardrails (`master`)**: Fixed cross-route `WorkspaceUrlSync` state leak via store-level `activeJointKey` / `syncJointContext`, made `CommandPalette` read `?zone=3` on `/demo` and navigate when invoked off-workspace, derived `DemoRoute` zone directly from URL search params, added client/API PDF type, page-range, and 100 MB upload guardrails (`413 application/problem+json`), and added resilience unit and Playwright E2E tests.
- **20 November 2026: Post-city-round reader accuracy fixes (`fix/after-city`)**: Implemented items 1, 2, 4, and 5 from `docs/handoff/after-city-round.md` on top of `integrate/eba` (fixes E, B, A): preserved `-inv` inverted-beam flags in `parser.py` / `agree.py` / `link.py` so inverted beams are never checked as plain beams and get non-clearable `unsupported` To check items (`409` in `api.py`, read-only card in `ToCheckCard.tsx`); auto-included equal accepted copies during linking verification while keeping differing copies blocked; dropped uncited optional linker values (`seismic_zone`, `exposure`, `aggregate`, etc.) back to defaults with explicit notes; added a `sheet_scale` length guard for two-support elevations in `plan.py`; and scoped members by separate building title (`SERVANT QUARTER` on sheet 9 via `levels.sheet_building`) across `agree.py`, `plan.py`, `link.py`, `api.py`, and UI provenance/review displays.

## Data

`examples/c4_b12.json` is the pitch deck's worked example with assumed sizes, checked by hand. Its bottom bars
(4-16) and the 40 mm cover to the column's main bars are assumptions the deck does not state. No customer data.
