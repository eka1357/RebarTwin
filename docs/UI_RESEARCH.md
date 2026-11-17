# UI research: what we take from each source

Read on 17 November 2026. For each source: what it is, what RebarTwin takes, where it lands (task ids from
IMPLEMENTATION_PLAN.md), and the catch. Anything copied in is reviewed for keyboard and screen-reader behaviour,
restyled to DESIGN_SYSTEM.md tokens, and credited in a code comment.

## Components

**[21st.dev](https://21st.dev/)**: a marketplace of 12,000+ React and Tailwind components in shadcn registry format,
installed with the shadcn CLI or `npx 21st add`, or handed to an agent as a prompt; it also offers MCP access.
- Take: a file dropzone for Upload (W8) and starting points for landing sections (W12).
- Catch: many authors, uneven quality; the free plan allows two installs a day, so choose deliberately; each
  component's licence must be checked.

**[React Bits](https://reactbits.dev/)**: free, open-source animated components (text animations, animations,
components, backgrounds, micro-interactions) in JS or TS and CSS or Tailwind, copied or installed by CLI.
- Take, landing only (W12): one text effect that resolves a scrambled callout into "5-20", the reading metaphor;
  one quiet blueprint-grid background; spotlight-style cards for the three steps. In the app, at most an animated
  list for the reading log (W8).
- Catch: check each component's current name and dependencies on the site; anything that ignores reduced motion
  gets wrapped and rendered static. Decorative text is `aria-hidden` with the real text in the DOM.

**[Skiper UI](https://skiper-ui.com/)**: "uncommon" components extending shadcn/ui, built with Tailwind and Motion,
one file each, installed with `npx shadcn add @skiper-ui/skiperNN`; 24 free, the rest in a $129 bundle; its style
follows Rauno Freiberg's Devouring Details: minimal, monochrome, obsessive about interaction detail.
- Take the craft, not the components: tooltips delay 400 ms on first hover, then show instantly for the next 1.5 s;
  popovers scale from their trigger; presses settle at 0.98 scale in 120 ms; every animation can be interrupted.
- Take the idea of its "dynamic island": a status island in our top bar that expands while a drawing is read or a
  joint is checked, then collapses to the summary (W2, built with Motion layout animation).
- Catch: written for Next.js; strip `"use client"` and Next-only imports for Vite.

**[Watermelon UI](https://ui.watermelon.sh/)**: free, open-source components, animations, blocks, dashboards and
templates on React, Tailwind and shadcn, installable by CLI, with llms.txt and an MCP server for agents.
- Take: dashboard layout patterns for the project overview (W10): summary row, joints table, filters.
- Take: connect its MCP server in Antigravity so the agent can pull block source directly.

**[Unsection](https://www.unsection.com/)**: about 5,600 website sections for inspiration, by type (hero, feature,
CTA, pricing, FAQ and more) with style and layout filters; free sign-up, unclear whether code is included.
- Take: the landing's section order (W12): hero with the live joint; the problem, 2D against 3D; how it proves, in
  three steps; the scroll story; Google AI with each model's job; evidence (the PLE number, our accuracy); one call
  to action. Use it to choose layouts, not to copy them.

## Animation

**[Motion](https://motion.dev/)**: the animation library for React (package `motion`, imported from
`motion/react`; older docs use `framer-motion`). Its accessibility guide: `<MotionConfig reducedMotion="user">`
turns off transform and layout animations for people who ask for reduced motion and keeps opacity and colour;
`useReducedMotion()` covers the rest (swap a slide for a fade, stop autoplay, drop parallax).
- Take: `MotionConfig` at the root; layout animations for cards that expand and lists that re-sort; presence for
  panels, sheets and toasts; spring presets in `lib/motion.ts`; `useReducedMotion` inside `SceneController` (W1, W3).

**[GSAP](https://gsap.com/)**: now 100% free, including SplitText, ScrollTrigger, MorphSVG, DrawSVG and
ScrollSmoother; read its terms before relying on it commercially. React integration through `@gsap/react`.
- Take, landing only (W12): a ScrollTrigger pinned story (sheet, then bars rising into 3D, then the clash ring, then
  the fix); SplitText for the headline; DrawSVG for the joint plan drawing itself. Wrap everything in
  `gsap.matchMedia()` under `(prefers-reduced-motion: no-preference)`.

**[Lenis](https://lenis.dev/)**: a smooth-scroll library under 5 KB for JavaScript, React and Vue, built to keep
WebGL and the DOM in sync.
- Take: the landing only (W12), synced to GSAP's ticker and ScrollTrigger per its README; off under reduced motion;
  `data-lenis-prevent` on any nested scroll area.
- Catch: never in the workspace, which is full of scroll areas and a canvas.

**[Barba.js](https://barba.js.org/)**: page transitions for multi-page websites.
- Skip: RebarTwin is a single-page app. Route changes use React Router's view transitions and Motion presence.

**[Jitter](https://jitter.video/)**: web motion design with Figma import, templates, and export to 4K video, GIF and
Lottie.
- Take: title cards and feature clips for the Buildathon demo video and social posts (P4). If a clip ships on the
  landing, export video with a poster frame, lazy-load it, and pause it under reduced motion.

## Inspiration

**[Manus](https://manus.im/)**: a quiet off-white surface, one centred entry ("What can I do for you?") and starter
chips with "New" badges; the product is known for letting people watch and replay what its agent did.
- Take: the project start screen as one centred drop zone with starter chips: "Try the example joint", "Upload a
  drawing set", "Paste a joint" (W8). The reading log as a step list (W8). The Workings replay with play, scrub and a
  shareable link to any attempt (`?a=`) (W7).

**[bklit](https://bklit.com/)**: open-source React charts on shadcn and d3 (235 types including sparkline, heatmap
and sankey), a chart builder, dark-first, with a Cmd K entry point.
- Take: failures by rule as bars and a sheets-by-rule heatmap on the project overview (W10); per-field accuracy
  bars for the reading evaluation (R6); the Cmd K habit (we use cmdk).

**[Toolfolio](https://toolfolio.com/)**: a directory of tools and curations, including a motion library, launch
videos and microinteractions.dev (free, copyable microinteractions).
- Take: microinteractions.dev patterns for press, copy-to-clipboard confirmation and toggles (W1); the launch-video
  curation as references for P4.

**[ScreensDesign](https://screensdesign.com/)**: recorded iOS app flows, strongest on onboarding and paywalls.
- Take: first-run and empty states before the first upload, and "results ready" moments, adapted from mobile to
  web (W8, W10). Little else applies.

**[Realtime Colors](https://www.realtimecolors.com/)**: previews a palette on a real page with text, background,
primary, secondary and accent roles, a light and dark toggle, an AA and AAA contrast indicator, and export to CSS,
Tailwind, SCSS or a shadcn preset in HEX, RGB, HSL or OKLCH.
- Take: enter our dark tokens (text `#eef1f4`, background `#0e1116`, primary neutral, secondary steel `#9aa6b5`,
  accent fail `#ff6a3d`) and the light set, check contrast, and export OKLCH if we move tokens to OKLCH (W1).

## What this adds up to

A monochrome, instrument-grade workspace in the Devouring Details tradition, with one signal colour; motion that only
explains (Motion in the app, GSAP and Lenis confined to the landing); replay as a first-class way to show the work,
as Manus does; and a landing built section by section from proven layouts, with one effect that tells our story:
a drawing's callout resolving into a value.
