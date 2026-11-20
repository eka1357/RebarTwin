"""R5: linking. The linking model chooses structure; every number it returns is re-derived from the accepted fields
it cites. Crafted replies that change, invent or drop a value must block the joint with a To check item."""
import copy
import json
from dataclasses import replace
from pathlib import Path

import pytest

pytest.importorskip("pymupdf")

from reader_pdf import make_pdf  # noqa: E402

from rebartwin.check import check  # noqa: E402
from rebartwin.reader.agree import Agreement, agree  # noqa: E402
from rebartwin.reader.gemini import RecordedTransport, Reply, read_page  # noqa: E402
from rebartwin.reader.ingest import ingest  # noqa: E402
from rebartwin.reader.link import link  # noqa: E402
from rebartwin.reader.parser import parse_page  # noqa: E402

FIXTURES = Path(__file__).parent / "fixtures" / "reader"
LINK = json.loads((FIXTURES / "link.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def agreement(tmp_path_factory) -> Agreement:
    pages = ingest(make_pdf(tmp_path_factory.mktemp("sheet") / "s.pdf"))
    reads = read_page(pages[0], RecordedTransport(FIXTURES))
    return agree(reads, parse_page(pages[0]), pages)


class Replies:
    """Returns a given link reply; raises for models listed as missing."""

    def __init__(self, body: dict, missing: tuple[str, ...] = ()):
        self.body, self.missing, self.models = body, missing, []

    def generate(self, *, key, model, parts, schema, temperature=0.0, high_res=False):
        self.models.append(model)
        if model in self.missing:
            e = Exception(f"404 models/{model} is not found")
            e.code = 404
            raise e
        return Reply(json.dumps(self.body), model)


def run(agreement, body):
    return link(agreement, Replies(body))


def body_with(change) -> dict:
    b = copy.deepcopy(LINK)
    change(b["joints"][0])
    return b


def blocking(result, joint_id="C4xB12xB13"):
    return [t for t in result.to_check if t.joint == joint_id]


def test_recorded_link_gives_the_hand_checked_joint(agreement):
    """From the sheet: C4 300 x 300 with 8-16 and 8 mm ties at 40 mm cover; B12 230 x 450, top 5-20, bottom 4-16,
    2-legged 8 mm stirrups; B13 230 x 450, top 2-25 + 1-20, bottom 3-16; 25 mm cover to beams; zone III."""
    result = run(agreement, LINK)
    [v] = result.joints
    j = v.joint
    assert j.id == "C4xB12xB13"                          # rebuilt from the members, not the model's "C4-joint"
    assert (j.column.b, j.column.h, j.column.n_bars, j.column.bar_dia, j.column.tie_dia, j.column.cover) == (
        300, 300, 8, 16, 8, 40)
    b12, b13 = j.beams
    assert (b12.b, b12.D, b12.top[0].bars, b12.bottom[0].bars, b12.stirrup_dia, b12.cover) == (
        230, 450, "5-20", "4-16", 8, 25)
    assert (b13.direction, b13.top[0].bars, b13.bottom[0].bars) == ("y", "2-25 + 1-20", "3-16")
    assert j.settings.seismic_zone == "III"
    assert blocking(result) == []
    assert result.model == "gemini-4-argon"
    # Defaults and judgements are sentences written by code; the model's own note is kept aside, not in the joint.
    assert not any("exposure" in n or "zone" in n for n in j.notes)    # read from the notes, not defaulted
    assert "Default: aggregate 20 mm (not on the drawing)." in j.notes
    assert any(n.startswith("B13 meets C4 on the plan; it runs along Y") for n in j.notes)
    assert not any("label runs horizontally" in n for n in j.notes)
    assert result.link_notes[j.id] == ["Placed B12 along X because its label runs horizontally on the plan."]
    # Provenance: one entry per path, the contract's per-layer key when a face has one layer.
    p = v.provenance["beams[0].top[0].bars"]
    assert (p["text"], p["gemini"], p["parser"], p["status"], p["page"]) == ("5-20", "5-20", "5-20", "agreed", 1)
    assert set(v.provenance) >= {"column.section", "column.main", "column.cover", "beams[1].frames_into",
                                 "settings.seismic_zone", "settings.exposure", "beams[1].bottom[0].bars"}
    report, _ = check(j)                                 # the engine accepts it
    assert report.is13920


def test_changed_number_is_never_accepted(agreement):
    def change(item):
        item["joint"]["beams"][0]["top"] = [{"bars": "5-25"}]
    result = run(agreement, body_with(change))
    items = blocking(result)
    assert [(t.field, t.reason) for t in items] == [("beams[0].top", "disagree")]
    assert "5-25" in items[0].detail and "5-20" in items[0].detail


def test_column_size_and_bars_are_proved(agreement):
    def change(item):
        item["joint"]["column"].update(b=300, h=350, n_bars=8, bar_dia=20)
    fields = {t.field for t in blocking(run(agreement, body_with(change)))}
    assert fields == {"column.section", "column.main"}


def test_invented_value_without_a_source(agreement):
    """Ties of 10 mm with no field behind them: not a default, not on the drawing."""
    def change(item):
        item["joint"]["column"]["tie_dia"] = 10
        item["sources"] = [s for s in item["sources"] if s["path"] != "column.ties"]
    items = blocking(run(agreement, body_with(change)))
    assert [(t.field, t.reason) for t in items] == [("column.ties", "missing")]


def test_ignoring_a_value_on_the_drawing(agreement):
    """Leaving the drawing's stirrups uncited and the default in place hides a drawn value: blocked."""
    def change(item):
        item["sources"] = [s for s in item["sources"] if s["path"] != "beams[0].stirrups"]
    items = blocking(run(agreement, body_with(change)))
    assert [(t.field, t.reason) for t in items] == [("beams[0].stirrups", "missing")]


def test_citing_another_members_field(agreement):
    def change(item):
        for s in item["sources"]:
            if s["path"] == "beams[0].top":
                s["field_ids"] = ["f0019"]                # B14's 3-12
        item["joint"]["beams"][0]["top"] = [{"bars": "3-12"}]
    items = blocking(run(agreement, body_with(change)))
    assert [(t.field, t.reason) for t in items] == [("beams[0].top", "disagree")]


def test_citing_an_unknown_id(agreement):
    def change(item):
        item["sources"].append({"path": "beams[0].top", "field_ids": ["f9999"]})
    items = blocking(run(agreement, body_with(change)))
    assert ("beams[0].top", "missing") in [(t.field, t.reason) for t in items]


def test_beam_not_shown_meeting_the_column(agreement):
    """B14 is in the schedule but not on the plan. A joint that puts it at C4 has no frames_into to stand on."""
    def change(item):
        beam = item["joint"]["beams"][1]
        beam.update(id="B14", b=230, D=380, top=[{"bars": "3-12"}], bottom=[{"bars": "3-16"}])
        item["sources"] = [s for s in item["sources"] if not s["path"].startswith("beams[1]")] + [
            {"path": "beams[1].section", "field_ids": ["f0018"]}, {"path": "beams[1].top", "field_ids": ["f0019"]},
            {"path": "beams[1].stirrups", "field_ids": ["f0017"]}, {"path": "beams[1].cover", "field_ids": ["f0005"]}]
    result = run(agreement, body_with(change))
    items = blocking(result, "C4xB12xB14")
    fields = {(t.field, t.reason) for t in items}
    assert ("beams[1].frames_into", "missing") in fields
    assert ("beams[1].bottom", "missing") in fields      # its bottom bars are under review (B14 bottom disagreed)
    assert any(t.member == "B14" and t.field == "bottom" and t.reason == "disagree" for t in items)


def test_extra_bars_must_all_be_used_and_layers_kept(agreement):
    """Add an accepted top_extra of 2-16 for B12 (layer 1) and a layer-2 top of 2-12. Total top steel on the drawing:
    5-20 + 2-16 + 2-12. The joint must hold exactly that, with the layer-2 bars in layer 2."""
    base = agreement.accepted
    top = next(a for a in base if (a.member, a.field) == ("B12", "top"))
    extra = replace(top, id="f0101", field="top_extra", value="2-16")
    second = replace(top, id="f0102", layer=2, value="2-12")
    a2 = Agreement(base + [extra, second], list(agreement.to_check), [])

    def sources(item, top_ids):
        for s in item["sources"]:
            if s["path"] == "beams[0].top":
                s["field_ids"] = top_ids

    good = body_with(lambda i: (sources(i, ["f0011", "f0101", "f0102"]), i["joint"]["beams"][0].update(
        top=[{"bars": "5-20 + 2-16"}, {"bars": "2-12"}])))
    result = run(a2, good)
    assert blocking(result) == []
    assert any("B12 top bars arranged as layer 1: 5-20 + 2-16; layer 2: 2-12" in n for n in result.joints[0].joint.notes)

    dropped = body_with(lambda i: (sources(i, ["f0011", "f0102"]), i["joint"]["beams"][0].update(
        top=[{"bars": "5-20"}, {"bars": "2-12"}])))
    assert [(t.field, t.reason) for t in blocking(run(a2, dropped))] == [("beams[0].top", "missing")]

    flattened = body_with(lambda i: (sources(i, ["f0011", "f0101", "f0102"]), i["joint"]["beams"][0].update(
        top=[{"bars": "5-20 + 2-16 + 2-12"}])))
    items = blocking(run(a2, flattened))
    assert [(t.field, t.reason) for t in items] == [("beams[0].top", "disagree")] and "layer 2" in items[0].detail


def test_model_not_found_falls_back(agreement, monkeypatch):
    monkeypatch.setenv("REBARTWIN_MODEL_FALLBACK", "gemini-3.8-flash")
    t = Replies(LINK, missing=("gemini-4-argon",))
    result = link(agreement, t)
    assert t.models == ["gemini-4-argon", "gemini-3.8-flash"]
    assert result.model == "gemini-3.8-flash" and len(result.joints) == 1


def test_invalid_joint_becomes_a_to_check_item(agreement):
    def change(item):
        item["joint"]["beams"][1]["direction"] = "x"      # two beams one way: Joint refuses it
    result = run(agreement, body_with(change))
    assert result.joints == []
    assert any(t.field == "joints[0]" and t.reason == "ambiguous" for t in result.to_check)


def test_unresolved_from_the_model_blocks_only_where_code_has_no_value(agreement):
    """Code decides (Eka, 18 November): the model's "unresolved" on beams[1].top, which code proves from B13's top
    field (2-25 + 1-20), is dropped; on beams[1].spacer, which code neither proves nor defaults for a one-layer face,
    it blocks the joint."""
    def change(item):
        item["unresolved"] = [{"path": "beams[1].top", "reason": "two top callouts on different sheets"},
                              {"path": "beams[1].spacer", "reason": "no spacer on the drawing"}]
    items = blocking(run(agreement, body_with(change)))
    assert [(t.field, t.reason) for t in items] == [("beams[1].spacer", "ambiguous")]


def test_a_disagreement_on_a_joint_member_blocks_that_joint(agreement):
    """If B12's top had disagreed, the item is tied to the joint, and the joint cannot cite a value for it."""
    a2 = copy.deepcopy(agreement)
    top = next(a for a in a2.accepted if (a.member, a.field) == ("B12", "top"))
    a2.accepted.remove(top)
    from rebartwin.reader.agree import ToCheck
    a2.to_check.append(ToCheck("tc_0099", "B12", "top", 1, top.box, {"value": "5-25"}, {"value": "5-20"},
                               "disagree", "Gemini read 5-25, the text layer says 5-20"))
    result = run(a2, LINK)
    items = blocking(result)
    assert any(t.id == "tc_0099" for t in items)
    assert ("beams[0].top", "missing") in [(t.field, t.reason) for t in items]


def test_general_note_conflict_is_one_project_level_item(agreement):
    """A conflict on a general note stays one item, with no joint, and blocks every joint until resolved."""
    from rebartwin.reader.agree import ToCheck
    from rebartwin.reader.link import blocks
    a2 = copy.deepcopy(agreement)
    a2.to_check.append(ToCheck("tc_0098", "ALL", "seismic_zone", 1, (0, 0, 1, 1), None, None, "ambiguous", "two zones"))
    result = run(a2, LINK)
    [item] = [t for t in result.to_check if t.field == "seismic_zone"]
    assert item.id == "tc_0098" and item.joint is None
    assert blocks(item, "C4xB12xB13") and blocks(item, "any other joint")
    item.resolution = {"value": "III", "by": "person", "at": "2026-11-20T09:00:00Z"}
    assert not blocks(item, "C4xB12xB13")


@pytest.mark.parametrize("missing", ["seismic_zone", "exposure"])
def test_unstated_zone_or_exposure_is_a_project_item_not_a_default(agreement, missing):
    """Remove the drawing's zone (or exposure) note. The joint keeps the schema default only as a placeholder: no
    'Default' note, one project-level To check item (member ALL, reason missing), and every joint is blocked. Zone II
    by default would have switched IS 13920 off without anyone deciding it."""
    from rebartwin.reader.link import blocks
    a2 = copy.deepcopy(agreement)
    a2.accepted = [a for a in a2.accepted if a.field != missing]

    def change(item):
        item["sources"] = [s for s in item["sources"] if s["path"] != f"settings.{missing}"]
        item["joint"]["settings"].pop(missing, None)
    result = run(a2, body_with(change))
    items = [t for t in result.to_check if t.field == missing]
    assert [(t.member, t.joint, t.reason) for t in items] == [("ALL", None, "missing")]
    assert blocks(items[0], "C4xB12xB13")
    assert not any(missing.replace("_", " ") in n for n in result.joints[0].joint.notes)


def test_no_accepted_fields_means_no_call():
    t = Replies(LINK)
    result = link(Agreement(), t)
    assert result.joints == [] and t.models == []


def placed(agreement, places: dict[str, str], extras=()) -> Agreement:
    """The sheet's agreement with frames_into f0008 (B12 meets C4) and f0013 (B13 meets C4) made by geometry at the
    given grid places, plus extra accepted fields."""
    acc = [replace(a, at=places[a.id], status="geometry") if a.id in places else a for a in agreement.accepted]
    return Agreement(acc + list(extras), list(agreement.to_check), [])


def test_joint_id_carries_the_grid_place_safe_as_a_file_name(agreement):
    """C4 with B12 and B13 at "C/C1-25" (a column covering sub-grids C and C1 on line 25): the id is
    "C4xB12xB13@C+C1-25", "/" written "+" so it is a valid Windows file name. The same members at F-14 and F-33
    would be two joints, "...@F-14" and "...@F-33", never one."""
    from rebartwin.reader.link import safe_id
    [v] = run(placed(agreement, {"f0008": "C/C1-25", "f0013": "C/C1-25"}), LINK).joints
    assert v.joint.id == "C4xB12xB13@C+C1-25" and v.place == "C/C1-25"
    assert (v.joint.place, v.joint.floor) == ("C/C1-25", None)        # explicit fields: nobody parses the id
    assert blocking(run(placed(agreement, {"f0008": "C/C1-25", "f0013": "C/C1-25"}), LINK),
                    "C4xB12xB13@C+C1-25") == []
    assert safe_id("LMR OHT") == "LMR_OHT" and safe_id("F-14") == "F-14" and safe_id("a:b|c") == "a_b_c"


def test_beams_placed_at_two_grid_places_are_not_one_joint(agreement):
    """B12 meets C4 at B-2 and B13 meets C4 at B-3 by geometry: those are two columns of one type, so a joint holding
    both is ambiguous."""
    result = run(placed(agreement, {"f0008": "B-2", "f0013": "B-3"}), LINK)
    items = [t for t in result.to_check if t.field == "beams"]
    assert len(items) == 1 and "different grid places: B-2, B-3" in items[0].detail


def test_extra_top_bars_count_only_at_their_own_support(agreement):
    """The joint is at B-2; B12 runs along X, so its support here is grid line 2. Extras: 2-16 at line 2 (f0101) and
    2-12 at line 3 (f0102). B12's top at this joint is 5-20 + 2-16: the 2-12 belongs to the support on line 3, and
    citing it is a disagreement. An extra the detail sheet does not place (f0103, no `at`) blocks the joint as
    ambiguous: which support it is at needs a person."""
    top = next(a for a in agreement.accepted if (a.member, a.field) == ("B12", "top"))
    here = replace(top, id="f0101", field="top_extra", value="2-16", at="2")
    there = replace(top, id="f0102", field="top_extra", value="2-12", at="3")
    places = {"f0008": "B-2", "f0013": "B-2"}

    def body(ids, bars):
        def change(i):
            for s in i["sources"]:
                if s["path"] == "beams[0].top":
                    s["field_ids"] = ids
            i["joint"]["beams"][0]["top"] = [{"bars": bars}]
        return body_with(change)

    jid = "C4xB12xB13@B-2"
    assert blocking(run(placed(agreement, places, [here, there]), body(["f0011", "f0101"], "5-20 + 2-16")), jid) == []
    wrong = blocking(run(placed(agreement, places, [here, there]),
                         body(["f0011", "f0101", "f0102"], "5-20 + 2-16 + 2-12")), jid)
    assert [(t.field, t.reason) for t in wrong] == [("beams[0].top", "disagree")]
    loose = replace(top, id="f0103", field="top_extra", value="2-16", at=None)
    items = blocking(run(placed(agreement, places, [loose]), body(["f0011", "f0103"], "5-20 + 2-16")), jid)
    assert [(t.field, t.reason) for t in items] == [("beams[0].top", "ambiguous")]
    assert "does not mark which support" in items[0].detail


def test_a_joint_short_of_numbers_is_a_draft_from_accepted_values_only(agreement):
    """The model writes C4's bar size as 0 (it had no value): no Joint can be made, so the joint is a draft. The draft
    holds only accepted values (C4 main "8-16" and B12 top "5-20", as the schedule gives them), no number from the model
    (no n_bars, bar_dia, b or D anywhere), and one To check item names what no field gives. Here every value has a
    field, so the item lists none; with C4's main field taken away, it names column.main and the draft's main is
    null."""
    def zero(item):
        item["joint"]["column"]["bar_dia"] = 0
    result = run(agreement, body_with(zero))
    assert result.joints == [] and len(result.drafts) == 1
    d = result.drafts[0]
    assert d["id"] == "C4xB12xB13" and d["draft"] is True
    assert [x["value"] for x in d["column"]["main"]] == ["8-16"]
    assert [x["value"] for x in d["beams"][0]["top"]] == ["5-20"]
    text = json.dumps(d)
    assert not any(k in text for k in ('"n_bars"', '"bar_dia"', '"b":', '"D":'))
    [item] = [t for t in result.to_check if t.field == "joint"]
    assert item.joint == d["id"] and item.reason == "missing"

    no_main = Agreement([a for a in agreement.accepted if (a.member, a.field) != ("C4", "main")],
                        list(agreement.to_check), [])
    d2 = run(no_main, body_with(zero)).drafts[0]
    assert d2["column"]["main"] is None
    assert "column.main" in next(t for t in run(no_main, body_with(zero)).to_check if t.field == "joint").detail


def test_a_bottom_extra_counts_at_a_joint_only_if_its_bar_reaches_the_support(agreement):
    """The joint is at B-2; B12 runs along X, so its support here is line 2. B12's bottom is 4-16. An extra 2-12 whose
    bar reaches lines 1 and 2 (at "1/2") is at the joint: bottom 4-16 + 2-12. One that stops short ("-") is left out
    and noted: "B12 2-12 bottom extra stops short of C4 at 2 on the elevation: not at the joint." One with no `at`
    (where it stops is not shown) blocks the joint as ambiguous."""
    bottom = next(a for a in agreement.accepted if (a.member, a.field) == ("B12", "bottom"))
    places = {"f0008": "B-2", "f0013": "B-2"}
    bottom_ids = next(s["field_ids"] for s in LINK["joints"][0]["sources"] if s["path"] == "beams[0].bottom")

    def body(ids, bars):
        def change(i):
            for s in i["sources"]:
                if s["path"] == "beams[0].bottom":
                    s["field_ids"] = ids
            i["joint"]["beams"][0]["bottom"] = [{"bars": bars}]
        return body_with(change)

    jid = "C4xB12xB13@B-2"
    reaches = replace(bottom, id="f0201", field="bottom_extra", value="2-12", at="1/2")
    assert blocking(run(placed(agreement, places, [reaches]), body(bottom_ids + ["f0201"], "4-16 + 2-12")), jid) == []
    short = replace(bottom, id="f0202", field="bottom_extra", value="2-12", at="-")
    result = run(placed(agreement, places, [short]), body(bottom_ids, "4-16"))
    assert blocking(result, jid) == []
    assert "B12 2-12 bottom extra stops short of C4 at 2 on the elevation: not at the joint." in result.joints[0].joint.notes
    unclear = replace(bottom, id="f0203", field="bottom_extra", value="2-12", at=None)
    items = blocking(run(placed(agreement, places, [unclear]), body(bottom_ids, "4-16")), jid)
    assert [(t.field, t.reason) for t in items] == [("beams[0].bottom", "ambiguous")]


def test_mixed_column_main_is_corner_and_face_bars_and_code_settles_what_it_proves(agreement):
    """C4's main on the drawing becomes "4-16 + 4-12": a joint with 8 bars, 16 mm corners and face_dia 12 is proved
    (4 x 201.1 + 4 x 113.1 = 1,256.6 mm2 of steel) and noted; the same with face_dia missing disagrees. "2-16 + 6-12"
    (a first group that is not the four corners) needs a person. The model's "unresolved" on beams[0].stirrups, a
    path code fills with the noted 8 mm default, is dropped; on column.main, which code cannot prove here, it stays."""
    main = next(a for a in agreement.accepted if (a.member, a.field) == ("C4", "main"))
    def with_main(value):
        acc = [replace(a, value=value) if a is main else a for a in agreement.accepted]
        return Agreement(acc, list(agreement.to_check), [])

    def col(face, unresolved=()):
        def change(i):
            i["joint"]["column"].update(n_bars=8, bar_dia=16, face_dia=face, bars_x=None, bars_y=None)
            i["unresolved"] = [{"path": p, "reason": "not in the values"} for p in unresolved]
        return body_with(change)

    ok = run(with_main("4-16 + 4-12"), col(12, unresolved=["beams[0].stirrups"]))
    assert blocking(ok) == [] and ok.joints[0].joint.column.area == pytest.approx(1256.6, abs=0.1)
    assert any(n.startswith("C4 4-16 at the corners and 4-12 on the faces") for n in ok.joints[0].joint.notes)
    assert [t.field for t in blocking(run(with_main("4-16 + 4-12"), col(None)))] == ["column.main"]
    odd = blocking(run(with_main("2-16 + 6-12"), col(12, unresolved=["column.main"])))
    assert sorted((t.field, t.reason) for t in odd) == [("column.main", "ambiguous"), ("column.main", "disagree")]


def test_an_item_about_a_column_off_the_grid_blocks_only_joints_at_its_place(agreement):
    """Fix E. C4 with B12 and B13 stands at B-2 (both frames_into fields placed there). A second C4 drawn off the grid
    near N1-4 is a To check item on frames_into for C4 with place "N1-4": it is about that place, where no joint is,
    so it blocks 0 joints and stays in to_check.json with joint null. The same item at "B-2" blocks the one joint;
    an item with no place (any other agreement item on C4) still blocks every joint that uses C4: 1 here."""
    from rebartwin.reader.agree import ToCheck
    jid = "C4xB12xB13@B-2"

    def with_item(place):
        a2 = placed(agreement, {"f0008": "B-2", "f0013": "B-2"})
        a2.to_check.append(ToCheck("tc_0097", "C4", "frames_into", 2, (0, 0, 1, 1), None, None, "ambiguous",
                                   "C4 is near N1-4 but its outline is not on that grid intersection", place=place))
        result = run(a2, LINK)
        assert [v.joint.id for v in result.joints] == [jid]
        return [t for t in result.to_check if t.id == "tc_0097" or t.detail == "C4 is near N1-4 but its outline is "
                "not on that grid intersection"]

    [off] = with_item("N1-4")
    assert off.joint is None and off.place == "N1-4" and off.to_json()["place"] == "N1-4"
    assert [t.joint for t in with_item("B-2")] == [jid]
    assert [t.joint for t in with_item(None)] == [jid]


def test_a_storey_from_the_table_is_a_note_and_in_provenance(agreement):
    """Fix B. C4's section field marked as having its storey from the schedule's table (Gemini gave none): the joint
    still checks, provenance for column.section carries level_by, and one note says the storey was read by code."""
    from rebartwin.reader.agree import TABLE_STOREY
    sec = next(a for a in agreement.accepted if (a.member, a.field) == ("C4", "section"))
    a2 = Agreement([replace(a, level_by=TABLE_STOREY) if a is sec else a for a in agreement.accepted],
                   list(agreement.to_check), [])
    [v] = run(a2, LINK).joints
    assert v.provenance["column.section"]["level_by"] == "storey from the schedule's table"
    assert [n for n in v.joint.notes if "read from the table by code" in n] == [
        "C4 section: the storey is the schedule's header above the value, read from the table by code (Gemini gave "
        "none)."]
    assert blocking(run(a2, LINK)) == blocking(run(agreement, LINK))


def test_beam_values_count_only_on_the_spans_meeting_the_joint(agreement):
    """Fix A. The joint is at B-2; B12 runs along X, so its support line here is 2. B12's section 230x450 (f0010) is
    placed over span 1/2 and a second 230x450 over span 2/3 (f0201): both end on line 2 and are equal, so they are one
    value and the joint checks with the model citing either. A 230x600 over span 3/4 (f0202) does not reach line 2
    and is left out. If span 2/3 were 230x600 instead (f0203), B12 is 230x450 on one side of C4 and 230x600 on the
    other: the beam changes at the column, one ambiguous item on beams[0].section and nothing proved there."""
    sec = next(a for a in agreement.accepted if a.id == "f0010")
    places = {"f0008": "B-2", "f0013": "B-2"}
    left = replace(sec, at="1/2")
    acc = [left if a is sec else a for a in placed(agreement, places).accepted]
    jid = "C4xB12xB13@B-2"
    same = replace(sec, id="f0201", at="2/3")
    far = replace(sec, id="f0202", value="230x600", at="3/4")
    ok = run(Agreement(acc + [same, far], list(agreement.to_check), []), LINK)
    assert blocking(ok, jid) == [] and ok.joints[0].provenance["beams[0].section"]["field_id"] == "f0010"
    other = replace(sec, id="f0203", value="230x600", at="2/3")
    changed = blocking(run(Agreement(acc + [other], list(agreement.to_check), []), LINK), jid)
    assert [(t.field, t.reason) for t in changed] == [("beams[0].section", "ambiguous")]
    assert "B12 section is 230x450 and 230x600 at C4 B-2 (spans 1/2, 2/3): the beam changes" in changed[0].detail


def test_inverted_beam_is_unsupported_and_never_checked(agreement):
    """Item 1: a joint with an inverted beam ('200x600-inv', e.g. YB16 on sheet 18 or XB8's inverted spans on sheet 15)
    gets reason='unsupported' ('not checked: inverted beam (not modelled yet)'), even when a plain span meets the same
    column, and also on draft joints. A joint meeting only a plain span of the same beam still checks cleanly."""
    sec = next(a for a in agreement.accepted if a.id == "f0010")
    inv_acc = [replace(a, value="230x450-inv", inverted=True) if a is sec else a for a in agreement.accepted]
    res_inv = run(Agreement(inv_acc, list(agreement.to_check), []), LINK)
    items = blocking(res_inv)
    assert [(t.field, t.reason) for t in items] == [("beams[0].section", "unsupported")]
    assert "not checked: inverted beam (not modelled yet)" in items[0].detail

    # XB8-like beam: plain 230x450 on span 1/2, inverted 230x600-inv on span 2/3.
    # At B-2 (touching both 1/2 and 2/3) -> unsupported! At B-1 (touching only 1/2) -> passes!
    plain_span = replace(sec, value="230x450", at="1/2", inverted=False)
    inv_span = replace(sec, id="f0299", value="230x600-inv", at="2/3", inverted=True)
    b2_acc = [plain_span if a is sec else a for a in placed(agreement, {"f0008": "B-2", "f0013": "B-2"}).accepted] + [inv_span]
    res_b2 = run(Agreement(b2_acc, list(agreement.to_check), []), LINK)
    assert any(t.field == "beams[0].section" and t.reason == "unsupported" for t in blocking(res_b2, "C4xB12xB13@B-2"))

    b1_acc = [plain_span if a is sec else a for a in placed(agreement, {"f0008": "B-1", "f0013": "B-1"}).accepted] + [inv_span]
    res_b1 = run(Agreement(b1_acc, list(agreement.to_check), []), LINK)
    assert blocking(res_b1, "C4xB12xB13@B-1") == []

    # Draft joint with inverted beam also records the unsupported item
    def zero_col(item):
        item["joint"]["column"]["bar_dia"] = 0
    res_draft = run(Agreement(inv_acc, list(agreement.to_check), []), body_with(zero_col))
    assert len(res_draft.drafts) == 1
    assert any(t.reason == "unsupported" and "inverted beam" in t.detail for t in res_draft.to_check)


def test_equal_copies_are_auto_included_and_differing_copies_still_block(agreement):
    """Item 2: when the linking reply cites one copy of a value, code adds every other accepted copy with the same
    member, field, building, compatible level/span and normalised value (the three 19 Nov blockers: column.section on
    pages 7 & 21, column.cover on pages 15 & 18, beams[0].cover on pages 15 & 16). A copy with a different value is
    never auto-added and still raises To check."""
    col_sec = next(a for a in agreement.accepted if (a.member, a.field) == ("C4", "section"))
    col_cov = next(a for a in agreement.accepted if (a.member, a.field) == ("ALL_COLUMNS", "cover"))
    bm_cov = next(a for a in agreement.accepted if (a.member, a.field) == ("ALL_BEAMS", "cover"))

    # Add second copies on other pages (one with level=None, matching 19 Nov sheets 21, 18, 16)
    col_sec_copy = replace(col_sec, id="f0291", page=21, level=None)
    col_cov_copy = replace(col_cov, id="f0196", page=18, level=None)
    bm_cov_copy = replace(bm_cov, id="f0134", page=16, level=None)
    a_copies = Agreement(agreement.accepted + [col_sec_copy, col_cov_copy, bm_cov_copy], list(agreement.to_check), [])

    # LINK cites only the original ids (not f0291/f0196/f0134); code auto-adds all three equal copies
    res = run(a_copies, LINK)
    assert blocking(res) == []
    [v] = res.joints
    assert len(v.provenance["column.section"]) == 2
    assert {p["page"] for p in v.provenance["column.section"]} == {col_sec.page, 21}
    assert len(v.provenance["column.cover"]) == 2
    assert len(v.provenance["beams[0].cover"]) == 2

    # A second copy with a DIFFERENT value still blocks with "leaves out"
    col_sec_diff = replace(col_sec, id="f0292", page=21, level=None, value="300x350")
    a_diff = Agreement(agreement.accepted + [col_sec_diff], list(agreement.to_check), [])
    diff_items = blocking(run(a_diff, LINK))
    assert [(t.field, t.reason) for t in diff_items] == [("column.section", "missing")]
    assert "leaves out 300x350" in diff_items[0].detail


def test_uncited_optional_values_from_linker_are_dropped_and_noted(agreement):
    """Item 2: if the linker writes seismic_zone='III', exposure='moderate' or aggregate=25 with no cited accepted
    field, code drops them back to defaults, notes them on the joint, and leaves zone/exposure to the single
    project-level To check items."""
    a2 = copy.deepcopy(agreement)
    a2.accepted = [a for a in a2.accepted if a.field not in ("seismic_zone", "exposure")]

    def hallucinate(item):
        item["sources"] = [s for s in item["sources"] if s["path"] not in ("settings.seismic_zone", "settings.exposure")]
        item["joint"]["settings"]["seismic_zone"] = "III"
        item["joint"]["settings"]["exposure"] = "moderate"
        item["joint"]["settings"]["aggregate"] = 25
        item["joint"]["settings"]["stock_dias"] = [8, 10, 12, 16, 20, 25, 32]
        item["joint"]["settings"]["max_layers"] = 3
        item["joint"]["settings"]["apply_is13920"] = True
        item["unresolved"] = [
            {"path": "settings.seismic_zone", "reason": "not stated"},
            {"path": "settings.exposure", "reason": "not stated"},
        ]

    res = run(a2, body_with(hallucinate))
    [v] = res.joints
    assert v.joint.settings.seismic_zone == "II"
    assert v.joint.settings.exposure == "mild"
    assert v.joint.settings.aggregate == 20.0
    assert v.joint.settings.stock_dias == [12.0, 16.0, 20.0, 25.0]
    assert v.joint.settings.max_layers == 2
    assert v.joint.settings.apply_is13920 is None
    assert "the linker wrote seismic zone III with no source; ignored" in v.joint.notes
    assert "the linker wrote exposure moderate with no source; ignored" in v.joint.notes
    assert "the linker wrote aggregate 25 mm with no source; ignored" in v.joint.notes
    assert "the linker wrote stock dias [8, 10, 12, 16, 20, 25, 32] with no source; ignored" in v.joint.notes
    assert "the linker wrote max layers 3 with no source; ignored" in v.joint.notes
    assert "the linker wrote apply IS 13920 True with no source; ignored" in v.joint.notes
    # Only the two project-level ALL items block the joint; no spurious joint-level missing/ambiguous settings items
    assert blocking(res) == []
    proj_items = [(t.member, t.field, t.reason) for t in res.to_check if t.field in ("seismic_zone", "exposure")]
    assert sorted(proj_items) == [("ALL", "exposure", "missing"), ("ALL", "seismic_zone", "missing")]


def test_separate_building_keeps_servant_quarter_members_apart(agreement):
    """Item 5: sheet 9's SERVANT QUARTER C1 (200x500, 8-16) and C2 (200x500, 4-16 + 4-12) live in their own building
    and never share accepted values, To check items or joints with the main house's columns."""
    from rebartwin.reader.agree import ToCheck
    from rebartwin.reader.ingest import Page, Word
    from rebartwin.reader.levels import sheet_building

    p9 = Page(9, 842, 595, words=[
        Word("SERVANT", (20, 100, 35, 160), 9, (0, 0)),
        Word("QUARTER", (20, 165, 35, 225), 9, (0, 1)),
        Word("COLUMN", (20, 230, 35, 280), 9, (0, 2)),
        Word("SCHEDULE", (20, 285, 35, 350), 9, (0, 3)),
        Word("C1", (100, 50, 112, 70), 9, (1, 0)),
        Word("200x500", (100, 120, 112, 180), 9, (1, 1)),
        Word("8Ø16", (100, 210, 112, 250), 9, (1, 2)),
        Word("C2", (140, 50, 152, 70), 9, (2, 0)),
        Word("200x500", (140, 120, 152, 180), 9, (2, 1)),
        Word("4Ø16+4Ø12", (140, 210, 152, 280), 9, (2, 2)),
    ])
    p7 = Page(7, 842, 595, words=[
        Word("INTEGRATED", (20, 100, 35, 180), 7, (0, 0)),
        Word("DIRECTOR", (20, 185, 35, 250), 7, (0, 1)),
        Word("RESIDENCE", (20, 255, 35, 330), 7, (0, 2)),
        Word("C1", (100, 50, 112, 70), 7, (1, 0)),
        Word("200x450", (100, 120, 112, 180), 7, (1, 1)),
    ])
    assert sheet_building(p9) == "SERVANT QUARTER"
    assert sheet_building(p7) is None

    # Adding SERVANT QUARTER C4 accepted fields + a SERVANT QUARTER C4 To check item must NOT touch main C4xB12xB13
    col_sec = next(a for a in agreement.accepted if (a.member, a.field) == ("C4", "section"))
    col_main = next(a for a in agreement.accepted if (a.member, a.field) == ("C4", "main"))
    sq_sec = replace(col_sec, id="f0901", page=9, value="200x500", building="SERVANT QUARTER")
    sq_main = replace(col_main, id="f0902", page=9, value="4-16 + 4-12", building="SERVANT QUARTER")
    sq_tc = ToCheck("tc_0900", "C4", "links", 9, (100, 100, 120, 140), {"value": "8@150"}, {"value": "8@200"},
                    "disagree", "Servant quarter tie disagreement", building="SERVANT QUARTER")
    a_both = Agreement(agreement.accepted + [sq_sec, sq_main], list(agreement.to_check) + [sq_tc], [])

    res = run(a_both, LINK)
    assert blocking(res) == []
    [v] = res.joints
    assert (v.joint.column.b, v.joint.column.h, v.joint.column.n_bars, v.joint.column.bar_dia) == (300, 300, 8, 16)
    sq_out = next(t for t in res.to_check if t.id == "tc_0900")
    assert sq_out.joint is None and sq_out.building == "SERVANT QUARTER"
