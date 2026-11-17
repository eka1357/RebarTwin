"""Storeys: column values carry the storey header they sit under, beams and plans their floor, and a joint takes the
column's storey that ends at its beams' floor. Without that, every column on a schedule by storey is ambiguous."""
import copy
import json

import pytest

pytest.importorskip("pymupdf")

from reader_pdf import make_pdf, make_storey_pdf  # noqa: E402

from rebartwin.reader.agree import agree  # noqa: E402
from rebartwin.reader.gemini import Callout, Read, Reply  # noqa: E402
from rebartwin.reader.ingest import ingest  # noqa: E402
from rebartwin.reader.levels import ends_at, floor, is_storey_header, same_level, storey  # noqa: E402
from rebartwin.reader.link import link  # noqa: E402
from rebartwin.reader.parser import parse_page  # noqa: E402

LOWER, UPPER = "FOUNDATION TO FIRST FLOOR", "FIRST FLOOR TO TERRACE FLOOR"


# --- the words --------------------------------------------------------------------------------------------------

@pytest.mark.parametrize("text, name", [
    ("FIRST FLOOR BEAM LAYOUT", "FIRST"), ("First Floor", "FIRST"), ("TERRACE FLOOR", "TERRACE"),
    ("LMR/OHT LVL", "LMR OHT"), ("", None), (None, None), ("FLOOR", None),
    ("FIRST FLOOR ▪OR", "FIRST"),               # OCR fragments round a header do not change the floor
    ("FOUNDATION ON", "FOUNDATION"), ("SERVANT QUARTER", "SERVANT QUARTER"),
])
def test_floor(text, name):
    assert floor(text) == name


def test_storey_and_ends():
    assert storey(LOWER) == ("FOUNDATION", "FIRST")
    assert storey(UPPER) == ("FIRST", "TERRACE")
    assert storey("TERRACE FLOOR TO LMR/OHT LVL") == ("TERRACE", "LMR OHT")
    assert storey("FIRST FLOOR") is None
    assert is_storey_header(LOWER) and not is_storey_header("REFER TO NOTES")
    assert not is_storey_header("1550 SECTION DETAIL TO PLINTH BEAM")     # a floor word on one side only
    assert not is_storey_header("FOUNDATION @ LIFT PIT RETAINER SECTION X - X")   # a dash is not TO
    assert same_level("FOUNDATION ON TO FIRST FLOOR ▪OR", LOWER)           # OCR noise, same storey
    assert ends_at(LOWER, "FIRST") and not ends_at(UPPER, "FIRST") and ends_at(UPPER, "TERRACE")
    assert ends_at(None, "FIRST")                          # a value with no storey fits every floor
    assert same_level("foundation to first floor", LOWER) and not same_level(LOWER, UPPER)


# --- agreement --------------------------------------------------------------------------------------------------

@pytest.fixture(scope="module")
def sheet(tmp_path_factory):
    pages = ingest(make_storey_pdf(tmp_path_factory.mktemp("storey") / "s.pdf"))
    return pages, parse_page(pages[0])


def at(matches, kind, value, x):
    """The text layer's box of a value, nudged a little as a model's box would be."""
    m = next(m for m in matches if m.kind == kind and m.value == value and abs(m.box[1] - x) < 15)
    return (round(m.box[0]) - 2, round(m.box[1]) - 1, round(m.box[2]) + 2, round(m.box[3]) + 1)   # model: ints


def callouts(matches) -> list[Read]:
    def r(member, fld, value, box, level):
        return Read(Callout(member=member, field=fld, value=value, box_2d=list(box), level=level), box, "t", "m")
    return [
        r("C4", "section", "300x450", at(matches, "section", "300x450", 143), LOWER),
        r("C4", "main", "8-20", at(matches, "bars", "8-20", 237), LOWER),
        r("C4", "section", "300x450", at(matches, "section", "300x450", 392), UPPER),
        r("C4", "main", "8-16", at(matches, "bars", "8-16", 487), UPPER),
        r("B12", "section", "230x450", at(matches, "section", "230x450", 131), "FIRST FLOOR"),
        r("B12", "top", "4-16", at(matches, "bars", "4-16", 237), "FIRST FLOOR"),
        r("B12", "bottom", "3-16", at(matches, "bars", "3-16", 344), "FIRST FLOOR"),
        r("B12", "frames_into", "C4", (314, 706, 346, 808), "FIRST FLOOR"),
    ]


def test_each_storey_is_its_own_value(sheet):
    """C4's main bars are 8-20 below the first floor and 8-16 above it: two values, both accepted, each with the
    sheet's own header as its level. One value per member and field holds per storey."""
    pages, matches = sheet
    result = agree(callouts(matches), matches, pages)
    assert result.to_check == []
    mains = sorted((a.level, a.value) for a in result.accepted if (a.member, a.field) == ("C4", "main"))
    assert mains == [(UPPER, "8-16"), (LOWER, "8-20")]
    assert len(result.accepted) == 8
    assert {a.level for a in result.accepted if a.member == "B12"} == {"FIRST FLOOR"}


def test_wrong_or_missing_storey_is_never_accepted(sheet):
    pages, matches = sheet
    reads = callouts(matches)
    swapped = copy.deepcopy(reads[1])
    swapped.callout.level = UPPER                       # 8-20 sits under the lower header
    none = copy.deepcopy(reads[1])
    none.callout.level = None
    for read, reason in ((swapped, "disagree"), (none, "ambiguous")):
        result = agree([read], matches, pages)
        assert result.accepted == [] and result.to_check[0].reason == reason


def test_storey_where_the_sheet_has_no_header(tmp_path):
    """The plain sheet's column schedule has no storey headers; a storey from Gemini there has nothing behind it."""
    pages = ingest(make_pdf(tmp_path / "p.pdf"))
    matches = parse_page(pages[0])
    m = next(m for m in matches if m.kind == "bars" and m.value == "8-16")
    box = tuple(round(v) for v in m.box)
    read = Read(Callout(member="C4", field="main", value="8-16", box_2d=list(box), level=LOWER), box, "t", "m")
    result = agree([read], matches, pages)
    assert result.accepted == [] and result.to_check[0].reason == "ambiguous"
    read.callout.level = None                            # and with no storey it is accepted as before
    assert [a.value for a in agree([read], matches, pages).accepted] == ["8-16"]


def test_floor_the_sheet_does_not_name(sheet):
    pages, matches = sheet
    plan = copy.deepcopy(callouts(matches)[-1])
    plan.callout.level = "SECOND FLOOR"
    result = agree([plan], matches, pages)
    assert result.accepted == [] and result.to_check[0].reason == "ambiguous"


# --- linking ----------------------------------------------------------------------------------------------------

class Replies:
    def __init__(self, body):
        self.body = body

    def generate(self, *, key, model, parts, schema, high_res=False):
        return Reply(json.dumps(self.body), model)


def reply(result, storey_level, n_bars=8, dia=20):
    ids = {(a.member, a.field, a.level): a.id for a in result.accepted}
    return {"joints": [{
        "joint": {"id": "j", "column": {"id": "C4", "b": 300, "h": 450, "n_bars": n_bars, "bar_dia": dia},
                  "beams": [{"id": "B12", "direction": "x", "b": 230, "D": 450, "top": [{"bars": "4-16"}],
                             "bottom": [{"bars": "3-16"}]}]},
        "sources": [
            {"path": "column.section", "field_ids": [ids[("C4", "section", storey_level)]]},
            {"path": "column.main", "field_ids": [ids[("C4", "main", storey_level)]]},
            {"path": "beams[0].section", "field_ids": [ids[("B12", "section", "FIRST FLOOR")]]},
            {"path": "beams[0].top", "field_ids": [ids[("B12", "top", "FIRST FLOOR")]]},
            {"path": "beams[0].bottom", "field_ids": [ids[("B12", "bottom", "FIRST FLOOR")]]},
            {"path": "beams[0].frames_into", "field_ids": [ids[("B12", "frames_into", "FIRST FLOOR")]]},
        ]}]}


def test_joint_takes_the_storey_that_ends_at_the_beams_floor(sheet):
    """B12 was read on the FIRST FLOOR BEAM LAYOUT, so the joint is at the first floor and C4 takes the storey that
    ends there, FOUNDATION TO FIRST FLOOR: 8-20. The choice is a sentence in the notes and the floor is in the id."""
    pages, matches = sheet
    result = agree(callouts(matches), matches, pages)
    linked = link(result, Replies(reply(result, LOWER)))
    [v] = linked.joints
    assert v.joint.id == "C4xB12@FIRST" and v.floor == "FIRST"
    assert (v.joint.column.n_bars, v.joint.column.bar_dia) == (8, 20)
    assert any(f"C4 takes the storey {LOWER}, which ends at the beams' floor, FIRST" in n for n in v.joint.notes)
    assert [t for t in linked.to_check if t.joint == v.joint.id] == []


def test_the_other_storeys_values_are_refused(sheet):
    """Citing the storey above (8-16, FIRST FLOOR TO TERRACE FLOOR) for a first-floor joint is caught by code."""
    pages, matches = sheet
    result = agree(callouts(matches), matches, pages)
    linked = link(result, Replies(reply(result, UPPER, dia=16)))
    items = [(t.field, t.reason) for t in linked.to_check if t.joint == "C4xB12@FIRST"]
    assert ("column.main", "disagree") in items and ("column.section", "disagree") in items


def test_without_a_plan_floor_every_storey_is_ambiguous(sheet):
    """If the plan gave no floor, nothing picks C4's storey: its section and main bars both go to To check."""
    pages, matches = sheet
    result = agree(callouts(matches), matches, pages)
    body = reply(result, LOWER)
    for a in result.accepted:
        if a.field == "frames_into":
            a.level = None
    linked = link(result, Replies(body))
    [v] = linked.joints
    assert v.joint.id == "C4xB12"
    items = {(t.field, t.reason) for t in linked.to_check if t.joint == "C4xB12"}
    assert {("column.section", "ambiguous"), ("column.main", "ambiguous")} <= items
