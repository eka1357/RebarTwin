"""R2: the parser grammar, one case per notation in ARCHITECTURE.md and the reader prompt, and near-misses that must
not match. A false match could be agreed into a wrong number, so the near-misses matter as much as the matches."""
from pathlib import Path

import pytest

pytest.importorskip("pymupdf")

from reader_pdf import make_pdf  # noqa: E402

from rebartwin.model import parse_bars  # noqa: E402
from rebartwin.reader.agree import agree  # noqa: E402
from rebartwin.reader.gemini import Callout, Read  # noqa: E402
from rebartwin.reader.ingest import Page, Word, ingest  # noqa: E402
from rebartwin.reader.parser import is_inverted_section, normalise, parse_page, scan  # noqa: E402


def only(text: str) -> tuple[str, str]:
    found = scan(text)
    assert len(found) == 1, found
    return found[0][0], found[0][1]


@pytest.mark.parametrize("text, kind, value", [
    ("5-20", "bars", "5-20"),
    ("2-25+1-20", "bars", "2-25 + 1-20"),
    ("2-25 + 1-20", "bars", "2-25 + 1-20"),
    ("2#25", "bars", "2-25"),
    ("8-T16", "bars", "8-16"),
    ("8-Y16", "bars", "8-16"),
    ("3 nos 16φ", "bars", "3-16"),
    ("3 Nos-16 dia", "bars", "3-16"),
    ("4-12Φ", "bars", "4-12"),
    ("4–12 mm", "bars", "4-12"),
    ("4 T16", "bars", "4-16"),
    ("230x450", "section", "230x450"),
    ("230 X 450", "section", "230x450"),
    ("230×450", "section", "230x450"),
    ("300 x 600 mm", "section", "300x600"),
    ("8φ @ 150 c/c", "links", "8@150"),
    ("8φ@150c/c", "links", "8@150"),
    ("2L-8 @ 100", "links", "2L-8@100"),
    ("4L-8φ @ 150 C/C", "links", "4L-8@150"),
    ("Y8@150", "links", "8@150"),
    ("T10 @ 100 c/c", "links", "10@100"),
    ("8 dia @ 200", "links", "8@200"),
    ("8φ-150 c/c", "links", "8@150"),
    ("clear cover 25 mm", "cover", "25"),
    ("CLEAR COVER TO BEAMS 25 mm", "cover", "25"),
    ("C.C. 40", "cover", "40"),
    ("Cover: 30mm", "cover", "30"),
    ("M25", "concrete_grade", "M25"),
    ("M 30", "concrete_grade", "M30"),
    ("Fe500", "steel_grade", "Fe500"),
    ("Fe 415", "steel_grade", "Fe415"),
    ("Fe500D", "steel_grade", "Fe500D"),
    ("SEISMIC ZONE III", "seismic_zone", "III"),
    ("Zone-IV", "seismic_zone", "IV"),
    ("MODERATE EXPOSURE", "exposure", "moderate"),
    ("Exposure: very severe", "exposure", "very_severe"),
    ("B12", "member", "B12"),
    ("C4", "member", "C4"),
    ("FB3", "member", "FB3"),
    ("B-12", "member", "B12"),
])
def test_every_notation(text, kind, value):
    assert only(text) == (kind, value)


def test_bar_values_are_what_the_engine_reads():
    """Canonical bar values go straight into Layer.bars, so model.parse_bars must read each one back."""
    for text in ("5-20", "2-25+1-20", "2#25", "8-T16", "3 nos 16φ", "4-12Φ"):
        value = only(text)[1]
        assert parse_bars(value), value


@pytest.mark.parametrize("text", [
    "520",              # no separator: is it 5-20 or 52-0? never guess
    "5 20",
    "1-2",              # 2 mm is not a bar size
    "3-15",             # nor is 15
    "123-20",           # three-digit count
    "5-200",            # three-digit diameter
    "2-8 @ 100",        # legs without L: not bars, and not a link we can read with confidence
    "23x45",            # section needs three or four digits each side
    "230x",
    "2300x45000",
    "8 @ 1500",         # spacing out of range
    "@150",
    "8φ 150",           # no @ and no c/c
    "c/c 150",
    "M10",              # not a structural grade
    "M2",
    "Fe41",
    "Fe 600x",
    "1:4:8 C.C.",       # cement concrete mix, not cover
    "C.C. 1:4:8",
    "ZONE",
    "b12",              # member ids are upper case
    "B",
    "C/C",
    "SEISMIC ZONE 7",
    "DRG NO 5-20/A",
])
def test_near_misses_do_not_match(text):
    found = [f for f in scan(text) if f[0] != "member"] if text not in ("b12", "B", "C/C") else scan(text)
    assert found == [], found


def test_links_take_precedence_over_bars():
    """'2L-8 @ 100' contains a count and a diameter, but it is two-legged 8 mm links at 100 mm, never bars 2-8."""
    assert [k for k, *_ in scan("B12 2L-8 @ 100 5-20")] == ["member", "links", "bars"]


def test_normalise_reads_gemini_values():
    assert normalise("bars", "B12 5 nos 20φ") == "5-20"
    assert normalise("seismic_zone", "III") == "III"
    assert normalise("cover", "25 mm") == "25"
    assert normalise("exposure", "Moderate") == "moderate"
    assert normalise("bars", "5-20 or 5-16") is None          # two readings: ambiguous, not a pick
    assert normalise("bars", "five twenty") is None


def test_normalise_reads_gemini_cyrillic_ef_and_greek_alpha_tonos_as_diameter():
    """Gemini writes the drawing's Ø as Cyrillic "Ф" (U+0424) in 31 values and Greek "Ά" (U+0386) in 25 values of
    the saved t3000 replies (counted from out/iith-t3000/replies). Read as Ø, "4Ф20+8Ф16" is 4 bars of 20 mm plus
    8 of 16 mm, "Ф8@200c/c" is 8 mm links at 200 mm, "2Ά12" is 2 bars of 12 mm: the same values as the Ø forms.
    Only Gemini's values: the page scanner never takes these letters for Ø, so a stray Ф on a sheet reads nothing."""
    assert normalise("bars", "4Ф20+8Ф16") == normalise("bars", "4Ø20+8Ø16") == "4-20 + 8-16"
    assert normalise("links", "Ф8@200c/c") == "8@200"
    assert normalise("bars", "2Ά12") == "2-12"
    assert not [f for f in scan("2Ά12 4Ф20") if f[0] == "bars"]


def test_parse_page_maps_matches_to_word_boxes(tmp_path: Path):
    """'8φ @ 150 c/c' is four words; the match covers all four and its box is their union."""
    page = ingest(make_pdf(tmp_path / "s.pdf"))[0]
    matches = parse_page(page)
    c4_ties = [m for m in matches if m.kind == "links" and m.text == "8φ @ 150 c/c" and m.box[0] > 400]
    assert len(c4_ties) == 1
    m = c4_ties[0]
    assert [w.text for w in m.words] == ["8φ", "@", "150", "c/c"]
    assert m.box == (min(w.box[0] for w in m.words), min(w.box[1] for w in m.words),
                     max(w.box[2] for w in m.words), max(w.box[3] for w in m.words))
    values = {(m.kind, m.value) for m in matches}
    assert {("section", "230x450"), ("bars", "2-25 + 1-20"), ("links", "2L-8@100"), ("cover", "25"),
            ("cover", "40"), ("seismic_zone", "III"), ("concrete_grade", "M25"), ("steel_grade", "Fe500")} <= values
    assert not [m for m in matches if m.kind == "bars" and m.text.startswith("1.")]   # note numbers are not bars


def test_separate_text_objects_join_into_one_callout():
    """CAD exports often write each token as its own text object, in different PyMuPDF blocks. Words on one
    baseline less than a text height apart still read as one callout; a far word does not join."""
    page = Page(1, 842, 595, words=[
        Word("8φ", (100, 100, 115, 112), 1, (0, 0)), Word("@", (100, 114, 115, 120), 1, (1, 0)),
        Word("150", (100, 122, 115, 135), 1, (2, 0)), Word("c/c", (100, 137, 115, 148), 1, (3, 0)),
        Word("5-20", (100, 400, 115, 420), 1, (4, 0)),
    ])
    found = {(m.kind, m.value) for m in parse_page(page)}
    assert found == {("links", "8@150"), ("bars", "5-20")}


def test_inverted_beam_sections_keep_inv_flag_and_never_match_plain():
    """Item 1: '-inv' on YB16(200x600-inv) and XB8(200x450/200x600-inv) stays on the canonical value so neither
    channel can accept an inverted beam as a plain section."""
    assert [(k, v) for k, v, *_ in scan("YB16(200x600-inv)")] == [("member", "YB16"), ("section", "200x600-inv")]
    assert [(k, v) for k, v, *_ in scan("XB8(200x450/200x600-inv)")] == [
        ("member", "XB8"), ("section", "200x450"), ("section", "200x600-inv")]
    assert only("200x1475-INV") == ("section", "200x1475-inv")
    assert only("200x600(inv)") == ("section", "200x600-inv")
    assert normalise("section", "200x600-inv") == "200x600-inv"
    assert normalise("section", "200x600") == "200x600"
    assert is_inverted_section("200x600-inv") is True
    assert is_inverted_section("200x600") is False


def test_agree_rejects_plain_section_for_inverted_and_sets_inverted_flag():
    """On sheet 18, YB16(200x600-inv): if Gemini drops '-inv' and writes '200x600', agreement rejects it as a
    disagreement; when both channels read '200x600-inv', it is accepted with inverted=True so linking flags it."""
    page = Page(18, 842, 595, words=[
        Word("YB16(200x600-inv)", (100, 100, 115, 220), 18, (0, 0)),
    ])
    matches = parse_page(page)
    plain_read = [Read(Callout(member="YB16", field="section", value="200x600", box_2d=[100, 100, 115, 220], page=18),
                       (100, 100, 115, 220), "read-p18", "gemini-3.8-flash")]
    dis = agree(plain_read, matches, [page])
    assert dis.accepted == []
    assert [(t.member, t.field, t.reason) for t in dis.to_check] == [("YB16", "section", "disagree")]

    inv_read = [Read(Callout(member="YB16", field="section", value="200x600-inv", box_2d=[100, 100, 115, 220], page=18),
                     (100, 100, 115, 220), "read-p18", "gemini-3.8-flash")]
    acc = agree(inv_read, matches, [page])
    assert len(acc.accepted) == 1
    assert acc.accepted[0].value == "200x600-inv"
    assert acc.accepted[0].inverted is True
    assert acc.accepted[0].provenance()["inverted"] is True
