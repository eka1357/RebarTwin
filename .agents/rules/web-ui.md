---
trigger: glob
globs: "web/**"
description: "RebarTwin web app rules: tokens, components, numbers, motion and accessibility. Full detail in DESIGN_SYSTEM.md."
---

# Web UI rules

- **Stack**: Vite, React 19, TypeScript strict, Tailwind v4 with `web/src/styles/tokens.css`, shadcn/ui on Radix,
  Motion (`motion/react`), three.js through `SceneController`, `camera-controls`, React Router 7, TanStack Query,
  Zustand, cmdk, sonner, lucide-react. GSAP and Lenis only under `features/landing`, lazy-loaded.
- **Tokens only**: colours, radii, fonts, shadows, durations and easings come from tokens. No raw hex, no
  `text-[13px]`, no inline durations.
- **Orange (`--fail`) means "fails"**. Primary buttons are neutral (`bg-primary text-primary-foreground`).
- **Numbers** go through `lib/format.ts`: units always, `en-IN` grouping, never round a failing value onto its
  limit, never animate a number.
- **The viewer draws `bundle.scene`** and computes nothing. Bar ids join everything: scene, findings, chips, URL.
- **3D text is an HTML overlay**, and every fact in 3D is also in the findings list.
- **Accessibility**: Radix for interactive controls; focus ring 2 px with 2 px offset; the keyboard map in
  DESIGN_SYSTEM.md; status as icon plus word plus colour; targets at least 24 px; polite live regions for progress
  and results; axe clean on every route.
- **Motion**: `<MotionConfig reducedMotion="user">` at the root; `SceneController` cuts instead of flying under
  reduced motion; durations from `lib/motion.ts`.
- **Layout**: three panes from 1280 px, a bottom sheet below 1024 px, report-first under 768 px; test at 320 px.
- **Files**: `features/<area>/` for feature code, `components/ui/` for shadcn, `components/` for shared custom
  components, `lib/` for helpers; components under about 200 lines.
- **Before delivery**: `npm run lint`, `typecheck`, `test`, `build`, `e2e` (Playwright with axe).
