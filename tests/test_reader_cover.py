"""The clear-cover table (item 4 follow-up): read as a table, scoped by its rows, and one project item per reading."""
from __future__ import annotations

from reader_pdf import make_cover_table_pdf  # noqa: E402

from rebartwin.reader.agree import agree  # noqa: E402
from rebartwin.reader.gemini import Callout, Read  # noqa: E402
from rebartwin.reader.ingest import ingest  # noqa: E402
from rebartwin.reader.parser import parse_page  # noqa: E402


def _read(page: int, member: str, field: str, value: str, box) -> Read:
    return Read(Callout(member=member, field=field, value=value, box_2d=[round(v) for v in box], page=page),
                tuple(box), "t", "m")


def test_the_cover_table_gives_scoped_values(tmp_path):
    """Row COLUMNS, column CLEAR COVER: 40 mm for ALL_COLUMNS; row BEAMS: 25 mm for ALL_BEAMS."""
    page = ingest(make_cover_table_pdf(tmp_path / "t.pdf", pages=1))[0]
    covers = sorted((m.value, m.scope) for m in parse_page(page) if m.kind == "cover")
    assert covers == [("25", "ALL_BEAMS"), ("40", "ALL_COLUMNS")]


def test_a_cover_in_another_row_disagrees_and_repeats_collapse(tmp_path):
    """Both sheets repeat the table. Gemini reads ALL_COLUMNS 40 mm on both (one accepted field, rule 7) and calls the
    BEAMS row's 25 mm ALL_COLUMNS on page 1 (disagree: wrong row). On both pages it reads exposure "moderate" where
    the sheet shows nothing (missing): one project item, naming page 2. On page 2 it reads ALL_BEAMS 25 mm in an
    empty corner (missing), dropped because ALL_BEAMS 25 is accepted from page 1's table."""
    pages = ingest(make_cover_table_pdf(tmp_path / "t.pdf"))
    cell = {(p.number, m.scope): m.box for p in pages for m in parse_page(p) if m.kind == "cover"}
    empty = (900.0, 900.0, 910.0, 950.0)
    reads = [_read(1, "ALL_COLUMNS", "cover", "40 mm", cell[(1, "ALL_COLUMNS")]),
             _read(2, "ALL_COLUMNS", "cover", "40 mm", cell[(2, "ALL_COLUMNS")]),
             _read(1, "ALL_BEAMS", "cover", "25 mm", cell[(1, "ALL_BEAMS")]),
             _read(1, "ALL_COLUMNS", "cover", "25 mm", cell[(1, "ALL_BEAMS")]),
             _read(1, "ALL", "exposure", "moderate", empty), _read(2, "ALL", "exposure", "moderate", empty),
             _read(2, "ALL_BEAMS", "cover", "25 mm", empty)]
    result = agree(reads, [m for p in pages for m in parse_page(p)], pages)
    assert sorted((a.member, a.value) for a in result.accepted if a.field == "cover") == [
        ("ALL_BEAMS", "25"), ("ALL_COLUMNS", "40")]
    items = [(t.member, t.field, t.reason) for t in result.to_check]
    assert sorted(items) == [("ALL", "exposure", "missing"), ("ALL_COLUMNS", "cover", "disagree")]
    wrong = next(t for t in result.to_check if t.field == "cover")
    assert "ALL_BEAMS row" in wrong.detail
    exposure = next(t for t in result.to_check if t.field == "exposure")
    assert exposure.detail.endswith("(the same reading on page 2)")
