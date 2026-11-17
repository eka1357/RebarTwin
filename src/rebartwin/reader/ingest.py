"""R1: render each page to a PNG and return its text layer as words with boxes.

Boxes use Gemini's `box_2d` convention (integers 0 to 1000 relative to the rendered page image, in the order
`[ymin, xmin, ymax, xmax]`) so the parser channel and the Gemini channel can be compared without conversion.
PyMuPDF returns words in the unrotated page's space; drawings are often stored rotated (A1 sheets with /Rotate 90),
so each word is mapped through `page.rotation_matrix` into the space of the image we render and send.
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


@dataclass
class Page:
    number: int                          # 1-based
    width: float                         # points, after rotation
    height: float
    words: list[Word] = field(default_factory=list)
    image: Path | None = None
    png: bytes | None = field(default=None, repr=False)

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
            pix = page.get_pixmap(dpi=dpi)
            png = pix.tobytes("png")
            image = None
            if out is not None:
                image = out / "pages" / f"page-{number}.png"
                image.write_bytes(png)
            result.append(Page(number, rect.width, rect.height, words, image, png))
    return result
