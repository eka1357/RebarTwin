"""Table cells from ruling lines, the OCR Ø repair, and beam direction from XB and YB ids. No key needed."""
import json
from dataclasses import replace
from pathlib import Path

import pytest

pytest.importorskip("pymupdf")

from reader_pdf import make_grid_pdf, make_pdf, make_shx_pdf, make_vector_pdf  # noqa: E402

from rebartwin.reader import agree as agree_mod  # noqa: E402
from rebartwin.reader.agree import agree  # noqa: E402
from rebartwin.reader.gemini import Callout, RecordedTransport, Read, Reply, read_page, tiles  # noqa: E402
from rebartwin.reader.ingest import Word, ingest  # noqa: E402
from rebartwin.reader.link import direction_of, link  # noqa: E402
from rebartwin.reader.ocr import bar_reading, ocr_pages, repair, words_from  # noqa: E402
from rebartwin.reader.parser import parse_page, scan, visual_lines  # noqa: E402

FIXTURES = Path(__file__).parent / "fixtures" / "reader"


# --- 3. cells ------------------------------------------------------------------------------------------------------

def test_ruling_lines_are_read(tmp_path: Path):
    """The grid has 3 horizontal rules (y = 80, 112, 132 pt) and 4 vertical (x = 40, 120, 200, 280 pt). In box units
    the first horizontal is at 1000 x 80 / 595 = 134.45 and spans x 1000 x 40 / 842 = 47.51 to 1000 x 280 / 842 =
    332.54. Text strokes shorter than 10 pt are not rules."""
    page = ingest(make_grid_pdf(tmp_path / "g.pdf"))[0]
    assert len(page.h_rules) == 3 and len(page.v_rules) == 4
    y, x0, x1 = sorted(page.h_rules)[0]
    assert (y, x0, x1) == pytest.approx((134.454, 47.506, 332.542), abs=0.001)


def test_words_group_by_cell_on_a_ruled_table(tmp_path: Path):
    """In the ruled table the two-line headers read whole and the bar values 4 pt apart stay in their own cells.
    On the same words with no rules, the old line grouping splits the headers and runs the two values together."""
    ruled = ingest(make_grid_pdf(tmp_path / "g.pdf"))[0]
    lines = [" ".join(w.text for w in line) for line in visual_lines(ruled)]
    assert "FOUNDATION TO FIRST FLOOR" in lines and "FIRST FLOOR TO TERRACE FLOOR" in lines
    assert "8Ø16" in lines and "8Ø12" in lines
    bare = ingest(make_grid_pdf(tmp_path / "b.pdf", ruled=False))[0]
    lines = [" ".join(w.text for w in line) for line in visual_lines(bare)]
    assert "FOUNDATION TO FIRST FLOOR" not in lines and "8Ø16 8Ø12" in lines


def test_storey_header_comes_from_the_cell_above(tmp_path: Path):
    page = ingest(make_grid_pdf(tmp_path / "g.pdf"))[0]
    m16 = next(m for m in parse_page(page) if m.value == "8-16")
    m12 = next(m for m in parse_page(page) if m.value == "8-12")
    assert agree_mod._storey_header(page, m16.box) == "FOUNDATION TO FIRST FLOOR"
    assert agree_mod._storey_header(page, m12.box) == "FIRST FLOOR TO TERRACE FLOOR"


def test_the_sheet_border_is_not_a_cell(tmp_path: Path):
    """A frame round everything (the sheet border) is wider than 30% of the page: words inside it keep the line
    grouping. The plain sheet's lines are the same with or without that frame."""
    import pymupdf
    path = make_pdf(tmp_path / "p.pdf")
    plain = [" ".join(w.text for w in line) for line in visual_lines(ingest(path)[0])]
    doc = pymupdf.open(path)
    doc[0].draw_rect(pymupdf.Rect(20, 20, 822, 575))
    doc.saveIncr()
    doc.close()
    framed = [" ".join(w.text for w in line) for line in visual_lines(ingest(path)[0])]
    assert sorted(framed) == sorted(plain)


# --- 1. XB and YB ---------------------------------------------------------------------------------------------------

@pytest.mark.parametrize("text, value", [("XB12", "XB12"), ("YB3", "YB3"), ("XB4A", "XB4A"), ("XB-7", "XB7"),
                                         ("B12", "B12"), ("FB3", "FB3")])
def test_xb_and_yb_ids(text, value):
    assert [(k, v) for k, v, *_ in scan(text)] == [("member", value)]


def test_direction_from_the_prefix():
    assert [direction_of(i) for i in ("XB12", "YB3", "B12", "FB3")] == ["x", "y", None, None]


@pytest.fixture(scope="module")
def xb_agreement(tmp_path_factory):
    """The recorded sheet's agreement with B12 renamed XB12 (a beam the drawing says runs along X)."""
    pages = ingest(make_pdf(tmp_path_factory.mktemp("xb") / "s.pdf"))
    result = agree(read_page(pages[0], RecordedTransport(FIXTURES)), parse_page(pages[0]), pages)
    for a in result.accepted:
        if a.member == "B12":
            a.member = "XB12"
    return result


class Replies:
    def __init__(self, body):
        self.body = body

    def generate(self, *, key, model, parts, schema, high_res=False):
        return Reply(json.dumps(self.body), model)


def _link_body(direction_xb, direction_b13):
    body = json.loads((FIXTURES / "link.json").read_text(encoding="utf-8"))
    beams = body["joints"][0]["joint"]["beams"]
    beams[0].update(id="XB12", direction=direction_xb)
    beams[1].update(direction=direction_b13)
    return body


def test_prefix_direction_agrees_and_is_noted(xb_agreement):
    linked = link(xb_agreement, Replies(_link_body("x", "y")))
    [v] = linked.joints
    assert "XB12 meets C4 on the plan; it runs along X, as its prefix XB states (checked by code)." in v.joint.notes
    assert not [t for t in linked.to_check if t.joint == v.joint.id and t.field.endswith("direction")]


def test_prefix_direction_overrules_the_model(xb_agreement):
    """The linking model put XB12 along Y: code refuses it, and the joint waits in To check."""
    linked = link(xb_agreement, Replies(_link_body("y", "x")))
    [v] = linked.joints
    items = [(t.field, t.reason) for t in linked.to_check if t.joint == v.joint.id]
    assert ("beams[0].direction", "disagree") in items


# --- 2. Ø repair in OCR words ----------------------------------------------------------------------------------------

@pytest.mark.parametrize("token, reading", [
    ("4016", "4Ø16"), ("8016", "8Ø16"), ("12020", "12Ø20"), ("10016", "10Ø16"), ("4O16", "4Ø16"),
    ("4Q16", "4Ø16"), ("4•16", "4Ø16"), ("4θ16", "4Ø16"), ("24032", "24Ø32"),
    ("25016", None),        # 25 bars is out of range, and 2-Ø-5016 is no bar size: nothing
    ("4060", None),         # 60 is not a bar size
    ("406", None),          # 6 is not a main bar size
    ("400", None),
    ("4016x", None), ("Q16", None),
])
def test_bar_repair_needs_exactly_one_standard_split(token, reading):
    """'12020' has two zeros: 1-Ø-020 fails (a size cannot start with 0), 12-Ø-20 works: one split, repaired.
    '10016': 1-Ø-016 fails, 10-Ø-16 works. '25016' gives no standard split."""
    assert bar_reading(token) == reading


def _words(*texts):
    return [Word(t, (0.0, 10.0 * k, 1.0, 10.0 * k + 8), 1, (-2, k), "ocr") for k, t in enumerate(texts)]


def test_link_repair_needs_the_at_and_a_standard_spacing():
    """Ø-d @ s with d in 6, 8, 10, 12 and s a multiple of 5 from 50 to 300: 'θ8 @ 310' (over 300), 'Q16 @ 150'
    (16 is not a link size), 'Q8 @ 152' (not a multiple of 5) and a lone 'Q8' stay as read."""
    out = repair(_words("Q8", "@", "200", "08@150c/c", "O10", "@", "125", "θ8", "@", "310", "Q16", "@", "150",
                        "Q8", "@", "152", "Q8"))
    got = [(w.text, w.raw) for w in out if w.raw or w.text.startswith(("Q", "θ", "Ø", "O", "0"))]
    assert got == [("Ø8", "Q8"), ("Ø8@150c/c", "08@150c/c"), ("Ø10", "O10"), ("θ8", None), ("Q16", None),
                   ("Q8", None), ("Q8", None)]


def test_repair_never_touches_the_text_layer_or_comments(tmp_path: Path):
    """'4016' written as a comment (or in the text layer) is a number on the drawing, not a misread; the parser
    leaves it alone."""
    page = ingest(make_shx_pdf(tmp_path / "s.pdf"))[0]
    page.words.append(replace(page.words[0], text="4016"))
    assert all(w.raw is None for w in page.words)
    assert not [m for m in parse_page(page) if m.text == "4016"]


def test_repaired_value_is_accepted_only_if_gemini_reads_the_same(tmp_path: Path):
    """Vision read C4's bars as '4016' (Ø misread as 0). The repair makes it 4Ø16, kept with ocr_raw '4016' and
    counted. Gemini reading 4-16 there agrees; Gemini reading 4-10 does not, so nothing is accepted."""
    page = ingest(make_vector_pdf(tmp_path / "v.pdf"))[0]
    [tile] = tiles(page)
    body = {"responses": [{"textAnnotations": [
        {"description": "C4 4016"},
        {"description": "C4", "boundingPoly": {"vertices": [{"x": 300, "y": 400}, {"x": 340, "y": 400},
                                                            {"x": 340, "y": 430}, {"x": 300, "y": 430}]}},
        {"description": "4016", "boundingPoly": {"vertices": [{"x": 500, "y": 400}, {"x": 580, "y": 400},
                                                              {"x": 580, "y": 430}, {"x": 500, "y": 430}]}}]}]}

    class OneReply:
        def annotate(self, *, key, png):
            return body

    assert ocr_pages([page], OneReply()) == []
    assert page.ocr_repairs == 1
    [w] = [w for w in page.words if w.raw]
    assert (w.text, w.raw) == ("4Ø16", "4016")
    box = (240, 212, 262, 249)
    right = Read(Callout(member="C4", field="main", value="4-16", box_2d=list(box)), box, "t", "m")
    wrong = Read(Callout(member="C4", field="main", value="4-10", box_2d=list(box)), box, "t", "m")
    [a] = agree([right], parse_page(page), [page]).accepted
    assert (a.value, a.text, a.ocr_raw) == ("4-16", "4Ø16", "4016")
    assert a.provenance()["ocr_raw"] == "4016"
    result = agree([wrong], parse_page(page), [page])
    assert result.accepted == [] and result.to_check[0].reason == "disagree"
    assert words_from(body, tile, 1)[1].raw == "4016"


def test_letter_strokes_drawn_as_lines_are_not_table_rules():
    """On a sheet whose lettering is vector paths, a big word's crossbars pass the 10 pt length test. A word at
    y 100 to 110, x 100 to 160 has strokes inside its box (y 101, 109; x 101, 159): those make no cell. The table's
    rules around it (y 90 and 120, x 90 and 170) do: the word's cell is (90, 90, 120, 170)."""
    from rebartwin.reader.cells import assign
    from rebartwin.reader.ingest import Page
    word = Word("TERRACE", (100.0, 100.0, 110.0, 160.0), 1, (0, 0), "ocr")
    strokes_h = [(101.0, 100.5, 159.5), (109.0, 100.5, 159.5)]
    strokes_v = [(101.0, 100.5, 109.5), (159.0, 100.5, 109.5)]
    only_strokes = Page(1, 2384, 3370, [word], h_rules=strokes_h, v_rules=strokes_v)
    assert assign(only_strokes) == {}
    table = Page(1, 2384, 3370, [word], h_rules=strokes_h + [(90.0, 80.0, 200.0), (120.0, 80.0, 200.0)],
                 v_rules=strokes_v + [(90.0, 80.0, 130.0), (170.0, 80.0, 130.0)])
    assert assign(table) == {id(word): (90.0, 90.0, 120.0, 170.0)}
