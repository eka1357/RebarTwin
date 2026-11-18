"""FastAPI API tests for A1: stateless check, project reading + SSE events, To check resolution unlocking joints,
@ joint ids, IFC/BCF/report exports, drawing crops, and application/problem+json error responses."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

TESTS_DIR = Path(__file__).parent
if str(TESTS_DIR) not in sys.path:
    sys.path.insert(0, str(TESTS_DIR))

from reader_pdf import make_pdf  # noqa: E402

from rebartwin.api import create_app  # noqa: E402
from rebartwin.reader import gemini  # noqa: E402

FIXTURES = TESTS_DIR / "fixtures" / "reader"
EXAMPLE_JOINT = TESTS_DIR.parent / "examples" / "c4_b12.json"


def test_post_joints_check_stateless():
    app = create_app()
    client = TestClient(app)
    joint_payload = json.loads(EXAMPLE_JOINT.read_text(encoding="utf-8"))

    resp = client.post("/joints/check", json=joint_payload)
    assert resp.status_code == 200
    data = resp.json()
    fails = [f for f in data["report"]["findings"] if f["status"] == "fail"]
    assert len(fails) == 6
    assert data["fix"]["status"] == "fixed"

    resp_z3 = client.post("/joints/check?zone=III", json=joint_payload)
    assert resp_z3.status_code == 200
    assert any(f["rule"] == "IS13920-7.1.1" and f["status"] == "fail" for f in resp_z3.json()["report"]["findings"])


def test_project_upload_sse_to_check_unlock_bundle_exports_and_crop(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("REBARTWIN_PROJECTS_DIR", str(tmp_path))

    # Corrupt C4 section (last sorted field f0022) in recorded page reply so C4xB12xB13
    # is initially blocked by To check without shifting earlier f0001..f0021 field ids!
    fixtures = tmp_path / "fx"
    fixtures.mkdir()
    page = json.loads((FIXTURES / "read-p1-t0.json").read_text(encoding="utf-8"))
    for c in page["callouts"]:
        if (c["member"], c["field"]) == ("C4", "section"):
            c["value"] = "350x350"
    (fixtures / "read-p1-t0.json").write_text(json.dumps(page), encoding="utf-8")
    (fixtures / "link.json").write_text((FIXTURES / "link.json").read_text(encoding="utf-8"), encoding="utf-8")

    app = create_app(transport_factory=lambda: gemini.RecordedTransport(fixtures))
    client = TestClient(app)

    # 1. Create project
    p_resp = client.post("/projects", json={"id": "demo-live", "name": "Demo Live"})
    assert p_resp.status_code == 201
    assert p_resp.json()["id"] == "demo-live"

    # 2. Reject invalid upload with application/problem+json
    bad = client.post("/projects/demo-live/drawings", files={"file": ("notes.txt", b"hello", "text/plain")})
    assert bad.status_code == 400
    assert bad.headers["content-type"].startswith("application/problem+json")

    # 3. Upload valid PDF (sync=True for deterministic test assertions)
    pdf_bytes = make_pdf(tmp_path / "sheet.pdf").read_bytes()
    up = client.post(
        "/projects/demo-live/drawings",
        files={"file": ("sheet.pdf", pdf_bytes, "application/pdf")},
        data={"sync": "true", "no_ifc": "true"},
    )
    assert up.status_code == 202

    # 4. Stream events SSE replay
    sse = client.get("/projects/demo-live/events")
    assert sse.status_code == 200
    assert "event: page_started" in sse.text
    assert "event: page_read" in sse.text
    assert "event: done" in sse.text

    # 5. Project overview lists blocked joint
    proj = client.get("/projects/demo-live").json()
    assert proj["status"] == "done"
    assert proj["joints"][0]["id"] == "C4xB12xB13"
    assert proj["joints"][0]["status"] == "to_check"

    # Bundle must refuse with 409 while blocked
    blocked_bundle = client.get("/projects/demo-live/joints/C4xB12xB13/bundle")
    assert blocked_bundle.status_code == 409
    assert blocked_bundle.headers["content-type"].startswith("application/problem+json")

    # 6. Inject a project-level item into to_check.json and verify /to-check puts it FIRST
    tc_path = tmp_path / "demo-live" / "to_check.json"
    tc_raw = json.loads(tc_path.read_text(encoding="utf-8"))
    tc_raw.append({
        "id": "tc_proj_zone",
        "member": "ALL",
        "field": "seismic_zone",
        "page": 0,
        "box_2d": None,
        "gemini": None,
        "parser": None,
        "reason": "missing",
        "detail": "the drawing does not state the seismic zone; give it",
        "layer": 1,
        "joint": None,
        "resolution": None,
        "level": None,
    })
    tc_path.write_text(json.dumps(tc_raw), encoding="utf-8")

    queue = client.get("/projects/demo-live/to-check").json()
    assert queue[0]["id"] == "tc_proj_zone"
    assert queue[0]["project_level"] is True

    # Invalid grammar rejected with 422 problem+json
    bad_res = client.post("/projects/demo-live/to-check/tc_proj_zone/resolve", json={"value": "Zone X"})
    assert bad_res.status_code == 422
    assert bad_res.headers["content-type"].startswith("application/problem+json")

    # Resolve project-level zone -> II; joint remains blocked by member top disagreement
    r1 = client.post("/projects/demo-live/to-check/tc_proj_zone/resolve", json={"value": "III"})
    assert r1.status_code == 200
    assert r1.json()["resolved_value"] == "III"
    assert r1.json()["checked_joints"] == []

    # Resolve joint C4 section disagreement -> validates, cascades derived missing item, unlocks & checks C4xB12xB13!
    joint_item = next(x for x in queue if x.get("joint") == "C4xB12xB13" and x.get("field") == "section")
    r2 = client.post(
        f"/projects/demo-live/to-check/{joint_item['id']}/resolve?no_ifc=true",
        json={"value": "300x300"},
    )
    assert r2.status_code == 200
    assert r2.json()["checked_joints"] == ["C4xB12xB13"]

    # 7. Bundle, report.md, issues.bcf, and page crop work cleanly
    bundle = client.get("/projects/demo-live/joints/C4xB12xB13/bundle")
    assert bundle.status_code == 200
    b_json = bundle.json()
    assert b_json["joint"]["settings"]["seismic_zone"] == "III"
    assert any(e["status"] == "resolved" for e in b_json["provenance"])
    assert any(e["status"] == "default" for e in b_json["provenance"])

    rep = client.get("/projects/demo-live/joints/C4xB12xB13/report.md")
    assert rep.status_code == 200 and "C4xB12xB13" in rep.text

    bcf = client.get("/projects/demo-live/joints/C4xB12xB13/issues.bcf")
    assert bcf.status_code == 200 and len(bcf.content) > 100

    crop_img = client.get("/projects/demo-live/pages/1.png?crop=100,100,300,400")
    assert crop_img.status_code == 200
    assert crop_img.headers["content-type"] == "image/png"
    assert crop_img.content.startswith(b"\x89PNG")


def test_joint_ids_with_at_sign_encode_cleanly(tmp_path: Path, monkeypatch):
    """Joint ids like C4xB12@FIRST with storey suffix must serve bundle & assets cleanly over encoded URLs."""
    monkeypatch.setenv("REBARTWIN_PROJECTS_DIR", str(tmp_path))
    p_dir = tmp_path / "at-proj"
    j_dir = p_dir / "joints" / "C4xB12@FIRST"
    j_dir.mkdir(parents=True)
    _bundle = {"joint": {"id": "C4xB12@FIRST"}, "provenance": []}
    (p_dir / "project.json").write_text(json.dumps({"id": "at-proj", "name": "At Proj", "status": "done"}), encoding="utf-8")
    (p_dir / "to_check.json").write_text("[]", encoding="utf-8")
    (j_dir / "bundle.json").write_text(json.dumps(_bundle), encoding="utf-8")

    client = TestClient(create_app())
    r = client.get("/projects/at-proj/joints/C4xB12%40FIRST/bundle")
    assert r.status_code == 200
    assert r.json()["joint"]["id"] == "C4xB12@FIRST"


def test_project_overview_exposes_counts_failures_by_rule_worst_and_beam_junctions(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("REBARTWIN_PROJECTS_DIR", str(tmp_path))
    p_dir = tmp_path / "overview-proj"
    j_dir = p_dir / "joints" / "C4xB12@FIRST"
    j_dir.mkdir(parents=True)
    joint_data = json.loads(EXAMPLE_JOINT.read_text(encoding="utf-8"))
    joint_data["id"] = "C4xB12@FIRST"
    joint_data["grid"] = "B-4"
    (p_dir / "joints" / "C4xB12@FIRST.json").write_text(json.dumps(joint_data), encoding="utf-8")
    from rebartwin.check import check
    from rebartwin.fixes import Enumerator, resolve
    from rebartwin.model import Joint
    from rebartwin.report import bundle as make_bundle

    jm = Joint.model_validate(joint_data)
    rep, cage = check(jm)
    fix = resolve(jm, [Enumerator()])
    (j_dir / "bundle.json").write_text(json.dumps(make_bundle(jm, rep, fix, cage)), encoding="utf-8")
    (p_dir / "project.json").write_text(json.dumps({"id": "overview-proj", "name": "Overview", "status": "done"}), encoding="utf-8")
    (p_dir / "to_check.json").write_text("[]", encoding="utf-8")
    (p_dir / "beam_junctions.json").write_text(
        json.dumps([{"id": "B21-B4", "beams": ["B21", "B4"], "grid": "A/B-3", "level": "FIRST FLOOR", "page": 2}]),
        encoding="utf-8",
    )

    client = TestClient(create_app())
    ov = client.get("/projects/overview-proj").json()
    assert ov["counts"] == {"found": 1, "checked": 1, "failing": 1, "blocked": 0, "passing": 0}
    assert ov["joints"][0]["grid"] == "B-4"
    assert ov["joints"][0]["level"] == "FIRST"
    assert ov["joints"][0]["worst_failure"]["rule"] == "GEOM-CLASH"
    assert ov["failures_by_rule"][0]["rule"] == "IS456-26.3.2-H"
    assert ov["failures_by_rule"][0]["failures"] == 4
    assert ov["failures_by_rule"][0]["joints"] == 1
    assert len(ov["beam_junctions"]) == 1
    assert ov["beam_junctions"][0]["beams"] == ["B21", "B4"]
