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


def test_unresolved_from_the_model_blocks(agreement):
    def change(item):
        item["unresolved"] = [{"path": "beams[1].top", "reason": "two top callouts on different sheets"}]
    items = blocking(run(agreement, body_with(change)))
    assert [(t.field, t.reason) for t in items] == [("beams[1].top", "ambiguous")]


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
