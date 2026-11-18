"""R2: the parser channel, a grammar for Indian structural drawing notation over the PDF's text layer. No model.

Each match carries the words it came from and their union box, in the same `box_2d` space as the Gemini channel.
Values are canonical so the two channels compare as strings:

    bars            "5-20", "2-25 + 1-20"          count-diameter groups in the order written (as `format_bars`)
    section         "230x450"                      b x D, mm
    links           "8@150", "2L-8@100"            legs only when the drawing gives them
    cover           "25"                           mm
    concrete_grade  "M25";  steel_grade "Fe500", "Fe500D"
    seismic_zone    "III";  exposure "moderate", "very_severe"
    member          "B12", "C4", "FB3"

The grammar is deliberately narrow. A bar diameter must be a standard size, counts are one or two digits, and a
count and a diameter need a separator ("-", "#", "nos", or a T/Y/φ prefix), so "520", "1-2" and "230x450" never
read as bars. A miss costs a person a click in To check; a false match could be agreed into a wrong number.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from .ingest import Box, Page, Word

BAR_DIAS = {6, 8, 10, 12, 16, 20, 25, 28, 32, 36, 40}
LINK_DIAS = {6, 8, 10, 12, 16}
CONCRETE = {15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80}
STEEL = {250, 415, 500, 550, 600}
ROMAN = {"2": "II", "3": "III", "4": "IV", "5": "V", "II": "II", "III": "III", "IV": "IV", "V": "V"}
EXPOSURES = {"mild", "moderate", "severe", "very severe", "extreme"}

_PHI = r"(?:φ|Φ|ϕ|ø|Ø|∅|⌀|%%[cC])"
_MARK = rf"(?:{_PHI}|mm\s*{_PHI}|mm\s*dia\.?|mm|dia\.?|DIA\.?|#)"
_DASH = r"[-–—]"
_START = r"(?<![\w.#/+-])"
_GROUP = (rf"(\d{{1,2}})(?:\s*(?:nos?\.?|Nos?\.?|NOS?\.?)\s*{_DASH}?\s*|\s*[{_DASH[1:-1]}#]\s*|\s*(?=[TY]\d|{_PHI}))"
          rf"(?:[TY]|{_PHI})?\s*(\d{{1,2}})(?![\d.])(?:\s*{_MARK})?")
_BARS = re.compile(rf"{_START}{_GROUP}(?:\s*\+\s*{_GROUP})*(?!\s*@)(?![\w./])")
_ONE_GROUP = re.compile(_GROUP)
_SECTION = re.compile(r"(?<![\w.])(\d{3,4})\s*(?:mm)?\s*[xX×*]\s*(\d{3,4})(?:\s*mm)?(?![\w.])")
_LINKS = re.compile(
    rf"{_START}(?:(\d)\s*{_DASH}?\s*L(?:egged)?\s*{_DASH}?\s*)?(?:[TY]|{_PHI})?\s*(\d{{1,2}})(?![\d.])\s*(?:{_MARK})?"
    rf"(?:\s*@\s*(\d{{2,3}})|\s*{_DASH}\s*(\d{{2,3}})(?=\s*(?:mm\s*)?[cC]\s*/\s*[cC]))(?!\d)(?:\s*mm)?"
    rf"(?:\s*[cC]\s*/\s*[cC]\.?)?")
_COVER = re.compile(
    r"(?i)(?<![\w.])(?:clear\s+cover|cover|c\.\s?c\.)"
    r"(?:\s+(?:to|for)\s+(?:the\s+)?(?:main\s+)?(?:beams?|columns?|slabs?|footings?|bars?|reinforcement|links|stirrups))?"
    r"\s*[:=\-–]?\s*(\d{2})(?![\d:.])(?:\s*mm)?")
_CONCRETE = re.compile(rf"(?<![\w.])M\s?{_DASH}?\s?(\d{{2}})(?![\w.])")
_STEEL = re.compile(rf"(?<![\w.])Fe\s?{_DASH}?\s?(\d{{3}})\s?([DS])?(?![\w.])")
_ZONE = re.compile(r"(?i)(?<![\w.])(?:seismic\s+)?zone\s*[-:–]?\s*(III|II|IV|V|[2-5])(?![\w.])")
_EXPOSURE = re.compile(
    r"(?i)(?<![\w.])(?:(very\s+severe|mild|moderate|severe|extreme)\s+exposure"
    r"|exposure(?:\s+condition)?\s*[:=\-–]?\s*(very\s+severe|mild|moderate|severe|extreme))(?![\w.])")
_MEMBER = re.compile(rf"(?<![\w.#/-])(XB|YB|FB|PB|RB|GB|TB|LB|SB|CB|B|C|F){_DASH}?(\d{{1,3}}[A-Z]?)(?![\w.])")

# Bare values, accepted only when normalising Gemini's value for a known kind, never when scanning a page: on a sheet
# a lone "III" or "25" means nothing.
_BARE = {
    "cover": (re.compile(r"(?i)(\d{2})\s*(?:mm)?"), lambda m: _cover(m)),
    "seismic_zone": (re.compile(r"(?i)(III|II|IV|V|[2-5])"), lambda m: _zone(m)),
    "exposure": (re.compile(r"(?i)(very\s+severe|mild|moderate|severe|extreme)()"), lambda m: _exposure(m)),
}

KINDS = ("links", "cover", "seismic_zone", "exposure", "section", "bars", "concrete_grade", "steel_grade", "member")


@dataclass(frozen=True)
class Match:
    kind: str
    value: str                    # canonical, see the module docstring
    text: str                     # as written
    page: int
    box: Box
    words: tuple[Word, ...] = ()
    scope: str | None = None      # a table value's row: "ALL_COLUMNS" for the COLUMNS row of a cover table


def _bars(m: re.Match) -> str | None:
    groups = []
    for g in _ONE_GROUP.finditer(m.group(0)):
        n, d = int(g.group(1)), int(g.group(2))
        if n < 1 or d not in BAR_DIAS:
            return None
        groups.append(f"{n}-{d}")
    return " + ".join(groups) or None


def _section(m: re.Match) -> str | None:
    b, d = int(m.group(1)), int(m.group(2))
    return f"{b}x{d}" if 100 <= b <= 3000 and 100 <= d <= 3000 else None


def _links(m: re.Match) -> str | None:
    legs, dia, s = m.group(1), int(m.group(2)), int(m.group(3) or m.group(4))
    if dia not in LINK_DIAS or not 50 <= s <= 400 or (legs and not 1 <= int(legs) <= 8):
        return None
    return f"{legs}L-{dia}@{s}" if legs else f"{dia}@{s}"


def _cover(m: re.Match) -> str | None:
    c = int(m.group(1))
    return str(c) if 10 <= c <= 75 else None


def _concrete(m: re.Match) -> str | None:
    return f"M{m.group(1)}" if int(m.group(1)) in CONCRETE else None


def _steel(m: re.Match) -> str | None:
    return f"Fe{m.group(1)}{m.group(2) or ''}" if int(m.group(1)) in STEEL else None


def _zone(m: re.Match) -> str | None:
    return ROMAN[m.group(1).upper()]


def _exposure(m: re.Match) -> str | None:
    word = " ".join((m.group(1) or m.group(2)).lower().split())
    return word.replace(" ", "_") if word in EXPOSURES else None


def _member(m: re.Match) -> str | None:
    return f"{m.group(1)}{m.group(2)}"


_PATTERNS = {
    "links": (_LINKS, _links), "cover": (_COVER, _cover), "seismic_zone": (_ZONE, _zone),
    "exposure": (_EXPOSURE, _exposure), "section": (_SECTION, _section), "bars": (_BARS, _bars),
    "concrete_grade": (_CONCRETE, _concrete), "steel_grade": (_STEEL, _steel), "member": (_MEMBER, _member),
}


def scan(text: str) -> list[tuple[str, str, int, int]]:
    """Every match in one line of text as (kind, value, start, end), earlier kinds in KINDS taking precedence:
    "2L-8 @ 100" is links, never bars "2-8"; "C.C. 40" is cover."""
    taken: list[tuple[int, int]] = []
    found = []
    for kind in KINDS:
        pattern, value_of = _PATTERNS[kind]
        for m in pattern.finditer(text):
            start, end = m.span()
            if any(start < e and s < end for s, e in taken):
                continue
            value = value_of(m)
            if value is None:
                continue
            taken.append((start, end))
            found.append((kind, value, start, end))
    return sorted(found, key=lambda f: f[2])


_GEMINI_PHI = str.maketrans({"Ф": "Ø", "Ά": "Ø"})


def normalise(kind: str, text: str) -> str | None:
    """The canonical value of `text` read as `kind`, or None when it has none or more than one distinct reading.

    Used on Gemini's "value as written", so both channels go through one grammar. A reading of another kind does
    not stop it ("B12 5-20" normalises as bars to "5-20").

    Gemini sometimes writes the drawing's Ø as Cyrillic "Ф" or Greek "Ά"; those read as Ø here only, never in page
    scanning, so a letter on the sheet itself is not taken for a diameter mark."""
    text = text.translate(_GEMINI_PHI)
    values = {v for k, v, _, _ in scan(text) if k == kind}
    if not values and kind in _BARE:                  # Gemini writes "III" or "25 mm" where the sheet has a label
        pattern, value_of = _BARE[kind]
        m = pattern.fullmatch(text.strip())
        value = value_of(m) if m else None
        return value
    return values.pop() if len(values) == 1 else None


def union(boxes: list[Box]) -> Box:
    return (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))


def visual_lines(page: Page, tokens: bool = True) -> list[list[Word]]:
    """Words that sit on one baseline and close together, left to right.

    CAD exports often write "8φ", "@", "150" and "c/c" as separate text objects, so PyMuPDF's own lines would split a
    callout. Two words join when their vertical centres are within half a text height and the gap between them is
    under one text height, measured in points (box units differ in x and y on a non-square sheet).

    On a page with drawn table rules, words inside one small table cell are one run instead, whatever their lines
    (cells.py): a two-line header reads whole and neighbouring cells never run together.

    With `tokens` (the parser's view) split Ø callouts are joined first (tokens.py); without, the stored words
    exactly, as Gemini's prompt shows them."""
    from .cells import cell_lines
    from .tokens import token_page

    if tokens:
        page = token_page(page)

    in_cells, loose = cell_lines(page)
    sx, sy = page.width / 1000, page.height / 1000
    words = sorted(loose, key=lambda w: ((w.box[0] + w.box[2]) / 2, w.box[1]))
    rows: list[list[Word]] = []
    for w in words:
        cy, h = (w.box[0] + w.box[2]) / 2 * sy, (w.box[2] - w.box[0]) * sy
        for row in rows:
            last = row[-1]
            ly, lh = (last.box[0] + last.box[2]) / 2 * sy, (last.box[2] - last.box[0]) * sy
            if abs(cy - ly) <= 0.5 * max(h, lh):
                row.append(w)
                break
        else:
            rows.append([w])
    lines: list[list[Word]] = []
    for row in rows:
        row.sort(key=lambda w: w.box[1])
        current = [row[0]]
        for w in row[1:]:
            prev = current[-1]
            gap = (w.box[1] - prev.box[3]) * sx
            height = max(w.box[2] - w.box[0], prev.box[2] - prev.box[0]) * sy
            if gap <= height:
                current.append(w)
            else:
                lines.append(current)
                current = [w]
        lines.append(current)
    return in_cells + lines


_SCOPES = {"COLUMN": "ALL_COLUMNS", "COLUMNS": "ALL_COLUMNS", "BEAM": "ALL_BEAMS", "BEAMS": "ALL_BEAMS",
           "SLAB": "SLABS", "SLABS": "SLABS", "FOOTING": "FOOTINGS", "FOOTINGS": "FOOTINGS"}
_TABLE_COVER = re.compile(r"(\d{2})\s*(?:mm)?")


def cover_table(page: Page) -> list[Match]:
    """Cover values read from a ruled table whose header cell says COVER ("CLEAR COVER"): each cell below the header
    in its column holding a number ("40 mm") is a cover value, scoped by the member word in its row's label cell
    (COLUMNS gives ALL_COLUMNS, BEAMS ALL_BEAMS; SLABS and FOOTINGS are kept so a claim on them disagrees). A row
    with no single member word gives nothing. The cells carry no word "cover", so the line grammar cannot read them.
    `page` is the parser's token view."""
    from .cells import assign
    cells = assign(page)
    lines = [ln for ln in visual_lines(page, tokens=False) if ln and id(ln[0]) in cells]
    out: list[Match] = []
    for head in lines:
        text = " ".join(w.text for w in head).upper()
        if "COVER" not in text.split() or len(head) > 3:
            continue
        hc = cells[id(head[0])]
        for ln in lines:
            c = cells[id(ln[0])]
            vtext = " ".join(w.text for w in ln)
            m = _TABLE_COVER.fullmatch(vtext.strip())
            if not m or c[0] < hc[2] - 0.5 or not (hc[1] - 0.5 <= (c[1] + c[3]) / 2 <= hc[3] + 0.5):
                continue
            value = _cover(m)
            row = {_SCOPES[w.text.strip(".:").upper()] for r in lines for w in r
                   if w.text.strip(".:").upper() in _SCOPES and cells[id(r[0])][3] <= c[1] + 0.5
                   and cells[id(r[0])][0] < c[2] and c[0] < cells[id(r[0])][2]}
            if value and len(row) == 1:
                out.append(Match("cover", value, vtext, page.number, union([w.box for w in ln]), tuple(ln), row.pop()))
    return out


def parse_page(page: Page) -> list[Match]:
    """Every notation match on a page, each mapped to the words it covers. A grid bubble is never a member id: bubble
    "C1" names grid line C1, not column C1 (plan.py)."""
    from .plan import bubbles
    in_bubble = {(b.word.text, b.word.box) for b in bubbles(page)}
    out = []
    for line in visual_lines(page):
        text, spans, pos = "", [], 0
        for w in line:
            if text:
                text += " "
                pos += 1
            spans.append((pos, pos + len(w.text)))
            text += w.text
            pos += len(w.text)
        for kind, value, start, end in scan(text):
            covered = tuple(w for w, (s, e) in zip(line, spans) if s < end and start < e)
            if kind == "member" and all((w.text, w.box) in in_bubble for w in covered):
                continue
            out.append(Match(kind, value, text[start:end], page.number, union([w.box for w in covered]), covered))
    from .tokens import token_page
    return out + cover_table(token_page(page))
