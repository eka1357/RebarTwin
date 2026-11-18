"""The detailing rules, each a plain function from the 3D cage to findings with a clause, a measured value and a
limit. A rule never asks a model anything. `basis` records where each rule's text was checked, so nobody mistakes
an unverified reading of the code for the code (see docs/rules.md)."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Literal

from pydantic import BaseModel

from .numbers import fmt
from .geometry import boxes_overlap, clear_gap
from .layout import Bar, Cage
from .model import Joint

TOL = 1e-6          # mm: a measured value this close to its limit passes
LINE_TOL = 1.0      # mm: bars count as vertically in line when their centres are this close across the width

NOMINAL_COVER = {"mild": 20, "moderate": 30, "severe": 45, "very_severe": 50, "extreme": 75}   # IS 456 Table 16


class Finding(BaseModel):
    rule: str
    clause: str
    title: str
    status: Literal["fail", "pass"]
    measured: float
    limit: float
    compare: Literal[">=", "<="] = ">="
    unit: str = "mm"
    members: list[str]
    bars: list[str] = []
    at: tuple[float, float, float] | None = None
    span: tuple[tuple[float, float, float], tuple[float, float, float]] | None = None   # a dimension to draw, mm
    margin: float = 0.0            # signed, in `unit`: how far inside the limit (positive passes, negative fails)
    message: str

    @property
    def key(self) -> str:
        """Stable identity: the same problem in two runs has the same key."""
        return f"{self.rule}|{'|'.join(sorted(self.bars)) if self.bars else '|'.join(self.members)}"


@dataclass(frozen=True)
class Rule:
    id: str
    clause: str
    title: str
    basis: str
    run: Callable[[Cage, Joint], list[Finding]]
    seismic: bool = False          # an IS 13920 rule: runs only when IS 13920 applies
    knock_on: bool = False         # fixed by changing another element (a column size, the other face of a beam)


def _ok(measured: float, limit: float, compare: str = ">=") -> bool:
    return measured >= limit - TOL if compare == ">=" else measured <= limit + TOL


def _finding(rule: Rule, measured: float, limit: float, members: list[str], message: str, *, bars=(), at=None,
             span=None, compare=">=", unit="mm") -> Finding:
    """`margin` is measured minus limit for '>=', limit minus measured for '<=', so its sign is the verdict (within the
    tolerance) and the web never subtracts."""
    margin = measured - limit if compare == ">=" else limit - measured
    return Finding(rule=rule.id, clause=rule.clause, title=rule.title,
                   status="pass" if _ok(measured, limit, compare) else "fail", measured=round(measured, 3),
                   limit=round(limit, 3), compare=compare, unit=unit, members=members, bars=list(bars), at=at,
                   span=span, margin=round(margin, 3), message=message)


def _mid(a: Bar, b: Bar) -> tuple[float, float, float]:
    return clear_gap(a, b)[1]


# ------------------------------------------------------------------------------------------------ IS 456

def horizontal_spacing(cage: Cage, joint: Joint) -> list[Finding]:
    agg, out = joint.settings.aggregate, []
    for (beam_id, face, k), row in cage.layers.items():
        for a, b in zip(row, row[1:]):
            gap = abs(b.lateral - a.lateral) - (a.dia + b.dia) / 2
            limit = max(a.dia, b.dia, agg + 5)
            where = f"layer {k} " if k > 1 else ""
            out.append(_finding(HORIZONTAL, gap, limit, [beam_id],
                                f"{beam_id} {face} {where}bars {a.index} and {b.index} are {fmt(gap)} mm apart; "
                                f"with {agg:g} mm aggregate and {max(a.dia, b.dia):g} mm bars the code needs "
                                f"{fmt(limit)} mm", bars=(a.id, b.id), at=_mid(a, b)))
    for face, row in cage.column_faces.items():
        for a, b in zip(row, row[1:]):
            centres = ((a.p0[0] - b.p0[0]) ** 2 + (a.p0[1] - b.p0[1]) ** 2) ** 0.5
            gap = centres - (a.dia + b.dia) / 2
            limit = max(a.dia, b.dia, agg + 5)
            out.append(_finding(HORIZONTAL, gap, limit, [a.member],
                                f"{a.member} column bars {a.index} and {b.index} on face {face} are {fmt(gap)} mm "
                                f"apart; the code needs {fmt(limit)} mm", bars=(a.id, b.id), at=_mid(a, b)))
    return out


def vertical_spacing(cage: Cage, joint: Joint) -> list[Finding]:
    agg, out = joint.settings.aggregate, []
    for (beam_id, face, k), row in cage.layers.items():
        if k == 1:
            continue
        above = cage.layers[(beam_id, face, k - 1)]
        for bar in row:
            near = min(above, key=lambda o: abs(o.lateral - bar.lateral))
            offset = abs(near.lateral - bar.lateral)
            if offset > LINE_TOL:
                out.append(_finding(IN_LINE, offset, 0.0, [beam_id],
                                    f"{beam_id} {face} bar {bar.index} of layer {k} is {fmt(offset)} mm off the line "
                                    f"of the bar it should sit under; rows must be vertically in line",
                                    bars=(bar.id, near.id), at=_mid(bar, near), compare="<="))
                continue
            gap = abs(near.level - bar.level) - (near.dia + bar.dia) / 2
            limit = max(15.0, 2 * agg / 3, near.dia, bar.dia)
            out.append(_finding(VERTICAL, gap, limit, [beam_id],
                                f"{beam_id} {face} layers {k - 1} and {k} are {fmt(gap)} mm apart vertically; the "
                                f"code needs {fmt(limit)} mm", bars=(near.id, bar.id), at=_mid(near, bar)))
    return out


def nominal_cover(cage: Cage, joint: Joint) -> list[Finding]:
    s, out = joint.settings, []
    need = NOMINAL_COVER[s.exposure]
    c = joint.column
    members = [(c.id, c.link_cover, c.main_dias, "ties")] + [
        (b.id, b.link_cover, [d for layer in [*b.top, *b.bottom] for d in layer.diameters()], "stirrups")
        for b in joint.beams]
    for member, cover, dias, links in members:
        limit = need - 5 if s.exposure == "mild" and max(dias) <= 12 else need
        out.append(_finding(COVER, cover, limit, [member],
                            f"{member} has {cover:g} mm of concrete outside its {links}; {s.exposure.replace('_', ' ')} "
                            f"exposure needs {limit:g} mm"))
    return out


def column_main_cover(cage: Cage, joint: Joint) -> list[Finding]:
    c = joint.column
    big = max(c.main_dias)                 # every main bar has the same cover; the largest sets the limit
    small = min(c.b, c.h) <= 200 and big <= 12
    limit = 25.0 if small else max(40.0, big)
    return [_finding(COLUMN_COVER, c.main_cover, limit, [c.id],
                     f"{c.id} has {c.main_cover:g} mm of concrete outside its main bars; the code needs {limit:g} mm")]


# ------------------------------------------------------------------------------------------------ geometry

def clashes(cage: Cage, joint: Joint) -> list[Finding]:
    """Hard clashes between main bars of different members. Touching is allowed (crossing bars are tied together);
    any overlap means the bars cannot both be placed as drawn."""
    out, bars = [], cage.bars
    for i, a in enumerate(bars):
        for b in bars[i + 1:]:
            if a.member == b.member or not boxes_overlap(a, b):
                continue
            gap, at = clear_gap(a, b)
            if gap < -0.01:
                out.append(_finding(CLASH, gap, 0.0, sorted({a.member, b.member}),
                                    f"{a.label} runs into {b.label}: they overlap by {fmt(-gap)} mm, so one of them "
                                    f"cannot be placed as drawn", bars=(a.id, b.id), at=at))
    return out


# ------------------------------------------------------------------------------------------------ IS 13920

def _across(c, direction: str, z: float):
    """The column's full width along X or Y at height z, through its centre line: (span, midpoint)."""
    half = (c.b if direction == "x" else c.h) / 2
    a, b = ((-half, 0.0, z), (half, 0.0, z)) if direction == "x" else ((0.0, -half, z), (0.0, half, z))
    return (a, b), (0.0, 0.0, z)


def column_size_for_beam_bars(cage: Cage, joint: Joint) -> list[Finding]:
    """Each finding carries the dimension it measures as `span`, so the viewer can draw it: across the column along
    the beam, at the level of the beam's outer top bars (the bars whose size sets the limit pass through there)."""
    c, out = joint.column, []
    short = "x" if c.b <= c.h else "y"
    span, at = _across(c, short, 0.0)
    out.append(_finding(COLUMN_SIZE, min(c.b, c.h), 300.0, [c.id],
                        f"{c.id}'s smaller side is {min(c.b, c.h):g} mm; the code needs at least 300 mm",
                        span=span, at=at))
    for beam in joint.beams:
        along = c.b if beam.direction == "x" else c.h
        db = beam.max_dia()
        top = cage.layers.get((beam.id, "top", 1))
        span, at = _across(c, beam.direction, top[0].level if top else 0.0)
        out.append(_finding(COLUMN_SIZE, along, 20 * db, [c.id, beam.id],
                            f"{c.id} is {along:g} mm deep along {beam.id}; with {db:g} mm bars in {beam.id} the code "
                            f"needs 20 × {db:g} = {20 * db:g} mm", span=span, at=at))
    return out


def bottom_steel_at_joint(cage: Cage, joint: Joint) -> list[Finding]:
    out = []
    for beam in joint.beams:
        top, bottom = beam.area("top"), beam.area("bottom")
        out.append(_finding(BOTTOM_HALF, bottom, top / 2, [beam.id],
                            f"{beam.id} has {fmt(bottom)} mm² of bottom steel at the joint face against {fmt(top)} mm² "
                            f"at the top; the code needs at least half, {fmt(top / 2)} mm²", unit="mm²"))
    return out


# ------------------------------------------------------------------------------------------------ the catalogue

_IS456 = ("Clause text as quoted by civil4m ('As per IS 456 clause number 26.3.2') and The Constructor; "
          "not yet read in the BIS original. The needle-vibrator relaxation for groups of bars is not applied.")
HORIZONTAL = Rule("IS456-26.3.2-H", "IS 456:2000 cl. 26.3.2", "Clear gap between parallel bars", _IS456,
                  horizontal_spacing)
VERTICAL = Rule("IS456-26.3.2-V", "IS 456:2000 cl. 26.3.2", "Clear gap between rows of bars", _IS456,
                vertical_spacing)
IN_LINE = Rule("IS456-26.3.2-L", "IS 456:2000 cl. 26.3.2", "Rows of bars vertically in line", _IS456,
               vertical_spacing)
COVER = Rule("IS456-26.4.2", "IS 456:2000 cl. 26.4.2, Table 16", "Nominal cover for the exposure",
             "Table 16 values as reproduced by civilengineeringweb.com, with Note 1's 5 mm reduction for mild "
             "exposure and main bars up to 12 mm.", nominal_cover)
COLUMN_COVER = Rule("IS456-26.4.2.1", "IS 456:2000 cl. 26.4.2.1", "Cover to a column's main bars",
                    "Clause text as reproduced by brainkart.com (40 mm or the bar size; 25 mm for columns up to "
                    "200 mm with bars up to 12 mm).", column_main_cover)
CLASH = Rule("GEOM-CLASH", "Geometry", "Bars that run into each other",
             "No clause: two bars cannot occupy the same space. Touching is allowed.", clashes)
COLUMN_SIZE = Rule("IS13920-7.1.1", "IS 13920:2016 cl. 7.1.1", "Column size against beam bar size",
                   "Applied as in IITGN/NICEE 'Examples on IS 13920:2016', Example 3a (pp. 22, 28): the column's "
                   "dimension along the beam is at least 20 times the largest beam bar, and at least 300 mm.",
                   column_size_for_beam_bars, seismic=True, knock_on=True)
BOTTOM_HALF = Rule("IS13920-6.2.3", "IS 13920:2016 cl. 6.2.3", "Bottom steel at the joint face",
                   "Applied as in IITGN/NICEE 'Examples on IS 13920:2016', Example 1 (p. 5): bottom steel at the "
                   "joint face is at least half the top steel.", bottom_steel_at_joint, seismic=True, knock_on=True)

RULES: list[Rule] = [HORIZONTAL, VERTICAL, COVER, COLUMN_COVER, CLASH, COLUMN_SIZE, BOTTOM_HALF]
CATALOGUE: dict[str, Rule] = {r.id: r for r in [HORIZONTAL, VERTICAL, IN_LINE, COVER, COLUMN_COVER, CLASH,
                                                COLUMN_SIZE, BOTTOM_HALF]}
