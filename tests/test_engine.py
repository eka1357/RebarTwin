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


def test_a_failing_value_never_reads_as_its_limit():
    """The web's rule (format.ts) for every number in engine text: whole numbers unless a failing value would round
    onto or across its limit, then more decimals. 24.6 failing >= 25 reads "24.6"; 24.96 reads "24.96" (24.96 to one
    place is 25.0, still on the limit); 16 failing stays "16"; 26 passing stays "26". An overlap of 0.3 mm against 0
    (<=) reads "0.3", never "0"."""
    from rebartwin.numbers import shown
    assert shown(24.6, 25) == "24.6" and shown(24.96, 25) == "24.96" and shown(16, 25) == "16"
    assert shown(26, 25) == "26" and shown(0.3, 0, "<=") == "0.3" and shown(18, 0, "<=") == "18"


def test_xb17_top_bars_read_on_the_failing_side():
    """XB17 (IITH sheet 17): 200 mm wide, 25 mm cover to 8 mm stirrups, top "2-12 + 2-16" (12s outside, 16s inside).
    Bar centres from -(100 - 33 - 6) = -61 to 61, four bars evenly: -61, -20.333, 20.333, 61, 40.667 apart. Bars 2 and
    3 (16 mm): 40.667 - 16 = 24.667 mm against max(16, 20 + 5) = 25: fails, and the message says 24.7 mm, not 25 mm.
    Bars 1 and 2: 40.667 - 14 = 26.667: passes."""
    from rebartwin.model import Layer
    j = mixed_c1()
    j.beams = [j.beams[0].model_copy(update={"id": "XB17", "b": 200, "D": 450, "stirrup_dia": 8, "cover": 25,
                                              "cover_to": "links", "top": [Layer(bars="2-12 + 2-16")],
                                              "bottom": [Layer(bars="2-12")]})]
    report, _ = check(Joint.model_validate(j.model_dump()))
    top = {tuple(f.bars): f for f in report.findings if f.rule == "IS456-26.3.2-H" and f.members == ["XB17"]
           and "top" in f.message}
    mid = top[("XB17/T1-2", "XB17/T1-3")]
    assert (mid.measured, mid.limit, mid.status) == (24.667, 25.0, "fail")
    assert "are 24.7 mm apart" in mid.message and "needs 25 mm" in mid.message
    assert top[("XB17/T1-1", "XB17/T1-2")].measured == 26.667


def c1_xb17() -> Joint:
    """C1 x XB17 at L1/M/M1-28 (IITH, first floor) as linked: C1 200 x 450, 4-16 corners and 4-12 faces, 8 mm ties,
    40 mm clear cover to the ties (so the main bars sit 48 mm in); XB17 along X, 200 x 450, 25 mm cover to 8 mm
    stirrups, top 2-12 + 2-16, bottom 2-12; zone II, mild exposure, 20 mm aggregate."""
    from rebartwin.model import Layer
    j = mixed_c1()
    j.column = j.column.model_copy(update={"cover_to": "links"})
    j.beams = [j.beams[0].model_copy(update={"id": "XB17", "direction": "x", "b": 200, "D": 450, "stirrup_dia": 8,
                                              "cover": 25, "cover_to": "links", "top": [Layer(bars="2-12 + 2-16")],
                                              "bottom": [Layer(bars="2-12")]})]
    return Joint.model_validate(j.model_dump())


def test_face_bar_placements_for_c1_x_xb17_by_hand():
    """Corners at y = +-(225 - 48 - 8) = +-169. XB17's bars cross at y = +-61 (12 mm) and +-20.333 (16 mm). A 12 mm
    face pair at +-s keeps 5 mm clear of them when |s - 61| - 12 >= 5 and |s - 20.333| - 14 >= 5: s <= 44 or s >= 78,
    and s >= 39.333. Spacing (IS 456 cl. 26.3.2, 25 mm here): 2s - 12 >= 25 and (169 - s) - 14 >= 25, so
    18.5 <= s <= 130. On 5 mm steps: 40, then 80 to 130; the six smallest moves from the drawn +-56.333 (the even
    spread -169, -56.333, 56.333, 169) are 40, 80, 85, 90, 95, 100."""
    from rebartwin.fixes import placements
    got = [p.along_y for p in placements(c1_xb17())]
    assert got == [[-40.0, 40.0], [-80.0, 80.0], [-85.0, 85.0], [-90.0, 90.0], [-95.0, 95.0], [-100.0, 100.0]]
    assert all(p.along_x is None for p in placements(c1_xb17()))     # the 200 mm faces have no face bars


def test_c1_x_xb17_is_fixed_by_a_beam_change_with_face_bars_placed():
    """As drawn it fails 9 checks (XB17's top bars 24.7 mm apart, 8 clashes with C1's face bars). No beam change
    alone passes, and no redesign is needed: the best fix re-arranges XB17's top as 2-16 in layer 1 and 2-12 in layer 2
    (2 x 201.1 + 2 x 113.1 = 628.3 mm2, the same steel) and places C1's face bars at y = +-40. By hand: layer 1 16 mm
    bars at +-(100 - 33 - 8) = +-59, layer 2 in line at +-59, bottom 12 mm at +-61; face bars at +-40 clear the
    16 mm bars by 19 - 14 = 5 mm, the 12 mm layer 2 by 19 - 12 = 7 and the bottom bars by 21 - 12 = 9. The note says
    the 5 mm is a placing tolerance, not a code rule."""
    from rebartwin.fixes import Enumerator, PlaceFaceBars, ResizeColumn, apply, resolve
    j = c1_xb17()
    assert len(check(j)[0].failures) == 9
    r = resolve(j, [Enumerator()])
    assert r.status == "fixed"
    best = r.options[0]
    assert best.candidate.title == "XB17 top: 2-16 in layer 1, 2-12 in layer 2; C1 face bars at y = -40, 40 mm"
    assert not any(isinstance(e, ResizeColumn) for o in r.options for e in o.candidate.edits)
    place = next(e for e in best.candidate.edits if isinstance(e, PlaceFaceBars))
    assert place.along_y == [-40.0, 40.0]
    assert best.faces[0].area_provided == pytest.approx(628.3, abs=0.1)
    assert any("placing tolerance chosen here, not a code rule" in f for f in best.flags)
    report, cage = check(apply(j, best.candidate))
    assert report.failures == []
    xb17 = {b.id: (b.lateral, b.dia) for b in cage.bars if b.member == "XB17"}
    assert xb17["XB17/T1-2"] == (59.0, 16.0) and xb17["XB17/T2-2"] == (59.0, 12.0) and xb17["XB17/B1-2"] == (61.0, 12.0)


def test_rank_puts_beam_changes_first_then_placements_then_redesigns():
    """Three passing options for one joint: a beam change, a face bar placement and a column resize. They rank in
    that order whatever their steel."""
    from rebartwin.fixes import Candidate, Option, PlaceFaceBars, ResizeColumn, SetFace, _rank
    j = c1_xb17()
    beam = Option(candidate=Candidate(title="b", edits=[SetFace(beam="XB17", face="top", layers=["4-12"])]),
                  faces=[], flags=[])
    place = Option(candidate=Candidate(title="p", edits=[PlaceFaceBars(along_y=[-40.0, 40.0])]), faces=[], flags=[])
    grow = Option(candidate=Candidate(title="r", edits=[ResizeColumn(b=200, h=550)]), faces=[], flags=[])
    assert [o.candidate.title for o in sorted([grow, place, beam], key=lambda o: _rank(o, j))] == ["b", "p", "r"]


def test_the_demo_joints_never_try_a_placement():
    """C4 (300 x 300, 8-16) has one face bar per face, on the centre line: a symmetric placement cannot move it, so
    the fix loop for the C4 x B12 demo joints tries no placement and its result is what the bundles hold."""
    from rebartwin.fixes import Enumerator, resolve
    root = Path(__file__).parent.parent / "web" / "public" / "demo"
    for name in ("C4xB12", "C4xB12-zone3"):
        j = Joint.model_validate(json.loads((root / name / "bundle.json").read_text(encoding="utf-8"))["joint"])
        assert not any(a.candidate.placement for a in resolve(j, [Enumerator()]).attempts)


def test_face_bar_positions_must_be_symmetric_and_fit_the_face():
    """C1's faces along Y hold 2 face bars: [-40, 40] is valid; [-40, 45] is not symmetric, [-40] is one bar short."""
    c = c1_xb17().column
    assert c.model_validate({**c.model_dump(), "face_along_y": [-40.0, 40.0]}).face_along_y == [-40.0, 40.0]
    for bad in ([-40.0, 45.0], [-40.0]):
        with pytest.raises(ValueError):
            c.model_validate({**c.model_dump(), "face_along_y": bad})


def test_a_redesign_passing_early_does_not_stop_the_search_for_a_re_detail():
    """In the app a model proposer offered "C1 200 x 550" in round 1 and it passed, so the loop stopped with only a
    redesign. Now the loop goes on while only redesigns pass: round 2 finds XB17's re-arranged top with C1's face bars
    at +-40, which ranks first; the redesign stays listed below it only if kept, never ahead of it."""
    from rebartwin.fixes import Candidate, Enumerator, ResizeColumn, resolve

    class Grower:
        name = "grower"

        def propose(self, joint, report, history, round):
            return [Candidate(title="C1 200 x 550", edits=[ResizeColumn(b=200, h=550)], source="grower")] \
                if round == 1 else []
    r = resolve(c1_xb17(), [Grower(), Enumerator()])
    assert r.status == "fixed"
    assert r.options[0].candidate.title == "XB17 top: 2-16 in layer 1, 2-12 in layer 2; C1 face bars at y = -40, 40 mm"
    assert not r.options[0].candidate.redesign
