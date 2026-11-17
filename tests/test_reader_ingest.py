"""R1: pages render at 200 dpi and words come back with box_2d boxes that land on the ink in the rendered image,
including on rotated sheets."""
from pathlib import Path

import pytest

pymupdf = pytest.importorskip("pymupdf")

from reader_pdf import make_pdf  # noqa: E402

from rebartwin.reader.ingest import ingest, normalise_rect  # noqa: E402


def _word(page, text):
    return next(w for w in page.words if w.text == text)


def test_normalise_rect_by_hand():
    """A 100 x 50 pt rectangle at (421, 297.5) on an 842 x 595 pt page:
    xmin = 1000 * 421 / 842 = 500, ymin = 1000 * 297.5 / 595 = 500, xmax = 1000 * 521 / 842 = 618.8 -> 619,
    ymax = 1000 * 347.5 / 595 = 584.0 -> 584."""
    assert normalise_rect(421, 297.5, 521, 347.5, 842, 595) == (500, 500, 584, 619)


def test_renders_pages_and_words(tmp_path: Path):
    """842 pt at 200 dpi is 842 / 72 * 200 = 2338.9, so 2339 px wide; 595 pt is 1652.8, so 1653 px tall.
    'B12' starts at x = 40 pt, and 1000 * 40 / 842 = 47.5, so its xmin is 48."""
    pages = ingest(make_pdf(tmp_path / "sheet.pdf"), tmp_path / "out")
    assert len(pages) == 1
    image = tmp_path / "out" / "pages" / "page-1.png"
    assert image.is_file()
    pix = pymupdf.Pixmap(str(image))
    assert (pix.width, pix.height) == (2339, 1653)
    b12 = _word(pages[0], "B12")
    assert b12.box[1] == 48 and b12.page == 1
    assert {"230x450", "5-20", "8φ", "@", "c/c", "300x300"} <= {w.text for w in pages[0].words}


def _ink(pix, box) -> int:
    """Dark pixels inside a box_2d box of a pixmap."""
    y0, x0, y1, x1 = (round(box[0] * pix.height / 1000), round(box[1] * pix.width / 1000),
                      round(box[2] * pix.height / 1000), round(box[3] * pix.width / 1000))
    return sum(1 for y in range(y0, y1) for x in range(x0, x1) if sum(pix.pixel(x, y)[:3]) < 300)


def test_rotated_sheet_boxes_land_on_the_ink(tmp_path: Path):
    """With /Rotate 90 the page is 595 pt wide and 842 tall. PyMuPDF gives words in the unrotated space; mapped by
    the rotation matrix (x' = 595 - y, y' = x), 'B12' at x = 40 pt now starts at y' = 40 pt, so ymin = 1000 * 40 / 842
    = 48 (its xmin before rotation). The box must hold dark pixels in the rendered image."""
    flat = ingest(make_pdf(tmp_path / "flat.pdf"))[0]
    turned = ingest(make_pdf(tmp_path / "turned.pdf", rotate=90), tmp_path / "out")[0]
    assert (turned.width, turned.height) == (595, 842)
    a, b = _word(flat, "B12").box, _word(turned, "B12").box
    assert b[0] == a[1] == 48
    assert abs(b[1] - round(1000 * (595 - a[2] * 595 / 1000) / 595)) <= 1
    pix = pymupdf.Pixmap(turned.png)
    assert pix.width < pix.height
    assert _ink(pix, b) > 20
    assert _ink(pix, (b[0], 0, b[2], 30)) == 0          # and not on the blank margin beside it


def test_page_filter(tmp_path: Path):
    assert ingest(make_pdf(tmp_path / "s.pdf"), pages=[2]) == []


def test_probe_counts_words_and_annotations_without_text(tmp_path: Path):
    """The plain sheet has its words in the text layer and no comments. The SHX sheet has no words and one comment
    per string in the beam schedule (rows at y = 90 to 150: 5 headers + 3 beams x 5 cells = 20), all by
    'AutoCAD SHX Text', all merged as words. Neither needs OCR."""
    from reader_pdf import TEXT, make_shx_pdf
    from rebartwin.reader.ingest import probe
    expected = sum(1 for _, y, _ in TEXT if 90 <= y <= 150)
    assert expected == 20
    [plain] = probe(make_pdf(tmp_path / "plain.pdf"))
    assert plain["words"] > 50 and plain["annotations"] == {} and plain["comments"] == 0
    assert not plain["needs_ocr"]
    [shx] = probe(make_shx_pdf(tmp_path / "shx.pdf"))
    assert shx["words"] == 0 and shx["annotations"] == {"AutoCAD SHX Text": expected} and shx["comments"] == expected
    assert not shx["needs_ocr"] and isinstance(shx["paths"], int)
    assert all(isinstance(v, (int, bool, list, dict)) for v in shx.values() if v is not None)
    assert "230x450" not in str(shx) and "5-20" not in str(shx)          # counts only, never the text


@pytest.mark.parametrize("rotate", [0, 90])
def test_shx_annotations_become_words_on_the_ink(tmp_path: Path, rotate):
    """With the annotations as words, the parser finds the schedule values, and each annotation's box (its rect
    through the rotation matrix) lands on rendered ink, rotated or not."""
    from reader_pdf import make_shx_pdf
    from rebartwin.reader.parser import parse_page
    page = ingest(make_shx_pdf(tmp_path / "shx.pdf", rotate=rotate))[0]
    assert page.comments == 20 and page.text_words == 0 and not page.needs_ocr
    assert {w.source for w in page.words} == {"annotation"}
    values = {(m.kind, m.value) for m in parse_page(page)}
    assert {("section", "230x450"), ("bars", "5-20"), ("links", "2L-8@100"), ("member", "B13")} <= values
    pix = pymupdf.Pixmap(page.png)
    b12 = _word(page, "B12")
    assert _ink(pix, b12.box) > 10
