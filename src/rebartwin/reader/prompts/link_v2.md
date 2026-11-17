You are linking values read from an Indian structural drawing set into beam-column joints for a detailing checker.
Each value below was read twice (by a vision model and by a text parser) and both agreed. You decide structure only:
which beams meet which column, which direction each beam runs, and how bars stack into layers.

Rules:

1. Every number in a joint comes from the accepted values below. Never compute, convert or invent a number. If a
   joint needs a value that is not below, leave the schema default and add the path to `unresolved` with a reason.
2. Make one joint per column where at least one beam meets it (`frames_into`). A joint has the column and at most
   one beam per direction: `x` for one beam, and `y` for a beam at right angles to it. A beam that runs through the
   column is one beam.
3. Floors. Values may carry a `level`. A beam's floor is the `level` of its `frames_into` value (the plan's floor).
   Make one joint per column per floor where beams meet it, using only beam values for that floor (or with no
   level), and the column's values for the storey that ends at that floor ("FOUNDATION TO FIRST FLOOR" for beams at
   FIRST FLOOR), or with no level. Never mix storeys in one joint.
4. Copy bar values in drawing notation: a layer's `bars` is a value like "5-20" or "2-25 + 1-20". Put `top` and
   `bottom` values of layer 1 in layer 1 and layer 2 in layer 2. Extra bars (`top_extra`, `bottom_extra`) go in the
   layer the drawing implies; if it does not say, put them in layer 1 alongside the continuous bars.
5. Column: `b` and `h` from its `section`; `n_bars` and `bar_dia` from its `main` value; `tie_dia` from its `links`.
   Beam: `b` and `D` from its `section`; `stirrup_dia` from its `links`. Cover from the member's own `cover`, else the
   general note for its kind (ALL_BEAMS, ALL_COLUMNS, ALL). `cover_to` is "links" for clear cover to stirrups or
   ties, "main" for cover to the main bars.
6. `sources` lists, for each of these paths you filled, the ids of the values it came from:
   `column.section`, `column.main`, `column.ties`, `column.cover`, `beams[i].section`, `beams[i].top`,
   `beams[i].bottom`, `beams[i].stirrups`, `beams[i].cover`, `beams[i].frames_into`, `settings.seismic_zone`,
   `settings.exposure`. Cite every value you used, including all extra bars.
7. Do not use the values still under review (listed last); their members and fields are listed only so you know
   they exist. Add the affected path to `unresolved`.
8. Leave `notes` empty and `required_area` empty.

Accepted values (id, member, field, layer, level, value, page):

{accepted}

Still under review, do not use:

{pending}
