# C4xB12: fails 6 checks

Seismic zone II (IS 13920 off), mild exposure, 20 mm aggregate. Advisory: the engineer of record decides.

## What fails

| Check | Clause | Measured | Needs | What it means |
|---|---|---|---|---|
| Clear gap between parallel bars | IS 456:2000 cl. 26.3.2 | 16 mm | >= 25 mm | B12 top bars 1 and 2 are 16 mm apart; with 20 mm aggregate and 20 mm bars the code needs 25 mm |
| Clear gap between parallel bars | IS 456:2000 cl. 26.3.2 | 16 mm | >= 25 mm | B12 top bars 2 and 3 are 16 mm apart; with 20 mm aggregate and 20 mm bars the code needs 25 mm |
| Clear gap between parallel bars | IS 456:2000 cl. 26.3.2 | 16 mm | >= 25 mm | B12 top bars 3 and 4 are 16 mm apart; with 20 mm aggregate and 20 mm bars the code needs 25 mm |
| Clear gap between parallel bars | IS 456:2000 cl. 26.3.2 | 16 mm | >= 25 mm | B12 top bars 4 and 5 are 16 mm apart; with 20 mm aggregate and 20 mm bars the code needs 25 mm |
| Bars that run into each other | Geometry | -18 mm | >= 0 mm | C4 column bar 4 (16 mm) runs into B12 top bar 3 (20 mm): they overlap by 18 mm, so one of them cannot be placed as drawn |
| Bars that run into each other | Geometry | -18 mm | >= 0 mm | C4 column bar 8 (16 mm) runs into B12 top bar 3 (20 mm): they overlap by 18 mm, so one of them cannot be placed as drawn |

## Fix

7 of 36 candidates pass every rule. Best: B12 top: 2-25 in layer 1, 2-20 in layer 2.

**Option 1: B12 top: 2-25 in layer 1, 2-20 in layer 2**

- B12 top (layers outermost first): 5-20 becomes 2-25 / 2-20; 1610 mm² against 1571 mm² needed (+2.5%); effective depth 407 to 386 mm
- Recheck: B12 top steel's effective depth drops from 407 to 386 mm: recheck the section's strength

**Option 2: B12 top: 4-16 in layer 1, 4-16 in layer 2**

- B12 top (layers outermost first): 5-20 becomes 4-16 / 4-16; 1609 mm² against 1571 mm² needed (+2.4%); effective depth 407 to 389 mm
- Recheck: B12 top steel's effective depth drops from 407 to 389 mm: recheck the section's strength

**Option 3: B12 top: 4-20 in layer 1, 2-16 in layer 2**

- B12 top (layers outermost first): 5-20 becomes 4-20 / 2-16; 1659 mm² against 1571 mm² needed (+5.6%); effective depth 407 to 397 mm
- Recheck: B12 top steel's effective depth drops from 407 to 397 mm: recheck the section's strength

## Why the other candidates failed

- Geometry, bars that run into each other: rejected 27
- IS 456:2000 cl. 26.3.2, clear gap between parallel bars: rejected 14
- IS 456:2000 cl. 26.3.2, rows of bars vertically in line: rejected 6

## Rules

- IS 456:2000 cl. 26.3.2, clear gap between parallel bars: 11 passed. Basis: Clause text as quoted by civil4m ('As per IS 456 clause number 26.3.2') and The Constructor; not yet read in the BIS original. The needle-vibrator relaxation for groups of bars is not applied.
- IS 456:2000 cl. 26.3.2, clear gap between rows of bars: 0 passed. Basis: Clause text as quoted by civil4m ('As per IS 456 clause number 26.3.2') and The Constructor; not yet read in the BIS original. The needle-vibrator relaxation for groups of bars is not applied.
- IS 456:2000 cl. 26.4.2, Table 16, nominal cover for the exposure: 2 passed. Basis: Table 16 values as reproduced by civilengineeringweb.com, with Note 1's 5 mm reduction for mild exposure and main bars up to 12 mm.
- IS 456:2000 cl. 26.4.2.1, cover to a column's main bars: 1 passed. Basis: Clause text as reproduced by brainkart.com (40 mm or the bar size; 25 mm for columns up to 200 mm with bars up to 12 mm).
- Geometry, bars that run into each other: 0 passed. Basis: No clause: two bars cannot occupy the same space. Touching is allowed.
- IS 13920:2016 cl. 7.1.1: not run. IS 13920 is off: the joint is in seismic zone II. It applies in zones III to V, or when the designer turns it on.
- IS 13920:2016 cl. 6.2.3: not run. IS 13920 is off: the joint is in seismic zone II. It applies in zones III to V, or when the designer turns it on.

## Assumptions

- Worked example from the pitch deck: sizes assumed, checked by hand.
- Assumed, because the deck gives neither: bottom bars 4-16, and 40 mm cover to the column's main bars.
