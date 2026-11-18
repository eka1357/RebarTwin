"""Run every rule that applies to a joint and say what fails. This is the authority for every number RebarTwin
shows: the viewer, the report and the fix loop all read it, and none of them computes its own."""
from __future__ import annotations

from collections import Counter

from pydantic import BaseModel

from .layout import Cage, build
from .model import Joint
from .rules import RULES, Finding


class Report(BaseModel):
    joint: str
    seismic_zone: str
    is13920: bool
    findings: list[Finding]
    rules_run: list[str]
    rules_skipped: dict[str, str]
    passed: dict[str, int]
    notes: list[str] = []

    @property
    def failures(self) -> list[Finding]:
        return [f for f in self.findings if f.status == "fail"]

    @property
    def verdict(self) -> str:
        n = len(self.failures)
        return "passes every rule checked" if not n else f"fails {n} check{'s' if n > 1 else ''}"


def check(joint: Joint) -> tuple[Report, Cage]:
    cage = build(joint)
    findings, run, skipped = [], [], {}
    for rule in RULES:
        if rule.seismic and not joint.settings.is13920:
            skipped[rule.id] = (f"IS 13920 is off: the joint is in seismic zone {joint.settings.seismic_zone}. It "
                                "applies in zones III to V, or when the designer turns it on.")
            continue
        run.append(rule.id)
        findings += rule.run(cage, joint)
    passed = Counter(f.rule for f in findings if f.status == "pass")
    report = Report(joint=joint.id, seismic_zone=joint.settings.seismic_zone, is13920=joint.settings.is13920,
                    findings=findings, rules_run=run, rules_skipped=skipped, passed=dict(passed), notes=joint.notes)
    return report, cage
