---
trigger: glob
globs: "src/rebartwin/reader/**"
description: "RebarTwin reader rules: two channels, agreement, provenance. The reader is Claude Code's."
---

# Reader rules

- The reader (R1 to R6) belongs to Claude Code. Gemini may edit prompts under `reader/prompts/` and add tests, and
  nothing else here.
- Two channels, always: Gemini (`gemini-3.8-flash`, temperature 0, structured output, `box_2d` as
  `[ymin, xmin, ymax, xmax]` in 0 to 1000) and the text-layer parser.
- Accept a value only when both channels agree and their boxes overlap (IoU at least 0.3, or one centre inside the
  other). Everything else goes to `to_check.json` with both readings and a reason.
- Every accepted value goes into `provenance.json` with page, `box_2d`, text and both channels' values.
- Linking uses `gemini-4-argon` (fallback `gemini-3.8-flash`) with `Joint.model_json_schema()`; every default it
  applies becomes a sentence in `Joint.notes`.
- Keys come from `.env`; drawings stay in `uploads/` (git-ignored); drawing text never goes into logs.
- Tests run without keys, on recorded responses in `tests/fixtures/`.
