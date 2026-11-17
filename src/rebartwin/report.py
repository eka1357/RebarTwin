"""The plain-language report: what fails, by how much, under which clause, what fix passes every rule, what the
engineer must recheck, and every assumption. Markdown for people, JSON (`bundle`) for the viewer."""
from __future__ import annotations

from .check import Report, check
from .fixes import FixResult, apply
from .layout import EXTENT, Cage, build
from .model import Joint
from .rules import CATALOGUE

MAX_ATTEMPT_SCENES = 60


def _concrete(joint: Joint, cage: Cage) -> list[dict]:
    col, (z0, z1) = joint.column, cage.z_range
    boxes = [{"id": col.id, "kind": "column", "min": [-col.b / 2, -col.h / 2, z0], "max": [col.b / 2, col.h / 2, z1]}]
    for beam in joint.beams:
        reach = (col.b if beam.direction == "x" else col.h) / 2 + EXTENT
        if beam.direction == "x":
            lo, hi = [-reach, -beam.b / 2, -beam.D], [reach, beam.b / 2, 0.0]
        else:
            lo, hi = [-beam.b / 2, -reach, -beam.D], [beam.b / 2, reach, 0.0]
        boxes.append({"id": beam.id, "kind": "beam", "min": lo, "max": hi})
    return boxes


def _bars(cage: Cage, failing: dict[str, list[int]]) -> list[dict]:
    return [{"id": b.id, "member": b.member, "role": b.role, "layer": b.layer, "index": b.index, "dia": b.dia,
             "p0": list(b.p0), "p1": list(b.p1), "label": b.label,
             "status": "fail" if b.id in failing else "pass", "findings": failing.get(b.id, [])} for b in cage.bars]


def scene(joint: Joint, cage: Cage, report: Report | None = None) -> dict:
    """The cage as plain geometry for the viewer: millimetres, Z up, exactly the bars the rules measured. A bar's
    `findings` are indexes into `report.findings`."""
    failing: dict[str, list[int]] = {}
    for i, f in enumerate(report.findings if report else []):
        if f.status == "fail":
            for bar_id in f.bars:
                failing.setdefault(bar_id, []).append(i)
    loops = [{"id": l.id, "member": l.member, "role": l.role, "dia": l.dia, "points": [list(p) for p in l.points]}
             for l in cage.loops]
    return {"units": "mm", "up": "z", "concrete": _concrete(joint, cage), "bars": _bars(cage, failing),
            "loops": loops}


def bundle(joint: Joint, report: Report, fix: FixResult, cage: Cage | None = None,
           attempt_scenes: bool = True) -> dict:
    """Everything the viewer needs in one JSON: the joint as read, the findings, the fix and its workings, and the
    geometry to draw. `option_scenes` follows `fix.options`; `attempt_scenes` follows `fix.attempts` (first
    MAX_ATTEMPT_SCENES), bars and concrete only, with each bar's `findings` indexing that attempt's `failures`."""
    if cage is None:
        _, cage = check(joint)
    out = {"joint": joint.model_dump(), "report": report.model_dump(), "fix": fix.model_dump(),
           "rules": {r.id: {"clause": r.clause, "title": r.title, "basis": r.basis} for r in CATALOGUE.values()},
           "scene": scene(joint, cage, report), "option_scenes": []}
    for option in fix.options:
        trial = apply(joint, option.candidate)
        rep, trial_cage = check(trial)
        out["option_scenes"].append(scene(trial, trial_cage, rep))
    if attempt_scenes:
        out["attempt_scenes"] = []
        for attempt in fix.attempts[:MAX_ATTEMPT_SCENES]:
            trial = apply(joint, attempt.candidate)
            trial_cage = build(trial)
            failing: dict[str, list[int]] = {}
            for i, f in enumerate(attempt.failures):
                for bar_id in f.get("bars", []):
                    failing.setdefault(bar_id, []).append(i)
            out["attempt_scenes"].append({"concrete": _concrete(trial, trial_cage),
                                          "bars": _bars(trial_cage, failing)})
    return out


def markdown(joint: Joint, report: Report, fix: FixResult) -> str:
    s = joint.settings
    lines = [f"# {joint.id}: {report.verdict}", "",
             f"Seismic zone {s.seismic_zone} (IS 13920 {'on' if report.is13920 else 'off'}), {s.exposure.replace('_', ' ')} "
             f"exposure, {s.aggregate:g} mm aggregate. Advisory: the engineer of record decides.", ""]
    if report.failures:
        lines += ["## What fails", "", "| Check | Clause | Measured | Needs | What it means |", "|---|---|---|---|---|"]
        for f in report.failures:
            need = f"{f.compare} {f.limit:g} {f.unit}"
            lines.append(f"| {f.title} | {f.clause} | {f.measured:g} {f.unit} | {need} | {f.message} |")
        lines.append("")
    lines += ["## Fix", "", fix.summary, ""]
    for k, o in enumerate(fix.options, 1):
        lines.append(f"**Option {k}: {o.candidate.title}**")
        lines.append("")
        for c in o.faces:
            lines.append(f"- {c.beam} {c.face} (layers outermost first): {c.before} becomes {c.after}; "
                         f"{c.area_provided:.0f} mm² against "
                         f"{c.area_required:.0f} mm² needed (+{c.overshoot_pct:g}%); effective depth {c.depth_before:.0f} "
                         f"to {c.depth_after:.0f} mm")
        if o.column:
            lines.append(f"- Column: {o.column} mm")
        for flag in o.flags:
            lines.append(f"- Recheck: {flag}")
        lines.append("")
    if fix.blocking:
        lines += ["## Why the other candidates failed", ""]
        for rule, n in sorted(fix.blocking.items(), key=lambda x: -x[1]):
            lines.append(f"- {CATALOGUE[rule].clause}, {CATALOGUE[rule].title.lower()}: rejected {n}")
        lines.append("")
    lines += ["## Rules", ""]
    for rule_id in report.rules_run:
        r = CATALOGUE[rule_id]
        lines.append(f"- {r.clause}, {r.title.lower()}: {report.passed.get(rule_id, 0)} passed. Basis: {r.basis}")
    for rule_id, why in report.rules_skipped.items():
        lines.append(f"- {CATALOGUE[rule_id].clause}: not run. {why}")
    if joint.notes:
        lines += ["", "## Assumptions", ""] + [f"- {n}" for n in joint.notes]
    return "\n".join(lines) + "\n"
