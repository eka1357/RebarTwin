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
7. No other accepted callout gives the same member and field a different value (`ambiguous`, both go to To check).
   `frames_into` is exempt: a beam meets a column at each end. Each level is separate: a column has a value per
   storey. Zone, exposure and grades are project-wide: two
   values under any scopes conflict.

Parser values of the main kinds that no callout claimed are listed too, as unassigned items, so a person can see what
Gemini missed. They block no joint, since nothing ties them to one.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field

from .gemini import FIELD_KIND, GLOBAL_MEMBERS, Read
from .ingest import Box, Page
from .levels import floor, is_storey_header, same_level, storey
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

    def provenance(self) -> dict:
        return {"page": self.page, "box_2d": list(self.box), "text": self.text, "gemini": self.gemini,
                "parser": self.value, "status": "agreed", "field_id": self.id, "level": self.level}


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

    def to_json(self) -> dict:
        d = asdict(self)
        d["box_2d"] = list(self.box_2d) if self.box_2d else None
        return d


@dataclass
class Agreement:
    accepted: list[Accepted] = field(default_factory=list)
    to_check: list[ToCheck] = field(default_factory=list)
    unassigned: list[ToCheck] = field(default_factory=list)


def _member_kind(member: str) -> str:
    return "column" if member.startswith("C") and not member.startswith("CB") else "beam"


def _tied(member: str, box: Box, members: list[Match], line_of: dict[int, int]) -> tuple[bool, str | None]:
    """Is `member` the label this value belongs to? Returns (tied, the member named there instead).

    Drawings put the label before the value in reading order: to its left in a schedule row or a plan callout,
    or above it in a transposed schedule's column. So the label is the nearest member id of the same kind to the
    left in the value's row, else the nearest above in its column. Ids on that label's own line count too, for rows
    like "B1, B2". Anywhere else on the sheet does not count: a long row or column band crosses unrelated tables."""
    same = [m for m in members if _member_kind(m.value) == _member_kind(member)]
    left = [m for m in same if m.box[0] < box[2] and box[0] < m.box[2] and m.box[3] <= box[1] + 2]
    above = [m for m in same if m.box[1] < box[3] and box[1] < m.box[3] and m.box[2] <= box[0] + 2]
    for found, gap in ((left, lambda m: box[1] - m.box[3]), (above, lambda m: box[0] - m.box[2])):
        if found:
            nearest = min(found, key=gap)
            line = line_of.get(id(nearest.words[0])) if nearest.words else None
            group = {m.value for m in same if m is nearest or (line is not None and m.words and
                                                                line_of.get(id(m.words[0])) == line)}
            return (True, None) if member in group else (False, nearest.value)
    return False, None


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


def _storey_header(page: Page, box: Box) -> str | None:
    """The storey header a column value sits under: the nearest storey-range line above it in its column, else the
    nearest to its left in its row. As written on the sheet."""
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


def _level_problem(c, page: Page, box: Box) -> tuple[str | None, str, str | None]:
    """(reason, detail, level to keep). `reason` None means the level holds; the level kept is the sheet's own text
    for a storey header, else Gemini's."""
    if _member_kind(c.member) == "column" and c.member not in GLOBAL_MEMBERS and c.field in COLUMN_FIELDS:
        header = _storey_header(page, box)
        if header and not c.level:
            return "ambiguous", f"this value sits under the storey header {header!r}; Gemini gave no storey", header
        if header and not same_level(c.level, header):
            return "disagree", f"Gemini says storey {c.level!r}; the header above says {header!r}", header
        if not header and c.level and storey(c.level):
            return "ambiguous", f"Gemini says storey {c.level!r}; no storey header is above or beside it", None
        return None, "", header or c.level
    if c.level and not _names_floor(page, c.level):
        return "ambiguous", f"Gemini says floor {c.level!r}; nothing on this sheet names it", None
    return None, "", c.level


def agree(reads: list[Read], matches: list[Match], pages: list[Page]) -> Agreement:
    by_page = {p.number: p for p in pages}
    line_of = {id(w): (p.number, k) for p in pages for k, line in enumerate(visual_lines(p)) for w in line}
    result = Agreement()
    n_tc = 0

    def flag(r: Read, reason: str, detail: str, parser_value: str | None = None) -> None:
        nonlocal n_tc
        n_tc += 1
        c = r.callout
        result.to_check.append(ToCheck(
            f"tc_{n_tc:04d}", c.member, c.field, c.page, r.box, {"value": c.value},
            {"value": parser_value} if parser_value is not None else None, reason, detail, c.layer, level=c.level))

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
        if c.member not in GLOBAL_MEMBERS:
            tied, other = _tied(c.member, here[0].box, members, line_of)
            if not tied:
                if other:
                    flag(r, "disagree", f"Gemini says {c.member}; the row or column of this value names {other}",
                         value)
                else:
                    flag(r, "ambiguous", f"{c.member} is not in the same row or column as this value", value)
                continue
        if c.field in ("top", "top_extra", "bottom", "bottom_extra"):
            label = _face_label(by_page[c.page], here[0].box)
            said = c.field.split("_")[0]
            if label and label != said:
                flag(r, "disagree", f"Gemini says {said} bars; the drawing labels this value {label}", value)
                continue
        reason, detail, level = _level_problem(c, by_page[c.page], here[0].box)
        if reason:
            flag(r, reason, detail, value)
            continue
        m = here[0]
        result.accepted.append(Accepted("", c.member, c.field, c.layer, value, c.page, m.box, m.text, c.value,
                                        r.box, r.call, level))

    # Rule 6: one value per member, field and layer; project-wide settings get one value whatever their scope.
    groups: dict[tuple, list[Accepted]] = {}
    for a in result.accepted:
        scope = "*" if a.field in PROJECT_WIDE else a.member
        groups.setdefault((scope, a.field, a.layer, storey(a.level) or floor(a.level)), []).append(a)
    keep = []
    for (_scope, fld, layer, _level), group in groups.items():
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

    for m in matches:
        if m.kind in ("bars", "section", "links") and id(m) not in claimed:
            n_tc += 1
            result.unassigned.append(ToCheck(
                f"tc_{n_tc:04d}", None, m.kind, m.page, m.box, None, {"value": m.value}, "missing",
                "the parser read this value but Gemini did not report it"))
    return result
