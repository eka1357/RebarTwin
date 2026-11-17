"""Comments merged with the text layer, AutoCAD control codes, and OCR for sheets whose text was exported as lines,
all with no key."""
import json
from pathlib import Path

import pytest

pytest.importorskip("pymupdf")

from reader_pdf import make_mixed_pdf, make_pdf, make_vector_pdf  # noqa: E402

from rebartwin.reader import ocr as ocr_mod  # noqa: E402
from rebartwin.reader.agree import agree  # noqa: E402
from rebartwin.reader.gemini import Callout, Read, ReadError, prompt, tiles  # noqa: E402
from rebartwin.reader.ingest import autocad, ingest  # noqa: E402
from rebartwin.reader.ocr import CachingOcr, RecordedOcr, VisionTransport, ocr_pages, words_from  # noqa: E402
from rebartwin.reader.parser import parse_page  # noqa: E402

FIXTURES = Path(__file__).parent / "fixtures" / "reader"


# --- comments and AutoCAD codes ----------------------------------------------------------------------------------

@pytest.mark.parametrize("raw, shown", [
    ("10%%C", "10Ø"), ("8%%c @ 150 C/C", "8Ø @ 150 C/C"), ("%%UCOLUMN SCHEDULE%%u", "COLUMN SCHEDULE"),
    ("%%OTOP%%O", "TOP"), ("90%%D", "90°"), ("%%P0.000", "±0.000"), ("50%%%", "50%"), ("  2-16   +  1-12 ", "2-16 + 1-12"),
])
def test_autocad_codes(raw, shown):
    assert autocad(raw) == shown


def test_comments_are_merged_with_words_and_repeats_dropped(tmp_path: Path):
    """The sheet has a full text layer (so the old 'more than twice the words' switch would never fire) plus three
    comments. The one repeating the plan's 'B12' in the same place is dropped; the other two are kept, codes
    translated, and the parser reads the new callout as 8 mm links at 200 mm."""
    page = ingest(make_mixed_pdf(tmp_path / "m.pdf"))[0]
    plain = ingest(make_pdf(tmp_path / "p.pdf"))[0]
    assert page.text_words == len(plain.words) > 50
    assert page.annotations == {"AutoCAD SHX Text": 3} and page.comments == 2
    kept = sorted(w.text for w in page.words if w.source == "annotation")
    assert kept == ["8Ø @ 200 C/C", "COLUMN DETAIL"]
    assert sum(w.text == "B12" for w in page.words) == sum(w.text == "B12" for w in plain.words)
    assert ("links", "8@200") in {(m.kind, m.value) for m in parse_page(page)}
    assert not page.needs_ocr


# --- OCR ----------------------------------------------------------------------------------------------------------

@pytest.fixture
def vector(tmp_path):
    return ingest(make_vector_pdf(tmp_path / "v.pdf"))[0]


def test_a_sheet_of_lines_needs_ocr(vector):
    assert vector.needs_ocr and vector.words == [] and vector.comments == 0


def test_ocr_words_by_hand(vector):
    """One tile, 2339 x 1653 px. 'C4' spans x 300 to 340, y 400 to 430 px: xmin = 1000 x 300 / 2339 = 128.3 -> 128,
    xmax = 1000 x 340 / 2339 = 145.4 -> 145, ymin = 1000 x 400 / 1653 = 242.0 -> 242, ymax = 1000 x 430 / 1653 =
    260.1 -> 260. The rotated '8Ø' quadrilateral (x 900 to 940, y 400 to 430) becomes its bounding box. 'TOP' has
    x omitted where it is 0. The whole-text entry is skipped."""
    [tile] = tiles(vector)
    body = json.loads((FIXTURES / "ocr-p1-t0.json").read_text(encoding="utf-8"))
    words = words_from(body, tile, 1)
    assert [w.text for w in words] == ["C4", "300x450", "8-16", "8Ø", "@", "150", "c/c", "TOP"]
    assert words[0].box == (242, 128, 260, 145) and words[0].source == "ocr"
    assert words[3].box == (242, round(1000 * 900 / 2339), 260, round(1000 * 940 / 2339))
    assert words[-1].box[1] == 0


def test_ocr_words_go_through_the_same_parser(vector, tmp_path):
    skipped = ocr_pages([vector], CachingOcr(RecordedOcr(FIXTURES), tmp_path / "replies"))
    assert skipped == [] and vector.ocr_words == 8
    found = {(m.kind, m.value) for m in parse_page(vector)}
    assert {("member", "C4"), ("section", "300x450"), ("bars", "8-16"), ("links", "8@150")} <= found


def test_ocr_words_stay_out_of_geminis_prompt(vector, tmp_path):
    """On a page only OCR can read, Gemini gets the image and no words, so the two readings stay independent."""
    ocr_pages([vector], CachingOcr(RecordedOcr(FIXTURES), tmp_path / "replies"))
    [tile] = tiles(vector)
    text = prompt(vector, tile, 1)
    assert "(this image has no text layer)" in text
    assert "300x450" not in text and "8-16" not in text


def test_gemini_and_ocr_agree_on_a_page_of_lines(vector, tmp_path):
    """Gemini read the image alone; the parser read Vision's words. Same value in the same place: accepted. Two
    readings of one value that differ are never picked between."""
    ocr_pages([vector], CachingOcr(RecordedOcr(FIXTURES), tmp_path / "replies"))
    box = (241, 298, 262, 336)
    right = Read(Callout(member="C4", field="main", value="8-16", box_2d=list(box)), box, "t", "m")
    wrong = Read(Callout(member="C4", field="main", value="8-20", box_2d=list(box)), box, "t", "m")
    result = agree([right], parse_page(vector), [vector])
    assert [(a.member, a.field, a.value) for a in result.accepted] == [("C4", "main", "8-16")]
    result = agree([wrong], parse_page(vector), [vector])
    assert result.accepted == [] and result.to_check[0].reason == "disagree"


def test_ocr_replies_are_saved_and_replayed(vector, tmp_path):
    first = CachingOcr(RecordedOcr(FIXTURES), tmp_path / "replies")
    ocr_pages([vector], first)
    assert [c.cached for c in first.ledger] == [False] and first.ledger[0].model == "vision:DOCUMENT_TEXT_DETECTION"
    again = ingest(make_vector_pdf(tmp_path / "v2.pdf"))[0]
    replay = CachingOcr(None, tmp_path / "replies")
    assert ocr_pages([again], replay) == [] and again.ocr_words == 8
    assert [c.cached for c in replay.ledger] == [True]


def test_no_key_and_no_saved_reply_skips_the_page(vector, tmp_path):
    assert ocr_pages([vector], CachingOcr(None, tmp_path / "empty")) == [1]
    assert vector.words == []


def test_vision_key_goes_in_a_header_not_the_url(monkeypatch):
    sent = {}

    class Reply:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def read(self):
            return b'{"responses": [{}]}'

    def urlopen(request, timeout):
        sent["url"], sent["headers"], sent["body"] = request.full_url, dict(request.header_items()), request.data
        return Reply()

    monkeypatch.setattr(ocr_mod.urllib.request, "urlopen", urlopen)
    assert VisionTransport(api_key="secret-key").annotate(key="k", png=b"png") == {"responses": [{}]}
    assert "secret-key" not in sent["url"] and sent["headers"]["X-goog-api-key"] == "secret-key"
    assert json.loads(sent["body"])["requests"][0]["features"] == [{"type": "DOCUMENT_TEXT_DETECTION"}]
    monkeypatch.delenv("VISION_API_KEY", raising=False)
    with pytest.raises(ReadError, match="VISION_API_KEY"):
        VisionTransport()
