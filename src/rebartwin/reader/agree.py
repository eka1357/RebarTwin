"""R4: agreement between the Gemini channel and the parser channel, and the To check list.

A Gemini callout is accepted only when all of these hold; otherwise it becomes a To check item with a reason.

1. Its value normalises under the parser's grammar (`ambiguous` if not).
2. The parser found a value of the same kind at the same place on the same page: boxes overlap with IoU at least
   0.3, or one box's centre lies inside the other (`missing` if nothing is there).
3. Every parser value there equals Gemini's normalised value (`disagree` if none does, `ambiguous` if they differ
   among themselves).
4. The member is tied to the value by the text layer: it is the nearest member id of the same kind to the left in
   the value's row, or above it in its column (`disagree` if that label is another member, `ambiguous` if there
   is none). General notes (ALL, ALL_BEAMS, ALL_COLUMNS) skip this.
5. Top and bottom bars are not contradicted by a "top" or "bottom" label on the value's line or in the nearest
   header above it (`disagree`).
6. Levels: a column value in a schedule laid out by storey must name the storey header above it (or beside it in
   its row) on the sheet (`disagree` if Gemini names another, `ambiguous` if Gemini names none, or names one where
   the sheet has no header); a beam value or `frames_into` with a floor must be on a sheet that names that floor.
   Where Gemini names no storey, the sheet's header is the level only when the value sits inside exactly one ruled
   storey group and the header names exactly one storey (`levels.one_storey`); the level is then marked as made by
   code (`level_by`, "storey from the schedule's table").
7. No other accepted callout gives the same member and field a different value (`ambiguous`, both go to To check).
   Top extras at different supports (`at`, the grid bubble under them on the detail sheet) are separate, and so are
   beam values over different spans (`at` "14/18", the span's two supports).
   `frames_into` is exempt: a beam meets a column at each end. Each level is separate: a column has a value per
   storey. Zone, exposure and grades are project-wide: two
   values under any scopes conflict.
8. One value on the drawing backs one field: if callouts for different fields (a beam's top and its bottom) agree
   with the same parser value, none is accepted (`ambiguous`).

Parser values of the main kinds that no callout claimed are listed too, as unassigned items, so a person can see what
Gemini missed. They block no joint, since nothing ties them to one.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field

from .gemini import FIELD_KIND, GLOBAL_MEMBERS, Read
from .ingest import Box, Page, box_2d
from .levels import floor, is_storey_header, one_storey, same_level, storey
from .cells import rule_right_of, strip, table_left
from .parser import Match, normalise, union, visual_lines

IOU_MIN = 0.3
PROJECT_WIDE = {"seismic_zone", "exposure", "concrete_grade", "steel_grade"}
TOP_WORDS = {"top"}
BOTTOM_WORDS = {"bottom", "bot", "btm"}


def area(b: Box) -> float:
    return max(0, b[2] - b[0]) * max(0, b[3] - b[1])


def iou(a: Box, b: Box) -> float:
    inter = area((max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])))
    total = area(a) + area(b) - inter
    return inter / total if total else 0.0


def centre_inside(a: Box, b: Box) -> bool:
    """True when a's centre lies inside b, or b's inside a."""
    def inside(p: Box, q: Box) -> bool:
        cy, cx = (p[0] + p[2]) / 2, (p[1] + p[3]) / 2
        return q[0] <= cy <= q[2] and q[1] <= cx <= q[3]
    return inside(a, b) or inside(b, a)


def same_place(a: Box, b: Box) -> bool:
    return iou(a, b) >= IOU_MIN or centre_inside(a, b)


def _expand(b: Box, by: int) -> Box:
    return (b[0] - by, b[1] - by, b[2] + by, b[3] + by)


@dataclass
class Accepted:
    id: str
    member: str
    field: str
    layer: int
    value: str                    # canonical
    page: int
    box: Box                      # the parser's box: the text as it is on the drawing
    text: str                     # as written, from the text layer
    gemini: str                   # as Gemini wrote it
    gemini_box: Box
    call: str = ""
    level: str | None = None      # as written on the drawing: the storey header or the sheet's floor
    ocr_raw: str | None = None    # what OCR read before a misread Ø was repaired; None when nothing was repaired
    joined_from: list[str] | None = None   # the comments a split Ø callout was joined from (tokens.py)
    status: str = "agreed"        # "agreed" (both channels) or "geometry" (made by code from the drawing's geometry)
    refs: list[dict] | None = None   # further places on the drawing that back it: [{page, box_2d, text, at}]
    at: str | None = None         # where on the grid: a geometry frames_into's place ("F-14", "C/C1-25"); a top
                                  # extra's support grid line ("14"), from the bubble under it on the detail sheet
    level_by: str | None = None   # who gave the level when Gemini did not: "storey from the schedule's table"

    def provenance(self) -> dict:
        p = {"page": self.page, "box_2d": box_2d(self.box), "text": self.text, "gemini": self.gemini,
             "parser": self.value, "status": self.status, "field_id": self.id, "level": self.level,
             "ocr_raw": self.ocr_raw, "joined_from": self.joined_from}
        if self.at:
            p["at"] = self.at
        if self.level_by:
            p["level_by"] = self.level_by
        if self.refs:
            p["refs"] = self.refs
        return p


@dataclass
class ToCheck:
    id: str
    member: str | None
    field: str
    page: int
    box_2d: Box | None
    gemini: dict | None
    parser: dict | None
    reason: str                   # disagree | missing | ambiguous
    detail: str
    layer: int = 1
    joint: str | None = None
    resolution: dict | None = None
    level: str | None = None
    place: str | None = None      # a grid place ("N1-4"): the item blocks only joints at that place

    def to_json(self) -> dict:
        d = asdict(self)
        d["box_2d"] = box_2d(self.box_2d) if self.box_2d else None
        return d


@dataclass
class Agreement:
    accepted: list[Accepted] = field(default_factory=list)
    to_check: list[ToCheck] = field(default_factory=list)
    unassigned: list[ToCheck] = field(default_factory=list)


def _member_kind(member: str) -> str:
    return "column" if member.startswith("C") and not member.startswith("CB") else "beam"


TIE_NEAR = 1.5          # text heights: a label this close to a value is its label ...
TIE_CROWD = 3.0         # ... unless another label of the same kind is within this many: then it is ambiguous


def _gap_pt(page: Page, a: Box, b: Box) -> float:
    """Shortest distance between two boxes, in points (0 when they touch or overlap)."""
    sx, sy = page.width / 1000, page.height / 1000
    dx = max(0.0, b[1] - a[3], a[1] - b[3]) * sx
    dy = max(0.0, b[0] - a[2], a[0] - b[2]) * sy
    return (dx * dx + dy * dy) ** 0.5


def _tied(member: str, value: Match, members: list[Match], line_of: dict[int, int],
          page: Page) -> tuple[bool, str | None, str | None]:
    """Is `member` the label this value belongs to? Returns (tied, the member named there instead, why ambiguous).

    In order:
    1. A label in the same text as the value ("XB1(200x600-inv)") is its label.
    1a. On a plan, a beam size on a beam band belongs to the XB or YB label tied to that band (plan.py, `band_tie`);
       two different labels on the band make it ambiguous.
    1b. On a detail sheet, a beam value belongs to the elevation whose title ("XB1(200x600-inv)") is below it
       (plan.py, `elevation_tie`).
    2. The nearest label of the same kind within TIE_NEAR text heights in any direction (a plan callout's id above,
       below or beside its size) is its label, unless a second, different label of that kind is within TIE_CROWD:
       then which one is meant is ambiguous.
    3. Otherwise reading order: the nearest label to the left in the value's row, else above it in its column, with
       ids on that label's own line ("B1, B2"). Anywhere else on the sheet does not count."""
    box = value.box
    same = [m for m in members if _member_kind(m.value) == _member_kind(member)]
    inside = [m for m in same if {id(w) for w in m.words} & {id(w) for w in value.words}]
    if inside:
        names = {m.value for m in inside}
        return (True, None, None) if member in names else (False, sorted(names)[0], None)
    group = _group_of(page, box) if strip(page, box) is not None else None
    if group is not None:
        # In a ruled schedule by storey, structure decides, not distance: a label in the same row (its height range
        # overlapping the value's) inside the same storey group, in either direction. Ruled strips alone are not
        # enough to call something a table: beam elevations make them too.
        row = {m.value for m in same if m.box[0] < box[2] + 2 and box[0] - 2 < m.box[2]
               and group[2] < (m.box[1] + m.box[3]) / 2 <= group[3]}
        if len(row) == 1:
            name = row.pop()
            return (True, None, None) if name == member else (False, name, None)
        if len(row) > 1:
            return False, None, f"labels {', '.join(sorted(row))} share this row of the table"
        return _reading_order(member, box, same, line_of)
    if value.kind == "section" and _member_kind(member) == "beam":
        # On a plan, geometry decides before distance: a size on a beam band belongs to the beam labelled on that
        # band (plan.py). A band with no label, or no band, leaves it to the rules below.
        from .plan import band_tie
        found = band_tie(page, box)
        if found and found[0]:
            names = found[0]
            if len(names) == 1:
                name = next(iter(names))
                return (True, None, None) if name == member else (False, name, None)
            return False, None, f"labels {', '.join(sorted(names))} are on the beam band this value sits on"
    if value.kind == "section" and _member_kind(member) == "column":
        # On a column layout, a size beside a column's outline belongs to the column labelled at that outline.
        from .plan import outline_tie
        found = outline_tie(page, box)
        if found and found[0]:
            name = next(iter(found[0])) if len(found[0]) == 1 else None
            if name:
                return (True, None, None) if name == member else (False, name, None)
            return False, None, f"columns {', '.join(sorted(found[0]))} are as near this value"
    if _member_kind(member) == "beam":
        # On a detail sheet, a callout belongs to the beam elevation whose title is below it (plan.py).
        from .plan import elevation_tie
        found = elevation_tie(page, box)
        if found is not None:
            names, why = found
            if len(names) == 1:
                name = next(iter(names))
                return (True, None, None) if name == member else (False, name, None)
            return False, None, why
    height = (box[2] - box[0]) * page.height / 1000
    by_gap = sorted(((_gap_pt(page, m.box, box), k, m) for k, m in enumerate(same)), key=lambda t: (t[0], t[1]))
    close = [(g, m) for g, _, m in by_gap if g <= TIE_NEAR * height]
    if close:
        nearest = close[0][1]
        crowd = {m.value for g, _, m in by_gap if g <= TIE_CROWD * height} - {nearest.value}
        if crowd:
            return False, None, (f"labels {', '.join(sorted({nearest.value} | crowd))} are all within "
                                 f"{TIE_CROWD:g} text heights of this value")
        return (True, None, None) if nearest.value == member else (False, nearest.value, None)
    return _reading_order(member, box, same, line_of)


def _reading_order(member: str, box: Box, same: list[Match], line_of: dict[int, int]):
    """The nearest label to the left in the value's row, else above it in its column, with ids on that label's own
    line ("B1, B2")."""
    left = [m for m in same if m.box[0] < box[2] and box[0] < m.box[2] and m.box[3] <= box[1] + 2]
    above = [m for m in same if m.box[1] < box[3] and box[1] < m.box[3] and m.box[2] <= box[0] + 2]
    for found, gap in ((left, lambda m: box[1] - m.box[3]), (above, lambda m: box[0] - m.box[2])):
        if found:
            nearest = min(found, key=gap)
            line = line_of.get(id(nearest.words[0])) if nearest.words else None
            group = {m.value for m in same if m is nearest or (line is not None and m.words and
                                                                line_of.get(id(m.words[0])) == line)}
            return (True, None, None) if member in group else (False, nearest.value, None)
    return False, None, None


def _face_label(page: Page, box: Box) -> str | None:
    """'top' or 'bottom' from a label on the value's own line, else from the nearest header word above it."""
    def word_face(text: str) -> str | None:
        t = text.lower().strip(".:,()")
        return "top" if t in TOP_WORDS else "bottom" if t in BOTTOM_WORDS else None

    for line in visual_lines(page):
        if any(w.box[0] < box[2] and box[0] < w.box[2] and w.box[1] < box[3] and box[1] < w.box[3] for w in line):
            faces = {word_face(w.text) for w in line} - {None}
            if len(faces) == 1:
                return faces.pop()
    above = [(box[0] - w.box[2], word_face(w.text)) for w in page.words
             if word_face(w.text) and w.box[2] <= box[0] + 2 and w.box[1] < box[3] and box[1] < w.box[3]]
    return min(above)[1] if above else None


COLUMN_FIELDS = {"section", "main", "links"}


def _storey_groups(page: Page) -> list[tuple[str, Box, float, float]]:
    """Storey groups of ruled schedules: (header text, header box, left, right). A schedule by storey puts each
    storey's sub-columns (size, mix, stirrups, reinforcement) beside a sketch column titled by the storey header, so
    a group runs from the previous header's right-hand rule (for the first, the table's left edge) to this header's
    right-hand rule. Headers with no rule to their right are not in a ruled table and make no group. Cached."""
    cached = getattr(page, "_storey_groups", None)
    if cached is not None and cached[0] == len(page.words):
        return cached[1]
    headers = []
    for line in visual_lines(page):
        text = " ".join(w.text for w in line)
        if is_storey_header(text):
            b = union([w.box for w in line])
            right = rule_right_of(page, (b[0] + b[2]) / 2, b[3])
            if right is not None:
                headers.append((text, b, right))
    groups = []
    rows: list[list[tuple[str, Box, float]]] = []
    for h in sorted(headers, key=lambda h: (h[1][0], h[2])):
        row = next((r for r in rows if r[0][1][0] < h[1][2] and h[1][0] < r[0][1][2]), None)
        if row is not None:
            row.append(h)
        else:
            rows.append([h])
    for row in rows:
        row.sort(key=lambda h: h[2])
        for k, (text, b, right) in enumerate(row):
            left = row[k - 1][2] if k else table_left(page, (b[0] + b[2]) / 2, b[1])
            if left is not None:
                groups.append((text, b, left, right))
    object.__setattr__(page, "_storey_groups", (len(page.words), groups))
    return groups


def _groups_around(page: Page, box: Box) -> list[tuple[str, Box, float, float]]:
    """Every ruled storey group a value is inside: its centre inside the group's span, below the group's header."""
    cx = (box[1] + box[3]) / 2
    return [g for g in _storey_groups(page) if g[2] < cx <= g[3] and box[0] >= g[1][2] - 2]


def _group_of(page: Page, box: Box) -> tuple[str, Box, float, float] | None:
    """The storey group a value sits in: of those it is inside, the one whose header is nearest above it."""
    inside = _groups_around(page, box)
    return min(inside, key=lambda g: box[0] - g[1][2]) if inside else None


TABLE_STOREY = "storey from the schedule's table"


def _storey_header(page: Page, box: Box) -> str | None:
    """The storey header a column value sits under. In a ruled schedule, the header of the storey group the value
    is in (`_storey_groups`). Otherwise the nearest storey-range line above it in its column, else the nearest to its
    left in its row. As written on the sheet."""
    group = _group_of(page, box)
    if group is not None:
        return group[0]
    headers = [(line, union([w.box for w in line])) for line in visual_lines(page)
               if is_storey_header(" ".join(w.text for w in line))]
    above = [(box[0] - b[2], line) for line, b in headers if b[1] < box[3] and box[1] < b[3] and b[2] <= box[0] + 2]
    left = [(box[1] - b[3], line) for line, b in headers if b[0] < box[2] and box[0] < b[2] and b[3] <= box[1] + 2]
    for found in (above, left):
        if found:
            return " ".join(w.text for w in min(found, key=lambda f: f[0])[1])
    return None


def _names_floor(page: Page, level: str) -> bool:
    """Does some line on the sheet name this floor (a title such as 'FIRST FLOOR BEAM LAYOUT')?"""
    want = floor(level)
    if not want:
        return False
    for line in visual_lines(page):
        have = floor(" ".join(w.text for w in line))
        if have and f" {want} " in f" {have} ":
            return True
    return False


def _level_problem(c, page: Page, box: Box) -> tuple[str | None, str, str | None, str | None]:
    """(reason, detail, level to keep, who gave it). `reason` None means the level holds; the level kept is the
    sheet's own text for a storey header, else Gemini's.

    Gemini naming no storey for a column value under a header is not a disagreement when the table itself settles
    it: the value sits inside exactly one ruled storey group, and that group's header names exactly one storey. The
    level is then the header, marked TABLE_STOREY. The unruled fallback (a header above or to the left) never
    settles it, nor does a header that names no single storey (OCR runs two together)."""
    if _member_kind(c.member) == "column" and c.member not in GLOBAL_MEMBERS and c.field in COLUMN_FIELDS:
        header = _storey_header(page, box)
        if header and not c.level:
            groups = _groups_around(page, box)
            if len(groups) == 1 and groups[0][0] == header and one_storey(header):
                return None, "", header, TABLE_STOREY
            return ("ambiguous", f"this value sits under the storey header {header!r}; Gemini gave no storey",
                    header, None)
        if header and not same_level(c.level, header):
            return "disagree", f"Gemini says storey {c.level!r}; the header above says {header!r}", header, None
        if not header and c.level and storey(c.level):
            return "ambiguous", f"Gemini says storey {c.level!r}; no storey header is above or beside it", None, None
        return None, "", header or c.level, None
    if c.level and not _names_floor(page, c.level):
        return "ambiguous", f"Gemini says floor {c.level!r}; nothing on this sheet names it", None, None
    return None, "", c.level, None


def agree(reads: list[Read], matches: list[Match], pages: list[Page], supports: dict | None = None) -> Agreement:
    """`supports`: each beam mark's supports along it from the plans (plan.support_map), for placing extra top
    bars."""
    by_page = {p.number: p for p in pages}
    line_of = {id(w): (p.number, k) for p in pages for k, line in enumerate(visual_lines(p)) for w in line}
    result = Agreement()
    n_tc = 0

    def flag(r: Read, reason: str, detail: str, parser_value: str | None = None) -> None:
        nonlocal n_tc
        n_tc += 1
        c = r.callout
        level = c.level
        column_value = _member_kind(c.member) == "column" and c.field in COLUMN_FIELDS
        if level is None and column_value and c.member not in GLOBAL_MEMBERS:
            # the storey header the value sits under on the sheet, so the item blocks only joints of that storey
            level = _storey_header(by_page[c.page], r.box)
        result.to_check.append(ToCheck(
            f"tc_{n_tc:04d}", c.member, c.field, c.page, r.box, {"value": c.value},
            {"value": parser_value} if parser_value is not None else None, reason, detail, c.layer, level=level))

    claimed: set[int] = set()
    for r in reads:
        c = r.callout
        kind = FIELD_KIND[c.field]
        on_page = [m for m in matches if m.page == c.page]
        members = [m for m in on_page if m.kind == "member"]
        here = [m for m in on_page if m.kind == kind and same_place(m.box, r.box)]
        claimed.update(id(m) for m in on_page if same_place(m.box, r.box))

        if c.field == "frames_into":
            near = [m for m in members if same_place(m.box, _expand(r.box, 10)) or
                    centre_inside(m.box, _expand(r.box, 10))]
            names = {m.value for m in near}
            if c.member in names and c.value in names:
                if c.level and not _names_floor(by_page[c.page], c.level):
                    flag(r, "ambiguous", f"Gemini says floor {c.level!r}; nothing on this sheet names it")
                    continue
                both = [m for m in near if m.value in (c.member, c.value)]
                result.accepted.append(Accepted(
                    "", c.member, c.field, c.layer, c.value, c.page,
                    (min(m.box[0] for m in both), min(m.box[1] for m in both), max(m.box[2] for m in both),
                     max(m.box[3] for m in both)), " / ".join(m.text for m in both), c.value, r.box, r.call,
                    c.level))
            else:
                flag(r, "missing", f"the text layer does not show both {c.member} and {c.value} in the box")
            continue

        value = normalise(kind, c.value)
        if value is None:
            flag(r, "ambiguous", f"Gemini's value is not in a notation the parser reads as {kind}")
            continue
        if not here:
            flag(r, "missing", f"the parser found no {kind} value at this place")
            continue
        values = {m.value for m in here}
        if value not in values:
            best = max(here, key=lambda m: iou(m.box, r.box))
            flag(r, "disagree", f"Gemini read {value}, the text layer says {best.value}", best.value)
            continue
        if len(values) > 1:
            flag(r, "ambiguous", f"the text layer has different {kind} values here: {', '.join(sorted(values))}",
                 ", ".join(sorted(values)))
            continue
        scopes = {m.scope for m in here if m.scope}
        if scopes and c.member not in scopes:
            flag(r, "disagree", f"Gemini says {c.member}; this value is in the {', '.join(sorted(scopes))} row of its "
                 "table", value)
            continue
        if c.member not in GLOBAL_MEMBERS:
            tied, other, crowded = _tied(c.member, here[0], members, line_of, by_page[c.page])
            if not tied:
                if crowded:
                    flag(r, "ambiguous", f"Gemini says {c.member}; {crowded}", value)
                elif other:
                    flag(r, "disagree", f"Gemini says {c.member}; the label of this value is {other}", value)
                else:
                    flag(r, "ambiguous", f"{c.member} is not in the same row or column as this value", value)
                continue
        if c.field in ("top", "top_extra", "bottom", "bottom_extra"):
            label = _face_label(by_page[c.page], here[0].box)
            said = c.field.split("_")[0]
            if label and label != said:
                flag(r, "disagree", f"Gemini says {said} bars; the drawing labels this value {label}", value)
                continue
        reason, detail, level, level_by = _level_problem(c, by_page[c.page], here[0].box)
        if reason:
            flag(r, reason, detail, value)
            continue
        m = here[0]
        raw = " ".join(w.raw or w.text for w in m.words) if any(w.raw for w in m.words) else None
        joined = [t for w in m.words for t in (w.joined or ())] or None
        support = None
        if c.field == "top_extra":                       # extra top bars belong to a support (plan.py)
            from .plan import elevation_support_at, support_at, top_extra_reach
            support = support_at(by_page[c.page], m.box) or (
                elevation_support_at(by_page[c.page], m.box, supports) if supports else None) or (
                top_extra_reach(by_page[c.page], m.box, supports) if supports else None)
        elif c.field == "bottom_extra" and supports:     # the supports its bar reaches, "-" for none (plan.py)
            from .plan import bar_reach
            support = bar_reach(by_page[c.page], m.box, supports)
        elif c.field in ("top", "bottom") and supports:  # a bar callout on an elevation: its span (fix A)
            from .plan import elevation_span_at
            support = elevation_span_at(by_page[c.page], m.box, supports)
        elif c.field == "section" and supports and _member_kind(c.member) == "beam":
            from .plan import span_on_plan                # a size on a plan band: the span it sits over (fix A)
            support = span_on_plan(by_page[c.page], m.box, supports)
        result.accepted.append(Accepted("", c.member, c.field, c.layer, value, c.page, m.box, m.text, c.value,
                                        r.box, r.call, level, raw, joined, at=support, level_by=level_by))

    # Rule 8: one value on the drawing backs one field. Two callouts that agree with the same parser value but
    # name different fields (XB16's top and its bottom on one '2Ø12') cannot both be right: neither is accepted.
    # Different members sharing a value in the same field (a 'B1, B2' row) stay.
    by_source: dict[tuple, list[Accepted]] = {}
    for a in result.accepted:
        if a.field != "frames_into":
            by_source.setdefault((a.page, a.box, a.text), []).append(a)
    for group in by_source.values():
        if len({a.field for a in group}) > 1:
            for a in group:
                result.accepted.remove(a)
                n_tc += 1
                result.to_check.append(ToCheck(
                    f"tc_{n_tc:04d}", a.member, a.field, a.page, a.box, {"value": a.gemini}, {"value": a.value},
                    "ambiguous", f"one value on the drawing, {a.text}, was read as "
                    f"{' and '.join(sorted({f'{x.member} {x.field}' for x in group}))}", a.layer, level=a.level))

    # Rule 7: one value per member, field and layer; project-wide settings get one value whatever their scope.
    groups: dict[tuple, list[Accepted]] = {}
    for a in result.accepted:
        scope = "*" if a.field in PROJECT_WIDE else a.member
        groups.setdefault((scope, a.field, a.layer, storey(a.level) or floor(a.level), a.at), []).append(a)
    keep = []
    for (_scope, fld, layer, _level, _at), group in groups.items():
        values = {a.value for a in group}
        if len(values) == 1:
            keep.append(group[0])
            continue
        if fld == "frames_into":                            # a beam meets a column at each end
            keep.extend({a.value: a for a in group}.values())
            continue
        for a in group:
            n_tc += 1
            result.to_check.append(ToCheck(
                f"tc_{n_tc:04d}", a.member, fld, a.page, a.box, {"value": a.gemini}, {"value": a.value}, "ambiguous",
                f"the drawing gives {a.member} {fld.replace('_', ' ')} more than one value: "
                f"{', '.join(sorted(values))}", layer, level=a.level))
    for i, a in enumerate(sorted(keep, key=lambda a: (a.page, a.member, a.field, a.layer, a.level or "")), 1):
        a.id = f"f{i:04d}"
    result.accepted = sorted(keep, key=lambda a: a.id)

    # General notes repeat on every sheet and are read once per tile: keep one project-level item per field, scope and
    # value, listing the other places; none when that same scope and value is accepted elsewhere (nothing to decide).
    agreed = {(a.member, a.field, a.value) for a in result.accepted}
    first: dict[tuple, ToCheck] = {}
    also: dict[tuple, list[int]] = {}
    kept = []
    for t in result.to_check:
        if t.member not in GLOBAL_MEMBERS:
            kept.append(t)
            continue
        raw = (t.gemini or {}).get("value") or ""
        value = normalise(FIELD_KIND[t.field], raw) if t.field in FIELD_KIND else None
        if t.reason == "missing" and value is not None and (t.member, t.field, value) in agreed:
            continue
        key = (t.field, t.member, value or raw, t.reason)
        if key in first:
            also.setdefault(key, []).append(t.page)
            continue
        first[key] = t
        kept.append(t)
    for key, t in first.items():
        pages = sorted(set(also.get(key, [])) - {t.page})
        if pages:
            t.detail += f" (the same reading on page{'s' if len(pages) > 1 else ''} {', '.join(map(str, pages))})"
    result.to_check = kept

    for m in matches:
        if m.kind in ("bars", "section", "links") and id(m) not in claimed:
            n_tc += 1
            result.unassigned.append(ToCheck(
                f"tc_{n_tc:04d}", None, m.kind, m.page, m.box, None, {"value": m.value}, "missing",
                "the parser read this value but Gemini did not report it"))
    return result
