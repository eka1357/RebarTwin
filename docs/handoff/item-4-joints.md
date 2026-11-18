# Handoff: item 4, joints from geometry (Claude Code, 18 November 2026)

Written at the end of a long session so a fresh Claude Code session can pick up item 4 with nothing lost. Read
CLAUDE.md, AGENTS.md, ARCHITECTURE.md (Reader) first, then this.

## Where things are

- Work only in `C:\Projects\RebarTwin-R` (git worktree). Antigravity works in `C:\Projects\RebarTwin`; never switch
  branches or edit tracked files there. Its `.env` and `uploads/` are read only.
- Branch `feature/R-ocr`, last code commit `bbaf793`, 253 tests passing, ruff clean (except an old unused import in
  `export_ifc.py:140`, not ours).
- Tests: `../RebarTwin/.venv/Scripts/python -m pytest -q -p no:cacheprovider` from the worktree (pytest's
  `pythonpath = src` makes it import the worktree's code; the venv's editable install points at the other folder).
- Run the CLI with `PYTHONPATH=src ../RebarTwin/.venv/Scripts/python -X utf8 -m rebartwin.cli ...`.
- Drawing: `../RebarTwin/uploads/iith-director-residence-structural.pdf` (IIT Hyderabad tender set, 22 sheets).
  Keys in `RebarTwin-R/.env` (GEMINI_API_KEY, VISION_API_KEY); prepaid credit was added on 17 November.
- Saved replies of the `--tile 3000` run on sheets 7 to 9 and 15 to 20: `out/iith-t3000/replies/` (97 files: 67
  Gemini reads, 1 link, 30 Vision OCR tiles), with that run's `reading.json` and `to_check.json`.

## Replay (no API cost)

    cd C:\Projects\RebarTwin-R
    PYTHONPATH=src ../RebarTwin/.venv/Scripts/python -X utf8 scripts/replay_agreement.py \
        --pdf ../RebarTwin/uploads/iith-director-residence-structural.pdf --out out/iith-t3000 \
        --pages 7-9,15-20 --tile 3000

It replays every saved Gemini and Vision reply through the current parser and agreement (it asserts no live call),
prints agreement per field against the saved run, the commonest To check reasons, and 20 random newly agreed values
beside the drawing text near them. Linking is not replayed. Takes about 3 minutes (ingesting A0 sheets' vector paths).

Agreement now (saved run, then now):

| Field | Saved run | Now |
|---|---|---|
| section | 47 / 236 | 39 / 241 |
| main (columns) | 2 / 34 | 5 / 33 |
| links | 10 / 80 | 9 / 80 |
| top | 0 / 91 | 0 / 91 |
| top_extra | 0 / 110 | 0 / 110 |
| bottom | 0 / 98 | 25 / 96 |
| bottom_extra | 0 / 50 | 17 / 49 |
| cover | 0 / 16 | 0 / 16 |
| concrete grade | 4 / 17 | 4 / 17 |
| steel grade | 2 / 2 | 2 / 2 |

Total agreed 65 to 101. No `frames_into` came from Gemini at all, so no joints link yet: that is item 4.

## Invariants (never break)

- Nothing wrong is ever auto-accepted. A value is accepted only when Gemini and the parser give the same canonical
  value at the same place, tied to the right member, face and level. Everything else goes to To check with a reason.
- The engine is the only source of numbers. The linking model's numbers are never trusted: `link.verify` re-derives
  every number from accepted fields. Defaults and structural choices are notes written by code, not by the model.
- Every read value has provenance (page, box_2d, text, gemini, parser, status; plus `ocr_raw`, `joined_from`,
  `level` where they apply). Integer `box_2d` only in output files; floats inside the reader.
- Stored text is never modified. Repairs (OCR Ø) and joins (split Ø comments) are derived, recorded, and only
  ever count if Gemini reads the same value at the same place.
- Rules change only with a hand-checked test; tests are never loosened. Logs never carry drawing text.
- No new prompt version until after item 4 (it invalidates every saved reply). The storey prompt nudge waits.

## Decisions so far (all in the code)

- Comments (AutoCAD SHX Text) always merged with the text layer; AutoCAD codes translated; repeats dropped.
- Cloud Vision OCR for pages with no text and no comments; OCR words never go into Gemini's prompt.
- OCR Ø repair in OCR words only: bars n-Ø-d (n 1 to 24, d 8 to 40) and links Ø-d @ s (d 6 to 12, s a multiple of
  5 from 50 to 300), only when exactly one split fits; raw text kept as `ocr_raw`.
- Split Ø join in the parser's token layer only (`tokens.py`): a comment exactly "O" on the baseline over the space
  of an "n d" comment (or between "n" and "d" comments) becomes "nØd"; `joined_from` in provenance; Gemini's prompt
  keeps the raw comments; no fit or two fits, no join.
- XB and YB beam ids; direction from the prefix, a linking-model mismatch goes to To check.
- Table cells from drawn ruling lines (letter strokes inside word boxes excluded); words in a small cell are one run.
- Storey groups (sheets 7 and 8): a storey header owns its group from the previous header's right-hand rule (or the
  table's left edge) to its own right-hand rule. Inside a storey group a column mark ties to values in the same row
  (overlapping height), in either direction; no distance crowding there.
- Label ties elsewhere: same text first ("XB1(200x600-inv)"); then the nearest same-kind label within 1.5 text
  heights, ambiguous if another is within 3 (crowding applies only outside storey groups); then reading order.
- Rule 8: one value on the drawing backs one field. If callouts for different fields agree with the same parser
  value (XB16's top and bottom on one "2Ø12"), none is accepted.
- A storey that ends at the beams' floor is chosen by code; joint ids gain `@<floor>`.
- Unstated zone or exposure: one project-level To check item each, never a silent default.

## Item 4: what to build (approved plan)

Time-box: **this evening (18 November)**. If sheets 15 (FIRST FLOOR BEAM LAYOUT) and 21 (COLUMN LAYOUT) are not
giving joints you trust by then, fall back (below) so the city round still has a real joint.

1. **Grids per sheet.** A grid bubble is a short label (A to K, A1 to K1, 1, 2, ...) inside a drawn circle at the
   plan's edge; its grid line is the long drawn segment through the bubble's centre. Exclude bubble text from member
   ids (a bubble "C1" must not read as column C1). Sheets 15 and 21 share bubbles A to K and A1 to K1 on the left edge;
   check where the numbered bubbles are (not near the top edge).
2. **Align the two sheets.** Per axis, fit scale and offset from sheet 15's grid positions to sheet 21's using the
   labels both have: at least 2 shared labels per axis and worst residual under 0.5% of the span, else no alignment
   and that floor's joints go to To check.
3. **Columns at intersections (sheet 21).** A column is a column-id label within tolerance of a grid intersection,
   preferably with its outline rectangle containing it. Tolerance: the smaller of half the smallest bay and 1% of the
   span. A column label near but not on an intersection goes to To check ("C7 is near D-4 but not on it").
4. **Beam bands (sheet 15).** Beams are usually drawn dashed (hidden below the slab) and as two edges. Merge collinear
   dashes into one line; pair the two parallel edges at beam width into one band; check the band's centreline against
   the grid. Tie each XB or YB label to the band on which it sits, in its stated direction. Size labels on the same
   band tie to that beam (replaces distance crowding on plans).
5. **Beam ends to intersections.** The band's extent, mapped into sheet 21's coordinates, covers the intersections it
   passes; each one holding a column makes a code-made `frames_into` accepted field (status "geometry"), with both
   labels' pages and boxes and the plan title's floor ("FIRST FLOOR") as its level, so `link.verify` uses it.
6. **No column at an intersection** (beam on beam): no joint; record it in reading.json as a beam-to-beam junction,
   not To check. A column with no beam: no joint. A beam whose band is not found, or whose label sits between two
   candidate bands, goes to To check.
7. **One beam per direction.** An interior column usually has a beam on each side in the same direction, and the
   engine takes one beam per direction. If both sides carry the same mark, use it; if the marks differ, send that
   joint to To check for now.
8. **Detail-view tie (sheets 16 to 20), approved as part of item 4.** All 156 top and top_extra items on sheets 17, 18
   and 20 have the right value on both channels but no label tie: each beam elevation's title ("XB1(200x600-inv)")
   sits below the elevation, a beam depth from the top bars. Find the elevation's band (its long horizontal edge
   lines); a callout above, in or just below the band, within its x-span, belongs to the beam whose title is just
   below that band, only if exactly one same-kind title is there. Share the band code with step 4.
9. **Tests.** A generated sheet pair with grids offset and scaled differently, dashed two-edge beams, an offset column,
   a beam on a beam, a beam with no column, an interior column with the same and with different marks either side;
   an elevation with title below and top and bottom callouts. Then the real pair 15 and 21: print the joints found
   (column, beams, grid intersection) with no API calls, for Eka to check against the drawing, before any linking or
   whole-set run.

**Fallback** (if the time-box runs out): one To check item per beam end, "does XB12 meet C4 at D-4?", built from
whatever grid and band geometry works, for a person to confirm. A confirmed answer becomes a `frames_into` with
status "resolved".

## Small item

Normalise Gemini's Cyrillic "Ф" and Greek "Ά" to Ø in `parser.normalise` (Gemini's values only, not page scanning).
Eight top-bar values on sheets 17, 18 and 20 are written that way. Add a test.

## After item 4

1. Replay (above) and report agreement per field; print the joints found on 15 and 21.
2. Master will have Antigravity's A1, W8 and W9 (no files overlap). Merge master into `feature/R-ocr`, run every test
   (Python and, if it touches web, `cd web && npm test`), fast-forward master to `feature/R-ocr`, and tell Eka;
   Antigravity then re-runs its live upload, To check and joint check.
3. On hold until Eka confirms: the `--tile 1500` comparison (sheets 7 and 16 only), the whole set, and the storey
   prompt nudge (new prompt version, one re-read).

## Notes for the next session

- Sheet sizes: 7 and 8 are A0 portrait (2384 x 3370 pt), with text drawn as lines (OCR); 15 to 21 are A1 rotated 270
  with SHX comments. Ingesting 7 to 9 and 15 to 20 takes about 25 s (vector paths).
- Column schedules (7, 8): storeys across, column types down; sub-columns are vertical text; rows are not ruled.
- 34 column values are To check because Gemini gave no storey where the sheet has one; that is the prompt nudge.
