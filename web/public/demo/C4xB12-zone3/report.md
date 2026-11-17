# C4xB12: fails 7 checks

Seismic zone III (IS 13920 on), mild exposure, 20 mm aggregate. Advisory: the engineer of record decides.

## What fails

| Check | Clause | Measured | Needs | What it means |
|---|---|---|---|---|
| Clear gap between parallel bars | IS 456:2000 cl. 26.3.2 | 16 mm | >= 25 mm | B12 top bars 1 and 2 are 16 mm apart; with 20 mm aggregate and 20 mm bars the code needs 25 mm |
| Clear gap between parallel bars | IS 456:2000 cl. 26.3.2 | 16 mm | >= 25 mm | B12 top bars 2 and 3 are 16 mm apart; with 20 mm aggregate and 20 mm bars the code needs 25 mm |
| Clear gap between parallel bars | IS 456:2000 cl. 26.3.2 | 16 mm | >= 25 mm | B12 top bars 3 and 4 are 16 mm apart; with 20 mm aggregate and 20 mm bars the code needs 25 mm |
| Clear gap between parallel bars | IS 456:2000 cl. 26.3.2 | 16 mm | >= 25 mm | B12 top bars 4 and 5 are 16 mm apart; with 20 mm aggregate and 20 mm bars the code needs 25 mm |
| Bars that run into each other | Geometry | -18 mm | >= 0 mm | C4 column bar 4 (16 mm) runs into B12 top bar 3 (20 mm): they overlap by 18 mm, so one of them cannot be placed as drawn |
| Bars that run into each other | Geometry | -18 mm | >= 0 mm | C4 column bar 8 (16 mm) runs into B12 top bar 3 (20 mm): they overlap by 18 mm, so one of them cannot be placed as drawn |
| Column size against beam bar size | IS 13920:2016 cl. 7.1.1 | 300 mm | >= 400 mm | C4 is 300 mm deep along B12; with 20 mm bars in B12 the code needs 20 × 20 = 400 mm |

## Fix

No bar change alone passes; 11 redesigns do. Smallest: B12 top: 4-16 in layer 1, 4-16 in layer 2; C4 325 × 300. The engineer of record decides.

**Option 1: B12 top: 4-16 in layer 1, 4-16 in layer 2; C4 325 × 300**

- B12 top (layers outermost first): 5-20 becomes 4-16 / 4-16; 1609 mm² against 1571 mm² needed (+2.4%); effective depth 407 to 389 mm
- Column: 300 × 300 -> 325 × 300 mm
- Recheck: B12 top steel's effective depth drops from 407 to 389 mm: recheck the section's strength
- Recheck: C4 grows from 300 × 300 to 325 × 300 mm: a redesign for the engineer of record (frame analysis, column design, the drawings around it)

**Option 2: B12 top: 4-20 in layer 1, 2-16 in layer 2; B12 bottom: 2-20 in layer 1, 2-12 in layer 2; C4 400 × 300**

- B12 top (layers outermost first): 5-20 becomes 4-20 / 2-16; 1659 mm² against 1571 mm² needed (+5.6%); effective depth 407 to 397 mm
- B12 bottom (layers outermost first): 4-16 becomes 2-20 / 2-12; 855 mm² against 829 mm² needed (+3%); effective depth 409 to 396 mm
- Column: 300 × 300 -> 400 × 300 mm
- Recheck: B12 top steel's effective depth drops from 407 to 397 mm: recheck the section's strength
- Recheck: B12 bottom steel's effective depth drops from 409 to 396 mm: recheck the section's strength
- Recheck: C4 grows from 300 × 300 to 400 × 300 mm: a redesign for the engineer of record (frame analysis, column design, the drawings around it)

**Option 3: B12 top: 4-20 in layer 1, 4-12 in layer 2; B12 bottom: 2-20 in layer 1, 2-12 in layer 2; C4 400 × 300**

- B12 top (layers outermost first): 5-20 becomes 4-20 / 4-12; 1709 mm² against 1571 mm² needed (+8.8%); effective depth 407 to 396 mm
- B12 bottom (layers outermost first): 4-16 becomes 2-20 / 2-12; 855 mm² against 855 mm² needed (+0%); effective depth 409 to 396 mm
- Column: 300 × 300 -> 400 × 300 mm
- Recheck: B12 top steel's effective depth drops from 407 to 396 mm: recheck the section's strength
- Recheck: B12 bottom steel's effective depth drops from 409 to 396 mm: recheck the section's strength
- Recheck: C4 grows from 300 × 300 to 400 × 300 mm: a redesign for the engineer of record (frame analysis, column design, the drawings around it)

## Why the other candidates failed

- Geometry, bars that run into each other: rejected 49
- IS 13920:2016 cl. 7.1.1, column size against beam bar size: rejected 34
- IS 13920:2016 cl. 6.2.3, bottom steel at the joint face: rejected 25
- IS 456:2000 cl. 26.3.2, clear gap between parallel bars: rejected 19
- IS 456:2000 cl. 26.3.2, rows of bars vertically in line: rejected 14

## Rules

- IS 456:2000 cl. 26.3.2, clear gap between parallel bars: 11 passed. Basis: Clause text as quoted by civil4m ('As per IS 456 clause number 26.3.2') and The Constructor; not yet read in the BIS original. The needle-vibrator relaxation for groups of bars is not applied.
- IS 456:2000 cl. 26.3.2, clear gap between rows of bars: 0 passed. Basis: Clause text as quoted by civil4m ('As per IS 456 clause number 26.3.2') and The Constructor; not yet read in the BIS original. The needle-vibrator relaxation for groups of bars is not applied.
- IS 456:2000 cl. 26.4.2, Table 16, nominal cover for the exposure: 2 passed. Basis: Table 16 values as reproduced by civilengineeringweb.com, with Note 1's 5 mm reduction for mild exposure and main bars up to 12 mm.
- IS 456:2000 cl. 26.4.2.1, cover to a column's main bars: 1 passed. Basis: Clause text as reproduced by brainkart.com (40 mm or the bar size; 25 mm for columns up to 200 mm with bars up to 12 mm).
- Geometry, bars that run into each other: 0 passed. Basis: No clause: two bars cannot occupy the same space. Touching is allowed.
- IS 13920:2016 cl. 7.1.1, column size against beam bar size: 1 passed. Basis: Applied as in IITGN/NICEE 'Examples on IS 13920:2016', Example 3a (pp. 22, 28): the column's dimension along the beam is at least 20 times the largest beam bar, and at least 300 mm.
- IS 13920:2016 cl. 6.2.3, bottom steel at the joint face: 1 passed. Basis: Applied as in IITGN/NICEE 'Examples on IS 13920:2016', Example 1 (p. 5): bottom steel at the joint face is at least half the top steel.

## Assumptions

- Worked example from the pitch deck: sizes assumed, checked by hand.
- Assumed, because the deck gives neither: bottom bars 4-16, and 40 mm cover to the column's main bars.
