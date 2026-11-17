"""R1: render each page to a PNG and return its text layer as words with boxes.

Boxes use Gemini's `box_2d` convention (integers 0 to 1000 relative to the rendered page image, in the order
`[ymin, xmin, ymax, xmax]`) so the parser channel and the Gemini channel can be compared without conversion.
PyMuPDF returns words in the unrotated page's space; drawings are often stored rotated (A1 sheets with /Rotate 90),
so each word is mapped through `page.rotation_matrix` into the space of the image we render and send.

Some CAD exports (AutoCAD's SHX fonts) draw text as vector strokes and put the string in an annotation instead
("AutoCAD SHX Text"). The page then has few words and many annotations with content; on such a page the annotations
become the text layer, one word per annotation, so the parser channel still has something to read.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

Box = tuple[int, int, int, int]          # ymin, xmin, ymax, xmax, 0..1000


@dataclass(frozen=True)
class Word:
    text: str
    box: Box
    page: int                            # 1-based, as people number sheets
    line: tuple[int, int]                # PyMuPDF (block, line): words of one text entity share it
    source: str = "text"                 # "text" (the PDF text layer) or "annotation"


@dataclass
class Page:
    number: int                          # 1-based
    width: float                         # points, after rotation
    height: float
    words: list[Word] = field(default_factory=list)
    image: Path | None = None
    png: bytes | None = field(default=None, repr=False)
    text_words: int = 0                  # words in the text layer
    annotations: dict[str, int] = field(default_factory=dict)   # annotations with content, by author
    uses_annotations: bool = False

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
            rect, matrix = page.rect, page.rotation_matrix
            words = []
            for x0, y0, x1, y1, text, block, line, _ in page.get_text("words", sort=True):
                r = pymupdf.Rect(x0, y0, x1, y1) * matrix
                words.append(Word(text, normalise_rect(r.x0, r.y0, r.x1, r.y1, rect.width, rect.height),
                                  number, (block, line)))
            notes = _annotations(page)
            by_author: dict[str, int] = {}
            for author, _, _ in notes:
                by_author[author] = by_author.get(author, 0) + 1
            use = use_annotations(len(words), len(notes))
            if use:
                for k, (_, content, r) in enumerate(notes):
                    r = r * matrix
                    box = normalise_rect(r.x0, r.y0, r.x1, r.y1, rect.width, rect.height)
                    words.append(Word(" ".join(content.split()), box, number, (-1, k), "annotation"))
            pix = page.get_pixmap(dpi=dpi)
            png = pix.tobytes("png")
            image = None
            if out is not None:
                image = out / "pages" / f"page-{number}.png"
                image.write_bytes(png)
            result.append(Page(number, rect.width, rect.height, words, image, png,
                               text_words=sum(w.source == "text" for w in words), annotations=by_author,
                               uses_annotations=use))
    return result


def _annotations(page) -> list[tuple[str, str, object]]:
    """(author, content, rect) for every annotation that carries text."""
    found = []
    for a in page.annots() or []:
        content = (a.info.get("content") or "").strip()
        if content:
            found.append((a.info.get("title") or "(no author)", content, a.rect))
    return found


def use_annotations(n_words: int, n_annotations: int) -> bool:
    """Few words and many annotations with content: the text is in the annotations (SHX text from AutoCAD)."""
    return n_annotations >= 10 and n_annotations > 2 * n_words


def probe(pdf: Path) -> list[dict]:
    """Per page: text-layer word count, annotations with content by author, and whether the parser will use the
    annotations. Counts only; no text."""
    import pymupdf

    rows = []
    with pymupdf.open(pdf) as doc:
        for index, page in enumerate(doc):
            n_words = len(page.get_text("words"))
            notes = _annotations(page)
            by_author: dict[str, int] = {}
            for author, _, _ in notes:
                by_author[author] = by_author.get(author, 0) + 1
            rows.append({"page": index + 1, "size_pt": [round(page.rect.width), round(page.rect.height)],
                         "rotation": page.rotation, "words": n_words, "annotations": by_author,
                         "uses_annotations": use_annotations(n_words, len(notes))})
    return rows
