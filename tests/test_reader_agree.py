"""R4: agreement. The invariant: nothing is accepted unless both channels give the same value at the same place, tied
to the right member and face. Every crafted conflict below must land in To check, never in accepted."""
import copy
import json
import re
from pathlib import Path

import pytest

pytest.importorskip("pymupdf")

from reader_pdf import TRUTH, make_pdf  # noqa: E402

from rebartwin.reader.agree import agree, centre_inside, iou, same_place  # noqa: E402
from rebartwin.reader.gemini import Callout, Read  # noqa: E402
from rebartwin.reader.ingest import ingest  # noqa: E402
from rebartwin.reader.parser import BAR_DIAS, parse_page  # noqa: E402

FIXTURES = Path(__file__).parent / "fixtures" / "reader"
RECORDED = json.loads((FIXTURES / "read-p1-t0.json").read_text(encoding="utf-8"))["callouts"]


@pytest.fixture(scope="module")
def sheet(tmp_path_factory):
    pages = ingest(make_pdf(tmp_path_factory.mktemp("sheet") / "s.pdf"))
    return pages, parse_page(pages[0])


def reads(callouts: list[dict]) -> list[Read]:
    return [Read(Callout(**c), tuple(c["box_2d"]), "test", "test") for c in callouts]


def run(sheet, callouts):
    pages, matches = sheet
    return agree(reads(callouts), matches, pages)


def assert_nothing_wrong(result):
    for a in result.accepted:
        assert TRUTH.get((a.member, a.field)) == a.value, f"accepted {a.member} {a.field} = {a.value}"


# --- overlap, by hand ---------------------------------------------------------------------------------------------

def test_iou_by_hand():
    """a = (0, 0, 10, 100) and b = (0, 40, 10, 140): overlap 10 x 60 = 600, union 1000 + 1000 - 600 = 1400,
    IoU = 600 / 1400 = 0.4286, at least 0.3, so the same place.
    c = (0, 60, 10, 160): overlap 10 x 40 = 400, union 1600, IoU 0.25; a's centre x = 50 is outside c (60 to 160) and
    c's centre x = 110 is outside a (0 to 100), so not the same place."""
    a, b, c = (0, 0, 10, 100), (0, 40, 10, 140), (0, 60, 10, 160)
    assert iou(a, b) == pytest.approx(600 / 1400)
    assert same_place(a, b)
    assert iou(a, c) == pytest.approx(0.25)
    assert not centre_inside(a, c) and not same_place(a, c)


def test_centre_inside_rescues_a_small_box_in_a_long_line():
    """The cover note's text-layer box is (522, 59, 542, 213), 20 x 154 = 3080; Gemini boxes only '25 mm',
    (520, 183, 544, 214), 24 x 31 = 744. Overlap (522..542) x (183..213) = 20 x 30 = 600, union 3080 + 744 - 600 =
    3224, IoU 0.186: below 0.3. Gemini's centre (532, 198.5) lies inside the note's box, so they agree."""
    note, gemini = (522, 59, 542, 213), (520, 183, 544, 214)
    assert iou(note, gemini) == pytest.approx(600 / 3224)
    assert same_place(note, gemini)


# --- the recorded page ----------------------------------------------------------------------------------------------

def test_recorded_page_accepts_only_the_truth(sheet):
    result = run(sheet, RECORDED)
    assert_nothing_wrong(result)
    assert len(result.accepted) == 22                     # 23 callouts, one misread
    [item] = result.to_check
    assert (item.member, item.field, item.reason) == ("B14", "bottom", "disagree")
    assert item.gemini == {"value": "3-20"} and item.parser == {"value": "3-16"}
    assert item.box_2d == (235, 343, 257, 366)
    ids = [a.id for a in result.accepted]
    assert ids == sorted(ids) and ids[0] == "f0001"
    assert result.unassigned == []                        # Gemini reported every value the parser found


def test_provenance_keeps_both_channels(sheet):
    result = run(sheet, RECORDED)
    a = next(a for a in result.accepted if (a.member, a.field) == ("B13", "links"))
    assert a.provenance() == {"page": 1, "box_2d": list(a.box), "text": "8φ @ 150 c/c", "gemini": "8φ @ 150 c/c",
                              "parser": "8@150", "status": "agreed", "field_id": a.id,
                              "level": None}


# --- crafted conflicts ----------------------------------------------------------------------------------------------

def one(member, fld):
    return copy.deepcopy(next(c for c in RECORDED if (c["member"], c["field"]) == (member, fld)))


def test_disagreeing_value_is_never_accepted(sheet):
    c = one("B12", "top")
    c["value"] = "5-16"
    result = run(sheet, [c])
    assert result.accepted == []
    assert [(t.reason, t.gemini, t.parser) for t in result.to_check] == [
        ("disagree", {"value": "5-16"}, {"value": "5-20"})]


def test_value_at_the_wrong_place_is_missing(sheet):
    """Right value, wrong box: Gemini put B12's '5-20' over the B14 row. The parser has 3-12 there, not 5-20."""
    c = one("B12", "top")
    c["box_2d"] = [235, 236, 257, 260]
    result = run(sheet, [c])
    assert result.accepted == [] and result.to_check[0].reason == "disagree"
    c["box_2d"] = [700, 700, 720, 720]                   # blank paper
    result = run(sheet, [c])
    assert result.accepted == [] and result.to_check[0].reason == "missing"


def test_two_values_under_one_box_are_ambiguous(sheet):
    """A box tall enough to take in B12's top (5-20) and B13's top (2-25 + 1-20) has two parser values; even
    though one equals Gemini's, neither is picked."""
    c = one("B12", "top")
    c["box_2d"] = [168, 236, 223, 288]
    result = run(sheet, [c])
    assert result.accepted == []
    assert result.to_check[0].reason == "ambiguous"


def test_wrong_member_is_caught_by_the_row(sheet):
    """B13's row holds '3-16'; Gemini names B12. The row names B13, so it disagrees."""
    c = one("B13", "bottom")
    c["member"] = "B12"
    result = run(sheet, [c])
    assert result.accepted == []
    assert result.to_check[0].reason == "disagree" and "B13" in result.to_check[0].detail


def test_member_named_wrongly_or_nowhere_near(sheet):
    """C9 for C4's main bars: C4 is the label to the left in that row, so it disagrees. B12 for the cover note: no
    beam id is to the note's left, and the nearest above in its column is B14, so it disagrees. C4 for the 'M25'
    note: no column id to its left or above it, so nothing ties it to C4 and it is ambiguous."""
    c = one("C4", "main")
    c["member"] = "C9"
    result = run(sheet, [c])
    assert result.accepted == [] and result.to_check[0].reason == "disagree" and "C4" in result.to_check[0].detail
    c = one("ALL_BEAMS", "cover")
    c["member"] = "B12"
    result = run(sheet, [c])
    assert result.accepted == [] and result.to_check[0].reason == "disagree" and "B14" in result.to_check[0].detail
    c = one("ALL", "concrete_grade")
    c["member"] = "C4"
    result = run(sheet, [c])
    assert result.accepted == [] and result.to_check[0].reason == "ambiguous"


def test_top_and_bottom_swapped_are_caught_by_the_header(sheet):
    c = one("B12", "top")
    c["field"] = "bottom"
    result = run(sheet, [c])
    assert result.accepted == []
    assert result.to_check[0].reason == "disagree" and "top" in result.to_check[0].detail


def test_unreadable_gemini_value_is_ambiguous(sheet):
    c = one("B12", "top")
    c["value"] = "five twenty"
    result = run(sheet, [c])
    assert result.accepted == [] and result.to_check[0].reason == "ambiguous"


def test_two_values_for_one_setting_both_go_to_check(sheet):
    """Two notes give two seismic zones (III for all, IV for beams), each agreeing with the parser where it sits.
    A zone is project-wide, so neither is picked: both go to To check."""
    pages, matches = sheet
    zone = one("ALL", "seismic_zone")
    other = copy.deepcopy(zone)
    other.update(member="ALL_BEAMS")
    from rebartwin.reader.parser import Match
    fake = Match("seismic_zone", "IV", "ZONE IV", 1, (700, 100, 720, 140))
    other.update(value="IV", box_2d=[700, 100, 720, 140])
    result = agree(reads([zone, other]), matches + [fake], pages)
    assert result.accepted == []
    assert {t.reason for t in result.to_check} == {"ambiguous"} and len(result.to_check) == 2


def test_frames_into_needs_both_labels_in_the_box(sheet):
    c = one("B12", "frames_into")
    assert run(sheet, [c]).accepted[0].value == "C4"
    c["value"] = "C9"
    assert run(sheet, [c]).accepted == []
    c = one("B12", "frames_into")
    c["box_2d"] = [314, 770, 346, 808]                     # only B12 inside
    assert run(sheet, [c]).accepted == []


def test_a_beam_can_frame_into_two_columns(sheet):
    pages, matches = sheet
    from rebartwin.reader.parser import Match
    c5 = Match("member", "C5", "C5", 1, (320, 840, 340, 852))
    a, b = one("B12", "frames_into"), one("B12", "frames_into")
    b.update(value="C5", box_2d=[314, 780, 346, 856])
    result = agree(reads([a, b]), matches + [c5], pages)
    assert sorted(x.value for x in result.accepted) == ["C4", "C5"]


def test_unclaimed_parser_values_are_listed_not_accepted(sheet):
    result = run(sheet, [one("B12", "top")])
    assert len(result.accepted) == 1
    assert ("bars", {"value": "4-16"}) in [(t.field, t.parser) for t in result.unassigned]
    assert all(t.joint is None for t in result.unassigned)


# --- sweep: corrupt every recorded callout every way and check nothing wrong gets through ---------------------------

def _wrong_values(c: dict) -> list[str]:
    value, fld = c["value"], c["field"]
    if fld == "frames_into":
        return ["C9", "B13" if c["member"] != "B13" else "B12"]
    if fld == "seismic_zone":
        return ["IV", "II"]
    if fld == "exposure":
        return ["moderate", "severe"]
    if fld == "concrete_grade":
        return ["M30"]
    if fld == "steel_grade":
        return ["Fe415"]
    nums = list(re.finditer(r"\d+", value))
    last = nums[-1]
    out = []
    if fld in ("top", "bottom", "main"):
        d = int(last.group())
        bigger = min(x for x in BAR_DIAS if x > d)
        out.append(value[:last.start()] + str(bigger) + value[last.end():])
        first = nums[0]
        out.append(value[:first.start()] + str(int(first.group()) + 1) + value[first.end():])
    else:
        out.append(value[:last.start()] + str(int(last.group()) + 25) + value[last.end():])
    return out


def test_sweep_corrupted_values_never_accepted(sheet):
    checked = 0
    for k, c in enumerate(RECORDED):
        for wrong in _wrong_values(c):
            corrupted = copy.deepcopy(RECORDED)
            corrupted[k]["value"] = wrong
            result = run(sheet, corrupted)
            assert_nothing_wrong(result)
            checked += 1
    assert checked >= 30


def test_sweep_swapped_members_and_faces_never_accepted(sheet):
    swaps = {"B12": "B13", "B13": "B14", "B14": "B12"}
    for k, c in enumerate(RECORDED):
        variants = []
        if c["member"] in swaps:
            variants.append({"member": swaps[c["member"]]})
        if c["field"] in ("top", "bottom"):
            variants.append({"field": "bottom" if c["field"] == "top" else "top"})
        for change in variants:
            corrupted = copy.deepcopy(RECORDED)
            corrupted[k].update(change)
            result = run(sheet, corrupted)
            assert_nothing_wrong(result)
