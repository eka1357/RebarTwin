"""The answer key is the pitch deck's worked example, checked by hand:

C4: 300 × 300 column, 8-16, 40 mm cover to the main bars. B12: 230 × 450 beam, top 5-20, bottom 4-16, 8 mm stirrups,
25 mm cover to the stirrups. 20 mm aggregate, mild exposure.

By hand: the top bars sit inside 230 - 2 × (25 + 8) = 164 mm, so five 20 mm bars leave (164 - 100) / 4 = 16 mm gaps
against IS 456's max(20, 20 + 5) = 25 mm. The middle top bar runs along y = 0, straight through C4's middle bars on
the two faces it crosses: an 18 mm overlap (10 + 8). Effective depth of the top steel: 450 - 25 - 8 - 10 = 407 mm.
"""
import json
import math
from pathlib import Path

import pytest

from rebartwin.check import check
from rebartwin.fixes import Attempt, Candidate, ResizeColumn, SetFace, apply, resolve
from rebartwin.geometry import closest_points
from rebartwin.model import Joint, parse_bars

EXAMPLE = Path(__file__).parent.parent / "examples" / "c4_b12.json"


def joint(zone: str = "II") -> Joint:
    j = Joint.model_validate(json.loads(EXAMPLE.read_text(encoding="utf-8")))
    j.settings.seismic_zone = zone
    return j


def test_reads_drawing_notation():
    assert [(g.count, g.dia) for g in parse_bars("5-20")] == [(5, 20)]
    assert [(g.count, g.dia) for g in parse_bars("2-25 + 1-20")] == [(2, 25), (1, 20)]
    assert [(g.count, g.dia) for g in parse_bars("2 nos 25")] == [(2, 25)]
    assert [(g.count, g.dia) for g in parse_bars("3#16")] == [(3, 16)]
    with pytest.raises(ValueError):
        parse_bars("five twenty")


def test_segment_distances():
    d, _, _ = closest_points((0, 0, 0), (10, 0, 0), (5, 3, -5), (5, 3, 5))     # crossing, 3 apart
    assert d == pytest.approx(3.0)
    d, _, _ = closest_points((0, 0, 0), (10, 0, 0), (0, 4, 0), (10, 4, 0))     # parallel
    assert d == pytest.approx(4.0)
    d, _, _ = closest_points((0, 0, 0), (1, 0, 0), (3, 0, 0), (4, 0, 0))       # end to end
    assert d == pytest.approx(2.0)


def test_layout_matches_the_hand_check():
    _, cage = check(joint())
    top = cage.layers[("B12", "top", 1)]
    assert [round(b.lateral, 6) for b in top] == [-72, -36, 0, 36, 72]
    assert {round(b.level, 6) for b in top} == {-43}
    column = {(round(b.p0[0], 6), round(b.p0[1], 6)) for b in cage.bars if b.role == "column"}
    assert column == {(x, y) for x in (-102, 0, 102) for y in (-102, 0, 102)} - {(0, 0)}
    assert cage.effective_depth[("B12", "top")] == pytest.approx(407.0)


def test_zone_two_finds_exactly_the_hand_checked_failures():
    report, _ = check(joint("II"))
    spacing = [f for f in report.failures if f.rule == "IS456-26.3.2-H"]
    clashes = [f for f in report.failures if f.rule == "GEOM-CLASH"]
    assert len(report.failures) == 6
    assert [(f.measured, f.limit) for f in spacing] == [(16.0, 25.0)] * 4
    assert sorted(tuple(sorted(f.bars)) for f in clashes) == [("B12/T1-3", "C4/V4"), ("B12/T1-3", "C4/V8")]
    assert all(f.measured == pytest.approx(-18.0) for f in clashes)
    assert set(report.rules_skipped) == {"IS13920-7.1.1", "IS13920-6.2.3"}


def test_zone_three_adds_the_column_size_rule():
    report, _ = check(joint("III"))
    size = [f for f in report.failures if f.rule == "IS13920-7.1.1"]
    assert [(f.measured, f.limit) for f in size] == [(300.0, 400.0)]
    assert not [f for f in report.failures if f.rule == "IS13920-6.2.3"]   # 804 mm² >= half of 1571 mm²


def test_zone_two_fix_is_the_decks_and_passes_every_rule():
    result = resolve(joint("II"))
    assert result.status == "fixed"
    best = result.options[0]
    assert best.candidate.edits == [SetFace(beam="B12", face="top", layers=["2-25", "2-20"])]
    face = best.faces[0]
    assert face.area_provided == pytest.approx(2 * math.pi * 25 ** 2 / 4 + 2 * math.pi * 20 ** 2 / 4, abs=0.1)
    assert face.depth_after == pytest.approx(386.0, abs=0.1)
    assert any("effective depth drops" in f for f in best.flags)
    for option in result.options:                    # nothing is shown that the checker has not passed
        assert not check(apply(joint("II"), option.candidate))[0].failures


def test_zone_three_needs_the_engineer_and_says_why():
    result = resolve(joint("III"))
    assert result.status == "redesign"
    best = result.options[0]
    assert ResizeColumn(b=325, h=300) in best.candidate.edits
    assert SetFace(beam="B12", face="top", layers=["4-16", "4-16"]) in best.candidate.edits
    assert result.blocking["IS13920-7.1.1"] > 0
    for option in result.options:
        assert option.candidate.redesign
        assert not check(apply(joint("III"), option.candidate))[0].failures


class Scripted:
    """Stands in for the Gemini proposer: one fix that breaks the code, one that holds."""
    name = "scripted"

    def propose(self, joint, report, history: list[Attempt], round: int):
        if round > 1:
            return []
        return [Candidate(title="six 20s in one row", source="gemini",
                          edits=[SetFace(beam="B12", face="top", layers=["6-20"])]),
                Candidate(title="two 25s over two 20s", source="gemini",
                          edits=[SetFace(beam="B12", face="top", layers=["2-25", "2-20"])])]


def test_a_model_proposal_is_shown_only_if_the_checker_passes_it():
    result = resolve(joint("II"), proposers=[Scripted()])
    assert [o.candidate.title for o in result.options] == ["two 25s over two 20s"]
    rejected = [a for a in result.attempts if not a.passed]
    assert [a.candidate.title for a in rejected] == ["six 20s in one row"]
    assert {f["rule"] for f in rejected[0].failures} >= {"IS456-26.3.2-H"}


def test_is13920_skip_note_is_written_for_engineers():
    """In zone II, IS 13920 rules are not run; the reason goes into printed reports, so it names the zone and the
    designer's choice, not a setting name."""
    report, _ = check(joint("II"))
    note = "IS 13920 is off: the joint is in seismic zone II. It applies in zones III to V, or when the designer turns it on."
    assert set(report.rules_skipped.values()) == {note}
    assert all("apply_is13920" not in why for why in report.rules_skipped.values())


def mixed_c1() -> Joint:
    """C1 as the IITH schedule gives it: 200 x 450, "4-16 + 4-12" (16 mm at the corners, 12 mm on the faces), 8 mm
    ties, 40 mm cover to the main bars; the example's beams and settings (20 mm aggregate, mild exposure)."""
    j = joint("II")
    j.column = j.column.model_copy(update={"id": "C1", "b": 200, "h": 450, "n_bars": 8, "bar_dia": 16,
                                            "face_dia": 12, "bars_x": None, "bars_y": None})
    return Joint.model_validate(j.model_dump())


def test_mixed_column_bars_area_and_placement():
    """Area: 4 x 201.1 + 4 x 113.1 = 1,256.6 mm2. Split: 8 bars give bars_x + bars_y = 6; 6 x 200 / 650 = 1.85, so 2
    bars on the 200 mm faces (corners only) and 4 on the 450 mm faces. Corner bars (16 mm) at x = +-(100 - 40 - 8) =
    +-52, y = +-(225 - 40 - 8) = +-177; face bars (12 mm) sit tight to the ties at x = +-(100 - 40 - 6) = +-54, spread
    with the corners at y = -177, -59, 59, 177, so at y = +-59."""
    c = mixed_c1().column
    assert c.area == pytest.approx(1256.6, abs=0.1)
    assert (c.bars_x, c.bars_y) == (2, 4)
    _, cage = check(mixed_c1())
    col = sorted(((round(b.p0[0], 3), round(b.p0[1], 3)), b.dia) for b in cage.bars if b.member == "C1")
    assert col == sorted([((x, y), 16.0) for x in (-52, 52) for y in (-177, 177)] +
                         [((x, y), 12.0) for x in (-54, 54) for y in (-59, 59)])


def test_mixed_column_rules_use_each_bars_own_size():
    """Face x+ runs (52, -177) 16 mm, (54, -59) 12 mm, (54, 59) 12 mm, (52, 177) 16 mm. Corner to face bar: centres
    sqrt(2^2 + 118^2) = 118.017, gap 118.017 - (16 + 12) / 2 = 104.017, limit the larger bar or aggregate + 5:
    max(16, 12, 25) = 25. Face to face: 118 - 12 = 106. Cover to main bars 40 mm against max(40, 16) = 40 (the 16 mm
    corner bars set it): passes. Nominal cover: 40 - 8 = 32 mm outside the ties; mild exposure with bars over 12 mm
    needs 20."""
    report, _ = check(mixed_c1())
    xplus = sorted((f.measured, f.limit) for f in report.findings
                   if f.rule == "IS456-26.3.2-H" and f.members == ["C1"] and "face x+" in f.message)
    assert xplus == [(104.017, 25.0), (104.017, 25.0), (106.0, 25.0)]
    [cov] = [f for f in report.findings if f.rule == "IS456-26.4.2.1"]
    assert (cov.measured, cov.limit, cov.status) == (40.0, 40.0, "pass")
    [nom] = [f for f in report.findings if f.rule == "IS456-26.4.2" and f.members == ["C1"]]
    assert (nom.measured, nom.limit) == (32.0, 20.0)


def test_one_size_columns_are_unchanged_and_face_dia_needs_face_bars():
    """The demo bundles (C4 x B12, zones II and III) are exactly what the engine computes now: report and scene equal
    the files shipped to the web. A column of 4 bars has no face bars, so face_dia there is refused."""
    from rebartwin.report import scene
    root = Path(__file__).parent.parent / "web" / "public" / "demo"
    for name in ("C4xB12", "C4xB12-zone3"):
        bundle = json.loads((root / name / "bundle.json").read_text(encoding="utf-8"))
        j = Joint.model_validate(bundle["joint"])
        rep, cage = check(j)
        assert json.loads(rep.model_dump_json()) == {k: v for k, v in bundle["report"].items()
                                                     if k in json.loads(rep.model_dump_json())}
        assert json.loads(json.dumps(scene(j, cage, rep))) == bundle["scene"]
    with pytest.raises(ValueError):
        joint().column.model_validate({**joint().column.model_dump(), "n_bars": 4, "face_dia": 12,
                                       "bars_x": None, "bars_y": None})


def test_a_column_resize_keeps_its_bar_groups():
    """Resizing C1 from 200 x 450 to 250 x 450 keeps 4-16 at the corners and 4-12 on the faces (8 bars, face_dia 12):
    the fix loop changes the concrete, not the drawn steel. The new split: 6 x 250 / 700 = 2.14, so still 2 and 4."""
    out = apply(mixed_c1(), Candidate(title="resize", edits=[ResizeColumn(b=250, h=450)]))
    c = out.column
    assert (c.b, c.h, c.n_bars, c.bar_dia, c.face_dia, c.bars_x, c.bars_y) == (250, 450, 8, 16, 12, 2, 4)
