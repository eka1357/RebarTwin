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
