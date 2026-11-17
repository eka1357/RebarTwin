# Rules

Every rule is a function in `src/rebartwin/rules.py` that measures the 3D cage and returns findings with a clause,
a measured value and a limit. No rule asks a model anything. The basis column says where the rule's text was
checked; nothing here has yet been read in the BIS originals, so each needs one check against the published code
before it is called final.

| Id | Clause | Rule | Basis |
|---|---|---|---|
| IS456-26.3.2-H | IS 456:2000 cl. 26.3.2 | Clear gap between parallel bars at least the larger bar size and the aggregate size + 5 mm | civil4m and The Constructor quoting the clause |
| IS456-26.3.2-V | IS 456:2000 cl. 26.3.2 | Clear gap between rows at least 15 mm, two-thirds of the aggregate size and the larger bar size | as above |
| IS456-26.3.2-L | IS 456:2000 cl. 26.3.2 | Rows of bars vertically in line (within 1 mm) | as above |
| IS456-26.4.2 | IS 456:2000 cl. 26.4.2, Table 16 | Cover to ties and stirrups: mild 20, moderate 30, severe 45, very severe 50, extreme 75 mm; 5 mm less in mild exposure with main bars up to 12 mm | civilengineeringweb.com reproducing Table 16 |
| IS456-26.4.2.1 | IS 456:2000 cl. 26.4.2.1 | Cover to a column's main bars at least 40 mm and the bar size; 25 mm for columns up to 200 mm with bars up to 12 mm | brainkart.com reproducing the clause |
| GEOM-CLASH | none | Two main bars of different members overlap (touching is allowed) | geometry; cross-checked by IfcOpenShell's kernel |
| IS13920-7.1.1 | IS 13920:2016 cl. 7.1.1 | Column at least 300 mm, and along each beam at least 20 times that beam's largest bar | IITGN/NICEE "Examples on IS 13920:2016", Example 3a, pp. 22 and 28 |
| IS13920-6.2.3 | IS 13920:2016 cl. 6.2.3 | Bottom steel at the joint face at least half the top steel | same document, Example 1, p. 5 |

IS 13920 rules run in seismic zones III, IV and V, or when `apply_is13920` is true. Confirm the 2016 scope clause
before quoting it.

## Not modelled yet

Anchorage and development length into the column (IS 13920 cl. 6.2.5), laps, special confining ties in and around
the joint, maximum column bar spacing, minimum and maximum steel ratios, hooks and bends, the needle-vibrator
relaxation for groups of bars, and exterior or corner joints where beam bars stop in the column.

## Adding a rule

Write the function, add a `Rule` with its clause and basis to `RULES`, and add a test with a hand-checked number.
Every finding carries a signed `margin` (positive passes) computed in `_finding`; a rule whose measurement is a
dimension the viewer should draw passes it as `span` (two points, mm) with `at` its midpoint, as IS 13920 cl. 7.1.1
does. Numbers in messages go through `numbers.fmt` (half away from zero), never `:.0f`.
A rule that a different element must change to satisfy (a column size, the other face of a beam) sets
`knock_on=True`, so the fix loop knows to make that change in round 2.
