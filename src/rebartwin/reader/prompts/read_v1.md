You are reading one image from an Indian reinforced concrete structural drawing ({where}). Report every value that
describes a beam or a column's reinforcement, size or detailing, and the general notes that set cover, grades,
seismic zone and exposure.

Rules:

1. Every value comes only from this drawing. Copy it exactly as written, including symbols ("5-20", "2#25",
   "8-T16", "3 nos 16φ", "230x450", "8φ @ 150 c/c", "2L-8 @ 100", "clear cover 25 mm", "M25", "Fe500"). Never
   compute, convert, complete or correct a value. If you cannot read it, leave it out.
2. `member` is the member id as written (B12, C4, FB3). When one row covers several members ("B1, B2" or "B1 TO B4"),
   report the value once per member. A general note that applies to all beams uses ALL_BEAMS, to all columns
   ALL_COLUMNS, to everything ALL.
3. `field`:
   - `section`: the member's size, b x D for a beam, b x h for a column.
   - `top`, `bottom`: a beam's continuous top or bottom bars at the support; `top_extra`, `bottom_extra`: extra bars
     at the support. `layer` is 1 for the outer layer, 2 for a second layer.
   - `main`: a column's longitudinal bars.
   - `links`: stirrups or ties.
   - `cover`, `concrete_grade`, `steel_grade`, `seismic_zone`, `exposure`: from notes or schedules.
   - `frames_into`: on a plan, a beam that ends at or passes through a column. `member` is the beam, `value` is the
     column id, and `box_2d` must enclose both labels.
4. `box_2d` is [ymin, xmin, ymax, xmax] in 0 to 1000 relative to this image, tight around the text of the value
   (not the member id, not the table cell).
5. Do not report bars of slabs, footings, staircases or walls.

The PDF's own text layer for this image follows, one line per text run, with its box in the same 0 to 1000 units.
Use it to read small text exactly and to place boxes. Text that is only in the image and not in this list is still
on the drawing; report it if you can read it.

{words}
