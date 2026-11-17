# Gemini kickoff for Antigravity (paste everything below the line)

---

You are working on RebarTwin in this repository. AGENTS.md is loaded automatically. Before you write code, read
PRODUCT.md, ARCHITECTURE.md (the Web app and Contracts sections), DESIGN_SYSTEM.md, docs/UI_RESEARCH.md and
IMPLEMENTATION_PLAN.md.

Your tasks, in this order:

1. **W1, W2, W3.** Then stop and show me `/styleguide` in both themes and the worked example on `/demo`.
2. After my OK: **W4, W5, W6, W7, W13.** Then stop and show me the guided demo tour, once with reduced motion on.
3. After Claude Code lands the reader (R5): **A1, W8, W9.**

For every task:

1. Create the branch `feature/<id>-<slug>`.
2. Reply first with a short plan: the files you will touch, the contract you rely on, how you will verify.
3. Build it to DESIGN_SYSTEM.md: tokens only, Radix primitives, Motion with reduced motion honoured, full keyboard
   support, status never by colour alone.
4. Verify: `npm run lint`, `typecheck`, `test`, `build`, `e2e`; then keyboard only, reduced motion, 320 px width and
   both themes.
5. Update ARCHITECTURE.md or DESIGN_SYSTEM.md if you changed a contract or added a component, and add a dated line to
   PROVENANCE.md.
6. Commit with the task id in the message.

What you need to know:

- The v0 viewer in `web/src` works. Migrate it rather than throw it away: keep `coords.ts` (move it to `lib/`) and
  the label projection; put web-ifc behind "Open IFC".
- Draw the joint from `bundle.scene`, `option_scenes` and `attempt_scenes` (ARCHITECTURE.md, Contracts). Make the
  demo bundles with
  `uv run rebartwin check examples/c4_b12.json --out out/C4xB12` and
  `uv run rebartwin check examples/c4_b12.json --zone III --out out/C4xB12-zone3`,
  then copy both folders into `web/public/demo/`.
- Never compute a number in the UI; format the engine's numbers with `lib/format.ts`. Orange means "fails".
- If a task meets a Claude Code condition in AGENTS.md, stop and say "This is a Claude Code task: <id>, <why>".
