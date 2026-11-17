"""The split-Ø join in the parser's token layer, and label ties (same text, nearest within 1.5 text heights,
ambiguous when another label is within 3). Geometry is built by hand in points on a 2384 x 1684 pt sheet, the IIT
Hyderabad A1 detail sheets' size, where one box unit is 2.384 pt across and 1.684 pt down."""
import pytest

from rebartwin.reader.agree import agree
from rebartwin.reader.gemini import Callout, Read
from rebartwin.reader.ingest import Page, Word
from rebartwin.reader.parser import parse_page, visual_lines
from rebartwin.reader.tokens import token_words

W, H = 2384.0, 1684.0


def word(text, x0, y0, x1, y1, source="annotation"):
    """A word from a box in points."""
    return Word(text, (1000 * y0 / H, 1000 * x0 / W, 1000 * y1 / H, 1000 * x1 / W), 1, (0, 0), source)


def page(*words):
    return Page(1, W, H, list(words))


# --- the join ---------------------------------------------------------------------------------------------------------

def sheet17():
    """As measured on sheet 17: '2 16' is 23 pt wide (x 160 to 183), 12 pt tall; the 'O' is 10 pt wide and sits at
    x 165 to 175, over the space. By character position the space spans 160 + 23/4 = 165.75 to 171.5 pt; the O's
    centre, 170, is inside it."""
    return word("2 16", 160, 100, 183, 112), word("O", 165, 100, 175, 112)


def test_a_split_callout_is_joined_in_the_parsers_view_only():
    nd, o = sheet17()
    p = page(nd, o, word("XB1", 140, 100, 155, 112))
    tokens = token_words(p)
    [joined] = [w for w in tokens if w.joined]
    assert joined.text == "2Ø16" and joined.joined == ("2 16", "O")
    assert nd not in tokens and o not in tokens                      # the parts are replaced in the view ...
    assert p.words[0].text == "2 16" and p.words[1].text == "O"      # ... and never changed where they are stored
    assert ("bars", "2-16") in {(m.kind, m.value) for m in parse_page(p)}
    raw = [" ".join(w.text for w in line) for line in visual_lines(p, tokens=False)]
    assert not any("Ø" in line for line in raw)                     # Gemini's prompt sees the comments as stored


def test_three_comments_n_o_d_are_joined():
    """'2' (x 160 to 166), 'O' (x 168 to 176), '16' (x 178 to 190), 12 pt tall: gaps of 2 pt, under half a height."""
    p = page(word("2", 160, 100, 166, 112), word("O", 168, 100, 176, 112), word("16", 178, 100, 190, 112))
    [joined] = [w for w in token_words(p) if w.joined]
    assert joined.text == "2Ø16" and joined.joined == ("2", "O", "16")


@pytest.mark.parametrize("o", [
    word("O", 185, 100, 195, 112),        # beside the numbers, not over the space
    word("O", 165, 106, 175, 118),        # 6 pt below the baseline: more than a quarter of the height
    word("O", 165, 100, 175, 120),        # 20 pt tall against 12: not the same text
    word("0", 165, 100, 175, 112),        # a zero, not exactly 'O'
])
def test_no_join_when_the_geometry_does_not_fit(o):
    nd, _ = sheet17()
    assert not [w for w in token_words(page(nd, o)) if w.joined]


def test_no_join_when_two_os_fit_the_same_numbers():
    nd, o = sheet17()
    assert not [w for w in token_words(page(nd, o, word("O", 166, 100, 176, 112))) if w.joined]


def test_text_layer_words_are_never_joined():
    p = page(word("2 16", 160, 100, 183, 112, "text"), word("O", 165, 100, 175, 112, "text"))
    assert not [w for w in token_words(p) if w.joined]


def test_a_joined_value_is_accepted_only_if_gemini_reads_it_and_provenance_says_joined():
    nd, o = sheet17()
    p = page(nd, o, word("XB1", 140, 100, 155, 112))
    m = next(m for m in parse_page(p) if m.kind == "bars")
    box = tuple(round(v) for v in m.box)
    top = Read(Callout(member="XB1", field="top", value="2φ16", box_2d=list(box)), box, "t", "m")
    [a] = agree([top], parse_page(p), [p]).accepted
    assert a.value == "2-16" and a.provenance()["joined_from"] == ["2 16", "O"]
    wrong = Read(Callout(member="XB1", field="top", value="2φ20", box_2d=list(box)), box, "t", "m")
    result = agree([wrong], parse_page(p), [p])
    assert result.accepted == [] and result.to_check[0].reason == "disagree"


# --- label ties ----------------------------------------------------------------------------------------------------------

def size_read(member, m):
    box = tuple(round(v) for v in m.box)
    return Read(Callout(member=member, field="section", value=m.value.replace("x", " X "), box_2d=list(box)), box,
                "t", "m")


def test_label_in_the_same_comment():
    """'XB1(200x600-inv)' is one comment: the label and the size share the word, so XB1 is its label, whatever
    lies to its left; XB2 for it disagrees."""
    p = page(word("XB1(200x600-inv)", 300, 100, 400, 112), word("XB9", 250, 100, 270, 112))
    m = next(m for m in parse_page(p) if m.kind == "section")
    assert [a.member for a in agree([size_read("XB1", m)], parse_page(p), [p]).accepted] == ["XB1"]
    result = agree([size_read("XB2", m)], parse_page(p), [p])
    assert result.accepted == [] and result.to_check[0].reason == "disagree" and "XB1" in result.to_check[0].detail


def plan(*others):
    """A plan callout: size '200x450' (x 300 to 340, y 100 to 112, 12 pt tall) with its label 'XB8' just above
    (y 85 to 97: 3 pt gap, a quarter of a height), and another beam's label far along the row to its left."""
    return page(word("200x450", 300, 100, 340, 112), word("XB8", 305, 85, 330, 97),
                word("YB4", 100, 100, 120, 112), *others)


def test_nearest_label_within_one_and_a_half_heights():
    """The row rule alone would pick YB4 (to the left in the row). XB8 is 3 pt away, within 1.5 x 12 = 18 pt: XB8."""
    p = plan()
    m = next(m for m in parse_page(p) if m.kind == "section")
    assert [a.member for a in agree([size_read("XB8", m)], parse_page(p), [p]).accepted] == ["XB8"]
    result = agree([size_read("YB4", m)], parse_page(p), [p])
    assert result.accepted == [] and result.to_check[0].reason == "disagree"


def test_a_second_label_within_three_heights_is_ambiguous():
    """YB5 sits below the size at y 125 to 137: a 13 pt gap, within 3 x 12 = 36 pt. Two labels that close: neither."""
    p = plan(word("YB5", 305, 125, 330, 137))
    m = next(m for m in parse_page(p) if m.kind == "section")
    result = agree([size_read("XB8", m)], parse_page(p), [p])
    assert result.accepted == [] and result.to_check[0].reason == "ambiguous"
    assert "XB8, YB5" in result.to_check[0].detail


def test_a_label_beyond_three_heights_does_not_crowd():
    """YB5 at y 150 to 162 is 38 pt below: beyond 36 pt, so XB8 stands."""
    p = plan(word("YB5", 305, 150, 330, 162))
    m = next(m for m in parse_page(p) if m.kind == "section")
    assert [a.member for a in agree([size_read("XB8", m)], parse_page(p), [p]).accepted] == ["XB8"]


def test_one_value_on_the_drawing_backs_one_field():
    """Seen live on sheet 17: Gemini gave XB16's top and its bottom at the same place, and both agreed with the one
    '2Ø12' there. One value cannot be both faces, so neither is accepted. Two members in one row sharing a value in
    the same field stay accepted."""
    nd, o = sheet17()
    p = page(nd, o, word("XB16", 140, 100, 155, 112))
    m = next(m for m in parse_page(p) if m.kind == "bars")
    box = tuple(round(v) for v in m.box)
    top = Read(Callout(member="XB16", field="top", value="2φ12".replace("12", "16"), box_2d=list(box)), box, "t", "m")
    bottom = Read(Callout(member="XB16", field="bottom", value="2φ16", box_2d=list(box)), box, "t", "m")
    result = agree([top, bottom], parse_page(p), [p])
    assert result.accepted == []
    assert sorted(t.field for t in result.to_check) == ["bottom", "top"]
    assert all(t.reason == "ambiguous" and "XB16 bottom and XB16 top" in t.detail for t in result.to_check)


def test_two_members_sharing_one_value_in_one_field_stay():
    """'B1, B2' then '230x450' in one row: the size is both beams' section."""
    p = page(word("B1,", 100, 100, 115, 112, "text"), word("B2", 118, 100, 130, 112, "text"),
             word("230x450", 200, 100, 240, 112, "text"))
    m = next(m for m in parse_page(p) if m.kind == "section")
    reads = [size_read("B1", m), size_read("B2", m)]
    assert sorted(a.member for a in agree(reads, parse_page(p), [p]).accepted) == ["B1", "B2"]


# --- ruled schedules by storey (sheet 8's layout) -------------------------------------------------------------------

def storey_table():
    """Box units on a 2384 x 3370 pt sheet. Two storey groups, each three narrow sub-columns (size, main, spare) and a
    sketch column titled by the storey header; rows are not ruled (one body from y 60 to 400), as on sheet 8.
    Group 1 spans x 100 to 230 (table left edge to the right rule of its header's sketch column), group 2 x 230 to
    360. Column marks sit in the sketch column, to the right of their values, at the same height."""
    hs = [(20.0, 100.0, 360.0), (60.0, 100.0, 360.0), (400.0, 100.0, 360.0)]
    vs = [(x, 20.0, 400.0) for x in (100.0, 110.0, 120.0, 130.0, 230.0, 240.0, 250.0, 260.0, 360.0)]
    def w(text, y0, x0, y1, x1):
        return Word(text, (y0, x0, y1, x1), 1, (0, 0), "ocr")
    words = [w("FOUNDATION", 30, 140, 38, 200), w("TO", 30, 202, 38, 210), w("FIRST", 40, 150, 48, 180),
             w("FLOOR", 40, 182, 48, 215),
             w("FIRST", 30, 270, 38, 300), w("FLOOR", 30, 302, 38, 335), w("TO", 30, 337, 38, 345),
             w("TERRACE", 40, 275, 48, 320), w("FLOOR", 40, 322, 48, 350),
             w("300x450", 100, 101, 130, 109), w("8Ø20", 100, 111, 130, 119), w("C1A", 110, 170, 120, 190),
             w("300x450", 100, 231, 130, 239), w("8Ø16", 100, 241, 130, 249), w("C1A", 110, 300, 120, 320),
             w("230x450", 200, 231, 230, 239), w("4Ø12", 200, 241, 230, 249), w("C1B", 210, 300, 220, 320)]
    return Page(1, 2384, 3370, words, h_rules=hs, v_rules=vs)


def bars_at(p, value):
    return next(m for m in parse_page(p) if m.kind == "bars" and m.value == value)


def col_read(member, m, level):
    box = tuple(round(v) for v in m.box)
    return Read(Callout(member=member, field="main", value=m.value, box_2d=list(box), level=level), box, "t", "m")


def test_storey_group_owns_its_sub_columns():
    """8Ø16 is in sub-column x 240 to 250, under no header text, but inside group 2 (230 to 360): its storey is
    group 2's header. 8Ø20 at x 110 to 120 is in group 1 (table left edge 100 to 230)."""
    from rebartwin.reader.agree import _storey_header
    p = storey_table()
    assert _storey_header(p, bars_at(p, "8-16").box) == "FIRST FLOOR TO TERRACE FLOOR"
    assert _storey_header(p, bars_at(p, "8-20").box) == "FOUNDATION TO FIRST FLOOR"


def test_column_mark_ties_by_row_and_group_not_distance():
    """C1A's mark sits to the right of 8Ø16 in the same row and group: tied. C1B is the mark of the row below, so
    C1B for 8Ø16 disagrees; C1B for 4Ø12 is tied. The two C1A marks (one per group) and C1B are all within a few text
    heights, but inside a ruled table distance does not crowd."""
    p = storey_table()
    upper = "FIRST FLOOR TO TERRACE FLOOR"
    [a] = agree([col_read("C1A", bars_at(p, "8-16"), upper)], parse_page(p), [p]).accepted
    assert (a.member, a.value, a.level) == ("C1A", "8-16", upper)
    result = agree([col_read("C1B", bars_at(p, "8-16"), upper)], parse_page(p), [p])
    assert result.accepted == [] and result.to_check[0].reason == "disagree" and "C1A" in result.to_check[0].detail
    [b] = agree([col_read("C1B", bars_at(p, "4-12"), upper)], parse_page(p), [p]).accepted
    assert (b.member, b.value) == ("C1B", "4-12")
    [c] = agree([col_read("C1A", bars_at(p, "8-20"), "FOUNDATION TO FIRST FLOOR")], parse_page(p), [p]).accepted
    assert c.level == "FOUNDATION TO FIRST FLOOR"
