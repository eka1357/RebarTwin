import json
import uuid
import zipfile
from pathlib import Path

import pytest

from rebartwin.check import check
from rebartwin.export_bcf import export_bcf
from rebartwin.guid import compress, ifc_guid
from rebartwin.model import Joint

EXAMPLE = Path(__file__).parent.parent / "examples" / "c4_b12.json"


def joint() -> Joint:
    return Joint.model_validate(json.loads(EXAMPLE.read_text(encoding="utf-8")))


def test_bcf_has_one_issue_per_failure_pointing_at_the_bars(tmp_path):
    j = joint()
    report, _ = check(j)
    path = tmp_path / "issues.bcf"
    assert export_bcf(j, report, path) == len(report.failures) == 6
    with zipfile.ZipFile(path) as z:
        names = z.namelist()
        assert "bcf.version" in names
        assert sum(n.endswith("/markup.bcf") for n in names) == 6
        views = "".join(z.read(n).decode() for n in names if n.endswith(".bcfv"))
    assert ifc_guid(j.id, "B12/T1-3") in views and ifc_guid(j.id, "C4/V4") in views


def test_bundle_carries_the_geometry_the_rules_measured():
    from rebartwin.fixes import resolve
    from rebartwin.report import bundle
    j = joint()
    report, cage = check(j)
    b = json.loads(json.dumps(bundle(j, report, resolve(j), cage)))      # what the viewer will read
    bars = {x["id"]: x for x in b["scene"]["bars"]}
    assert len(bars) == 17 and len(b["scene"]["loops"]) == len(cage.loops)
    assert {i for i, x in bars.items() if x["status"] == "fail"} == {f"B12/T1-{k}" for k in range(1, 6)} | {"C4/V4",
                                                                                                         "C4/V8"}
    assert bars["B12/T1-3"]["p0"] == [-750.0, 0.0, -43.0]
    assert {c["id"] for c in b["scene"]["concrete"]} == {"C4", "B12"}
    assert len(b["option_scenes"]) == len(b["fix"]["options"])
    assert all(x["status"] == "pass" for x in b["option_scenes"][0]["bars"])
    assert len(b["attempt_scenes"]) == len(b["fix"]["attempts"])
    first_failed = next(i for i, a in enumerate(b["fix"]["attempts"]) if not a["passed"])
    assert any(x["status"] == "fail" for x in b["attempt_scenes"][first_failed]["bars"])


def test_guids_match_ifcopenshell():
    guid = pytest.importorskip("ifcopenshell.guid")
    for _ in range(20):
        h = uuid.uuid4().hex
        assert compress(h) == guid.compress(h)


def test_ifc_kernel_finds_the_same_clashes(tmp_path):
    """Two independent channels: our closed-form geometry and IfcOpenShell's OpenCASCADE kernel must agree."""
    pytest.importorskip("ifcopenshell")
    from rebartwin.export_ifc import export_ifc, kernel_clashes
    j = joint()
    report, cage = check(j)
    path = tmp_path / "joint.ifc"
    guids = export_ifc(j, path, report, cage)
    assert len(guids) == len(cage.bars) + len(cage.loops)
    ours = {frozenset(f.bars) for f in report.failures if f.rule == "GEOM-CLASH"}
    assert kernel_clashes(path) == ours
