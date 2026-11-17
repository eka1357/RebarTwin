"""The parser's token layer: words as the parser reads them, derived from the stored words without changing them.

AutoCAD's SHX export can split a bar callout drawn as "2Ø16" into a comment "2 16" and a separate comment "O" for
the diameter circle, placed over the space between the numbers (on the IIT Hyderabad set: "O" 12 pt tall and 10 pt
wide, inside the 23 pt wide "2 16"). Gemini, reading the image, sees 2Ø16; the parser, reading the comments, saw
"2 16" and read nothing.

Here, and only here, such a split is joined into one derived word "2Ø16" when the geometry fits exactly one way:

- the "O" comment is exactly "O", on the same baseline as the numbers (centres within a quarter of the text height,
  heights within 0.6 to 1.4 of each other);
- either one comment "n d" whose space, placed by character position along the comment's width, holds the O's
  centre within three quarters of a character; or three comments "n", "O", "d" left to right with gaps under half a
  text height;
- no other O fits the same numbers, and the O fits no other numbers.

Stored comment text is never modified: the derived word replaces its parts only in the parser's view, records
the comments it came from in `joined`, and provenance says so. Gemini's prompt keeps the raw comments, so the two
readings stay independent. If the geometry does not fit, nothing is joined.
"""
from __future__ import annotations

import re
from dataclasses import replace

from .ingest import Page, Word

LONE = "O"
_ND = re.compile(r"(\d{1,2})( +)(\d{1,2})")
_N = re.compile(r"\d{1,2}")


def _geom(page: Page, w: Word) -> tuple[float, float, float, float]:
    """Centre y, height, x0, x1 in points."""
    sx, sy = page.width / 1000, page.height / 1000
    return (w.box[0] + w.box[2]) / 2 * sy, (w.box[2] - w.box[0]) * sy, w.box[1] * sx, w.box[3] * sx


def _baseline(page: Page, a: Word, b: Word) -> bool:
    ya, ha, _, _ = _geom(page, a)
    yb, hb, _, _ = _geom(page, b)
    return abs(ya - yb) <= 0.25 * max(ha, hb) and 0.6 <= ha / hb <= 1.4


def _fits_inside(page: Page, o: Word, nd: Word) -> bool:
    m = _ND.fullmatch(nd.text)
    if not m or not _baseline(page, o, nd):
        return False
    _, _, x0, x1 = _geom(page, nd)
    char = (x1 - x0) / len(nd.text)
    gap0 = x0 + len(m.group(1)) * char
    gap1 = gap0 + len(m.group(2)) * char
    _, _, ox0, ox1 = _geom(page, o)
    centre = (ox0 + ox1) / 2
    return gap0 - 0.75 * char <= centre <= gap1 + 0.75 * char


def _fits_between(page: Page, n: Word, o: Word, d: Word) -> bool:
    if not (_N.fullmatch(n.text) and _N.fullmatch(d.text) and _baseline(page, n, o) and _baseline(page, o, d)):
        return False
    _, h, _, _ = _geom(page, o)
    _, _, _, n1 = _geom(page, n)
    _, _, o0, o1 = _geom(page, o)
    _, _, d0, _ = _geom(page, d)
    return 0 <= o0 - n1 <= 0.5 * h and 0 <= d0 - o1 <= 0.5 * h


def _union(words: list[Word]):
    return (min(w.box[0] for w in words), min(w.box[1] for w in words), max(w.box[2] for w in words),
            max(w.box[3] for w in words))


def token_words(page: Page) -> list[Word]:
    """The page's words with each split Ø callout joined into one derived word. Cached on the page."""
    key = (id(page.words), len(page.words))
    cached = getattr(page, "_tokens", None)
    if cached and cached[0] == key:
        return cached[1]
    comments = [w for w in page.words if w.source == "annotation"]
    lone = [w for w in comments if w.text == LONE]
    numbers = [w for w in comments if _ND.fullmatch(w.text) or _N.fullmatch(w.text)]
    fits: dict[int, list[tuple[Word, ...]]] = {}          # id(O) -> the ways it joins
    for o in lone:
        oy, oh, _, _ = _geom(page, o)
        near = [w for w in numbers if abs(_geom(page, w)[0] - oy) <= oh]
        ways: list[tuple[Word, ...]] = [(nd,) for nd in near if _fits_inside(page, o, nd)]
        singles = sorted((w for w in near if _N.fullmatch(w.text)), key=lambda w: w.box[1])
        ways += [(n, d) for n in singles for d in singles if n is not d and _fits_between(page, n, o, d)]
        fits[id(o)] = ways
    used: dict[int, int] = {}                             # id(number word) -> how many O's claim it
    for ways in fits.values():
        for way in ways:
            for w in way:
                used[id(w)] = used.get(id(w), 0) + 1
    drop: set[int] = set()
    derived: list[Word] = []
    for o in lone:
        ways = fits[id(o)]
        if len(ways) != 1 or any(used[id(w)] != 1 for w in ways[0]):
            continue                                      # no fit, or more than one: do nothing
        way = ways[0]
        if len(way) == 1:
            m = _ND.fullmatch(way[0].text)
            n, d = m.group(1), m.group(3)
            parts = [way[0], o]
        else:
            n, d = way[0].text, way[1].text
            parts = [way[0], o, way[1]]
        derived.append(replace(o, text=f"{n}Ø{d}", box=_union(parts), joined=tuple(w.text for w in parts)))
        drop.update(id(w) for w in parts)
    out = [w for w in page.words if id(w) not in drop] + derived
    object.__setattr__(page, "_tokens", (key, out))
    return out


def token_page(page: Page) -> Page:
    """The page as the parser sees it. Cached, so cell assignment on it is computed once."""
    words = token_words(page)
    cached = getattr(page, "_token_page", None)
    if cached is not None and cached.words is words:
        return cached
    view = replace(page, words=words)
    object.__setattr__(view, "_tokens", ((id(words), len(words)), words))
    object.__setattr__(view, "_token_page", view)
    object.__setattr__(page, "_token_page", view)
    return view
