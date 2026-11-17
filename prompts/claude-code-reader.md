# Claude Code: build the reader (paste everything below the line)

---

Build RebarTwin's reader, tasks R1 to R5 in IMPLEMENTATION_PLAN.md, on the branch `feature/R-reader`. First read
CLAUDE.md (it loads AGENTS.md), ARCHITECTURE.md (Reader and Contracts), docs/rules.md and
`src/rebartwin/model.py`. Do not change rules, layout, geometry or the fix loop.

Deliver `src/rebartwin/reader/`:

1. `ingest.py`: PyMuPDF renders pages at 200 dpi to `out/<project>/pages/page-<n>.png` and returns words with boxes,
   normalised to 0 to 1000 in Gemini's `box_2d` order, `[ymin, xmin, ymax, xmax]`.
2. `parser.py`: a grammar for Indian notation, with each match mapped to its word boxes: bar groups ("5-20",
   "2-25+1-20", "2#25", "8-T16", "3 nos 16φ", "4-12Φ"), sections ("230x450", "230 X 450"), links ("8φ @ 150 c/c",
   "2L-8 @ 100"), cover ("clear cover 25 mm", "C.C. 40"), grades ("M25", "Fe500"), member ids ("B12", "C4", "FB3").
   Unit tests for every notation, and near-misses that must not match.
3. `gemini.py`: the google-genai client, with `GEMINI_API_KEY` locally or Vertex AI when
   `GOOGLE_GENAI_USE_VERTEXAI=true`; model from `REBARTWIN_MODEL_READ` (default `gemini-3.8-flash`); temperature 0;
   a response schema for callouts (member, field, value as written, `box_2d`, page); the prompt in
   `reader/prompts/read_v1.md` says numbers come only from the drawing and includes the page's text-layer words.
   Retries with backoff; log model, tokens and latency, never drawing text.
4. `agree.py`: normalise values (canonical count-diameter, sections as b × D), compare the two channels, accept on
   equal values with IoU at least 0.3 or one centre inside the other; accepted values go to provenance, everything
   else to To check with a reason (disagree, missing, ambiguous).
5. `link.py`: `REBARTWIN_MODEL_LINK` (default `gemini-4-argon`; on a model-not-found error use
   `REBARTWIN_MODEL_FALLBACK`), response schema `Joint.model_json_schema()`, input the accepted fields, schedules and
   general notes; every default applied becomes a sentence in `Joint.notes`; validate with `Joint.model_validate`;
   anything unresolved becomes a To check item.
6. CLI: `rebartwin read <pdf> --out out/<project>` writes `joints/<id>.json`, `provenance.json`, `to_check.json`
   and `pages/`; `rebartwin check` then runs on each joint.
7. Tests that need no key: a PDF generated inside the test with PyMuPDF holding a small beam and column schedule,
   recorded Gemini responses in `tests/fixtures/`, and crafted disagreements that prove nothing wrong is accepted.

Add `pymupdf` and `google-genai` as a `reader` extra in `pyproject.toml`. When the tests pass, run the reader on the
drawing in `uploads/` that I name, report agreement per field, and list the To check items. Update ARCHITECTURE.md
if a contract changes and add a dated line to PROVENANCE.md.
