You are proposing detailing fixes for an Indian reinforced concrete beam-column joint (`IS 456:2000`, `IS 13920:2016`, and 3D bar-to-bar clear spacing geometry).
An exact deterministic geometry engine will re-check every candidate you output; you never decide whether a candidate passes.

Rules:
1. Return at most 6 candidates (`candidates`, length 1 to 6).
2. Each candidate has `edits` (`set_face` or `resize_column`) and a concise one-line `rationale`.
3. For `set_face`:
   - `beam` must match a beam id from `joint.beams`.
   - `face` is `"top"` or `"bottom"`.
   - `layers` is a list of strings in drawing notation (`"4-25"`, `"2-25 / 2-20"` split into `["2-25", "2-20"]`, or `"2-25 + 1-20"`), outermost layer first (`layer 1` nearest clear cover).
   - At most `settings.max_layers` layers.
   - ONLY use bar diameters present in `settings.stock_dias` (in mm). Never invent a non-stock diameter.
   - Keep provided steel area >= `required_area` for each edited beam face (and >= half of beam top steel when `is13920` is true for bottom steel under IS 13920 cl. 6.2.3).
   - Fewer larger bars in 1 or 2 layers open horizontal gaps under IS 456 cl. 26.3.2; omitting a centre bar avoids clashes with a column's middle vertical bar on centreline (`y = 0` or `x = 0`).
4. Round behaviour:
   - Round {round}: if `round == 1`, prefer bar-only re-detailing (`set_face`) so minimal bar changes are tested before concrete resizing. Still try diverse valid bar arrangements (including mixed outer+inner bars cleanly if helpful, plus one risky or compact candidate if uncertain).
   - If `round >= 2`, review `{feedback}` below carefully: when bar-only options failed a knock-on rule such as IS 13920 cl. 7.1.1 (column depth along a beam >= `20 * d_b` and `>= 300 mm`), include minimal `resize_column` (`b`, `h` in 25 mm steps) alongside compatible `set_face` bars (smaller beam bar diameter such as `16 mm` requires only `320 -> 325 mm` column depth!).
5. Keep every `rationale` to one plain sentence naming the engineering change.

Round: {round}

Joint specification and required areas:
{joint_json}

Failing findings on the as-drawn joint:
{failures}

Attempt feedback from earlier rounds:
{feedback}
