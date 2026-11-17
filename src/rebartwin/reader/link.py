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
import time
from collections import Counter
from dataclasses import dataclass, field
from typing import Callable

from pydantic import BaseModel, Field, ValidationError

from ..model import Beam, Column, Joint, Settings, parse_bars
from .agree import Accepted, Agreement, ToCheck
from .gemini import GLOBAL_MEMBERS, PROMPTS, ModelNotFound, Transport, call

LINK_PROMPT = "link_v1"
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
    for s in linked.sources:
        unknown = [i for i in s.field_ids if i not in fields]
        if unknown:
            issues.append(Issue(s.path, "missing", f"{s.path} cites {', '.join(unknown)}, which are not accepted "
                                "fields"))
        cited.setdefault(s.path, []).extend(fields[i] for i in s.field_ids if i in fields)

    def of(member: str, *names: str, scope: tuple[str, ...] = ()) -> list[Accepted]:
        """Accepted fields for a member; general notes in `scope` only when the member has none of its own."""
        own = [a for a in accepted if a.member == member and a.field in names]
        return own or [a for a in accepted if a.member in scope and a.field in names]

    def use(path: str, expected: list[Accepted], names: tuple[str, ...], check: Callable[[list[Accepted]], str | None],
            *, required: bool = True, value=None, default=None, label: str = "") -> bool:
        """One path: the cited fields are the expected ones, none is left out, and the value matches them.
        An optional value with no field must equal the model default, which becomes a note."""
        got = cited.get(path, [])
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
                notes.append(f"Default: {label} {default} (not on the drawing).")
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
        c = _bars(got[0].value)
        if len(c) != 1:
            return f"{col.id} has mixed bar sizes ({got[0].value}); the engine takes one size per column"
        (dia, n), = c.items()
        if (col.n_bars, col.bar_dia) != (n, dia):
            return f"{col.id} has {col.n_bars}-{col.bar_dia:g} in the joint, {got[0].value} on the drawing"
    use("column.main", of(col.id, "main"), ("main",), main_col)

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

    for i, beam in enumerate(j.beams):
        p = f"beams[{i}]"

        def sec_beam(got, beam=beam):
            if (beam.b, beam.D) != _section(got[0].value):
                return f"{beam.id} is {beam.b:g} x {beam.D:g} in the joint, {got[0].value} on the drawing"
        use(f"{p}.section", of(beam.id, "section"), ("section",), sec_beam)

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
            use(f"{p}.{face}", of(beam.id, face, f"{face}_extra"), (face, f"{face}_extra"), face_check)

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
        meets = [a for a in of(beam.id, "frames_into") if a.value == col.id]
        if use(f"{p}.frames_into", meets, ("frames_into",), lambda got: None):
            notes.append(f"{beam.id} meets {col.id} on the plan; it runs along {beam.direction.upper()} "
                         "(the linking model's reading of the plan).")
        if len(beam.top) > 1 or len(beam.bottom) > 1:
            notes.append(f"Default: {beam.id} spacer between layers {beam.spacer:g} mm (not on the drawing)."
                         if beam.spacer == db["spacer"].default else
                         f"{beam.id} spacer {beam.spacer:g} mm (the linking model's value; no field gives it).")

    st = j.settings
    for name, value in (("seismic_zone", st.seismic_zone), ("exposure", st.exposure)):
        label = name.replace("_", " ")
        use(f"settings.{name}", [a for a in accepted if a.field == name], (name,),
            lambda got, value=value, label=label: None if got[0].value == value else
            f"{label} is {value} in the joint, {got[0].value} on the drawing",
            required=False, value=value, default=ds[name].default, label=label)
    if st.aggregate == ds["aggregate"].default:
        notes.append(f"Default: aggregate {st.aggregate:g} mm (not on the drawing).")
    else:
        issues.append(Issue("settings.aggregate", "missing", f"aggregate {st.aggregate:g} mm comes from no "
                            "accepted field"))

    for u in linked.unresolved:
        issues.append(Issue(u.path, "ambiguous", f"Linking model: {u.reason}"))
    j.notes = list(dict.fromkeys(notes))
    for key in [k for k in provenance if re.fullmatch(r"beams\[\d+\]\.(top|bottom)", k)]:
        face = j.beams[int(key[6:key.index("]")])].face(key.rsplit(".", 1)[1])
        if len(face) == 1 and isinstance(provenance[key], dict):
            provenance[f"{key}[0].bars"] = provenance.pop(key)
    return Verified(Joint.model_validate(j.model_dump()), provenance, issues)


def _members(j: Joint) -> set[str]:
    return {j.column.id, *(b.id for b in j.beams)}


@dataclass
class Linked:
    joints: list[Verified]
    to_check: list[ToCheck]
    model: str | None
    link_notes: dict[str, list[str]]


def _inputs(agreement: Agreement) -> str:
    accepted = [{"id": a.id, "member": a.member, "field": a.field, "layer": a.layer, "value": a.value,
                 "page": a.page} for a in agreement.accepted]
    pending = [{"member": t.member, "field": t.field, "reason": t.reason} for t in agreement.to_check]
    template = (PROMPTS / f"{LINK_PROMPT}.md").read_text(encoding="utf-8")
    return (template.replace("{accepted}", json.dumps(accepted, ensure_ascii=False, indent=0))
            .replace("{pending}", json.dumps(pending, ensure_ascii=False, indent=0)))


# Fields a joint uses; To check items on other fields (grades) block nothing.
USED_FIELDS = {"section", "top", "top_extra", "bottom", "bottom_extra", "main", "links", "cover", "seismic_zone",
               "exposure", "frames_into"}


def link(agreement: Agreement, transport: Transport, model: str | None = None, fallback: str | None = None,
         sleep: Callable[[float], None] = time.sleep) -> Linked:
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
        raw = call(transport, key="link", model=model, parts=parts, schema=schema, validate=parse, sleep=sleep)
        used = model
    except ModelNotFound:
        raw = call(transport, key="link", model=fallback, parts=parts, schema=schema, validate=parse, sleep=sleep)
        used = fallback

    fields = {a.id: a for a in agreement.accepted}
    joints: list[Verified] = []
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
            to_check.append(new_item(member=None, field=f"joints[{k}]", page=0, box_2d=None, gemini=None,
                                     parser=None, reason="ambiguous",
                                     detail=f"the linking model's joint {k + 1} is not a valid joint "
                                            f"({type(e).__name__}); link it by hand"))
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

    # Items from agreement block every joint that uses their member, or every joint for a general note.
    tied: list[ToCheck] = []
    for t in to_check:
        if t.joint is not None or t.field not in USED_FIELDS:
            tied.append(t)
            continue
        general = t.member in GLOBAL_MEMBERS or t.field in ("seismic_zone", "exposure")
        hits = [v.joint.id for v in joints if general or t.member in _members(v.joint)]
        if not hits:
            tied.append(t)
            continue
        t.joint = hits[0]
        tied.append(t)
        for extra in hits[1:]:
            copy = new_item(**{k: v for k, v in t.to_json().items() if k not in ("id", "joint")})
            copy.box_2d, copy.joint = t.box_2d, extra
            tied.append(copy)
    return Linked(joints, tied, used, notes)
