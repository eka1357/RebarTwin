# Handoff: fixes E, B and A (Claude Code, 18 November 2026, late evening)

For a fresh Claude Code session. Read CLAUDE.md, AGENTS.md, ARCHITECTURE.md (Reader, 4a) and docs/rules.md first,
then docs/handoff/item-4-joints.md (status at the top), then this.

## Where things are

- Work only in `C:\Projects\RebarTwin-R`, branch `feature/R-ocr`. Before any new work: `git merge --ff-only master`.
  Never merge into master yourself: commit on `feature/R-ocr`, tell Eka, Antigravity merges.
- `demo-safe` tag (local, not pushed) marks `fb79ded`, the master commit the city-round demo runs on.
- Tests: `../RebarTwin/.venv/Scripts/python -m pytest -q -p no:cacheprovider` (298 at the time of writing; the
  `tests/conftest.py` fixture keeps tests off the shared reply folder). Engine rule changes need a hand-checked
  number in the test docstring.
- Drawing: `../RebarTwin/uploads/iith-director-residence-structural.pdf` (IIT Hyderabad, 22 sheets). First-floor set:
  sheets 7, 8, 9 (column schedules; 9 is the servant quarters), 15 (FIRST FLOOR BEAM LAYOUT), 16 to 20 (beam details),
  21 (COLUMN LAYOUT).
- Saved replies: `C:\Projects\rebartwin-replies`, shared by every reply cache when `REBARTWIN_REPLIES_DIR` is set
  (it is, in `.env`; scripts must call `load_env()`). Every Gemini read, OCR tile and the last link replies are there,
  so agreement replays with no API call. Do not read `.env` into the conversation.
- Last live run: `out/iith-first-floor-3/` (prompt `link_v5`, 45 joints, `reading.json`, `to_check.json`, `joints/`),
  with `blocking.txt` (per joint) and `blocker_types.txt` (tonight's analysis).

## Replay (no API cost, about 7 minutes)

    cd C:\Projects\RebarTwin-R
    PYTHONPATH=src ../RebarTwin/.venv/Scripts/python -X utf8 scripts/replay_agreement.py \
        --pdf ../RebarTwin/uploads/iith-director-residence-structural.pdf --out out/iith-t3000 \
        --pages 7-9,15-20 --tile 3000 --plans 21 --sample 20

It replays every saved read through the current parser, plan geometry and agreement (it asserts no live call), prints
agreement per field against `out/iith-t3000/reading.json`, the commonest To check reasons, and `--sample` random
newly agreed values beside the drawing text near them: that sample is what Eka reviews at each merge. Linking is not
replayed: its input changes with agreement. A new linking run is one live call (about 40,000 input and 26,000 output
tokens, 4 minutes): `rebartwin read <pdf> --out out/<new> --pages 7-9,15-21 --tile 3000`; reads replay from the
shared folder.

## Tonight's analysis (out/iith-first-floor-3/blocker_types.txt)

44 joints besides C1xXB17@FIRST@L1+M+M1-28; none is checkable beyond zone and exposure. Most have 5 to 8 blocker
types. Grouped by the fix that removes them (joints hit / only blocker): A beam values by span 44 / 4; B column
schedule storey 36 / 0; D beam label ties 25 / 0; E off-grid column tying bug 19 / 0; plan bands 8; rule 8 4;
parser read nothing 2. Checkable if fixed: A alone 4, A + B 9, A + B + E 13, A + B + D 18 (upper bounds: a fix may not
clear every instance, and relinking can add items).

## Decisions (Eka, 18 November), in this order, each with tests and a replay after it

### E. The off-grid tying bug: go

`plan.meet` reports a column off the grid ("C5 is near N1-4 but its outline is not on that grid intersection") as a
`Problem` with member "C5"; `plan.read_plans` turns it into a To check item on `frames_into` for member C5 with no
joint; `link.link` then ties it to every joint that uses C5. Rule: an item about a column off the grid at one place
blocks only the joints at that place. That column is in no joint (it is not on the grid), so it blocks none. Carry the
place on the item (the `Problem`'s nearest grid name, or a "no place" marker) and make the tying in `link.link` (the
loop "Items from agreement block every joint that uses their member") skip joints whose `place` differs. Keep the
item in to_check.json so a person still sees it.

### B. Column storey from the sheet: go, with the guard

Today `agree._level_problem` sends a column value to To check ("this value sits under the storey header ...; Gemini
gave no storey"). Accept the sheet's header as the level only when all hold:
- Gemini gave no storey (a different storey from Gemini still disagrees);
- the value sits inside exactly one ruled storey group (`agree._storey_groups` / `_group_of`, not the unruled
  fallback in `_storey_header`);
- the header normalises to exactly one storey (`levels.storey` returns one pair; OCR headers can be garbled, such as
  "FOUNDATION ON TO FIRST FLOOR ▪OR").
Mark the level as code-made in provenance: "storey from the schedule's table" (a field on `Accepted`, carried by
`provenance()`; ARCHITECTURE.md Source contract updated). Every other agreement check still applies (value, place,
member tie).

### A. Beam values by span: go, time-boxed to 6 pm on 19 November

Give every beam value on an elevation (section, top, bottom, extras) the span or support it sits over, extending the
support mapping already used for top extras (`plan.elevation_supports`, `elevation_support_at`, `bar_reach`,
`plan_supports`, `support_map`; `agree` sets `Accepted.at`; `link.verify` filters by the joint's support line).
- A two-size title ("200x450/200x600-inv", 13 of the unreadable notations) is assigned to spans only when the
  elevation's drawn depths confirm which span is deeper; otherwise To check. Never assume left-to-right order.
- Joints where the beam changes at the column itself (a different section or bars either side) stay To check: the
  engine takes one beam per direction.
- If the time-box runs out, commit what passes the merge rules and list what is left.

## Merge rules for A and B (and E)

- Every test passes (Python; web untouched by these).
- C1xXB17@FIRST@L1+M+M1-28 still checks to the same 9 fails (XB17 top bars 24.7 mm against 25 mm; 8 clashes between
  XB17's outer bars and C1's 12 mm face bars) and the same best fix: "XB17 top: 2-16 in layer 1, 2-12 in layer 2;
  C1 face bars at y = -40, 40 mm" (tests `test_c1_x_xb17_*` in tests/test_engine.py pin the engine side; re-check
  the linked joint from a new run with zone II and mild exposure).
- Print 20 random newly accepted values beside their source text for Eka (`--sample 20` above).
- The C4 x B12 demo bundles must not change (tests pin report, scene and the fix loop).
- Commit on `feature/R-ocr`, tell Eka; Antigravity merges.

## Waiting

- D (beam label ties) waits until after the city round.
- On hold: the `--tile 1500` comparison, the whole set, the storey prompt nudge (a new prompt version and a re-read).
- Web: rendering draft joints and `place_face_bars` options is Antigravity's; `api.py` still resolves a mixed column
  main to one bar size (Antigravity's code).
