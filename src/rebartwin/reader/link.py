"""R5: linking. Gemini assembles accepted fields from across sheets into `Joint`s; code then proves every number.

The linking model decides structure: which beams meet which column, which direction each runs, how extra bars stack
into layers. It must cite, for every value, the ids of the accepted fields it came from, using a fixed set of paths
(below). `verify` then re-derives each value from those fields alone. A value that does not match its fields, or that
has no field, or a field the model left out, becomes a To check item; the model's numbers are never trusted. Every
default and every structural choice becomes a sentence in `Joint.notes`, written here, not by the model.

    column.section   column.main   column.ties   column.cover
    beams[i].section beams[i].top  beams[i].bottom beams[i].stirrups beams[i].cover beams[i].frames_into
    settings.seismic_zone          settings.exposure
"""
from __future__ import annotations

import json
import os
import re
from collections import Counter
from dataclasses import dataclass, field
from typing import Callable

from pydantic import BaseModel, Field, ValidationError

from ..model import Beam, Column, Joint, Settings, parse_bars
from .agree import Accepted, Agreement, ToCheck
from .gemini import GLOBAL_MEMBERS, PROMPTS, ModelNotFound, Transport, call
from .levels import ends_at, floor, storey

LINK_PROMPT = "link_v5"
DEFAULT_LINK_MODEL = "gemini-4-argon"
DEFAULT_FALLBACK = "gemini-3.8-flash"


class SourceRef(BaseModel):
    path: str = Field(description="one of the paths in the prompt, e.g. 'beams[0].top'")
    field_ids: list[str] = Field(description="ids of the accepted fields this value comes from")


class Unresolved(BaseModel):
    path: str
    reason: str


class LinkedJoint(BaseModel):
    joint: Joint
    sources: list[SourceRef] = Field(default_factory=list)
    unresolved: list[Unresolved] = Field(default_factory=list)


class LinkReply(BaseModel):
    joints: list[LinkedJoint]


@dataclass
class Issue:
    path: str
    reason: str                    # missing | disagree | ambiguous
    detail: str
    fields: list[Accepted] = field(default_factory=list)


@dataclass
class Verified:
    joint: Joint
    provenance: dict
    issues: list[Issue]
    defaults: dict[str, str] = field(default_factory=dict)     # path -> the default used, e.g. "8 mm"
    floor: str | None = None       # the beams' floor, from the plans they were read on ("FIRST")
    place: str | None = None       # the column's grid place, from geometry frames_into fields ("F-14")


def _bars(value: str) -> Counter:
    c: Counter = Counter()
    for g in parse_bars(value):
        c[g.dia] += g.count
    return c


def _section(value: str) -> tuple[float, float]:
    b, d = value.split("x")
    return float(b), float(d)


def _link_dia(value: str) -> float:
    return float(re.match(r"(?:\d+L-)?(\d+)@", value).group(1))


def _fmt(c: Counter) -> str:
    return " + ".join(f"{n}-{d:g}" for d, n in sorted(c.items(), reverse=True))


def verify(linked: LinkedJoint, fields: dict[str, Accepted]) -> Verified:
    """Prove each value of a linked joint from the accepted fields it cites. See the module docstring."""
    j = linked.joint.model_copy(deep=True)
    j.id = "x".join([j.column.id, *(b.id for b in j.beams)])
    j.required_area = {}
    accepted = list(fields.values())
    cited: dict[str, list[Accepted]] = {}
    issues: list[Issue] = []
    provenance: dict = {}
    notes: list[str] = []
    defaults: dict[str, str] = {}
    for s in linked.sources:
        unknown = [i for i in s.field_ids if i not in fields]
        if unknown:
            issues.append(Issue(s.path, "missing", f"{s.path} cites {', '.join(unknown)}, which are not accepted "
                                "fields"))
        cited.setdefault(s.path, []).extend(fields[i] for i in s.field_ids if i in fields)

    # The joint's floor: the floor of the plans its beams were read on. Column values are then the storey that ends
    # there, beam values that floor's; values with no level fit any floor.
    plan_floors = sorted({floor(a.level) for k, got in cited.items() if k.endswith(".frames_into") for a in got
                          if floor(a.level)})
    at_floor = plan_floors[0] if len(plan_floors) == 1 else None
    # The joint's place on the grid: the place of the geometry frames_into fields it cites. C5 with XB8 stands at
    # F-14 and at F-33; each place is its own joint, with its own extra top bars.
    places = sorted({a.at for k, got in cited.items() if k.endswith(".frames_into") for a in got if a.at})
    place = places[0] if len(places) == 1 else None
    if len(places) > 1:
        issues.append(Issue("beams", "ambiguous", f"the beams meet {linked.joint.column.id} at different grid places: "
                            f"{', '.join(places)}"))
    if len(plan_floors) > 1:
        issues.append(Issue("beams", "ambiguous", f"the beams were read on plans of different floors: "
                            f"{', '.join(plan_floors)}"))

    def fits(a: Accepted) -> bool:
        if a.level is None or at_floor is None:
            return True
        return ends_at(a.level, at_floor) if storey(a.level) else floor(a.level) == at_floor

    def of(member: str, *names: str, scope: tuple[str, ...] = ()) -> list[Accepted]:
        """Accepted fields for a member at this joint's floor; general notes in `scope` only when the member has none
        of its own."""
        own = [a for a in accepted if a.member == member and a.field in names and fits(a)]
        return own or [a for a in accepted if a.member in scope and a.field in names and fits(a)]

    def use(path: str, expected: list[Accepted], names: tuple[str, ...], check: Callable[[list[Accepted]], str | None],
            *, required: bool = True, value=None, default=None, label: str = "", note_default: bool = True) -> bool:
        """One path: the cited fields are the expected ones, none is left out, and the value matches them.
        An optional value with no field must equal the model default, which becomes a note."""
        got = cited.get(path, [])
        levels = sorted({a.level for a in expected if a.level})
        if len({storey(x) or floor(x) for x in levels}) > 1:
            issues.append(Issue(path, "ambiguous", f"{path}: the drawing gives a value for each of "
                                f"{'; '.join(levels)}, and no plan floor picks one", expected))
            return False
        wrong = [a for a in got if a.field not in names or a not in expected]
        if wrong:
            issues.append(Issue(path, "disagree", f"{path} cites {', '.join(a.id for a in wrong)}, which belong to "
                                "another member or field", wrong))
            return False
        if not got:
            if expected:
                issues.append(Issue(path, "missing", f"{path} does not use the drawing's "
                                    f"{', '.join(a.value for a in expected)}", expected))
            elif required:
                issues.append(Issue(path, "missing", f"no accepted field gives {path}"))
            elif value != default:
                issues.append(Issue(path, "missing", f"{label} {value} comes from no accepted field"))
            else:
                if note_default:
                    notes.append(f"Default: {label} {default} (not on the drawing).")
                    defaults[path] = str(default)
                return True
            return False
        left_out = [a for a in expected if a not in got]
        if left_out and len(expected) > 1:
            issues.append(Issue(path, "missing", f"{path} leaves out {', '.join(a.value for a in left_out)}",
                                left_out))
            return False
        problem = check(got)
        if problem:
            issues.append(Issue(path, "disagree", problem, got))
            return False
        provenance[path] = [a.provenance() for a in got] if len(got) > 1 else got[0].provenance()
        return True

    col = j.column
    dc, db, ds = Column.model_fields, Beam.model_fields, Settings.model_fields

    def sec_col(got):
        b, h = _section(got[0].value)
        if sorted((col.b, col.h)) != sorted((b, h)):
            return f"{col.id} is {col.b:g} x {col.h:g} in the joint, {got[0].value} on the drawing"
        if b != h:
            notes.append(f"{col.id} {got[0].value} placed with {col.b:g} mm along X (the linking model's choice).")
    use("column.section", of(col.id, "section"), ("section",), sec_col)

    def main_col(got):
        groups = parse_bars(got[0].value)
        total = sum(g.count for g in groups)
        drawn = f"{got[0].value} on the drawing"
        if len({g.dia for g in groups}) == 1:
            dia = groups[0].dia
            if (col.n_bars, col.bar_dia, col.face_dia or dia) != (total, dia, dia):
                return f"{col.id} has {col.n_bars}-{col.bar_dia:g} in the joint, {drawn}"
            return None
        # Two sizes: the first group of four is the corner bars, the second the face bars (a schedule's
        # "• 4Ø16 + ○ 4Ø12"). Any other arrangement needs a person.
        if len(groups) != 2 or groups[0].count != 4:
            return (f"{col.id} main bars {got[0].value}: the first group is not the four corner bars, so how the "
                    "bars sit needs a person")
        corner, face = groups
        if (col.n_bars, col.bar_dia, col.face_dia) != (total, corner.dia, face.dia):
            return (f"{col.id} has {col.n_bars} bars of {col.bar_dia:g} mm at the corners and "
                    f"{col.face_dia or col.bar_dia:g} mm on the faces in the joint, {drawn}")
        notes.append(f"{col.id} {corner.count}-{corner.dia:g} at the corners and {face.count}-{face.dia:g} on the "
                     f"faces, spread {col.bars_x} and {col.bars_y} per face (corners included) as the engine splits "
                     "them: the schedule's section sketch is not read.")
    use("column.main", of(col.id, "main"), ("main",), main_col)
    storeys = sorted({a.level for k in ("column.section", "column.main", "column.ties") for a in cited.get(k, [])
                      if a.level and storey(a.level)})
    if storeys and at_floor:
        notes.append(f"{col.id} takes the storey {', '.join(storeys)}, which ends at the beams' floor, {at_floor} "
                     "(chosen by code from the plan's floor).")
    tabled = sorted({k.split(".")[1] for k in ("column.section", "column.main", "column.ties")
                     for a in cited.get(k, []) if a.level_by})
    if tabled:
        notes.append(f"{col.id} {', '.join(tabled)}: the storey is the schedule's header above the value, read from "
                     "the table by code (Gemini gave none).")

    use("column.ties", of(col.id, "links"), ("links",),
        lambda got: None if col.tie_dia == _link_dia(got[0].value) else
        f"{col.id} ties are {col.tie_dia:g} mm in the joint, {got[0].value} on the drawing",
        required=False, value=f"{col.tie_dia:g} mm", default=f"{dc['tie_dia'].default:g} mm", label=f"{col.id} ties")

    def cover(member: str, value: float):
        return lambda got: None if float(got[0].value) == value else \
            f"{member} cover is {value:g} mm in the joint, {got[0].value} mm on the drawing"
    use("column.cover", of(col.id, "cover", scope=("ALL", "ALL_COLUMNS")), ("cover",), cover(col.id, col.cover),
        required=False, value=f"{col.cover:g} mm", default=f"{dc['cover'].default:g} mm", label=f"{col.id} cover")
    notes.append(f"{col.id} cover measured to the {'main bars' if col.cover_to == 'main' else 'ties'} "
                 "(the linking model's reading of the notes).")

    def at_joint(beam: Beam, path: str, name: str) -> list[Accepted] | None:
        """Fix A. A beam's values of one field at this joint: at a grid place, those over a span that ends on the
        beam's support line here (`at` "14/18") plus those placed on no span; elsewhere all of them. Equal values
        either side are one value (the one the model cites, else the first). Different values mean the beam changes
        at the column: the engine takes one beam per direction, so that is an ambiguous item and None."""
        got = of(beam.id, name)
        if not place:
            return got
        line = support_line(place, direction_of(beam.id) or beam.direction)
        got = [a for a in got if not a.at or set(a.at.split("/")) & line]
        values = sorted({a.value for a in got})
        if len(values) > 1:
            spans = sorted({a.at for a in got if a.at})
            issues.append(Issue(path, "ambiguous", f"{beam.id} {name} is {' and '.join(values)} at {col.id} {place}"
                                + (f" (spans {', '.join(spans)})" if spans else "") + ": the beam changes at the "
                                "column, and the engine takes one beam per direction, so this joint needs a person",
                                got))
            return None
        if len(got) > 1:
            chosen = [a for a in cited.get(path, []) if a in got and a.field == name][:1] or got[:1]
            cited[path] = [a for a in cited.get(path, []) if a not in got or a in chosen]
            got = chosen
        return got

    for i, beam in enumerate(j.beams):
        p = f"beams[{i}]"

        def sec_beam(got, beam=beam):
            if (beam.b, beam.D) != _section(got[0].value):
                return f"{beam.id} is {beam.b:g} x {beam.D:g} in the joint, {got[0].value} on the drawing"
        sections = at_joint(beam, f"{p}.section", "section")
        if sections is not None:
            use(f"{p}.section", sections, ("section",), sec_beam)

        for face in ("top", "bottom"):
            def face_check(got, beam=beam, face=face):
                layers = beam.face(face)
                want = sum((_bars(a.value) for a in got), Counter())
                have = sum((_bars(layer.bars) for layer in layers), Counter())
                if want != have:
                    return f"{beam.id} {face} is {_fmt(have) or 'empty'} in the joint, {_fmt(want)} on the drawing"
                for k in sorted({a.layer for a in got if a.field == face}):
                    need = sum((_bars(a.value) for a in got if a.field == face and a.layer == k), Counter())
                    if k > len(layers) or need - _bars(layers[k - 1].bars):
                        return f"{beam.id} {face} layer {k} on the drawing is not in layer {k} of the joint"
                if len(layers) != len(got) or any(x.bars != a.value for x, a in zip(layers, got)):
                    notes.append(f"{beam.id} {face} bars arranged as "
                                 f"{'; '.join(f'layer {n}: {x.bars}' for n, x in enumerate(layers, 1))} from "
                                 f"{', '.join(a.value for a in got)} (the linking model's arrangement).")
            base = at_joint(beam, f"{p}.{face}", face)
            if base is None:
                continue
            expected = base + of(beam.id, f"{face}_extra")
            if face == "top" and place:
                # Extra top bars belong to a support: only those under this joint's grid line count here, and an
                # extra the detail sheet does not place needs a person.
                extras = of(beam.id, "top_extra")
                unplaced = [a for a in extras if not a.at]
                if unplaced:
                    issues.append(Issue(f"{p}.top", "ambiguous", f"{beam.id} extra top bars "
                                        f"{', '.join(a.value for a in unplaced)}: the detail sheet does not mark which "
                                        f"support they are at, so which apply at {col.id} {place} needs a person",
                                        unplaced))
                    continue
                line = support_line(place, direction_of(beam.id) or beam.direction)
                expected = base + [a for a in extras if set(a.at.split("/")) & line]
            if face == "bottom" and place:
                # A bottom extra counts at a joint only if its bar reaches that support on the elevation; a bar
                # that stops short is noted and left out; one whose end the drawing does not show needs a person.
                extras = of(beam.id, "bottom_extra")
                unclear = [a for a in extras if not a.at]
                if unclear:
                    issues.append(Issue(f"{p}.bottom", "ambiguous", f"{beam.id} bottom extra bars "
                                        f"{', '.join(a.value for a in unclear)}: the elevation does not show whether "
                                        f"they reach {col.id} at {place}", unclear))
                    continue
                line = support_line(place, direction_of(beam.id) or beam.direction)
                reach = [a for a in extras if a.at != "-" and set(a.at.split("/")) & line]
                for a in extras:
                    if a not in reach:
                        notes.append(f"{beam.id} {a.value} bottom extra stops short of {col.id} at "
                                     f"{'/'.join(sorted(line))} on the elevation: not at the joint.")
                expected = base + reach
            use(f"{p}.{face}", expected, (face, f"{face}_extra"), face_check)

        use(f"{p}.stirrups", of(beam.id, "links"), ("links",),
            lambda got, beam=beam: None if beam.stirrup_dia == _link_dia(got[0].value) else
            f"{beam.id} stirrups are {beam.stirrup_dia:g} mm in the joint, {got[0].value} on the drawing",
            required=False, value=f"{beam.stirrup_dia:g} mm", default=f"{db['stirrup_dia'].default:g} mm",
            label=f"{beam.id} stirrups")
        use(f"{p}.cover", of(beam.id, "cover", scope=("ALL", "ALL_BEAMS")), ("cover",), cover(beam.id, beam.cover),
            required=False, value=f"{beam.cover:g} mm", default=f"{db['cover'].default:g} mm",
            label=f"{beam.id} cover")
        notes.append(f"{beam.id} cover measured to the {'main bars' if beam.cover_to == 'main' else 'stirrups'} "
                     "(the linking model's reading of the notes).")
        meets = [a for a in of(beam.id, "frames_into")
                 if a.value == col.id and (place is None or a.at in (None, place))]
        stated = direction_of(beam.id)
        if stated and beam.direction != stated:
            issues.append(Issue(f"{p}.direction", "disagree", f"{beam.id} runs along {stated.upper()} by its prefix "
                                f"{beam.id[:2]}; the linking model put it along {beam.direction.upper()}"))
        if use(f"{p}.frames_into", meets, ("frames_into",), lambda got: None):
            if stated:
                notes.append(f"{beam.id} meets {col.id} on the plan; it runs along {stated.upper()}, as its prefix "
                             f"{beam.id[:2]} states (checked by code).")
            else:
                notes.append(f"{beam.id} meets {col.id} on the plan; it runs along {beam.direction.upper()} "
                             "(the linking model's reading of the plan).")
        if len(beam.top) > 1 or len(beam.bottom) > 1:
            if beam.spacer == db["spacer"].default:
                defaults[f"{p}.spacer"] = f"{beam.spacer:g} mm"
            notes.append(f"Default: {beam.id} spacer between layers {beam.spacer:g} mm (not on the drawing)."
                         if beam.spacer == db["spacer"].default else
                         f"{beam.id} spacer {beam.spacer:g} mm (the linking model's value; no field gives it).")

    st = j.settings
    for name, value in (("seismic_zone", st.seismic_zone), ("exposure", st.exposure)):
        label = name.replace("_", " ")
        use(f"settings.{name}", [a for a in accepted if a.field == name], (name,),
            lambda got, value=value, label=label: None if got[0].value == value else
            f"{label} is {value} in the joint, {got[0].value} on the drawing",
            required=False, value=value, default=ds[name].default, label=label, note_default=False)
    if st.aggregate == ds["aggregate"].default:
        notes.append(f"Default: aggregate {st.aggregate:g} mm (not on the drawing).")
        defaults["settings.aggregate"] = f"{st.aggregate:g} mm"
    else:
        issues.append(Issue("settings.aggregate", "missing", f"aggregate {st.aggregate:g} mm comes from no "
                            "accepted field"))

    for u in linked.unresolved:
        # Code decides: a path code has proved from the drawing, or filled with a noted default, is settled whatever
        # the linking model says; its "unresolved" counts only where code has no value.
        if u.path in provenance or u.path in defaults:
            continue
        issues.append(Issue(u.path, "ambiguous", f"Linking model: {u.reason}"))
    j.floor, j.place = at_floor, place              # explicit, so nothing downstream parses the id
    if at_floor:
        j.id = f"{j.id}@{safe_id(at_floor)}"
    if place:
        j.id = f"{j.id}@{safe_id(place)}"
    j.notes = list(dict.fromkeys(notes))
    for key in [k for k in provenance if re.fullmatch(r"beams\[\d+\]\.(top|bottom)", k)]:
        face = j.beams[int(key[6:key.index("]")])].face(key.rsplit(".", 1)[1])
        if len(face) == 1 and isinstance(provenance[key], dict):
            provenance[f"{key}[0].bars"] = provenance.pop(key)
    return Verified(Joint.model_validate(j.model_dump()), provenance, issues, defaults, at_floor, place)


def safe_id(text: str) -> str:
    """A joint id part safe as a Windows file name and in a URL path: "/" becomes "+" ("C/C1-25" to "C+C1-25"),
    spaces "_", and anything else outside letters, digits and _ + . - becomes "_"."""
    return re.sub(r"[^A-Za-z0-9_+.-]", "_", text.replace("/", "+").replace(" ", "_"))


def support_line(place: str, direction: str) -> set[str]:
    """The grid line(s) a beam's support is on at a column's place: "F-14" is row F and line 14; a beam along X is
    supported on line 14, one along Y on row F. Sub-grids both covered ("C/C1-26/27") give each."""
    rows, _, cols = place.partition("-")
    return set((cols if direction == "x" else rows).split("/"))


def direction_of(beam_id: str) -> str | None:
    """XB12 runs along X and YB3 along Y: the drawing states it in the id. Other ids say nothing."""
    return {"XB": "x", "YB": "y"}.get(beam_id[:2])


def _members(j: Joint) -> set[str]:
    return {j.column.id, *(b.id for b in j.beams)}


@dataclass
class Linked:
    joints: list[Verified]
    to_check: list[ToCheck]
    model: str | None
    link_notes: dict[str, list[str]]
    drafts: list[dict] = field(default_factory=list)


# Validation errors that mean a number is missing, not that the structure is wrong.
INCOMPLETE = {"missing", "greater_than", "greater_than_equal", "int_type", "float_type", "int_parsing",
              "float_parsing", "none_required"}


def draft(item, fields: dict[str, Accepted], place: str | None = None) -> dict | None:
    """An incomplete joint, written from accepted fields only: its id, place, floor and storey, the column and beams
    the linking model named, and for each value the accepted fields that give it (canonical text, field id, page),
    or null where none does. Never a number from the model, never a placeholder. None when the model named no column.
    A draft is validated as a Joint only once a person has filled every null (To check)."""
    j = item.get("joint") if isinstance(item, dict) else None
    if not isinstance(j, dict) or not isinstance(j.get("column"), dict) or not j["column"].get("id"):
        return None
    col = str(j["column"]["id"])
    beams = [(str(b["id"]), b.get("direction") if b.get("direction") in ("x", "y") else direction_of(str(b["id"])))
             for b in j.get("beams") or [] if isinstance(b, dict) and b.get("id")]
    accepted = list(fields.values())
    meets = [a for a in accepted if a.field == "frames_into" and a.value == col and a.member in {b for b, _ in beams}]
    # The place: the cited frames_into fields' place, else the one place every beam meets the column at.
    cited = [fields[i] for s in item.get("sources") or [] if isinstance(s, dict)
             and str(s.get("path", "")).endswith(".frames_into") for i in s.get("field_ids") or [] if i in fields]
    common = None
    for b, _ in beams:
        mine = {a.at for a in meets if a.member == b and a.at}
        common = mine if common is None else common & mine
    places = [place] if place else sorted({a.at for a in cited if a.at and a.value == col}) or sorted(common or [])
    floors = sorted({floor(a.level) for a in meets if floor(a.level)})
    place = places[0] if len(places) == 1 else None
    at_floor = floors[0] if len(floors) == 1 else None

    def fits(a: Accepted, column: bool) -> bool:
        if a.level is None or at_floor is None:
            return True
        return ends_at(a.level, at_floor) if (column and storey(a.level)) else floor(a.level) == at_floor

    def vals(member: str, names: tuple[str, ...], column: bool, scope: tuple[str, ...] = (),
             keep=lambda a: True) -> list[dict] | None:
        own = [a for a in accepted if a.member == member and a.field in names and fits(a, column) and keep(a)]
        got = own or [a for a in accepted if a.member in scope and a.field in names and fits(a, column)]
        return [{"value": a.value, "field": a.field, "layer": a.layer, "field_id": a.id, "page": a.page,
                 "level": a.level, "at": a.at} for a in got] or None

    column = {"id": col, "section": vals(col, ("section",), True), "main": vals(col, ("main",), True),
              "ties": vals(col, ("links",), True), "cover": vals(col, ("cover",), True, ("ALL", "ALL_COLUMNS"))}
    out_beams = []
    for bid, way in beams:
        line = support_line(place, way or "x") if place else None

        def on_span(a: Accepted, line=line) -> bool:          # fix A: a value over a span ending here, or unplaced
            return not (line and a.at) or bool(set(a.at.split("/")) & line)
        top = vals(bid, ("top",), False, keep=on_span)
        extras = [a for a in accepted if a.member == bid and a.field == "top_extra" and fits(a, False)]
        def at_support(a: Accepted, line=line) -> bool:
            return bool(line and a.at and a.at != "-" and set(a.at.split("/")) & line)
        here = vals(bid, ("top_extra",), False, keep=at_support)
        bottom = vals(bid, ("bottom",), False, keep=on_span)
        reach = vals(bid, ("bottom_extra",), False, keep=lambda a, s=at_support: not place or s(a))
        out_beams.append({
            "id": bid, "direction": way, "section": vals(bid, ("section",), False, keep=on_span),
            "top": (top or []) + (here or []) or None,
            "top_extra_unplaced": bool(place and any(not a.at for a in extras)),
            "bottom": bottom and bottom + (reach or []),
            "bottom_extra_unclear": bool(place and any(not a.at for a in accepted if a.member == bid
                                                       and a.field == "bottom_extra" and fits(a, False))),
            "stirrups": vals(bid, ("links",), False),
            "cover": vals(bid, ("cover",), False, ("ALL", "ALL_BEAMS")),
            "frames_into": vals(bid, ("frames_into",), False, keep=lambda a: a.value == col and
                                (place is None or a.at in (None, place)))})
    storeys = sorted({x["level"] for k in ("section", "main", "ties") for x in column[k] or [] if x["level"]})
    jid = "x".join([col, *(b for b, _ in beams)])
    if at_floor:
        jid += f"@{safe_id(at_floor)}"
    if place:
        jid += f"@{safe_id(place)}"
    return {"id": jid, "draft": True, "place": place, "floor": at_floor, "storey": storeys[0] if len(storeys) == 1
            else None, "column": column, "beams": out_beams}


def _nulls(d: dict) -> list[str]:
    """The required paths of a draft that no accepted field gives. Ties, stirrups and cover are not among them: with
    no field they take the noted default, as in `verify`."""
    paths = [f"column.{k}" for k in ("section", "main") if d["column"][k] is None]
    for i, b in enumerate(d["beams"]):
        paths += [f"beams[{i}].{k}" for k in ("section", "top", "bottom", "frames_into") if b[k] is None]
        if b["top_extra_unplaced"]:
            paths.append(f"beams[{i}].top")
        if b["bottom_extra_unclear"]:
            paths.append(f"beams[{i}].bottom")
    return paths


def _inputs(agreement: Agreement) -> str:
    accepted = [{"id": a.id, "member": a.member, "field": a.field, "layer": a.layer, "level": a.level,
                 "value": a.value, "page": a.page, **({"at": a.at} if a.at else {})} for a in agreement.accepted]
    pending = [{"member": t.member, "field": t.field, "reason": t.reason} for t in agreement.to_check]
    template = (PROMPTS / f"{LINK_PROMPT}.md").read_text(encoding="utf-8")
    return (template.replace("{accepted}", json.dumps(accepted, ensure_ascii=False, indent=0))
            .replace("{pending}", json.dumps(pending, ensure_ascii=False, indent=0)))


def project_level(t: ToCheck) -> bool:
    """An item on a general note or a project-wide setting: it applies to every joint."""
    return t.joint is None and t.field in USED_FIELDS and (
        t.member in GLOBAL_MEMBERS or t.field in ("seismic_zone", "exposure"))


def blocks(t: ToCheck, joint_id: str) -> bool:
    """Does this unresolved item stop `joint_id` from being checked?"""
    return t.resolution is None and (t.joint == joint_id or project_level(t))


# Fields a joint uses; To check items on other fields (grades) block nothing.
USED_FIELDS = {"section", "top", "top_extra", "bottom", "bottom_extra", "main", "links", "cover", "seismic_zone",
               "exposure", "frames_into"}


def link(agreement: Agreement, transport: Transport, model: str | None = None, fallback: str | None = None,
) -> Linked:
    """Ask the linking model for joints, then verify each one. Returns joints with provenance and every To check
    item, each tied to the joint it blocks."""
    to_check = list(agreement.to_check)
    if not agreement.accepted:
        return Linked([], to_check, None, {})
    model = model or os.environ.get("REBARTWIN_MODEL_LINK") or DEFAULT_LINK_MODEL
    fallback = fallback or os.environ.get("REBARTWIN_MODEL_FALLBACK") or DEFAULT_FALLBACK
    schema = LinkReply.model_json_schema()

    def parse(text: str) -> list:
        data = json.loads(text)
        if not isinstance(data, dict) or not isinstance(data.get("joints"), list):
            raise ValueError("no joints list")
        return data["joints"]

    parts = [("text", _inputs(agreement))]
    try:
        raw = call(transport, key="link", model=model, parts=parts, schema=schema, validate=parse)
        used = model
    except ModelNotFound:
        raw = call(transport, key="link", model=fallback, parts=parts, schema=schema, validate=parse)
        used = fallback

    fields = {a.id: a for a in agreement.accepted}
    joints: list[Verified] = []
    drafts: list[dict] = []
    notes: dict[str, list[str]] = {}
    n = len(to_check) + len(agreement.unassigned)

    def new_item(**kw) -> ToCheck:
        nonlocal n
        n += 1
        return ToCheck(id=f"tc_{n:04d}", **kw)

    for k, item in enumerate(raw):
        try:
            v = verify(LinkedJoint.model_validate(item), fields)
        except (ValidationError, ValueError, KeyError, AttributeError, TypeError) as e:
            # Only a joint short of numbers is incomplete; a wrong structure (two beams one way) is not a draft.
            short = isinstance(e, ValidationError) and all(
                err["type"] in INCOMPLETE for err in e.errors())
            d = draft(item, fields) if short else None
            if d is None or any(d["id"] == x["id"] for x in drafts) or any(d["id"] == v.joint.id for v in joints):
                to_check.append(new_item(member=None, field=f"joints[{k}]", page=0, box_2d=None, gemini=None,
                                         parser=None, reason="ambiguous",
                                         detail=f"the linking model's joint {k + 1} is not a valid joint "
                                                f"({type(e).__name__}); link it by hand"))
                continue
            # Incomplete: a draft, from accepted fields only, with one item naming what no field gives.
            drafts.append(d)
            missing = _nulls(d)
            to_check.append(new_item(member=d["column"]["id"], field="joint", page=0, box_2d=None, gemini=None,
                                     parser=None, reason="missing", joint=d["id"],
                                     detail=f"{d['id']} is a draft: no accepted value gives "
                                            f"{', '.join(missing) if missing else 'a value the joint needs'}"))
            continue
        if any(v.joint.id == other.joint.id for other in joints):
            to_check.append(new_item(member=v.joint.column.id, field="joint", page=0, box_2d=None, gemini=None,
                                     parser=None, reason="ambiguous", joint=v.joint.id,
                                     detail=f"the linking model gave {v.joint.id} twice"))
            continue
        joints.append(v)
        notes[v.joint.id] = [x for x in (item.get("joint") or {}).get("notes", []) if isinstance(x, str)]
        for issue in v.issues:
            first = issue.fields[0] if issue.fields else None
            to_check.append(new_item(
                member=first.member if first else None, field=issue.path, page=first.page if first else 0,
                box_2d=first.box if first else None, gemini=None,
                parser={"value": ", ".join(a.value for a in issue.fields)} if issue.fields else None,
                reason=issue.reason, detail=issue.detail, joint=v.joint.id))

    # Items from agreement block every joint that uses their member. Items on general notes and project-wide
    # settings stay as one project-level item (joint null), which blocks every joint (see `blocks`). An item about
    # one grid place (a column off the grid near N1-4) blocks only joints at that place: none, for a column on no
    # grid intersection, so it stays in to_check.json with joint null.
    for t in to_check:
        if t.joint is None and t.field in USED_FIELDS and not project_level(t):
            hits = [v.joint.id for v in joints if t.member in _members(v.joint) and (
                not t.level or v.floor is None or ends_at(t.level, v.floor) or floor(t.level) == v.floor)
                and (t.place is None or v.place == t.place)]
            hits += [d["id"] for d in drafts if t.member in {d["column"]["id"], *(b["id"] for b in d["beams"])} and (
                not t.level or d["floor"] is None or ends_at(t.level, d["floor"]) or floor(t.level) == d["floor"])
                and (t.place is None or d["place"] == t.place)]
            if len(hits) == 1:
                t.joint = hits[0]
            elif hits:                                   # a beam in two joints: one item per joint
                t.joint = hits[0]
                for extra in hits[1:]:
                    copy = new_item(**{k: v for k, v in t.to_json().items() if k not in ("id", "joint")})
                    copy.box_2d, copy.joint = t.box_2d, extra
                    to_check.append(copy)
    # Zone and exposure the drawing does not state: one project-level item each, never a silent default. Zone II
    # would turn IS 13920 off.
    if joints:
        for name, what in (("seismic_zone", "the seismic zone; IS 13920 applies only in zones III, IV and V"),
                           ("exposure", "the exposure condition, which sets the cover IS 456 requires")):
            if not any(a.field == name for a in agreement.accepted) and not any(t.field == name for t in to_check):
                to_check.append(new_item(member="ALL", field=name, page=0, box_2d=None, gemini=None, parser=None,
                                         reason="missing", detail=f"the drawing does not state {what}; give it"))
    tied = to_check
    return Linked(joints, tied, used, notes, drafts)
