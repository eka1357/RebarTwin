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

## Next: built in Google Antigravity

The Gemini fix proposer and the API on Cloud Run, from `prompts/antigravity-build-prompt.md`.
Record each piece here when it lands.

## Data

`examples/c4_b12.json` is the pitch deck's worked example with assumed sizes, checked by hand. Its bottom bars
(4-16) and the 40 mm cover to the column's main bars are assumptions the deck does not state. No customer data.
