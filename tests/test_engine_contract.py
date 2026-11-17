"""The engine gives the web every number it shows, so the web computes nothing: signed margins, before-and-after
face figures, the dimension IS 13920 cl. 7.1.1 measures, and one rounding rule for numbers in text. Worked example
as in test_engine.py: C4 300 x 300, 8-16, 40 mm to the main bars; B12 230 x 450 along X, top 5-20, bottom 4-16,
8 mm stirrups, 25 mm cover to them; 20 mm aggregate, mild exposure."""
import json
import math
from pathlib import Path

import pytest

from rebartwin import rules
from rebartwin.check import check
from rebartwin.fixes import SetFace, resolve
from rebartwin.model import Joint
from rebartwin.numbers import fmt, half_up

EXAMPLE = Path(__file__).parent.parent / "examples" / "c4_b12.json"


def joint(zone: str = "II") -> Joint:
    j = Joint.model_validate(json.loads(EXAMPLE.read_text(encoding="utf-8")))
    j.settings.seismic_zone = zone
    return j


def finding(report, rule, *members):
    return next(f for f in report.findings if f.rule == rule and (not members or f.members == list(members)))


# --- margin ------------------------------------------------------------------------------------------------------

def test_margins_by_hand():
    """Top bars: (164 - 5 x 20) / 4 = 16 mm gaps against max(20, 20 + 5) = 25 mm: margin 16 - 25 = -9 (fails).
    Clash: the middle top bar overlaps C4's middle bars by 10 + 8 = 18 mm: measured -18, limit 0, margin -18.
    B12 cover to stirrups 25 mm; mild exposure needs 20 mm (bars over 12 mm, so no 5 mm relief): margin +5.
    C4 cover to main bars 40 mm against max(40, 16) = 40: margin 0, passes."""
    report, _ = check(joint("II"))
    gaps = [f for f in report.findings if f.rule == "IS456-26.3.2-H" and f.bars[0].startswith("B12/T1")]
    assert len(gaps) == 4 and all(f.margin == pytest.approx(-9.0) and f.status == "fail" for f in gaps)
    # bottom 4-16: (164 - 4 x 16) / 3 = 33.33 mm against 25 mm, margin +8.33
    low = [f for f in report.findings if f.rule == "IS456-26.3.2-H" and f.bars[0].startswith("B12/B1")]
    assert len(low) == 3 and all(f.margin == pytest.approx(8.333, abs=0.001) and f.status == "pass" for f in low)
    clash = [f for f in report.findings if f.rule == "GEOM-CLASH"]
    assert clash and all(f.margin == pytest.approx(-18.0) for f in clash)
    cover = finding(report, "IS456-26.4.2", "B12")
    assert (cover.measured, cover.limit, cover.margin, cover.status) == (25, 20, 5, "pass")
    col = finding(report, "IS456-26.4.2.1")
    assert (col.margin, col.status) == (0, "pass")
    for f in report.findings:                          # the sign is the verdict
        assert (f.margin >= -rules.TOL) == (f.status == "pass")


def test_margin_for_an_at_most_rule():
    """'<=' rules measure how far over: 3 mm off line against 0 allowed is a margin of 0 - 3 = -3."""
    f = rules._finding(rules.IN_LINE, 3.0, 0.0, ["B12"], "off line", compare="<=")
    assert (f.margin, f.status) == (-3.0, "fail")
    f = rules._finding(rules.IN_LINE, 0.0, 0.0, ["B12"], "in line", compare="<=")
    assert (f.margin, f.status) == (0.0, "pass")


def test_bottom_steel_margin_in_mm2():
    """Zone III: top 5-20 = 5 x pi x 20² / 4 = 1570.8 mm², half is 785.4; bottom 4-16 = 804.2 mm²; margin 18.8 mm²."""
    f = finding(check(joint("III"))[0], "IS13920-6.2.3")
    assert f.unit == "mm²" and f.margin == pytest.approx(4 * math.pi * 64 - 5 * math.pi * 100 / 2, abs=0.001)
    assert f.margin == pytest.approx(18.85, abs=0.01)


# --- span for IS 13920 cl. 7.1.1 --------------------------------------------------------------------------------

def test_column_size_rule_has_a_dimension_to_draw():
    """Along B12 (X) C4 is 300 mm deep; 20 x 20 = 400 mm needed, margin -100. The dimension runs across the column
    along X, x = -150 to +150 through the centre line, at the level of B12's outer top bars: 0 - 25 cover - 8 stirrup
    - 20 / 2 = -43 mm. `at` is its midpoint. The 300 mm minimum is drawn across the smaller side (b = h, so X) at
    the beam top, z = 0, with margin 0."""
    report, _ = check(joint("III"))
    along = finding(report, "IS13920-7.1.1", "C4", "B12")
    assert (along.measured, along.limit, along.margin, along.status) == (300, 400, -100, "fail")
    assert along.span == ((-150.0, 0.0, -43.0), (150.0, 0.0, -43.0))
    assert along.at == (0.0, 0.0, -43.0)
    least = finding(report, "IS13920-7.1.1", "C4")
    assert least.span == ((-150.0, 0.0, 0.0), (150.0, 0.0, 0.0)) and least.margin == 0


def test_span_follows_a_beam_along_y():
    """Turn B12 to run along Y on a 300 x 450 column (b along X, h along Y): the dimension is across h, y = -225 to
    +225, and 450 mm is more than the 400 needed, margin +50."""
    j = joint("III")
    j.beams[0].direction = "y"
    j.column.h = 450
    j.column.bars_x = j.column.bars_y = None
    j = Joint.model_validate(j.model_dump())
    f = finding(check(j)[0], "IS13920-7.1.1", "C4", "B12")
    assert f.span == ((0.0, -225.0, -43.0), (0.0, 225.0, -43.0)) and f.margin == 50


# --- the fix's before and after ---------------------------------------------------------------------------------

def test_face_change_gives_before_and_after():
    """Zone II's fix: B12 top 5-20 (one layer, 5 bars, 5 x 314.16 = 1570.8 mm²) becomes 2-25 / 2-20 (two layers,
    4 bars, 2 x 490.87 + 2 x 314.16 = 1610.1 mm²)."""
    best = resolve(joint("II")).options[0]
    assert best.candidate.edits == [SetFace(beam="B12", face="top", layers=["2-25", "2-20"])]
    f = best.faces[0]
    assert (f.before, f.area_before, f.n_bars_before, f.n_layers_before) == ("5-20", 1570.8, 5, 1)
    assert (f.after, f.area_provided, f.n_bars, f.n_layers) == ("2-25 / 2-20", 1610.1, 4, 2)


def test_rejected_attempts_carry_margins():
    for a in resolve(joint("II")).attempts:
        for failure in a.failures:
            assert {"compare", "margin", "span"} <= set(failure)
            assert failure["margin"] < 0


# --- one rounding rule --------------------------------------------------------------------------------------------

@pytest.mark.parametrize("x, places, text", [
    (388.5, 0, "389"), (2.5, 0, "3"), (3.5, 0, "4"), (-0.5, 0, "-1"), (0.4, 0, "0"), (-0.4, 0, "0"),
    (2.675, 2, "2.68"), (1570.796, 0, "1571"), (16.0, 0, "16"),
])
def test_half_up(x, places, text):
    """Half away from zero on the decimal as written, like Intl.NumberFormat's default; Python's '{:.0f}' would
    give 388, 2, 4, -0, and 2.67 for 2.675."""
    assert fmt(x, places) == text
    assert half_up(x, places) == float(text)


def test_zone_three_flag_and_card_say_the_same_depth():
    """Zone III's fix puts B12's top in two layers of 4-16. Layer 1 centre: 25 + 8 + 8 = 41 mm down; layer 2:
    41 + 8 + 25 + 8 = 82 mm; equal areas, so the steel's centroid is 61.5 mm down and d = 450 - 61.5 = 388.5 mm.
    The card formats 388.5 as 389; the flag must too (it used to say 388)."""
    best = resolve(joint("III")).options[0]
    face = next(f for f in best.faces if (f.beam, f.face) == ("B12", "top"))
    assert (face.depth_before, face.depth_after) == (407.0, 388.5)
    assert any("drops from 407 to 389 mm" in flag for flag in best.flags)
    assert not any("388 mm" in flag for flag in best.flags)
