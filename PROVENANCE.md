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

## Next: built in Google Antigravity

The Gemini reader, the Gemini fix proposer and the API on Cloud Run, from `prompts/antigravity-build-prompt.md`.
Record each piece here when it lands.

## Data

`examples/c4_b12.json` is the pitch deck's worked example with assumed sizes, checked by hand. Its bottom bars
(4-16) and the 40 mm cover to the column's main bars are assumptions the deck does not state. No customer data.
