"""The fix loop: propose, re-check every rule, retry with the reasons, rank. A fix is shown only if the whole joint
passes every rule that applies, so a fix that breaks something else is never offered.

The loop's shape follows ORCA's `agent.resolve` (propose -> verify -> retry with the failure reason -> rank; see
THIRD_PARTY_NOTICES.md). Proposers are interchangeable: `Enumerator` searches bar arrangements deterministically,
and a Gemini proposer (built in Antigravity) returns the same `Candidate` JSON and is checked the same way.
"""
from __future__ import annotations

import math
from collections import Counter
from typing import Annotated, Literal, Protocol

from pydantic import BaseModel, Field

from .numbers import fmt
from .check import Report, check
from .model import Face, Joint, Layer, bar_area
from .rules import CATALOGUE

KNOCK_ON = {r.id for r in CATALOGUE.values() if r.knock_on}


class SetFace(BaseModel):
    kind: Literal["set_face"] = "set_face"
    beam: str
    face: Face
    layers: list[str] = Field(min_length=1, description="drawing notation per layer, outermost first")


class ResizeColumn(BaseModel):
    kind: Literal["resize_column"] = "resize_column"
    b: float = Field(gt=0)
    h: float = Field(gt=0)


class PlaceFaceBars(BaseModel):
    """Place a column's bars between the corners (the schedule does not dimension them): positions along the faces,
    mm from the centre line, symmetric. None leaves that pair of faces as it is."""
    kind: Literal["place_face_bars"] = "place_face_bars"
    along_x: list[float] | None = None     # on the two faces that run along X (crossed by beams along Y)
    along_y: list[float] | None = None     # on the two faces that run along Y (crossed by beams along X)


Edit = Annotated[SetFace | ResizeColumn | PlaceFaceBars, Field(discriminator="kind")]


class Candidate(BaseModel):
    title: str
    edits: list[Edit] = Field(min_length=1)
    source: str = "enumerator"
    rationale: str = ""

    @property
    def redesign(self) -> bool:
        """Changes a member's size, not just its bars: the engineer of record must redesign, not just re-detail."""
        return any(isinstance(e, ResizeColumn) for e in self.edits)

    @property
    def placement(self) -> bool:
        """Places a column's face bars: a detailing choice the schedule leaves open."""
        return any(isinstance(e, PlaceFaceBars) for e in self.edits)


class Attempt(BaseModel):
    round: int
    candidate: Candidate
    passed: bool
    failures: list[dict]          # rule, clause, measured, limit, message: what rejected it


class FaceChange(BaseModel):
    beam: str
    face: Face
    before: str                    # layers separated by " / ", outermost first: "2-25 / 2-20"
    after: str
    area_before: float             # mm², the face as drawn
    area_required: float
    area_provided: float
    overshoot_pct: float
    depth_before: float
    depth_after: float
    n_bars_before: int
    n_layers_before: int
    n_bars: int
    n_layers: int


class Option(BaseModel):
    candidate: Candidate
    faces: list[FaceChange]
    column: str | None = None      # "300 × 300 -> 325 × 300" when the column changes
    flags: list[str]               # what the engineer must recheck; the loop never decides these


class FixResult(BaseModel):
    status: Literal["clean", "fixed", "redesign", "no_fix"]
    summary: str
    options: list[Option]
    attempts: list[Attempt]
    blocking: dict[str, int]       # rule -> how many candidates it rejected


class Proposer(Protocol):
    name: str

    def propose(self, joint: Joint, report: Report, history: list[Attempt], round: int) -> list[Candidate]: ...


def apply(joint: Joint, cand: Candidate) -> Joint:
    out = joint.model_copy(deep=True)
    for e in cand.edits:
        if isinstance(e, SetFace):
            beam = out.beam(e.beam)
            setattr(beam, e.face, [Layer(bars=s) for s in e.layers])
        elif isinstance(e, PlaceFaceBars):
            if e.along_x is not None:
                out.column.face_along_x = list(e.along_x)
            if e.along_y is not None:
                out.column.face_along_y = list(e.along_y)
        else:
            out.column.b, out.column.h = e.b, e.h
    return out


def _failure_dicts(report: Report) -> list[dict]:
    return [{"rule": f.rule, "clause": f.clause, "measured": f.measured, "limit": f.limit, "compare": f.compare,
             "margin": f.margin, "unit": f.unit, "message": f.message, "bars": f.bars, "at": f.at, "span": f.span}
            for f in report.failures]


def feedback_lines(history: list[Attempt], limit: int = 30) -> list[str]:
    """What was already tried, in words, for a model proposing the next round (ORCA's `_feedback` idea)."""
    lines = []
    for a in history[-limit:]:
        if a.passed:
            lines.append(f"- {a.candidate.title}: passed every rule")
        else:
            why = "; ".join(f"{f['clause']}: {f['measured']:g} {f['unit']} against {f['limit']:g}" for f in
                            a.failures[:3])
            lines.append(f"- {a.candidate.title}: FAILED ({why})")
    return lines


# ------------------------------------------------------------------------------------------------ the enumerator

def arrangements(required: float, stock: list[float], max_layers: int = 2, max_per_layer: int = 6,
                 overshoot: float = 0.35) -> list[list[str]]:
    """Bar arrangements that carry at least `required` mm² and at most `overshoot` more. A second layer only when
    the first cannot carry the steel alone, never bigger bars below than above."""
    hi, out = required * (1 + overshoot), []
    for d1 in stock:
        for n1 in range(2, max_per_layer + 1):
            a1 = n1 * bar_area(d1)
            if required - 1e-6 <= a1 <= hi:
                out.append(([f"{n1}-{d1:g}"], a1, n1))
            if max_layers < 2 or a1 >= required - 1e-6:
                continue
            for d2 in stock:
                if d2 > d1:
                    continue
                for n2 in range(1, n1 + 1):
                    a = a1 + n2 * bar_area(d2)
                    if required - 1e-6 <= a <= hi:
                        out.append(([f"{n1}-{d1:g}", f"{n2}-{d2:g}"], a, n1 + n2))
    out.sort(key=lambda x: (x[1], x[2]))
    return [x[0] for x in out]


def _faces_at_fault(joint: Joint, report: Report) -> list[tuple[str, Face]]:
    faces: list[tuple[str, Face]] = []
    for f in report.failures:
        for bar_id in f.bars:
            member, _, tag = bar_id.partition("/")
            if tag[:1] in ("T", "B") and member in {b.id for b in joint.beams}:
                key = (member, "top" if tag[0] == "T" else "bottom")
                if key not in faces:
                    faces.append(key)
        if f.rule == "IS13920-6.2.3":
            key = (f.members[0], "bottom")
            if key not in faces:
                faces.append(key)
    return faces


PLACE_STEP = 5.0         # mm: face bar positions tried, measured from the column's centre line
PLACE_CLEAR = 5.0        # mm: clear gap kept from every crossing beam bar; a placing tolerance, not a code rule
PLACE_KEEP = 6           # placements tried per joint, the smallest moves first


def _symmetric(k: int, inner: float) -> list[list[float]]:
    """Symmetric positions for k face bars strictly between -inner and inner, on PLACE_STEP mm steps: one or two
    pairs, with a bar on the centre line when k is odd. More than five face bars: none (not searched)."""
    steps = [PLACE_STEP * i for i in range(1, int(inner // PLACE_STEP) + 1) if PLACE_STEP * i < inner]
    if k in (2, 3):
        return [[-s, *([0.0] if k == 3 else []), s] for s in steps]
    if k in (4, 5):
        return [[-b, -a, *([0.0] if k == 5 else []), a, b] for a in steps for b in steps if b > a]
    return []


def _current(c, n: int, size: float, placed: list[float] | None) -> tuple[float, list[float]]:
    from .layout import spread
    inner = size / 2 - c.main_cover - c.bar_dia / 2            # corner bar centres
    return inner, list(placed) if placed is not None else spread(-inner, inner, n)[1:-1]


def placements(joint: Joint) -> list[PlaceFaceBars]:
    """Face bar placements that clear every crossing beam bar by PLACE_CLEAR mm, for each pair of column faces whose
    bars between the corners do not: beams along X cross the faces that run along Y (their bars' lateral positions
    are y), beams along Y the faces that run along X. Also kept: each face bar at least the larger of the two bar
    sizes and aggregate + 5 mm clear of its neighbours (IS 456 cl. 26.3.2), so `check` is not asked about hopeless
    ones; `check` still decides. Ordered by how far the bars move, smallest first."""
    _, cage = check(joint)
    c, agg = joint.column, joint.settings.aggregate
    fd = c.face_dia if c.face_dia is not None else c.bar_dia
    crossing: dict[str, list[tuple[float, float]]] = {"x": [], "y": []}
    for bar in cage.bars:
        if bar.role in ("top", "bottom"):
            crossing[joint.beam(bar.member).direction].append((bar.lateral, bar.dia))
    out: dict[str, list] = {}
    for axis, n, size, placed, beams in (("along_y", c.bars_y, c.h, c.face_along_y, crossing["x"]),
                                         ("along_x", c.bars_x, c.b, c.face_along_x, crossing["y"])):
        inner, now = _current(c, n, size, placed)

        def clear(pos: list[float], beams=beams) -> bool:
            return all(abs(p - lat) - (fd + d) / 2 >= PLACE_CLEAR - 1e-9 for p in pos for lat, d in beams)

        def spaced(pos: list[float], inner=inner) -> bool:
            row = [-inner, *pos, inner]
            for a, b in zip(row, row[1:]):
                da = c.bar_dia if a in (-inner, inner) else fd
                db = c.bar_dia if b in (-inner, inner) else fd
                if (b - a) - (da + db) / 2 < max(da, db, agg + 5) - 1e-9:
                    return False
            return True
        if not now or clear(now):
            out[axis] = [None]
            continue
        found = [p for p in _symmetric(n - 2, inner) if clear(p) and spaced(p)]
        found.sort(key=lambda p, now=now: (sum(abs(a - b) for a, b in zip(p, now)), p))
        out[axis] = found
    combos = [PlaceFaceBars(along_x=x, along_y=y) for y in out["along_y"] for x in out["along_x"]
              if x is not None or y is not None]
    return combos[:PLACE_KEEP]


def _where(e: PlaceFaceBars) -> str:
    return "; ".join(f"{n} = " + ", ".join(f"{p:g}" for p in pos) + " mm"
                     for n, pos in (("y", e.along_y), ("x", e.along_x)) if pos)


def _layers_text(layers: list[str]) -> str:
    if len(layers) == 1:
        return layers[0]
    return ", ".join(f"{s} in layer {k}" for k, s in enumerate(layers, 1))


def _ceil(v: float, step: float = 25.0) -> float:
    return math.ceil(v / step - 1e-9) * step


class Enumerator:
    """Round 1: re-arrange the bars of each face at fault. Round 2: for arrangements that failed only on a knock-on
    rule (IS 13920's column size or bottom-to-top steel), make the knock-on change too and check again."""
    name = "enumerator"

    def __init__(self, per_face: int = 80, bottoms: int = 6):
        self.per_face, self.bottoms = per_face, bottoms

    def propose(self, joint: Joint, report: Report, history: list[Attempt], round: int) -> list[Candidate]:
        s = joint.settings
        if round == 1:
            cands = []
            col = joint.column.id + "/"
            if any(f.rule == "GEOM-CLASH" and any(b.startswith(col) for b in f.bars) for f in report.failures):
                for e in placements(joint):
                    cands.append(Candidate(title=f"{joint.column.id} face bars at {_where(e)}", edits=[e],
                                           rationale="move the column's face bars clear of the beam bars"))
            for beam_id, face in _faces_at_fault(joint, report):
                need = joint.required(beam_id, face)
                if face == "bottom" and s.is13920:
                    need = max(need, joint.beam(beam_id).area("top") / 2)
                drawn = " + ".join(layer.bars for layer in joint.beam(beam_id).face(face))
                for layers in arrangements(need, s.stock_dias, s.max_layers)[: self.per_face]:
                    cands.append(Candidate(title=f"{beam_id} {face}: {_layers_text(layers)}",
                                           edits=[SetFace(beam=beam_id, face=face, layers=layers)],
                                           rationale=f"re-arrange {drawn} to carry at least {fmt(need)} mm²"))
            return cands
        if round == 2:
            cands = []
            col = joint.column.id + "/"
            for a in history:                  # a beam change whose only failures are clashes with column bars
                if a.passed or a.candidate.placement or not a.failures or not all(
                        f["rule"] == "GEOM-CLASH" and any(b.startswith(col) for b in f["bars"]) for f in a.failures):
                    continue
                for e in placements(apply(joint, a.candidate)):
                    cands.append(Candidate(title=f"{a.candidate.title}; {joint.column.id} face bars at {_where(e)}",
                                           edits=[*a.candidate.edits, e],
                                           rationale="the beam change, with the column's face bars placed clear of it"))
            for a in history:
                rules = {f["rule"] for f in a.failures}
                if a.passed or not rules or not rules <= KNOCK_ON:
                    continue
                trial = apply(joint, a.candidate)
                extra_sets: list[list[SetFace]] = [[]]
                if "IS13920-6.2.3" in rules:
                    extra_sets = [[SetFace(beam=beam.id, face="bottom", layers=layers)]
                                  for beam in trial.beams if beam.area("bottom") + 1e-6 < beam.area("top") / 2
                                  for layers in arrangements(beam.area("top") / 2, s.stock_dias,
                                                             s.max_layers)[: self.bottoms]]
                for extra in extra_sets:
                    edits: list = list(a.candidate.edits) + extra
                    title = a.candidate.title + "".join(f"; {e.beam} bottom: {_layers_text(e.layers)}" for e in extra)
                    probe = apply(joint, Candidate(title="probe", edits=edits))
                    b, h = probe.column.b, probe.column.h
                    for beam in probe.beams:          # IS 13920 cl. 7.1.1: 300 mm, and 20 bar sizes along each beam
                        need = _ceil(max(300.0, 20 * beam.max_dia()))
                        if beam.direction == "x":
                            b = max(b, need)
                        else:
                            h = max(h, need)
                    b, h = max(b, 300.0), max(h, 300.0)
                    if (b, h) != (probe.column.b, probe.column.h):
                        edits.append(ResizeColumn(b=b, h=h))
                        title += f"; {joint.column.id} {b:g} × {h:g}"
                    cands.append(Candidate(title=title, edits=edits,
                                           rationale="make the knock-on change IS 13920 asks for, then check again"))
            return cands
        return []


# ------------------------------------------------------------------------------------------------ the loop

def _option(joint: Joint, cand: Candidate, base_cage_depths: dict) -> Option:
    trial = apply(joint, cand)
    _, cage = check(trial)
    faces, flags = [], []
    for e in cand.edits:
        if not isinstance(e, SetFace):
            continue
        drawn = joint.beam(e.beam).face(e.face)
        before = " / ".join(layer.bars for layer in drawn)
        need = joint.required(e.beam, e.face)
        if e.face == "bottom" and trial.settings.is13920:
            need = max(need, trial.beam(e.beam).area("top") / 2)
        got = trial.beam(e.beam).area(e.face)
        d0 = base_cage_depths.get((e.beam, e.face), 0.0)
        d1 = cage.effective_depth.get((e.beam, e.face), 0.0)
        faces.append(FaceChange(beam=e.beam, face=e.face, before=before, after=" / ".join(e.layers),
                                area_before=round(sum(layer.area for layer in drawn), 1),
                                n_bars_before=sum(layer.count for layer in drawn), n_layers_before=len(drawn),
                                area_required=round(need, 1), area_provided=round(got, 1),
                                overshoot_pct=round(100 * (got / need - 1), 1) if need else 0.0,
                                depth_before=round(d0, 1), depth_after=round(d1, 1),
                                n_bars=sum(Layer(bars=s).count for s in e.layers), n_layers=len(e.layers)))
        if d1 < d0 - 0.5:
            flags.append(f"{e.beam} {e.face} steel's effective depth drops from {fmt(d0)} to {fmt(d1)} mm: recheck "
                         f"the section's strength")
    column = None
    for e in cand.edits:
        if isinstance(e, PlaceFaceBars):
            c1 = trial.column
            fd = c1.face_dia if c1.face_dia is not None else c1.bar_dia
            column = f"{c1.id} face bars at {_where(e)}"
            flags.append(f"{c1.id}'s {fd:g} mm face bars placed at {_where(e)} from its centre line (the schedule "
                         f"does not dimension them), each at least {PLACE_CLEAR:g} mm clear of the beams' bars: a "
                         "placing tolerance chosen here, not a code rule. Show these positions on the drawing.")
    if cand.redesign:
        c0, c1 = joint.column, trial.column
        column = f"{c0.b:g} × {c0.h:g} -> {c1.b:g} × {c1.h:g}"
        flags.append(f"{c0.id} grows from {c0.b:g} × {c0.h:g} to {c1.b:g} × {c1.h:g} mm: a redesign for the "
                     "engineer of record (frame analysis, column design, the drawings around it)")
    return Option(candidate=cand, faces=faces, column=column, flags=flags)


def _rank(opt: Option, joint: Joint) -> tuple:
    growth = 0.0
    if opt.candidate.redesign:
        e = next(x for x in opt.candidate.edits if isinstance(x, ResizeColumn))
        growth = e.b * e.h - joint.column.b * joint.column.h
    over = max((f.overshoot_pct for f in opt.faces), default=0.0)
    bars = sum(f.n_bars for f in opt.faces)
    layers = sum(f.n_layers for f in opt.faces)
    depth_loss = max((f.depth_before - f.depth_after for f in opt.faces), default=0.0)
    move = 0.0                         # how far placed face bars move from where the drawing spreads them
    c = joint.column
    for e in opt.candidate.edits:
        if isinstance(e, PlaceFaceBars):
            for pos, n, size, placed in ((e.along_y, c.bars_y, c.h, c.face_along_y),
                                         (e.along_x, c.bars_x, c.b, c.face_along_x)):
                if pos:
                    move += sum(abs(a - b) for a, b in zip(pos, _current(c, n, size, placed)[1]))
    # beam-only changes first, then face bar placements (alone or with a beam change), then redesigns
    return (opt.candidate.redesign, opt.candidate.placement, growth, round(move, 1), int(over // 5), bars, layers,
            round(depth_loss, 1), over)


def resolve(joint: Joint, proposers: list[Proposer] | None = None, max_rounds: int = 2, keep: int = 3) -> FixResult:
    proposers = proposers or [Enumerator()]
    base, base_cage = check(joint)
    if not base.failures:
        return FixResult(status="clean", summary=f"{joint.id} passes every rule checked; nothing to fix.",
                         options=[], attempts=[], blocking={})
    history: list[Attempt] = []
    passing: list[Candidate] = []
    seen: set[str] = set()
    for rnd in range(1, max_rounds + 1):
        for proposer in proposers:
            for cand in proposer.propose(joint, base, history, rnd):
                sig = cand.model_dump_json(include={"edits"})
                if sig in seen:
                    continue
                seen.add(sig)
                rep, _ = check(apply(joint, cand))
                ok = not rep.failures
                history.append(Attempt(round=rnd, candidate=cand, passed=ok, failures=_failure_dicts(rep)))
                if ok:
                    passing.append(cand)
        if passing:
            break
    options = sorted((_option(joint, c, base_cage.effective_depth) for c in passing), key=lambda o: _rank(o, joint))
    blocking = Counter(f["rule"] for a in history if not a.passed for f in {x["rule"]: x for x in a.failures}.values())
    if not options:
        top = ", ".join(f"{CATALOGUE[r].clause} ({n})" for r, n in blocking.most_common(3))
        return FixResult(status="no_fix", options=[], attempts=history, blocking=dict(blocking),
                         summary=f"No re-arrangement of {len(history)} tried passes every rule. Most often blocked "
                                 f"by: {top}. This joint needs the engineer of record.")
    plain = [o for o in options if not o.candidate.redesign]
    status = "fixed" if plain else "redesign"
    chosen = (plain or options)[:keep]
    best = chosen[0].candidate.title
    summary = (f"{len(passing)} of {len(history)} candidates pass every rule. Best: {best}." if plain else
               f"No bar change alone passes; {len(options)} redesigns do. Smallest: {best}. The engineer of record "
               "decides.")
    return FixResult(status=status, summary=summary, options=chosen, attempts=history, blocking=dict(blocking))
