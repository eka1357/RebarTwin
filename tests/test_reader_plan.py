"""Item 4: joints from geometry (plan.py), on generated sheets (reader_pdf.make_plan_pdf, make_elevation_pdf).

Box units are 1000 across the page each way; the sheets are A4 landscape, 842 x 595 pt, so one x unit is 0.842 pt
and one y unit 0.595 pt.
"""
from __future__ import annotations

from pathlib import Path

import pytest

from reader_pdf import make_elevation_pdf, make_plan_pdf  # noqa: E402

from rebartwin.reader import plan  # noqa: E402
from rebartwin.reader.agree import Agreement  # noqa: E402
from rebartwin.reader.ingest import ingest  # noqa: E402
from rebartwin.reader.parser import parse_page  # noqa: E402


@pytest.fixture(scope="module")
def sheets(tmp_path_factory):
    d = tmp_path_factory.mktemp("plan")
    beam, column = ingest(make_plan_pdf(d / "plan.pdf"))
    elevation = ingest(make_elevation_pdf(d / "elevation.pdf"))[0]
    return beam, column, elevation


def test_grid_lines_come_from_the_lines_leaving_the_bubbles(sheets):
    """Grid 1 is drawn at x = 150 pt: 150 x 1000 / 842 = 178.15 units. Grid A at y = 150 pt: 150 x 1000 / 595 =
    252.10 units. On the column layout, 1 is at 0.8 x 150 + 60 = 180 pt, 213.78 units. The tolerance on the beam
    layout's x axis is the smaller of half the smallest bay (200 pt = 237.53 units, so 118.76) and 1% of the span
    (400 pt = 475.06 units, so 4.75): 4.75."""
    beam, column, _ = sheets
    g = plan.grid(beam)
    assert set(g.xs) == {"1", "2", "3"} and set(g.ys) == {"A", "B", "C1"} and not g.unplaced
    assert g.xs["1"] == pytest.approx(178.15, abs=0.05)
    assert g.ys["A"] == pytest.approx(252.10, abs=0.05)
    assert g.tol("x") == pytest.approx(4.75, abs=0.01)
    assert plan.grid(column).xs["1"] == pytest.approx(213.78, abs=0.05)


def test_a_bubble_is_never_a_member_id(sheets):
    """The y bubble "C1" names grid line C1 on both sheets; the parser must not read it as column C1. The columns
    drawn are C2 to C8, so no "C1" member appears at all."""
    beam, column, _ = sheets
    for page in (beam, column):
        assert "C1" not in {m.value for m in parse_page(page) if m.kind == "member"}
    assert "C2" in {m.value for m in parse_page(column) if m.kind == "member"}


def test_the_two_sheets_align_by_their_shared_grid_labels(sheets):
    """The column layout is the beam layout scaled 0.8 and moved 60 pt right and 40 pt down. In box units the scale
    stays 0.8; the offsets are 60 x 1000 / 842 = 71.259 and 40 x 1000 / 595 = 67.227. All three labels are shared on
    each axis and the fit is exact."""
    beam, column, _ = sheets
    fx, fy, why = plan.align(plan.grid(beam), plan.grid(column))
    assert not why
    assert fx.scale == pytest.approx(0.8, abs=1e-4) and fx.offset == pytest.approx(71.259, abs=0.01)
    assert fy.scale == pytest.approx(0.8, abs=1e-4) and fy.offset == pytest.approx(67.227, abs=0.01)
    assert len(fx.labels) == 3 and fx.worst < 0.01


def test_alignment_needs_two_shared_labels_and_a_close_fit():
    """One shared label cannot fix a scale. Three labels at 0, 100, 200 mapped to 0, 100, 205: the best line is
    y = 1.025 x - 0.833, residuals 0.833, 1.667, 0.833; the worst, 1.667, is not under 0.5% of the span 205 (1.025),
    so no fit."""
    assert plan.fit_axis({"1": 0.0}, {"1": 10.0})[0] is None
    f, why = plan.fit_axis({"1": 0.0, "2": 100.0, "3": 200.0}, {"1": 0.0, "2": 100.0, "3": 205.0})
    assert f is None and "worst residual 1.67" in why


def test_columns_sit_on_grid_intersections_or_are_flagged(sheets):
    """Six columns are drawn centred on intersections; C7 is drawn 20 pt right of C1-3 (23.75 units, far more than
    the column layout's 3.80 unit tolerance), so it is near C1-3 but not on it."""
    _, column, _ = sheets
    cols, problems = plan.columns(column, plan.grid(column))
    assert {(c.id, c.name()) for c in cols} == {("C2", "A-1"), ("C3", "A-2"), ("C4", "A-3"), ("C5", "B-1"),
                                                ("C6", "B-2"), ("C8", "C1-1")}
    assert [p.detail for p in problems] == ["C7 is near C1-3 but its outline is not on that grid intersection"]
    assert [p.place for p in problems] == ["C1-3"]          # fix E: the item is about that place only


def test_dashed_edges_make_bands_and_labels_tie_by_direction(sheets):
    """Each beam is two dashed edges 4 pt apart; the merged edges of XB2 are at y = 298 and 302 pt, 500.84 and
    507.56 units, and the band runs from x = 155 to 345 pt, 184.09 to 409.74 units. Every XB and YB label ties to
    the band in its own direction, on its own grid line."""
    beam, _, _ = sheets
    bms, problems = plan.beams(beam, plan.grid(beam))
    assert not problems
    assert sorted((b.id, tuple(b.grid)) for b in bms) == [
        ("XB1", ("A",)), ("XB1", ("A",)), ("XB2", ("B",)), ("XB3", ("B",)), ("YB1", ("1",)), ("YB2", ("2",)),
        ("YB3", ("3",))]
    xb2 = next(b for b in bms if b.id == "XB2").band
    assert (xb2.e0, xb2.e1) == (pytest.approx(500.84, abs=0.05), pytest.approx(507.56, abs=0.05))
    assert (xb2.lo, xb2.hi) == (pytest.approx(184.09, abs=0.05), pytest.approx(409.74, abs=0.05))


def test_beams_meet_columns_with_one_beam_per_direction(sheets):
    """By the layout in make_plan_pdf: XB1 (both spans) meets C2, C3, C4 along A; XB2 meets C5 at B-1; YB1 meets
    C2 and C5 along 1; YB2 meets C6 at B-2; YB3 meets C4 at A-3. XB2 and XB3 both reach C6 at B-2 along X: two
    marks, so both are problems and neither meets C6. XB3 ends at B-3, YB2 at C1-2 and YB3 at C1-3 with no column
    there: beam-on-beam junctions. C8 has no beam: nothing."""
    beam, column, _ = sheets
    r = plan.meet(beam, column)
    assert sorted((m.beam, m.column, m.at) for m in r.meets) == [
        ("XB1", "C2", "A-1"), ("XB1", "C3", "A-2"), ("XB1", "C4", "A-3"), ("XB2", "C5", "B-1"),
        ("YB1", "C2", "A-1"), ("YB1", "C5", "B-1"), ("YB2", "C6", "B-2"), ("YB3", "C4", "A-3")]
    assert {m.level for m in r.meets} == {"FIRST FLOOR BEAM LAYOUT"}
    two = [p for p in r.problems if "one beam per direction" in p.detail]
    assert sorted(p.member for p in two) == ["XB2", "XB3"]
    assert all("C6 at B-2 has XB2 and XB3 along X" in p.detail for p in two)
    assert sorted(j["detail"].split(",")[0] for j in r.junctions) == [
        "XB3 ends at B-3", "YB2 ends at C1-2", "YB3 ends at C1-3"]


def test_read_plans_adds_geometry_fields_and_to_check_items(sheets):
    """read_plans turns the 8 meets into 8 accepted frames_into fields with status "geometry", the beam label's
    page and box, and the column label's page, box and grid place in `refs`; the three problems (XB2 and XB3 at C6,
    C7 off the grid) become To check items on frames_into."""
    beam, column, _ = sheets
    agreement = Agreement()
    info = plan.read_plans([beam, column], agreement)
    assert info["beam_layouts"] == [1] and info["column_layouts"] == [2] and len(info["joints"]) == 8
    made = agreement.accepted
    assert len(made) == 8 and {a.status for a in made} == {"geometry"} and {a.field for a in made} == {"frames_into"}
    assert {(a.member, a.value, a.at) for a in made} >= {("XB1", "C3", "A-2"), ("XB2", "C5", "B-1")}
    xb2 = next(a for a in made if a.member == "XB2")
    assert xb2.value == "C5" and xb2.page == 1 and xb2.level == "FIRST FLOOR BEAM LAYOUT"
    prov = xb2.provenance()
    assert prov["status"] == "geometry" and prov["refs"][0]["page"] == 2 and prov["refs"][0]["at"] == "B-1"
    assert sorted(t.member for t in agreement.to_check) == ["C7", "XB2", "XB3"]
    assert {t.member: t.place for t in agreement.to_check} == {"C7": "C1-3", "XB2": None, "XB3": None}
    assert {t.field for t in agreement.to_check} == {"frames_into"}


def test_a_size_on_a_beam_band_belongs_to_that_band_s_beam(sheets):
    """"230x450" is written 2 pt above XB2's band, beside the label XB2: the band ties it to XB2. The page with no
    tied beam labels (the column layout) says nothing."""
    beam, column, _ = sheets
    size = next(w for w in beam.words if w.text == "230x450")
    assert plan.band_tie(beam, size.box) == ({"XB2"}, "")
    assert plan.band_tie(column, size.box) is None


def test_elevation_callouts_belong_to_the_title_below(sheets):
    """XB6's elevation spans x 100 to 400 pt (118.8 to 475.1 units) with its title at baseline 160 pt; XB5's the same
    span with its title at 260 pt. "2Ø20" (baseline 95) is above XB6's title: XB6. "2Ø16" (195) is below XB6's
    title and above XB5's: XB5. "3Ø12" (226, inside XB5's band): XB5. "2Ø25" at x 600 pt is under no elevation."""
    _, _, page = sheets
    els = plan.elevations(page)
    assert sorted(e.member for e in els) == ["XB5", "XB6"]
    assert els[0].lo == pytest.approx(118.8, abs=0.1) and els[0].hi == pytest.approx(475.1, abs=0.1)
    tie = {w.text: plan.elevation_tie(page, w.box) for w in page.words if "Ø" in w.text}
    assert tie == {"2Ø20": ({"XB6"}, ""), "2Ø16": ({"XB5"}, ""), "3Ø12": ({"XB5"}, ""), "2Ø25": None}


def test_no_grid_no_joints(tmp_path: Path):
    """A sheet with no bubbles has no grid, so it is neither a beam nor a column layout."""
    from reader_pdf import make_pdf
    page = ingest(make_pdf(tmp_path / "plain.pdf"))[0]
    assert plan.grid(page).xs == {} and plan.roles([page]) == ([], [])


def test_slab_marks_are_never_grid_bubbles(sheets):
    """"S1" in a circle in line with the grid bubbles 1, 2, 3 (y = 100 pt) is a slab mark: no bubble, no grid line,
    not even an unplaced one."""
    beam, _, _ = sheets
    assert "S1" not in {b.label for b in plan.bubbles(beam)}
    g = plan.grid(beam)
    assert set(g.xs) == {"1", "2", "3"} and "S1" not in g.unplaced


def test_an_extra_top_bar_belongs_to_the_support_whose_bubble_is_under_it(tmp_path):
    """Under XB5 are bubbles 2 (x = 115 pt) and 3 (x = 385 pt). "1Ø16" (centre about 126 pt) is 11 pt from 2 and 259
    from 3: support 2. "1Ø20" (centre about 366 pt) is 19 pt from 3 and 251 from 2: support 3. "2Ø10" is centred
    near 250 pt, about 135 pt from each: not clear, so no support. On the sheet without bubbles nothing is placed."""
    page = ingest(make_elevation_pdf(tmp_path / "e.pdf", supports=True))[0]
    at = {w.text: plan.support_at(page, w.box) for w in page.words if w.text in ("1Ø16", "1Ø20", "2Ø10")}
    assert at == {"1Ø16": "2", "1Ø20": "3", "2Ø10": None}
    plain = ingest(make_elevation_pdf(tmp_path / "p.pdf"))[0]
    assert all(plan.support_at(plain, w.box) is None for w in plain.words if "Ø" in w.text)


def test_elevation_supports_map_to_plan_supports_only_when_spans_fix_the_direction(tmp_path):
    """XB5's break marks are at x = 97, 266.5 and 400 pt: spans 169.5 and 133.5, shares 0.559 and 0.441 of 303.
    Plan supports on lines 1, 2, 3 at 0, 55.9 and 100 give the same shares left to right (0.559, 0.441) and not right
    to left (0.441, 0.559; 0.118 off, over the 0.03 limit), so "1Ø16" (nearest the first mark) is at line 1, "2Ø12" at
    2 and "1Ø20" at 3. Plan supports at 0, 50, 100 (shares 0.5, 0.5, each 0.059 off) match neither way: nothing is
    placed. Four plan supports against three marks: nothing."""
    page = ingest(make_elevation_pdf(tmp_path / "b.pdf", breaks=True))[0]
    e = next(e for e in plan.elevations(page) if e.member == "XB5")
    marks = plan.elevation_supports(page, e)
    assert [round(x * 842 / 1000, 1) for x in marks] == [97.0, 266.5, 400.0]
    box = {w.text: w.box for w in page.words if w.text in ("1Ø16", "2Ø12", "1Ø20")}

    def at(sup):
        return {t: plan.elevation_support_at(page, b, {"XB5": sup}) for t, b in box.items()}
    three = [(0.0, "1", "column"), (55.9, "2", "column"), (100.0, "3", "column")]
    assert at(three) == {"1Ø16": "1", "2Ø12": "2", "1Ø20": "3"}
    assert at([(0.0, "1", "column"), (50.0, "2", "column"), (100.0, "3", "column")]) == {
        "1Ø16": None, "2Ø12": None, "1Ø20": None}
    assert at(three + [(120.0, "4", "beam")]) == {"1Ø16": None, "2Ø12": None, "1Ø20": None}


def test_a_bottom_bar_reaches_the_supports_its_drawn_bar_reaches(tmp_path):
    """XB5's supports are at x = 97, 266.5 and 400 pt (lines 1, 2, 3). "3Ø16"'s leader ends on the bar from 97 to 400:
    it reaches all three, "1/2/3". "4Ø10"'s leader ends on the bar from 120 to 245: 23 pt short of the first support
    and 21.5 pt short of the second, each far over half a title height (about 3.5 pt), so it reaches none: "-"."""
    page = ingest(make_elevation_pdf(tmp_path / "b.pdf", breaks=True))[0]
    sup = {"XB5": [(0.0, "1", "column"), (55.9, "2", "column"), (100.0, "3", "column")]}
    reach = {w.text: plan.bar_reach(page, w.box, sup) for w in page.words if w.text in ("3Ø16", "4Ø10")}
    assert reach == {"3Ø16": "1/2/3", "4Ø10": "-"}


def test_a_size_on_a_plan_band_takes_the_span_it_sits_over(sheets):
    """Fix A. "230x450" starts at x = 150 + 90 = 240 pt on XB2's band along B, 2 pt above it. XB2's band meets C5 at
    B-1 (x = 150 pt) and reaches C6 at B-2 (x = 350 pt), so its supports along it are lines 1 and 2, 178.1 and 415.7
    units. The label's centre is about 252 pt, 299 units: more than one text height from both, so it is over span
    1/2. On the column layout the same label says nothing (no tied bands there)."""
    beam, column, _ = sheets
    supports = plan.support_map([beam, column])
    assert [s[1] for s in supports["XB2"]] == ["1", "2"] and supports.pages["XB2"] == 1
    size = next(w for w in beam.words if w.text == "230x450")
    assert plan.span_on_plan(beam, size.box, supports) == "1/2"
    assert plan.span_on_plan(column, size.box, supports) is None
    # The same label moved over support 2 (x = 350 pt, 415.7 units): which side it belongs to is not known.
    over = (size.box[0], 410.0, size.box[2], 422.0)
    assert plan.span_on_plan(beam, over, supports) is None


def test_a_bar_callout_on_an_elevation_takes_the_span_it_sits_over(tmp_path):
    """Fix A. XB5's break marks are at x = 97, 266.5 and 400 pt, mapped left to right onto plan lines 1, 2, 3 (shares
    0.559 and 0.441, as in the test above). "3Ø16" starts at x 300 pt, centre about 308: between 266.5 and 400, so over
    span 2/3; "4Ø10" (centre about 188) over span 1/2; "2Ø12" (x 258, centre about 266) sits over support 2, under
    half a title height (about 3.5 pt) from it, so no span. With the plan's supports at 0, 44.1, 100 (the shares
    reversed), only right to left fits: the elevation's second span is the plan's first, "3Ø16" over 1/2."""
    page = ingest(make_elevation_pdf(tmp_path / "b.pdf", breaks=True))[0]
    box = {w.text: w.box for w in page.words if w.text in ("3Ø16", "4Ø10", "2Ø12")}
    fwd = {"XB5": [(0.0, "1", "column"), (55.9, "2", "column"), (100.0, "3", "column")]}
    assert {t: plan.elevation_span_at(page, b, fwd) for t, b in box.items()} == {
        "3Ø16": "2/3", "4Ø10": "1/2", "2Ø12": None}
    rev = {"XB5": [(0.0, "1", "column"), (44.1, "2", "column"), (100.0, "3", "column")]}
    assert {t: plan.elevation_span_at(page, b, rev) for t, b in box.items()} == {
        "3Ø16": "1/2", "4Ø10": "2/3", "2Ø12": None}


def test_elevation_marks_match_a_run_of_plan_supports_at_the_sheet_s_scale():
    """Fix A. Plan supports on lines 1, 2, 3 at 0, 20 and 60 (gaps 20 and 40); the sheet's scale is 2, so the spans
    are drawn 40 and 80 long. Marks at 10, 50, 60 and 130: 10 to 50 is 40 and 50 to 130 is 80, so lines 1, 2, 3 left
    to right, and the mark at 60 is not a support. Right to left the gaps would be 80 then 40: from 10, 90 is no mark;
    from 50, 130 then 170 is none; so that direction does not fit. Marks at 0 and 40 only (one span of 40): span 1-2
    left to right, or 2-1 right to left, two ways; a span of 41 fits within the 1.5 tolerance, one of 44 does not
    (3% of 40 is 1.2, under 1.5)."""
    sup = [(0.0, "1", "column"), (20.0, "2", "column"), (60.0, "3", "column")]
    assert plan._scaled_mappings([10.0, 50.0, 60.0, 130.0], sup, 2.0, 1.5) == [
        [(10.0, "1"), (50.0, "2"), (130.0, "3")]]
    two = plan._scaled_mappings([0.0, 40.0], sup, 2.0, 1.5)
    assert sorted(sorted(lab for _, lab in mp) for mp in two) == [["1", "2"], ["1", "2"]]
    assert len(plan._scaled_mappings([0.0, 41.0], sup, 2.0, 1.5)) == 2
    assert plan._scaled_mappings([0.0, 44.0], sup, 2.0, 1.5) == []


def test_a_top_extra_is_placed_by_its_bar_only_over_one_support_or_one_span(tmp_path, monkeypatch):
    """Fix A. XB5's supports at x = 97, 266.5, 400 pt map to plan lines 1, 2, 3 (115.2, 316.5, 475.1 units). A bar
    from 250 to 410 pt (296.9 to 486.9 units) reaches 2 and 3, the two ends of one span: "2/3". From 255 to 280 pt it
    reaches 2 only: "2". From 90 to 410 pt it reaches all three, which is the continuous top bar, not an extra: None;
    so is the drawn fixture's own bar for "3Ø16" (97 to 400). One reaching 1 and 3 but not 2 cannot happen on one
    bar; none reached ("4Ø10"'s bar, 120 to 245 pt): None."""
    page = ingest(make_elevation_pdf(tmp_path / "b.pdf", breaks=True))[0]
    sup = {"XB5": [(0.0, "1", "column"), (55.9, "2", "column"), (100.0, "3", "column")]}
    box = next(w.box for w in page.words if w.text == "3Ø16")
    assert plan.top_extra_reach(page, box, sup) is None
    none = next(w.box for w in page.words if w.text == "4Ø10")
    assert plan.top_extra_reach(page, none, sup) is None
    u = 1000 / 842

    def bar(lo, hi):
        monkeypatch.setattr(plan, "leader_bar", lambda *a: plan.Line("h", 400.0, lo * u, hi * u))
        return plan.top_extra_reach(page, box, sup)
    assert bar(250, 410) == "2/3"
    assert bar(255, 280) == "2"
    assert bar(90, 410) is None
