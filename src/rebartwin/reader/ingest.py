"""R1: render each page to a PNG and return its text as words with boxes.

Boxes use Gemini's `box_2d` convention (integers 0 to 1000 relative to the rendered page image, in the order
`[ymin, xmin, ymax, xmax]`) so the parser channel and the Gemini channel can be compared without conversion.
PyMuPDF returns words in the unrotated page's space; drawings are often stored rotated (A1 sheets with /Rotate 90),
so each word is mapped through `page.rotation_matrix` into the space of the image we render and send.

A page's text comes from up to three places:

- the PDF text layer (`source` "text");
- comments (annotations with content). AutoCAD draws SHX-font text as strokes and keeps the string in an
  "AutoCAD SHX Text" comment, so on many sheets the callouts are only there while the title block is real text.
  Comments are always merged with the words, one word per comment, with AutoCAD's control codes translated; a
  comment that repeats a text-layer word in the same place is dropped (`source` "annotation");
- OCR, for pages with neither (text exported as lines). That runs later, in `ocr.py`; here a page is only marked
  `needs_ocr` (`source` "ocr").
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

Box = tuple[int, int, int, int]          # ymin, xmin, ymax, xmax, 0..1000

OCR_BELOW_WORDS = 20                     # a page with no comments and fewer text words than this is read by OCR


@dataclass(frozen=True)
class Word:
    text: str
    box: Box
    page: int                            # 1-based, as people number sheets
    line: tuple[int, int]                # PyMuPDF (block, line): words of one text entity share it
    source: str = "text"                 # "text" (the PDF text layer), "annotation" (a comment) or "ocr"


@dataclass
class Page:
    number: int                          # 1-based
    width: float                         # points, after rotation
    height: float
    words: list[Word] = field(default_factory=list)
    image: Path | None = None
    png: bytes | None = field(default=None, repr=False)
    text_words: int = 0                  # words in the text layer
    annotations: dict[str, int] = field(default_factory=dict)   # comments with content, by author
    comments: int = 0                    # comments merged as words (after dropping repeats)
    needs_ocr: bool = False
    ocr_words: int = 0

    def lines(self) -> list[list[Word]]:
        """Words grouped by text entity, in reading order inside each entity."""
        groups: dict[tuple[int, int], list[Word]] = {}
        for w in self.words:
            groups.setdefault(w.line, []).append(w)
        return list(groups.values())


def normalise_rect(x0: float, y0: float, x1: float, y1: float, width: float, height: float) -> Box:
    """Points to box_2d. Clamped, and never zero-height, so overlap tests stay defined."""
    def scale(v: float, size: float) -> int:
        return max(0, min(1000, round(1000 * v / size)))
    ymin, xmin, ymax, xmax = scale(y0, height), scale(x0, width), scale(y1, height), scale(x1, width)
    return ymin, xmin, max(ymax, ymin + 1), max(xmax, xmin + 1)


_CODES = {"c": "Ø", "d": "°", "p": "±", "%": "%", "u": "", "o": ""}
_CODE = re.compile(r"%%([cCdDpPuUoO%])")


def autocad(text: str) -> str:
    """AutoCAD's control codes as the drawing shows them: %%C is Ø, %%D is °, %%P is ±, %%% is %; %%U and %%O
    (underline and overline on and off) are dropped. Whitespace is collapsed."""
    return " ".join(_CODE.sub(lambda m: _CODES[m.group(1).lower()], text).split())


def _squash(text: str) -> str:
    return "".join(text.split()).upper()


def _centre_in(box: Box, outer: Box, pad: int = 3) -> bool:
    cy, cx = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
    return outer[0] - pad <= cy <= outer[2] + pad and outer[1] - pad <= cx <= outer[3] + pad


def _page_text(page, number: int) -> tuple[list[Word], dict[str, int], int]:
    """Text-layer words plus comments as words; comments by author; comments kept."""
    import pymupdf

    rect, matrix = page.rect, page.rotation_matrix

    def box_of(r) -> Box:
        r = r * matrix
        return normalise_rect(r.x0, r.y0, r.x1, r.y1, rect.width, rect.height)

    words = [Word(text, box_of(pymupdf.Rect(x0, y0, x1, y1)), number, (block, line))
             for x0, y0, x1, y1, text, block, line, _ in page.get_text("words", sort=True)]
    by_author: dict[str, int] = {}
    kept = 0
    for k, a in enumerate(page.annots() or []):
        content = autocad(a.info.get("content") or "")
        if not content:
            continue
        author = a.info.get("title") or "(no author)"
        by_author[author] = by_author.get(author, 0) + 1
        box = box_of(a.rect)
        under = sorted((w for w in words if w.source == "text" and _centre_in(w.box, box)), key=lambda w: w.box[1])
        if under and _squash("".join(w.text for w in under)) == _squash(content):
            continue                                   # the text layer already has it, in the same place
        words.append(Word(content, box, number, (-1, k), "annotation"))
        kept += 1
    return words, by_author, kept


def needs_ocr(text_words: int, comments: int) -> bool:
    """No comments and next to no words: the text was exported as lines, so only OCR can read it."""
    return comments == 0 and text_words < OCR_BELOW_WORDS


def ingest(pdf: Path, out: Path | None = None, dpi: int = 200, pages: list[int] | None = None) -> list[Page]:
    """Render pages to `out/pages/page-<n>.png` (when `out` is given) and return their words.

    `pages` limits the work to those 1-based page numbers. The PNG bytes are kept on each page for the Gemini channel.
    """
    import pymupdf

    result: list[Page] = []
    if out is not None:
        (out / "pages").mkdir(parents=True, exist_ok=True)
    with pymupdf.open(pdf) as doc:
        for index, page in enumerate(doc):
            number = index + 1
            if pages and number not in pages:
                continue
            words, by_author, kept = _page_text(page, number)
            png = page.get_pixmap(dpi=dpi).tobytes("png")
            image = None
            if out is not None:
                image = out / "pages" / f"page-{number}.png"
                image.write_bytes(png)
            n_text = sum(w.source == "text" for w in words)
            result.append(Page(number, page.rect.width, page.rect.height, words, image, png, text_words=n_text,
                               annotations=by_author, comments=kept, needs_ocr=needs_ocr(n_text, kept)))
    return result


def probe(pdf: Path) -> list[dict]:
    """Per page: text-layer words, comments by author, comments merged as words, whether OCR is needed, and the
    vector path count. Counts only; no text."""
    import pymupdf

    rows = []
    with pymupdf.open(pdf) as doc:
        for index, page in enumerate(doc):
            words, by_author, kept = _page_text(page, index + 1)
            n_text = sum(w.source == "text" for w in words)
            rows.append({"page": index + 1, "size_pt": [round(page.rect.width), round(page.rect.height)],
                         "rotation": page.rotation, "words": n_text, "annotations": by_author, "comments": kept,
                         "paths": len(page.get_drawings()), "needs_ocr": needs_ocr(n_text, kept)})
    return rows
