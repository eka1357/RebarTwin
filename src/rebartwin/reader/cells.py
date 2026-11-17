"""Table cells from drawn ruling lines.

Schedules are tables, and on a sheet whose text is OCR'd or exported as comments the words carry no table structure:
neighbouring cells sit closer than a text height, so grouping by line runs a whole row into one string, and a header
written on two lines ("FOUNDATION TO" over "FIRST FLOOR") never reads as one. The table's own ruling lines fix both:
a word's cell is bounded by the nearest drawn horizontal line above and below it and the nearest vertical line to its
left and right, each crossing the word's centre. Words in one cell are one text run.

Only small cells count (at most `MAX_CELL_H` of the page high and `MAX_CELL_W` wide): the sheet border, title block
frames and plan grid bays are not table cells, and words in them keep the ordinary line grouping. A page with no
ruling lines groups exactly as before.
"""
from __future__ import annotations

from bisect import bisect_left, bisect_right

from .ingest import Box, Page, Rule, Word

MAX_CELL_H = 80.0        # box units: 8% of the page height
MAX_CELL_W = 300.0       # 30% of the page width
_BUCKETS = 64


class _Index:
    """Segments of one orientation, bucketed along their extent and sorted by position within a bucket."""

    def __init__(self, rules: list[Rule]):
        self.buckets: list[list[Rule]] = [[] for _ in range(_BUCKETS)]
        for r in rules:
            lo, hi = self._bucket(r[1]), self._bucket(r[2])
            for b in range(lo, hi + 1):
                self.buckets[b].append(r)
        for b in self.buckets:
            b.sort()
        self.keys = [[r[0] for r in b] for b in self.buckets]

    @staticmethod
    def _bucket(v: float) -> int:
        return max(0, min(_BUCKETS - 1, int(v * _BUCKETS / 1000)))

    def before(self, along: float, at: float) -> float | None:
        """Position of the nearest segment before `at` that spans `along`."""
        b = self._bucket(along)
        rules, keys = self.buckets[b], self.keys[b]
        for k in range(bisect_left(keys, at) - 1, -1, -1):
            if rules[k][1] <= along <= rules[k][2]:
                return rules[k][0]
        return None

    def after(self, along: float, at: float) -> float | None:
        b = self._bucket(along)
        rules, keys = self.buckets[b], self.keys[b]
        for k in range(bisect_right(keys, at), len(rules)):
            if rules[k][1] <= along <= rules[k][2]:
                return rules[k][0]
        return None


def _not_letters(page: Page) -> tuple[list[Rule], list[Rule]]:
    """Ruling lines minus the strokes of text drawn as lines. On a sheet whose lettering was exported as vector paths
    (OCR'd sheets), the crossbars of large letters pass the length test; they lie inside a word's box, while a table
    rule runs past the words it separates."""
    buckets: list[list[Box]] = [[] for _ in range(_BUCKETS)]
    for w in page.words:
        pad = 0.15 * (w.box[2] - w.box[0])
        b = (w.box[0] - pad, w.box[1] - pad, w.box[2] + pad, w.box[3] + pad)
        for k in range(_Index._bucket(b[0]), _Index._bucket(b[2]) + 1):
            buckets[k].append(b)

    def inside_word(y0: float, y1: float, x0: float, x1: float) -> bool:
        return any(b[0] <= y0 and y1 <= b[2] and b[1] <= x0 and x1 <= b[3]
                   for b in buckets[_Index._bucket((y0 + y1) / 2)])

    hs = [r for r in page.h_rules if not inside_word(r[0], r[0], r[1], r[2])]
    vs = [r for r in page.v_rules if not inside_word(r[1], r[2], r[0], r[0])]
    return hs, vs


def assign(page: Page) -> dict[int, Box]:
    """id(word) -> the small table cell holding the word's centre, for words in one. Cached on the page."""
    key = (id(page.words), len(page.words), len(page.h_rules), len(page.v_rules))
    cached = getattr(page, "_cells", None)
    if cached and cached[0] == key:
        return cached[1]
    out: dict[int, Box] = {}
    hs, vs = _not_letters(page)
    if hs and vs:
        h, v = _Index(hs), _Index(vs)
        for w in page.words:
            cy, cx = (w.box[0] + w.box[2]) / 2, (w.box[1] + w.box[3]) / 2
            top, bottom = h.before(cx, cy), h.after(cx, cy)
            left, right = v.before(cy, cx), v.after(cy, cx)
            if None in (top, bottom, left, right):
                continue
            if bottom - top > MAX_CELL_H or right - left > MAX_CELL_W:
                continue
            if bottom - top < 0.6 * (w.box[2] - w.box[0]):       # a stroke through the word, not a cell around it
                continue
            out[id(w)] = (top, left, bottom, right)
    object.__setattr__(page, "_cells", (key, out))
    return out


def cell_lines(page: Page) -> tuple[list[list[Word]], list[Word]]:
    """Words grouped by cell, each cell's words in reading order (rows top to bottom, left to right in a row); and
    the words in no cell."""
    cells = assign(page)
    groups: dict[Box, list[Word]] = {}
    loose: list[Word] = []
    for w in page.words:
        c = cells.get(id(w))
        if c is None:
            loose.append(w)
        else:
            groups.setdefault(c, []).append(w)
    lines = []
    for _, words in sorted(groups.items(), key=lambda g: (g[0][0], g[0][1])):
        rows: list[list[Word]] = []
        for w in sorted(words, key=lambda w: (w.box[0] + w.box[2]) / 2):
            cy, hh = (w.box[0] + w.box[2]) / 2, w.box[2] - w.box[0]
            if rows and abs(cy - (rows[-1][-1].box[0] + rows[-1][-1].box[2]) / 2) <= 0.5 * hh:
                rows[-1].append(w)
            else:
                rows.append([w])
        lines.append([w for row in rows for w in sorted(row, key=lambda w: w.box[1])])
    return lines, loose
