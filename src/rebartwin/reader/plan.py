"""Item 4: joints from geometry. Grids, columns at grid intersections, beam bands, and which beam meets which column.

A beam layout (sheet 15, "FIRST FLOOR BEAM LAYOUT") and a column layout (sheet 21) share a grid: bubbles A to K,
A1 to K1 down one edge and 1, 2, ... along another. Code, not a model, reads the geometry:

1. `grid`: a bubble is a short label inside a drawn circle; its grid line is the drawn line that runs out of the
   circle, perpendicular to the edge the bubbles sit on (directly, or through a short leader where two bubbles are
   crowded). Grid lines are often drawn only as stubs near the bubbles; the stub's position is the line's.
2. `align`: per axis, scale and offset from one sheet's grid positions to the other's, from shared labels.
3. `columns`: a column label is tied to its drawn outline (a small filled shape); the column is at the grid
   intersection its outline holds.
4. `bands`: a beam is drawn as two parallel edges, often dashed; collinear dashes merge into one line and two edges
   at beam width make a band. An XB label ties to the horizontal band it sits on, a YB label to a vertical one.
5. `joints`: a band on a grid line meets the intersections it passes; one holding a column is a joint.

Nothing here guesses. Anything that does not fit (a label near an intersection but not on it, a label between two
bands, two marks on one side of a column) is returned as a problem for To check.

All positions are box units (0 to 1000 across the page each way); text heights are converted per axis.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from itertools import pairwise
from statistics import median

from .ingest import Box, Page, Seg, Word

GRID_LABEL = re.compile(r"(?:[A-Z]{1,2}\d{0,2}|\d{1,3})")
SLAB_MARK = re.compile(r"S\d+[A-Z]?")   # S1, S14: slab marks in circles, never grid bubbles
AXIS_TOL = 0.15          # box units: a segment this close to axis-aligned counts as horizontal or vertical
COLLINEAR = 0.3          # box units: dashes of one line share their coordinate within this
JOIN_PT = 0.5            # box units: two segment ends this close are joined (a leader's corner)
LEADER_HOPS = 3          # a bubble's leader is at most this many segments


def _centre(b: Box) -> tuple[float, float]:
    return (b[0] + b[2]) / 2, (b[1] + b[3]) / 2


def _inside(p: tuple[float, float], b: Box, pad: float = 0.0) -> bool:
    return b[0] - pad <= p[0] <= b[2] + pad and b[1] - pad <= p[1] <= b[3] + pad


# --- lines: segments merged into lines -------------------------------------------------------------------------------

@dataclass(frozen=True)
class Line:
    """An axis-aligned drawn line, dashes merged: `axis` "h" (at = y, lo..hi along x) or "v" (at = x, lo..hi in y)."""
    axis: str
    at: float
    lo: float
    hi: float

    @property
    def length(self) -> float:
        return self.hi - self.lo


def lines(segments: list[Seg], join: tuple[float, float]) -> list[Line]:
    """Merge collinear axis-aligned segments whose gaps are at most `join` (along x for horizontal lines, along y for
    vertical ones) into lines. A dashed line becomes one line; two dashed lines either side of a gap wider than
    `join` stay two."""
    by_axis: dict[str, list[tuple[float, float, float]]] = {"h": [], "v": []}
    for x0, y0, x1, y1 in segments:
        if abs(y0 - y1) <= AXIS_TOL and abs(x0 - x1) > AXIS_TOL:
            by_axis["h"].append(((y0 + y1) / 2, min(x0, x1), max(x0, x1)))
        elif abs(x0 - x1) <= AXIS_TOL and abs(y0 - y1) > AXIS_TOL:
            by_axis["v"].append(((x0 + x1) / 2, min(y0, y1), max(y0, y1)))
    out: list[Line] = []
    for axis, segs in by_axis.items():
        gap = join[0] if axis == "h" else join[1]
        segs.sort()
        rows: list[list[tuple[float, float, float]]] = []
        for s in segs:
            if rows and s[0] - rows[-1][0][0] <= COLLINEAR:
                rows[-1].append(s)
            else:
                rows.append([s])
        for row in rows:
            at = median(s[0] for s in row)
            row.sort(key=lambda s: s[1])
            lo, hi = row[0][1], row[0][2]
            for _, a, b in row[1:]:
                if a <= hi + gap:
                    hi = max(hi, b)
                else:
                    out.append(Line(axis, at, lo, hi))
                    lo, hi = a, b
            out.append(Line(axis, at, lo, hi))
    return out


# --- 1. grids --------------------------------------------------------------------------------------------------------

@dataclass
class Bubble:
    label: str
    circle: Box
    word: Word


@dataclass
class Grid:
    page: int
    xs: dict[str, float] = field(default_factory=dict)    # label -> x of a vertical grid line
    ys: dict[str, float] = field(default_factory=dict)    # label -> y of a horizontal grid line
    bubbles: list[Bubble] = field(default_factory=list)
    unplaced: list[str] = field(default_factory=list)     # bubbles whose grid line was not found

    def tol(self, axis: str) -> float:
        """How far a point may be from a grid line and still be on it: the smaller of half the smallest bay and 1% of
        the span, on that axis."""
        pos = sorted((self.xs if axis == "x" else self.ys).values())
        if len(pos) < 2:
            return 0.0
        bays = [b - a for a, b in pairwise(pos) if b - a > 0]
        return min(min(bays) / 2 if bays else 0.0, (pos[-1] - pos[0]) / 100)


def bubbles(page: Page) -> list[Bubble]:
    """Short labels inside drawn circles, slab marks (S1, S14) excepted. A circle holding more or less than one such word is not a bubble, nor is
    one much larger than its text (a detail callout's circle). Cached on the page."""
    cached = getattr(page, "_bubbles", None)
    if cached is not None:
        return cached
    found: list[Bubble] = []
    circles = page.shapes.circles if page.shapes else []
    words = [w for w in page.words if GRID_LABEL.fullmatch(w.text) and not SLAB_MARK.fullmatch(w.text)]
    for c in circles:
        inside = [w for w in words if _inside(_centre(w.box), c)]
        if len(inside) != 1:
            continue
        w = inside[0]
        if (c[2] - c[0]) > 4 * (w.box[2] - w.box[0]) or (c[2] - c[0]) < (w.box[2] - w.box[0]):
            continue
        found.append(Bubble(w.text, c, w))
    object.__setattr__(page, "_bubbles", found)
    return found


def bubble_words(page: Page) -> set[int]:
    """ids of the words that are grid bubbles: a bubble "C1" is grid line C1, never column C1."""
    return {id(b.word) for b in bubbles(page)}


def _clusters(values: list[tuple[float, Bubble]], gap: float) -> list[list[Bubble]]:
    values.sort(key=lambda v: v[0])
    out: list[list[tuple[float, Bubble]]] = []
    for v in values:
        if out and v[0] - out[-1][-1][0] <= gap:
            out[-1].append(v)
        else:
            out.append([v])
    return [[b for _, b in c] for c in out]


def grid(page: Page) -> Grid:
    """The grid of one sheet. Bubbles in a row (three or more at about the same height) name vertical lines (x);
    bubbles in a column name horizontal lines (y). Each bubble's line is the drawn line that leaves its circle
    perpendicular to that row: its end at the circle's edge, within half a radius, and its position within half a
    radius of the centre; or, for a bubble moved aside to make room, a short leader from the circle's edge to the
    end of such a line. The line's position is the grid's. A bubble with no such line, or a label given twice on one
    axis, places nothing."""
    g = Grid(page.number, bubbles=bubbles(page))
    if not g.bubbles or page.shapes is None:
        return g
    size = median(b.circle[2] - b.circle[0] for b in g.bubbles)
    width = median(b.circle[3] - b.circle[1] for b in g.bubbles)
    rows = [c for c in _clusters([(_centre(b.circle)[0], b) for b in g.bubbles], size) if len(c) >= 3]
    cols = [c for c in _clusters([(_centre(b.circle)[1], b) for b in g.bubbles], width) if len(c) >= 3]
    merged = lines(page.shapes.segments, (width / 2, size / 2))
    lns = [ln for ln in merged if ln.length >= 2 * min(size, width)]
    short = 3 * max(size, width)
    # leader pieces: short drawn segments, and short dashed lines merged with a tighter gap (a quarter of the circle)
    # so a dashed leader is one piece but two neighbouring leaders' legs stay apart
    leaders: list[Seg] = [(ln.lo, ln.at, ln.hi, ln.at) if ln.axis == "h" else (ln.at, ln.lo, ln.at, ln.hi)
                          for ln in lines(page.shapes.segments, (width / 4, size / 4)) if ln.length <= short]
    leaders += [s for s in page.shapes.segments if 0 < ((s[0] - s[2]) ** 2 + (s[1] - s[3]) ** 2) ** 0.5 <= short]

    def place(b: Bubble, axis: str) -> float | None:
        cy, cx = _centre(b.circle)
        ry, rx = (b.circle[2] - b.circle[0]) / 2, (b.circle[3] - b.circle[1]) / 2
        # axis "x": vertical lines leave the circle at its top or bottom
        want = "v" if axis == "x" else "h"
        across, along, r_across, r_along = (cx, cy, rx, ry) if axis == "x" else (cy, cx, ry, rx)
        cands = [ln for ln in lns if ln.axis == want]
        direct = [ln for ln in cands if abs(ln.at - across) <= r_across / 2 and
                  min(abs(ln.lo - (along + r_along)), abs(ln.hi - (along - r_along))) <= r_along / 2]
        if len(direct) == 1:
            return direct[0].at
        if direct:
            return None
        # A leader: up to LEADER_HOPS short segments joined end to end, from the circle's edge to the end of a grid
        # line that is not straight on from the bubble.
        def ends_line(p: tuple[float, float]) -> set[float]:
            p_across, p_along = (p[0], p[1]) if axis == "x" else (p[1], p[0])
            if abs(p_across - across) <= r_across / 2:
                return set()
            return {round(ln.at, 2) for ln in cands if abs(ln.at - p_across) <= COLLINEAR
                    and min(abs(ln.lo - p_along), abs(ln.hi - p_along)) <= JOIN_PT}

        found: set[float] = set()
        frontier = []
        for s in leaders:
            for e, f in (((s[0], s[1]), (s[2], s[3])), ((s[2], s[3]), (s[0], s[1]))):
                if 0.8 <= (((e[0] - cx) / rx) ** 2 + ((e[1] - cy) / ry) ** 2) ** 0.5 <= 1.2:
                    frontier.append((f, s))
        seen = {id(s) for _, s in frontier}
        for _ in range(LEADER_HOPS):
            nxt = []
            for p, _s in frontier:
                found |= ends_line(p)
                for s in leaders:
                    if id(s) in seen:
                        continue
                    for e, f in (((s[0], s[1]), (s[2], s[3])), ((s[2], s[3]), (s[0], s[1]))):
                        if abs(e[0] - p[0]) <= JOIN_PT and abs(e[1] - p[1]) <= JOIN_PT:
                            nxt.append((f, s))
                            seen.add(id(s))
            frontier = nxt
        return found.pop() if len(found) == 1 else None

    # A bubble names a line on one axis only: the one whose cluster of bubbles is larger.
    in_row = {id(b): len(c) for c in rows for b in c}
    in_col = {id(b): len(c) for c in cols for b in c}
    for axis, groups in (("x", rows), ("y", cols)):
        placed: dict[str, list[float]] = {}
        for group in groups:
            for b in group:
                mine, other = (in_row, in_col) if axis == "x" else (in_col, in_row)
                if other.get(id(b), 0) >= mine[id(b)]:
                    continue
                at = place(b, axis)
                if at is None:
                    g.unplaced.append(b.label)
                else:
                    placed.setdefault(b.label, []).append(at)
        target = g.xs if axis == "x" else g.ys
        for label, ats in placed.items():
            if len(ats) == 1:
                target[label] = ats[0]
            else:
                g.unplaced.append(label)
    return g


# --- 2. align --------------------------------------------------------------------------------------------------------

@dataclass
class Fit:
    scale: float
    offset: float
    labels: list[str]
    worst: float             # largest residual, box units on the target sheet
    span: float

    def map(self, v: float) -> float:
        return self.scale * v + self.offset


def fit_axis(src: dict[str, float], dst: dict[str, float]) -> tuple[Fit | None, str]:
    """Least-squares scale and offset from `src` positions to `dst` over the labels both have. None, with the reason,
    unless at least 2 labels are shared and the worst residual is under 0.5% of the target's span."""
    shared = sorted(set(src) & set(dst))
    if len(shared) < 2:
        return None, f"{len(shared)} shared grid label{'s' if len(shared) != 1 else ''}; 2 are needed"
    xs, ys = [src[k] for k in shared], [dst[k] for k in shared]
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    if sxx == 0:
        return None, "the shared grid lines are all at one position"
    scale = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sxx
    offset = my - scale * mx
    worst = max(abs(scale * x + offset - y) for x, y in zip(xs, ys))
    span = max(dst.values()) - min(dst.values())
    f = Fit(scale, offset, shared, worst, span)
    if span <= 0 or worst >= 0.005 * span:
        return None, f"the grids do not match: worst residual {worst:.2f} is not under 0.5% of the span {span:.1f}"
    return f, ""


def align(src: Grid, dst: Grid) -> tuple[Fit | None, Fit | None, str]:
    """Both axes of `src` mapped onto `dst`; the reason when either does not fit."""
    fx, wx = fit_axis(src.xs, dst.xs)
    fy, wy = fit_axis(src.ys, dst.ys)
    why = "; ".join(f"{a}: {w}" for a, w in (("x", wx), ("y", wy)) if w)
    return fx, fy, why


# --- 3. columns ------------------------------------------------------------------------------------------------------

COLUMN_ID = re.compile(r"C\d{1,3}[A-Z]?")
NEAR = 1.5               # text heights: a label this close to an outline is that outline's label


@dataclass
class Column:
    """A column on the column layout: its label, the outline tied to it, and the grid lines its outline covers. Close
    sub-grids (B and B1 are 250 mm apart on the IITH set) mean a 600 mm column can cover two lines on one axis; the
    beam's own grid line then says which intersection it meets the column at."""
    id: str
    label: Box
    outline: Box | None
    xs: list[str] = field(default_factory=list)
    ys: list[str] = field(default_factory=list)

    @property
    def area(self) -> Box:
        return self.outline or self.label

    def name(self) -> str:
        return f"{'/'.join(self.ys) or '?'}-{'/'.join(self.xs) or '?'}"


@dataclass
class Problem:
    member: str
    page: int
    box: Box
    detail: str


def _gap(page: Page, a: Box, b: Box) -> float:
    """Shortest distance between two boxes in points."""
    sx, sy = page.width / 1000, page.height / 1000
    dx = max(0.0, b[1] - a[3], a[1] - b[3]) * sx
    dy = max(0.0, b[0] - a[2], a[0] - b[2]) * sy
    return (dx * dx + dy * dy) ** 0.5


def _height_pt(page: Page, b: Box) -> float:
    """A label's text height in points: the smaller side, so vertical text counts the same as horizontal."""
    return min((b[2] - b[0]) * page.height, (b[3] - b[1]) * page.width) / 1000


def member_labels(page: Page) -> list[tuple[str, Box]]:
    """Member ids written on the sheet as their own text (comments or words), bubbles excluded."""
    skip = bubble_words(page)
    from .parser import _MEMBER
    out = []
    for w in page.words:
        if id(w) in skip:
            continue
        m = _MEMBER.fullmatch(w.text.strip())
        if m:
            out.append((f"{m.group(1)}{m.group(2)}", w.box))
    return out


def columns(page: Page, g: Grid) -> tuple[list[Column], list[Problem]]:
    """Columns on a column layout. Each column label is tied to the filled outline nearest it, within NEAR text
    heights, when no other column label is nearer that outline (mutual nearest). The column covers the grid lines
    that cross its outline, grown by the grid tolerance on each axis. A column covering no line on an axis is near
    the grid but not on it: a problem, and no column."""
    fills = page.shapes.fills if page.shapes else []
    labels = [(i, b) for i, b in member_labels(page) if COLUMN_ID.fullmatch(i)]
    tx, ty = g.tol("x"), g.tol("y")
    nearest_label: dict[int, int] = {}
    for k, f in enumerate(fills):
        d = [(_gap(page, b, f), j) for j, (_, b) in enumerate(labels)]
        if d:
            nearest_label[k] = min(d)[1]
    out: list[Column] = []
    problems: list[Problem] = []
    for j, (cid, b) in enumerate(labels):
        h = _height_pt(page, b)
        cands = sorted((_gap(page, b, f), k) for k, f in enumerate(fills))
        cands = [(d, k) for d, k in cands if d <= NEAR * h and nearest_label.get(k) == j]
        col = Column(cid, b, fills[cands[0][1]] if cands else None)
        a = col.area
        col.xs = sorted((k for k, x in g.xs.items() if a[1] - tx <= x <= a[3] + tx), key=g.xs.get)
        col.ys = sorted((k for k, y in g.ys.items() if a[0] - ty <= y <= a[2] + ty), key=g.ys.get)
        if col.xs and col.ys:
            out.append(col)
            continue
        cy, cx = _centre(a)
        nx = col.xs or ([min(g.xs, key=lambda k: abs(g.xs[k] - cx))] if g.xs else ["?"])
        ny = col.ys or ([min(g.ys, key=lambda k: abs(g.ys[k] - cy))] if g.ys else ["?"])
        what = "its outline" if col.outline else "its label (no outline found)"
        problems.append(Problem(cid, page.number, b, f"{cid} is near {'/'.join(ny)}-{'/'.join(nx)} but {what} is "
                                "not on that grid intersection"))
    return out, problems


# --- 4. beam bands ---------------------------------------------------------------------------------------------------

BAND_MIN, BAND_MAX = 0.15, 1.2   # text heights: two parallel edges this far apart make a beam band on a plan
OVERLAP = 0.5                     # the two edges overlap along at least this share of the shorter one


@dataclass
class Band:
    """Two (or more, merged) parallel edges of one drawn member: `axis` "h" runs along x. `e0`..`e1` across it,
    `lo`..`hi` along it, where its edges overlap."""
    axis: str
    e0: float
    e1: float
    lo: float
    hi: float

    def gap_to(self, page: Page, b: Box) -> float:
        box = (self.e0, self.lo, self.e1, self.hi) if self.axis == "h" else (self.lo, self.e0, self.hi, self.e1)
        return _gap(page, box, b)

    def side(self, b: Box) -> int:
        """-1 when the box is before the band across it (above, or left), 1 after, 0 overlapping."""
        c = _centre(b)[0] if self.axis == "h" else _centre(b)[1]
        return -1 if c < self.e0 else 1 if c > self.e1 else 0


def text_height(page: Page) -> float:
    """The median height of the sheet's member labels, in points: the scale for plan geometry."""
    hs = [_height_pt(page, b) for _, b in member_labels(page)]
    return median(hs) if hs else 10.0


def _root(parent: list[int], k: int) -> int:
    """Union-find: the representative of k's group."""
    while parent[k] != k:
        parent[k] = parent[parent[k]]
        k = parent[k]
    return k


def bands(page: Page, sep: tuple[float, float] = (BAND_MIN, BAND_MAX)) -> list[Band]:
    """Beam bands: parallel lines at least 3 text heights long, dashes merged (gaps up to one text height), whose
    separation is `sep` text heights and which overlap along at least half the shorter. Bands sharing an edge merge
    into one (a beam drawn with a third line along it). Cached per `sep`."""
    key = ("_bands", sep)
    cache = getattr(page, "_plan_cache", None)
    if cache is None:
        cache = {}
        object.__setattr__(page, "_plan_cache", cache)
    if key in cache:
        return cache[key]
    if page.shapes is None:
        return []
    h = text_height(page)
    hx, hy = h * 1000 / page.width, h * 1000 / page.height
    out: list[Band] = []
    for axis in ("h", "v"):
        unit = hy if axis == "h" else hx                 # across the band
        along = hx if axis == "h" else hy
        lns = sorted((ln for ln in lines(page.shapes.segments, (hx, hy)) if ln.axis == axis
                      and ln.length >= 3 * along), key=lambda ln: ln.at)
        pairs: list[tuple[int, int]] = []
        for i, a in enumerate(lns):
            for j in range(i + 1, len(lns)):
                b = lns[j]
                d = b.at - a.at
                if d > sep[1] * unit:
                    break
                ov = min(a.hi, b.hi) - max(a.lo, b.lo)
                if d >= sep[0] * unit and ov >= OVERLAP * min(a.length, b.length):
                    pairs.append((i, j))
        # merge pairs sharing a line
        parent = list(range(len(lns)))

        for i, j in pairs:
            parent[_root(parent, i)] = _root(parent, j)
        groups: dict[int, list[tuple[int, int]]] = {}
        for i, j in pairs:
            groups.setdefault(_root(parent, i), []).append((i, j))
        for ps in groups.values():
            ids = {k for p in ps for k in p}
            ls = [lns[k] for k in ids]
            lo = min(max(lns[i].lo, lns[j].lo) for i, j in ps)
            hi = max(min(lns[i].hi, lns[j].hi) for i, j in ps)
            out.append(Band(axis, min(ln.at for ln in ls), max(ln.at for ln in ls), lo, hi))
    cache[key] = out
    return out


@dataclass
class Beam:
    id: str
    label: Box
    band: Band | None = None
    grid: list[str] = field(default_factory=list)    # the grid line(s) the band lies on


def tie_to_band(page: Page, box: Box, axis: str) -> Band | str:
    """The band a label sits on, along `axis`, or why there is none. A candidate band runs along `axis`, has the
    label's centre within its length (give or take a text height), and is within NEAR text heights of the label. One
    candidate: that band. Candidates on both sides of the label: it sits between two bands. All on one side: the
    nearest, if the next is at least twice as far; else it is about as near two."""
    h = text_height(page)
    cy, cx = _centre(box)
    c_along = cx if axis == "h" else cy
    slack = h * 1000 / (page.width if axis == "h" else page.height)
    cands = sorted(((b.gap_to(page, box), k, b) for k, b in enumerate(bands(page)) if b.axis == axis
                    and b.lo - slack <= c_along <= b.hi + slack), key=lambda t: (t[0], t[1]))
    cands = [(d, b) for d, _, b in cands if d <= NEAR * _height_pt(page, box)]
    if not cands:
        return "no beam band found under it"
    sides = {b.side(box) for _, b in cands}
    if len(cands) > 1 and -1 in sides and 1 in sides:
        return "it sits between two beam bands"
    if len(cands) > 1 and cands[1][0] < 2 * cands[0][0]:
        return "it is about as near two beam bands"
    return cands[0][1]


def beams(page: Page, g: Grid) -> tuple[list[Beam], list[Problem]]:
    """XB and YB labels tied to the band they sit on, along their stated direction (XB along x; `tie_to_band`), and
    the band's grid line: the grid lines of the other axis between its edges, give or take the grid tolerance."""
    out: list[Beam] = []
    problems: list[Problem] = []
    for bid, box in member_labels(page):
        if bid[:2] not in ("XB", "YB"):
            continue
        axis = "h" if bid.startswith("XB") else "v"
        band = tie_to_band(page, box, axis)
        if isinstance(band, str):
            problems.append(Problem(bid, page.number, box, f"the label {bid}: {band}"))
            continue
        pos, tol = (g.ys, g.tol("y")) if axis == "h" else (g.xs, g.tol("x"))
        out.append(Beam(bid, box, band, sorted((k for k, v in pos.items() if band.e0 - tol <= v <= band.e1 + tol),
                                                key=pos.get)))
    return out, problems


def band_tie(page: Page, box: Box) -> tuple[set[str], str] | None:
    """On a plan, the beam a value (a size label) belongs to by geometry: the band the value sits on, read along its
    text (horizontal text along x, vertical along y), and the XB or YB labels tied to that same band. Returns (the
    beam ids on that band, "") or (empty, why) when the value sits on no single band; None on a sheet with no tied
    beam labels, where geometry says nothing."""
    cache = getattr(page, "_plan_cache", None)
    if cache is None:
        cache = {}
        object.__setattr__(page, "_plan_cache", cache)
    if "tied" not in cache:
        tied: dict[int, set[str]] = {}
        for bid, b in member_labels(page):
            if bid[:2] in ("XB", "YB"):
                band = tie_to_band(page, b, "h" if bid.startswith("XB") else "v")
                if not isinstance(band, str):
                    tied.setdefault(id(band), set()).add(bid)
        cache["tied"] = tied
    tied = cache["tied"]
    if not tied:
        return None
    vertical = (box[2] - box[0]) * page.height > (box[3] - box[1]) * page.width
    band = tie_to_band(page, box, "v" if vertical else "h")
    if isinstance(band, str):
        return set(), band
    return tied.get(id(band), set()), ""


# --- 5 to 7. joints --------------------------------------------------------------------------------------------------

@dataclass
class Meet:
    """A beam meets a column: found on the beam layout (`beam_page`) and the column layout (`column_page`)."""
    beam: str
    column: str
    at: str                  # the grid intersection, e.g. "F-14" (letters, then numbers)
    beam_page: int
    beam_box: Box
    column_page: int
    column_box: Box
    level: str | None        # the beam layout's title, e.g. "FIRST FLOOR BEAM LAYOUT"


@dataclass
class Plans:
    meets: list[Meet] = field(default_factory=list)
    junctions: list[dict] = field(default_factory=list)     # beam on beam, or beam off the grid: no joint
    problems: list[Problem] = field(default_factory=list)
    alignment: dict = field(default_factory=dict)


def plan_title(page: Page) -> str | None:
    """The layout's title, read for its floor: a line naming a floor and LAYOUT or PLAN ("FIRST FLOOR BEAM LAYOUT").
    None unless exactly one floor is named that way."""
    from .levels import _FLOOR_WORD, floor
    from .parser import visual_lines
    found: dict[str, list[str]] = {}
    for line in visual_lines(page, tokens=False):
        text = " ".join(w.text for w in line)
        if re.search(r"\b(LAYOUT|PLAN)\b", text.upper()) and _FLOOR_WORD.search(text.upper()):
            found.setdefault(floor(text), []).append(text)
    if len(found) != 1:
        return None
    texts = next(iter(found.values()))
    return next((t for t in texts if "BEAM" in t.upper()), texts[0])


def meet(beam_page: Page, column_page: Page) -> Plans:
    """Which beam meets which column, from a beam layout and a column layout of one floor.

    The beam layout's grid is fitted onto the column layout's (`align`); without a fit, nothing is linked and the
    reason is one problem. Each tied beam band, mapped onto the column layout, meets every column whose outline it
    overlaps across its width and reaches along its length (give or take one text height of the column layout, since
    edges stop at column faces). Outlines decide, not grid lines, so a beam flush with a column's face (off its grid
    line) still meets it; the grid names the place. Where a band ends at a grid intersection with no column, that is a beam-on-beam junction, kept in
    `junctions`, not a problem. A column with beams of different marks along one direction is a problem for each of
    them (the engine takes one beam per direction); the same mark either side is one beam."""
    out = Plans()
    gb, gc = grid(beam_page), grid(column_page)
    fx, fy, why = align(gb, gc)
    out.alignment = {"beam_page": beam_page.number, "column_page": column_page.number,
                     "x": fx and {"scale": round(fx.scale, 5), "offset": round(fx.offset, 3),
                                  "labels": len(fx.labels), "worst": round(fx.worst, 3)},
                     "y": fy and {"scale": round(fy.scale, 5), "offset": round(fy.offset, 3),
                                  "labels": len(fy.labels), "worst": round(fy.worst, 3)}}
    if fx is None or fy is None:
        out.problems.append(Problem("ALL", beam_page.number, (0, 0, 0, 0), f"the beam layout on sheet "
                                    f"{beam_page.number} does not line up with the column layout on sheet "
                                    f"{column_page.number} ({why}); its joints need a person"))
        return out
    level = plan_title(beam_page)
    cols, col_problems = columns(column_page, gc)
    bms, beam_problems = beams(beam_page, gb)
    out.problems += beam_problems
    ext_x = text_height(column_page) * 1000 / column_page.width
    ext_y = text_height(column_page) * 1000 / column_page.height
    seen: set[tuple[str, int]] = set()
    found: list[tuple[Meet, Column, str]] = []
    for b in bms:
        if (b.id, id(b.band)) in seen:
            continue
        seen.add((b.id, id(b.band)))
        horizontal = b.band.axis == "h"
        f, g2, ext = (fx, fy, ext_x) if horizontal else (fy, fx, ext_y)
        lo, hi = sorted((f.map(b.band.lo), f.map(b.band.hi)))
        lo, hi = lo - ext, hi + ext
        e0, e1 = sorted((g2.map(b.band.e0), g2.map(b.band.e1)))
        hits = []
        for c in cols:
            a = c.area
            along, across = ((a[1], a[3]), (a[0], a[2])) if horizontal else ((a[0], a[2]), (a[1], a[3]))
            if along[0] <= hi and lo <= along[1] and across[0] <= e1 and e0 <= across[1]:
                hits.append(c)
                found.append((Meet(b.id, c.id, c.name(), beam_page.number, b.label, column_page.number, c.label,
                                   level), c, "x" if horizontal else "y"))
        if not b.grid:
            if not hits:
                out.junctions.append({"beam": b.id, "page": beam_page.number, "kind": "off grid",
                                      "detail": f"{b.id} is on no named grid line and meets no column; it frames "
                                      "into other beams"})
            continue
        # band ends with no column there: beam on beam
        cross = gc.xs if horizontal else gc.ys
        for end in (lo + ext, hi - ext):
            near = [k for k, v in cross.items() if abs(v - end) <= ext]
            covered = [c for c in hits if set(c.xs if horizontal else c.ys) & set(near)]
            if near and not covered:
                names = [f"{'/'.join(b.grid)}-{k}" if horizontal else f"{k}-{'/'.join(b.grid)}" for k in near]
                out.junctions.append({"beam": b.id, "page": beam_page.number, "kind": "beam on beam",
                                      "at": names, "detail": f"{b.id} ends at {' or '.join(names)}, where no "
                                      "column is on the column layout"})
    # one beam per direction at each column
    by_col: dict[tuple[int, str], list[Meet]] = {}
    for m, c, way in found:
        by_col.setdefault((id(c), way), []).append(m)
    for (_, way), ms in by_col.items():
        marks = sorted({m.beam for m in ms})
        if len(marks) == 1:
            out.meets.append(ms[0])
            continue
        for m in ms:
            out.problems.append(Problem(m.beam, m.beam_page, m.beam_box, f"{m.column} at {m.at} has "
                                        f"{' and '.join(marks)} along {way.upper()}; the engine takes one beam per "
                                        "direction, so which one is this joint's needs a person"))
    out.problems += [p for p in col_problems]
    return out


# --- into the reading ------------------------------------------------------------------------------------------------

def roles(pages: list[Page]) -> tuple[list[Page], list[Page]]:
    """Beam layouts (a grid on both axes and at least one XB or YB label tied to a band) and column layouts (a grid on
    both axes, at least three columns on it, and no tied beam label)."""
    beam_pages, column_pages = [], []
    for p in pages:
        g = grid(p)
        if len(g.xs) < 2 or len(g.ys) < 2:
            continue
        bms, _ = beams(p, g)
        if bms:
            beam_pages.append(p)
        elif len(columns(p, g)[0]) >= 3:
            column_pages.append(p)
    return beam_pages, column_pages


def read_plans(pages: list[Page], agreement) -> dict:
    """Add a code-made `frames_into` field (status "geometry") for each beam that meets a column on a beam layout and
    its column layout, and a To check item for each problem; return what reading.json records: the alignment, the
    joints found, and the beam-on-beam junctions. A beam layout pairs with the one column layout its grid fits; with
    none or several, its beams' joints need a person."""
    from .agree import Accepted, ToCheck
    from .ingest import box_2d

    beam_pages, column_pages = roles(pages)
    info: dict = {"beam_layouts": [p.number for p in beam_pages], "column_layouts": [p.number for p in column_pages],
                  "alignment": [], "joints": [], "junctions": []}
    n_tc = len(agreement.to_check) + len(agreement.unassigned)

    def flag(member: str | None, page: int, box: Box | None, reason: str, detail: str) -> None:
        nonlocal n_tc
        n_tc += 1
        agreement.to_check.append(ToCheck(f"tc_{n_tc:04d}", member, "frames_into", page, box, None, None, reason,
                                          detail))

    have = {(a.member, a.value, a.level, a.at) for a in agreement.accepted if a.field == "frames_into"}
    made: list[Accepted] = []
    for bp in beam_pages:
        fits = [cp for cp in column_pages if all(align(grid(bp), grid(cp))[:2])]
        if len(fits) != 1:
            flag(None, bp.number, None, "missing" if not fits else "ambiguous",
                 f"the beam layout on sheet {bp.number} lines up with "
                 f"{'no column layout' if not fits else 'column layouts on sheets ' + ', '.join(str(p.number) for p in fits)}"
                 "; which column each beam meets needs a person")
            continue
        r = meet(bp, fits[0])
        info["alignment"].append(r.alignment)
        info["junctions"] += r.junctions
        for p in r.problems:
            flag(None if p.member == "ALL" else p.member, p.page, p.box, "ambiguous", p.detail)
        for m in r.meets:
            info["joints"].append({"beam": m.beam, "column": m.column, "at": m.at, "level": m.level,
                                   "beam_page": m.beam_page, "column_page": m.column_page})
            if (m.beam, m.column, m.level, m.at) in have:     # one field per place: C5 is at F-14 and F-33
                continue
            have.add((m.beam, m.column, m.level, m.at))
            made.append(Accepted(
                "", m.beam, "frames_into", 1, m.column, m.beam_page, m.beam_box, f"{m.beam} / {m.column} at {m.at}",
                "", (0.0, 0.0, 0.0, 0.0), "geometry", m.level, status="geometry",
                refs=[{"page": m.column_page, "box_2d": box_2d(m.column_box), "text": m.column, "at": m.at}],
                at=m.at))
    start = len(agreement.accepted)
    for i, a in enumerate(made, start + 1):
        a.id = f"f{i:04d}"
    agreement.accepted += made
    return info


# --- 8. beam elevations ----------------------------------------------------------------------------------------------

TITLE = re.compile(r"((?:XB|YB|FB|PB|RB|GB|TB|LB|SB|CB|B)\d{1,3}[A-Z]?)\s*\(")
SPAN_ABOVE = 3.0         # text heights: the lines that give an elevation's length are this close above its title
SPAN_LEFT = 2.0          # text heights: ... and start this close to the title's left end


@dataclass
class Elevation:
    member: str
    title: Box
    lo: float                # the elevation's x-span
    hi: float


def elevations(page: Page) -> list[Elevation]:
    """Beam elevations on a detail sheet: each titled below by "XB1(200x600-inv)". The elevation's x-span is the
    reach of the long horizontal lines (dimension lines, the beam's edges) within SPAN_ABOVE text heights above the
    title that start within SPAN_LEFT text heights of its left end: an elevation and its title share a left end.
    Cached."""
    cache = getattr(page, "_plan_cache", None)
    if cache is None:
        cache = {}
        object.__setattr__(page, "_plan_cache", cache)
    if "elevations" in cache:
        return cache["elevations"]
    out: list[Elevation] = []
    titles = [(m.group(1), w.box) for w in page.words if (m := TITLE.match(w.text.strip()))]
    if titles and page.shapes is not None:
        h = median(_height_pt(page, b) for _, b in titles)
        hx, hy = h * 1000 / page.width, h * 1000 / page.height
        long = [ln for ln in lines(page.shapes.segments, (hx, hy)) if ln.axis == "h" and ln.length >= 5 * hx]
        for member, b in titles:
            near = [ln for ln in long if b[0] - SPAN_ABOVE * hy <= ln.at < b[0] and abs(ln.lo - b[1]) <= SPAN_LEFT * hx]
            if near:
                out.append(Elevation(member, b, min(ln.lo for ln in near), max(ln.hi for ln in near)))
    cache["elevations"] = out
    return out


def elevation_tie(page: Page, box: Box) -> tuple[set[str], str] | None:
    """On a detail sheet, the beam a callout belongs to by geometry: the elevation whose title is the nearest below
    the callout among those whose x-span holds the callout's centre, provided no other title lies between them across
    that span (the callout would then be above another elevation's title, so in that elevation's band or above it).
    Returns ({member}, "") for exactly one such elevation, (empty, why) when two fit equally; None on a sheet with no
    elevation titles, or a callout under no elevation, where geometry says nothing."""
    els = elevations(page)
    if not els:
        return None
    cx = _centre(box)[1]
    below = sorted((e for e in els if e.title[0] >= box[2] and e.lo <= cx <= e.hi), key=lambda e: e.title[0])
    if not below:
        return None
    first = below[0]
    between = [e for e in els if e is not first and box[2] <= e.title[0] < first.title[0]
               and e.title[1] < first.hi and first.lo < e.title[3]]
    if between:
        return None
    same = [e for e in below if abs(e.title[0] - first.title[0]) < (first.title[2] - first.title[0])]
    names = {e.member for e in same}
    if len(names) > 1:
        return set(), f"elevations {', '.join(sorted(names))} both lie below this callout"
    return names, ""


def support_at(page: Page, box: Box) -> str | None:
    """The support an extra top bar callout on a beam elevation belongs to, by the grid bubble under it: the grid
    bubbles below the callout within its elevation's span (down to two title heights under the title), the nearest
    to the callout's centre in x, provided the next nearest is at least twice as far. None when the sheet marks no
    support there or it is not clear: then the extra's support needs a person, never a guess."""
    found = elevation_tie(page, box)
    if not found or len(found[0]) != 1:
        return None
    member = next(iter(found[0]))
    cx = _centre(box)[1]
    els = [e for e in elevations(page) if e.member == member and e.lo <= cx <= e.hi and e.title[0] >= box[2]]
    if not els:
        return None
    e = min(els, key=lambda e: e.title[0])
    depth = 2 * (e.title[2] - e.title[0])
    under = sorted((abs(_centre(b.circle)[1] - cx), b.label) for b in bubbles(page)
                   if box[2] <= _centre(b.circle)[0] <= e.title[2] + depth and e.lo <= _centre(b.circle)[1] <= e.hi)
    if not under or (len(under) > 1 and under[1][0] < 2 * under[0][0]):
        return None
    return under[0][1]
