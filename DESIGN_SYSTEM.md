# DESIGN_SYSTEM.md

## Concept: the drawing, measured

RebarTwin should feel like a precision instrument laid on a drafting table. The workspace is graphite. Anything
that came from a drawing sits on warm paper. Bars are steel. One signal colour, orange, appears only where
something fails, so the eye goes straight to the problem. Numbers are set in a monospace with their units, like
dimensions on a sheet, and dimensions are drawn the way engineers draw them: a hairline with ticks at both ends.
Motion explains cause and effect and never decorates.

Five signatures make it recognisable:

1. **Single orange.** In the workspace, orange means "this fails". Never decoration, never a button colour.
2. **Dimension lines.** Hairline, end ticks, value in mono. Used for 3D gap callouts, gauges and dividers.
3. **Paper for evidence.** Drawing crops, To check items and the report sit on paper surfaces, even in dark mode.
4. **Section glyphs.** Tiny cross-sections drawn to scale from scene data, so a layer of bars is shown, not described.
5. **Mono numerals.** Every measurement in JetBrains Mono, tabular, slashed zero, unit in a lighter tone.

## Principles

1. **Proof first.** Measured, limit and clause together, every time. A finding without a number is not shown.
2. **One glance, one problem.** Failures first, sorted by severity, counted in the top bar.
3. **Evidence is one click away.** From any number: its bars in 3D, its clause basis, its drawing crop.
4. **Calm by default.** Quiet surfaces, hairlines, few colours; motion only when something changes.
5. **Every fact twice.** What the 3D shows is also in text: the list, the gauge, the label. Nothing is 3D-only.

## Tokens

Copy into `web/src/styles/tokens.css`. Components use semantic tokens through Tailwind utilities (`bg-surface`,
`text-fail`, `border-border`), never raw hex. Dark is the default; `data-theme="light"` on `<html>` switches.

```css
@import "tailwindcss";

:root {
  /* primitives */
  --graphite-950: #0e1116; --graphite-900: #15191f; --graphite-850: #1b2028; --graphite-800: #222833;
  --graphite-700: #2e3542; --graphite-600: #3d4450; --graphite-500: #5f6875; --graphite-400: #8a94a3;
  --graphite-300: #a9b2bf; --graphite-200: #c9ced6; --graphite-100: #e6e9ed;
  --paper-50: #fffdf9; --paper-100: #f4f2ee; --paper-200: #eae6df; --paper-300: #ddd8cf; --paper-400: #bfb8ac;
  --orange-500: #f97316; --orange-700: #c2410c;

  /* semantic, dark (default) */
  --background: var(--graphite-950);
  --surface: #151a21;
  --surface-raised: #1b2129;
  --surface-sunken: #0a0d11;
  --border: #2a313c;
  --border-strong: #3a4351;
  --control-border: #667183;      /* inputs, toggles, checkboxes: at least 3:1 */
  --foreground: #eef1f4;
  --muted-foreground: var(--graphite-300);
  --subtle-foreground: #7f8a99;
  --primary: #eef1f4;              /* primary buttons are neutral, inverted */
  --primary-foreground: var(--graphite-950);
  --ring: #ffffff;
  --signal: var(--orange-500);     /* brand mark and landing only */
  --fail: #ff6a3d;      --fail-surface: rgb(255 106 61 / 0.12);
  --pass: #3dd68c;      --pass-surface: rgb(61 214 140 / 0.12);
  --check: #8c9eff;     --check-surface: rgb(140 158 255 / 0.14);
  --advisory: #f5b83d;  --advisory-surface: rgb(245 184 61 / 0.12);
  --paper: var(--paper-50);
  --paper-foreground: var(--graphite-900);
  --paper-border: var(--paper-300);
  --steel: #9aa6b5;
  --concrete: #cfc9bf;
  --grid: rgb(255 255 255 / 0.04);
  --shadow-overlay: 0 12px 32px -8px rgb(0 0 0 / 0.55), 0 0 0 1px var(--border);

  /* motion */
  --dur-1: 120ms; --dur-2: 200ms; --dur-3: 320ms; --dur-morph: 700ms; --dur-camera: 900ms;
}

[data-theme="light"] {
  --background: var(--paper-100);
  --surface: var(--paper-50);
  --surface-raised: #ffffff;
  --surface-sunken: var(--paper-200);
  --border: var(--paper-300);
  --border-strong: var(--paper-400);
  --control-border: #857e73;
  --foreground: var(--graphite-900);
  --muted-foreground: var(--graphite-600);
  --subtle-foreground: #59626f;
  --primary: var(--graphite-900);
  --primary-foreground: var(--paper-50);
  --ring: var(--graphite-900);
  --signal: #b03a0a;
  --fail: #b42318;      --fail-surface: rgb(180 35 24 / 0.08);
  --pass: #126b43;      --pass-surface: rgb(18 107 67 / 0.08);
  --check: #4338ca;     --check-surface: rgb(67 56 202 / 0.08);
  --advisory: #8a5a00;  --advisory-surface: rgb(138 90 0 / 0.08);
  --grid: rgb(21 25 31 / 0.05);
  --shadow-overlay: 0 12px 32px -12px rgb(21 25 31 / 0.18), 0 0 0 1px var(--border);
}

@theme inline {
  --color-background: var(--background);
  --color-surface: var(--surface);
  --color-surface-raised: var(--surface-raised);
  --color-surface-sunken: var(--surface-sunken);
  --color-border: var(--border);
  --color-border-strong: var(--border-strong);
  --color-control-border: var(--control-border);
  --color-foreground: var(--foreground);
  --color-muted-foreground: var(--muted-foreground);
  --color-subtle-foreground: var(--subtle-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-ring: var(--ring);
  --color-signal: var(--signal);
  --color-fail: var(--fail);
  --color-fail-surface: var(--fail-surface);
  --color-pass: var(--pass);
  --color-pass-surface: var(--pass-surface);
  --color-check: var(--check);
  --color-check-surface: var(--check-surface);
  --color-advisory: var(--advisory);
  --color-advisory-surface: var(--advisory-surface);
  --color-paper: var(--paper);
  --color-paper-foreground: var(--paper-foreground);
  --color-paper-border: var(--paper-border);
  --font-display: "Space Grotesk Variable", "Space Grotesk", ui-sans-serif, system-ui, sans-serif;
  --font-sans: "Inter Variable", "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "JetBrains Mono Variable", "JetBrains Mono", ui-monospace, monospace;
  --radius-xs: 4px; --radius-sm: 6px; --radius-md: 8px; --radius-lg: 12px; --radius-xl: 16px;
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
  --ease-exit: cubic-bezier(0.4, 0, 1, 1);
  --ease-inout: cubic-bezier(0.65, 0, 0.35, 1);
  --shadow-overlay: var(--shadow-overlay);
}
```

Contrast, computed with the WCAG formula on every background, surface and raised or sunken surface in both themes:
body text at least 14:1, muted at least 7.5:1, subtle at least 4.6:1, status colours at least 4.7:1 as text
(including on their own pill surfaces), the light-theme signal at least 4.8:1, control borders at least 3.2:1. The
hairline `--border` is decorative and below 3:1, so it is never the only thing that shows where a control is: inputs,
toggles and checkboxes use `--control-border`. Re-check any change in Realtime Colors and with axe. The deck's
`#6b7280` is not used for small text on paper: it measures 4.3:1 there.

## Type

| Role | Font | Size and line height | Use |
|---|---|---|---|
| Hero | Space Grotesk 700, tracking -0.02em | `text-6xl` to `text-7xl`, 1.0 | Landing only |
| Title | Space Grotesk 600 | `text-2xl` to `text-3xl`, 1.15 | Page and joint titles |
| Heading | Inter 600 | `text-base` to `text-lg`, 1.35 | Panels, cards |
| Body | Inter 400 | `text-sm` (14 px), 1.5 | The app |
| Reading | Inter 400 | `text-base` (16 px), 1.6 | Report, landing |
| Label | Inter 500 | `text-xs` (12 px), 1.35 | Chips, captions; uppercase eyebrows with 0.08em tracking |
| Number | JetBrains Mono 500, `tabular-nums`, `slashed-zero` | inherits | Every measurement, bar mark and clause |

Load the three as variable fonts from @fontsource, self-hosted. Nothing in the app below 12 px.

## Numbers and words (`lib/format.ts`)

- A number always carries its unit, with a non-breaking space: `16 mm`, `1,610 mm²`, `+2.5%`. Locale `en-IN`.
- Lengths to the nearest millimetre; overlaps read as "18 mm overlap", never "-18 mm".
- **Never round a failing value onto its limit.** If 24.6 mm fails against 25 mm, show `24.6 mm`, not `25 mm`.
- Clauses as `IS 456 cl. 26.3.2`; bar callouts as drawn, `5-20`; a single bar as `T1-3 ⌀20`.
- Status words: Fails, Passes, To check, Recheck, Redesign. Plain, precise, calm: no exclamation marks, no blame,
  no em dashes. Errors say what happened and what to do next.

## Layout

| Width | Workspace |
|---|---|
| 1280 px and up | Top bar 48 px; left rail 264 px (joints); centre viewport; right inspector 400 px, resizable 360 to 560 |
| 1024 to 1279 | Rail collapses to 56 px icons; inspector 360 px |
| 768 to 1023 | Rail becomes a drawer; inspector becomes a bottom sheet with snap points at 40% and 85% |
| Under 768 | Report first: summary, findings, fixes as cards; the 3D view is a card that opens full screen |

Spacing follows Tailwind's 4 px scale. Panels use 16 px padding, cards 12 to 16 px, lists 8 px rhythm. Radii: chips
`xs`, inputs and buttons `md`, cards `lg`, sheets and dialogs `xl`. Dark surfaces separate by border and a 1 px
inner top highlight, not shadows; only overlays use `shadow-overlay`.

## The 3D view

| Element | Look |
|---|---|
| Background | `--surface-sunken` with a faint grid on the floor plane: 100 mm minor, 500 mm major, fading with distance |
| Concrete | Warm translucent `--concrete` at 10 to 14% opacity with hairline edges in `--border-strong`; Ghost and Hidden modes |
| Bars that pass | Steel, metalness 0.6, roughness 0.45 |
| Bars that fail | `--fail` with a soft emissive glow; the only orange in the scene |
| Selected | White rim (dark) or graphite rim (light); everything else dims to 25% |
| Ties and stirrups | Thinner steel at 70% opacity |
| Gap callout | Dimension line between the two bar surfaces with end ticks, mono label `16 · needs 25 mm` |
| Clash | A ring at the overlap point, label `18 mm overlap` |
| Text | HTML overlay, never WebGL text; positions projected each frame; at most 8 labels, then a `+n more` chip |

Lighting: hemisphere plus one soft key light; no hard shadows. Views: Iso (default), Plan, Elevation along each beam.

## Components

Primitives come from shadcn/ui on Radix: Button, Tabs, Tooltip, Popover, Dialog, Sheet, DropdownMenu, Command, Toggle
Group, Slider, Progress, ScrollArea, Separator, Badge, Skeleton, Sonner, Resizable. Restyle them to tokens once, in
`components/ui`.

| Component | Purpose and anatomy | States and behaviour | Accessibility |
|---|---|---|---|
| StatusPill | Icon + word: Fails, Passes, To check, Recheck, Redesign | sm 20 px, md 24 px | Word always present; colour never alone |
| ToleranceGauge | Hairline track, limit tick labelled `needs <limit>` or `max <limit>`, diamond marker at measured value with measured label directly beneath (auto-staggered vertically if close), hatched wrong side | Overlap extends left with its own hatch; marker settles in 160 ms, numbers never animate | `role="img"`, label from `Finding.margin`: "16 millimetres; needs at least 25; short by 9 mm" |
| FindingCard | Overlay trigger with StatusPill, title, badge, gauge, ClauseChip, BarChips, actions Show in 3D and Source | Hover highlights bars in 3D; selected has 2 px `--fail` edge and raised surface | Concise `aria-label` ("Fails: ... , IS 456 clause 26.3.2") with details linked via `aria-describedby`; arrow keys move |
| ClauseChip | Clause in mono | Popover: rule title, basis, verification status | Popover is focusable and closes on Escape |
| BarChip | `T1-3 ⌀20` with a status dot | Hover and focus highlight the bar | Name read in full: "Top bar 3, layer 1, 20 millimetres" |
| SectionGlyph | SVG cross-section of a beam face, bars drawn to scale from `scene` | Used in fix cards and the joint list | `aria-label` lists the layers in words |
| FixOptionCard | Rank, plain title "2-25 over 2-20", SectionGlyph before and after, steel and effective depth, Recheck flags | Preview runs the morph; Use in report marks it chosen | Metrics in a description list |
| WorkingsTimeline | One tick per attempt, grouped by round (diamonds for Gemini, circles for Enumerator; filled for passed, hollow for failed); current attempt's `Gemini` / `Enumerator` source badge, `Gemini rationale`, and rejecting clauses with mini gauges | Space plays, arrows step, speed 0.5×, 1×, 2×, filter Failed only; drives `attempt_scenes` | Slider semantics; each step announced politely |
| SourceCrop | Paper card showing `entry.member`, bundle-relative sheet PNG with `box_2d` crop overlay, Gemini & Parser readings, `Agreed`/`Resolved` badges, `Assumed, not on the drawing` defaults, column `Storey` (`level`), `OCR read '...'`, or pitch-deck note when no provenance | Zoom and pan; Open full sheet | Alt text carries the sheet page and value read |
| ReadingBoard | Page tiles on paper; queued, reading (scan line), done (agreed, to check), error | Counts update live | Progress in a polite live region |
| ReadingLog | Step list in the style of an agent replay: page, what was read, what agreed | Newest at the bottom, auto-follows unless scrolled | Log role |
| ToCheckCard | Warm-paper resolution card with project-level `Blocks all joints` warning, `/pages/{n}.png?crop=` image, Gemini & Parser radio group, quick chips for missing zone/exposure, grammar-validated edit form | Keys 1 and 2 choose, E edits, S skips, J and K move | Radio group semantics, field errors linked via `aria-describedby` |
| SummaryStrip | "6 fail · 0 to check · zone II · IS 13920 off" | Click a count to filter | Counts are text |
| StatusIsland | Top-bar dynamic island showing fail count, zone and IS 13920 status; expands for quick actions | Expands on click; honours reduced motion | `aria-expanded` and descriptive status label |
| CommandPalette | Ctrl or Cmd + K: joints, findings, bars, clauses, actions | Fuzzy search, recent items | cmdk with full keyboard support |
| ShortcutDialog | `?` modal listing viewport and navigation shortcuts | Opens on `?` outside text inputs | Radix Dialog with Escape close |
| ViewportToolbar | View, Concrete, Labels, Reset, Full screen | Tooltips show shortcuts | Toggle groups with labels |
| ViewportCallouts | Stacked HTML callouts with SVG leaders, anchor dots, `+n more` chip, plus 3D gap dimension lines and clash rings | Caps at 8 visible pills without overlap; clicking selects finding and bars | Mirrored `sr-only` findings list; each callout is a keyboard-reachable button |
| DemoTour | Docked 5-step guided tour bar (Finding, Source, Fix, Replay, Zone III) over pre-cached `/demo/` bundles; Step 4 derives attempt count from the bundle | `Space` advances step by step; `Escape` exits; adapts transitions under reduced motion | Polite step announcements and `aria-current="step"` indicators |
| EmptyState | A joint plan drawn in hairlines, one sentence, one action | | Illustration is decorative |

Use outside components only after a review: copy the source in, check keyboard and screen-reader behaviour, replace
colours, radii and timings with tokens, and note the source in a comment. See docs/UI_RESEARCH.md for what to take
from each library.

## Motion

Motion answers three questions: what changed, where am I, did it work. Interface animation uses Motion
(`motion/react`) with `<MotionConfig reducedMotion="user">` at the root; the camera uses `camera-controls`; the
landing story uses GSAP. Numbers never animate.

| Moment | Choreography |
|---|---|
| Open a joint | Camera flies to the Iso frame (900 ms, in-out); failing bars pulse once (600 ms); callouts rise 6 px and fade in, staggered 40 ms |
| Select a finding | Camera frames its bars (600 ms); the rest dims (200 ms); the card expands with a layout animation (200 ms) |
| Hover a chip or bar | Highlight in 120 ms, both ways |
| Before and After | 700 ms morph matched by bar id: moved bars tween, removed bars shrink along their length (300 ms), new bars grow from their centre (400 ms, after 200 ms); then a toast "1,571 → 1,610 mm² · 5 bars → 4" |
| Workings replay | Each step: 400 ms morph, then the rejecting findings flash on their bars for 300 ms; 900 ms a step at 1× |
| Panels and sheets | Spring, stiffness 420, damping 36; sheets 320 ms |
| Tooltips | 400 ms delay for the first, then instant for the next within 1.5 s |
| Reading | A scan line sweeps a tile every 1.2 s while it reads; stops when done |
| Toasts | 200 ms in, 160 ms out |
| Landing | Headline lines reveal 80 ms apart; the joint plan draws itself (1.2 s); a pinned scroll story goes sheet, to bars rising into 3D, to the clash ring, to the fix |

**Reduced motion** (`prefers-reduced-motion: reduce`): the camera cuts instead of flying, morphs become 120 ms
crossfades, no pulses, no scan line (a static "Reading" label and a progress bar), no headline split or line drawing
(final state shown), no smooth scrolling, no parallax, replay steps change instantly. Set it once in
`lib/motion.ts` and in `SceneController`, and test both modes.

## Accessibility (WCAG 2.2 AA)

- Contrast as above; focus visible everywhere: 2 px `--ring` outline with a 2 px offset.
- Everything works by keyboard. Viewport: arrows orbit, + and - zoom, F frames the selection, 0 resets, Escape
  clears. `?` opens the shortcut list. A skip link jumps to the inspector.
- The canvas has `role="img"` and a live summary ("Joint C4 × B12: 6 checks fail, 7 bars affected"). Every fact in
  3D is also in the findings list; selecting in either selects in both.
- Status is never colour alone: icon, word and, in gauges, a hatch.
- Targets at least 24 by 24 px; 44 px on touch layouts.
- Live regions: reading progress and check results are polite; errors are assertive.
- Text resizes to 200% and the layout reflows at 320 px.
- `lang="en-IN"`; meaningful page titles per route; labelled form fields with error text linked by
  `aria-describedby`.
- axe on every route in Playwright, zero violations.

## Library use

| Library | Use it for | Do not use it for |
|---|---|---|
| shadcn/ui and Radix | All primitives | |
| Motion | Interface transitions, layout animations, presence | The camera, the landing scroll story |
| GSAP (ScrollTrigger, SplitText, DrawSVG) | The landing story only, lazy-loaded | Anything in the workspace |
| Lenis | Smooth scroll on the landing only | The app, which has nested scroll areas |
| camera-controls | Camera fly-to, framing, view presets | |
| Barba | Nothing: it is for multi-page sites and fights the router | |
| React Bits | One hero text effect and one background on the landing; AnimatedList for the reading log if it honours reduced motion | Decoration in the workspace |
| 21st.dev, Skiper UI, Watermelon UI | Reviewed, restyled pieces (dropzone, sections, dashboard layouts) | Anything that bypasses Radix for an interactive control |
| bklit | Charts for the accuracy report and project overview | |
| Jitter | Title cards and motion for the demo video | Shipping UI |
