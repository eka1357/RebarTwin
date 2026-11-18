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
    monkeypatch.setenv("REBARTWIN_REPLIES_DIR", str(tmp_path / "shared_replies"))

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


def test_joint_ids_with_at_and_plus_encode_cleanly(tmp_path: Path, monkeypatch):
    """Joint ids like C5xXB3xYB14@FIRST@C+C1-25 with floor and place suffixes serve bundles cleanly."""
    monkeypatch.setenv("REBARTWIN_PROJECTS_DIR", str(tmp_path))
    p_dir = tmp_path / "at-proj"
    for jid in ("C4xB12@FIRST", "C5xXB3xYB14@FIRST@C+C1-25"):
        j_dir = p_dir / "joints" / jid
        j_dir.mkdir(parents=True)
        (j_dir / "bundle.json").write_text(json.dumps({"joint": {"id": jid}, "provenance": []}), encoding="utf-8")
    (p_dir / "project.json").write_text(json.dumps({"id": "at-proj", "name": "At Proj", "status": "done"}), encoding="utf-8")
    (p_dir / "to_check.json").write_text("[]", encoding="utf-8")

    client = TestClient(create_app())
    r = client.get("/projects/at-proj/joints/C4xB12%40FIRST/bundle")
    assert r.status_code == 200
    assert r.json()["joint"]["id"] == "C4xB12@FIRST"

    r_plus = client.get("/projects/at-proj/joints/C5xXB3xYB14%40FIRST%40C%2BC1-25/bundle")
    assert r_plus.status_code == 200
    assert r_plus.json()["joint"]["id"] == "C5xXB3xYB14@FIRST@C+C1-25"


def test_project_overview_exposes_counts_failures_by_rule_worst_and_beam_junctions(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("REBARTWIN_PROJECTS_DIR", str(tmp_path))
    p_dir = tmp_path / "overview-proj"
    j_dir = p_dir / "joints" / "C4xB12@FIRST@B-4"
    j_dir.mkdir(parents=True)
    joint_data = json.loads(EXAMPLE_JOINT.read_text(encoding="utf-8"))
    joint_data["id"] = "C4xB12@FIRST@B-4"
    joint_data["place"] = "B-4"
    joint_data["floor"] = "FIRST"
    (p_dir / "joints" / "C4xB12@FIRST@B-4.json").write_text(json.dumps(joint_data), encoding="utf-8")

    # Joint without explicit place/floor must stay null (never split from id).
    no_meta = json.loads(EXAMPLE_JOINT.read_text(encoding="utf-8"))
    no_meta["id"] = "C4xB12@SECOND@G-9"
    (p_dir / "joints" / "C4xB12@SECOND@G-9.json").write_text(json.dumps(no_meta), encoding="utf-8")

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
    (p_dir / "reading.json").write_text(
        json.dumps({
            "plans": {
                "junctions": [
                    {
                        "beam": "XB9",
                        "page": 15,
                        "kind": "beam on beam",
                        "at": ["C-4"],
                        "detail": "XB9 ends at C-4, where no column is on the column layout",
                    }
                ]
            }
        }),
        encoding="utf-8",
    )

    client = TestClient(create_app())
    ov = client.get("/projects/overview-proj").json()
    assert ov["counts"] == {"found": 2, "checked": 1, "failing": 1, "blocked": 1, "passing": 0}
    first_j = next(j for j in ov["joints"] if j["id"] == "C4xB12@FIRST@B-4")
    second_j = next(j for j in ov["joints"] if j["id"] == "C4xB12@SECOND@G-9")
    assert first_j["place"] == "B-4" and first_j["floor"] == "FIRST"
    assert first_j["grid"] == "B-4" and first_j["level"] == "FIRST"
    assert second_j["place"] is None and second_j["floor"] is None
    assert first_j["worst_failure"]["rule"] == "GEOM-CLASH"
    assert ov["failures_by_rule"][0]["rule"] == "IS456-26.3.2-H"
    assert ov["failures_by_rule"][0]["failures"] == 4
    assert ov["failures_by_rule"][0]["joints"] == 1
    assert len(ov["beam_junctions"]) == 1
    assert ov["beam_junctions"][0]["beams"] == ["XB9"]
    assert ov["beam_junctions"][0]["grid"] == "C-4"


def test_draft_joints_and_shared_rebartwin_replies_dir(tmp_path: Path, monkeypatch):
    """Drafts list as blocked with explicit place/floor/storey and nulls; resolve skips drafts;
    upload replies reuse REBARTWIN_REPLIES_DIR with no per-project replies folder."""
    monkeypatch.setenv("REBARTWIN_PROJECTS_DIR", str(tmp_path / "projects"))
    replies_dir = tmp_path / "shared_replies"
    monkeypatch.setenv("REBARTWIN_REPLIES_DIR", str(replies_dir))

    fixtures = tmp_path / "fx"
    fixtures.mkdir()
    (fixtures / "read-p1-t0.json").write_text((FIXTURES / "read-p1-t0.json").read_text(encoding="utf-8"), encoding="utf-8")
    (fixtures / "link.json").write_text((FIXTURES / "link.json").read_text(encoding="utf-8"), encoding="utf-8")

    rec = gemini.RecordedTransport(fixtures)
    app = create_app(transport_factory=lambda: rec)
    client = TestClient(app)

    client.post("/projects", json={"id": "replay-one", "name": "Replay One"})
    pdf_bytes = make_pdf(tmp_path / "sheet.pdf").read_bytes()
    client.post(
        "/projects/replay-one/drawings",
        files={"file": ("sheet.pdf", pdf_bytes, "application/pdf")},
        data={"sync": "true", "no_ifc": "true"},
    )
    assert len(rec.calls) > 0
    assert replies_dir.is_dir() and any(replies_dir.glob("*.json"))
    assert not (tmp_path / "projects" / "replay-one" / "replies").exists()

    # Second project upload hits REBARTWIN_REPLIES_DIR cache without calling reading/linking Gemini again
    calls_before = len(rec.calls)
    client.post("/projects", json={"id": "replay-two", "name": "Replay Two"})
    client.post(
        "/projects/replay-two/drawings",
        files={"file": ("sheet.pdf", pdf_bytes, "application/pdf")},
        data={"sync": "true", "no_ifc": "true"},
    )
    extra_reader_calls = [
        c for c in rec.calls[calls_before:] if not str(c.get("key", "")).startswith("propose")
    ]
    assert extra_reader_calls == []
    reading_two = json.loads((tmp_path / "projects" / "replay-two" / "reading.json").read_text(encoding="utf-8"))
    assert reading_two["calls"] and all(c["cached"] is True for c in reading_two["calls"])
    assert not (tmp_path / "projects" / "replay-two" / "replies").exists()

    # Add a *.draft.json alongside a project-level item and verify overview + resolve skip
    p_dir = tmp_path / "projects" / "replay-two"
    draft_id = "C5xXB8@FIRST@F-14"
    draft_payload = {
        "id": draft_id,
        "draft": True,
        "place": "F-14",
        "floor": "FIRST",
        "storey": "FOUNDATION TO FIRST FLOOR",
        "column": {
            "id": "C5",
            "section": [{"value": "300x600", "field": "section", "layer": 1, "field_id": "f0001", "page": 8, "level": "FOUNDATION TO FIRST FLOOR", "at": None}],
            "main": None,
            "ties": None,
            "cover": None,
        },
        "beams": [
            {
                "id": "XB8",
                "direction": "x",
                "section": None,
                "top": [{"value": "4-16", "field": "top", "layer": 1, "field_id": "f0002", "page": 17, "level": "FIRST", "at": None}],
                "top_extra_unplaced": False,
                "bottom": None,
                "stirrups": None,
                "cover": None,
                "frames_into": [{"value": "C5", "field": "frames_into", "layer": 1, "field_id": "f0003", "page": 15, "level": "FIRST", "at": "F-14"}],
            }
        ],
    }
    (p_dir / "joints" / f"{draft_id}.draft.json").write_text(json.dumps(draft_payload), encoding="utf-8")
    tc_path = p_dir / "to_check.json"
    tc_list = json.loads(tc_path.read_text(encoding="utf-8"))
    tc_list.append({
        "id": "tc_draft_col_main",
        "member": "C5",
        "field": "column.main",
        "page": 8,
        "box_2d": None,
        "gemini": None,
        "parser": None,
        "reason": "missing",
        "detail": "column.main has no accepted value",
        "layer": 1,
        "joint": draft_id,
        "resolution": None,
        "level": "FIRST",
    })
    tc_list.append({
        "id": "tc_proj_zone_d",
        "member": "ALL",
        "field": "seismic_zone",
        "page": 0,
        "box_2d": None,
        "gemini": None,
        "parser": None,
        "reason": "missing",
        "detail": "the drawing does not state the seismic zone",
        "layer": 1,
        "joint": None,
        "resolution": None,
        "level": None,
    })
    tc_path.write_text(json.dumps(tc_list), encoding="utf-8")

    ov = client.get("/projects/replay-two").json()
    assert ov["counts"]["blocked"] >= 1
    draft_entry = next(j for j in ov["joints"] if j["id"] == draft_id)
    assert draft_entry["draft"] is True
    assert draft_entry["status"] == "to_check"
    assert draft_entry["bundle_ready"] is False
    assert draft_entry["place"] == "F-14"
    assert draft_entry["floor"] == "FIRST"
    assert draft_entry["storey"] == "FOUNDATION TO FIRST FLOOR"
    assert draft_entry["column"]["section"][0]["value"] == "300x600"
    assert draft_entry["column"]["main"] is None
    assert draft_entry["blocked_count"] == 2
    assert set(draft_entry["blocking_item_ids"]) == {"tc_draft_col_main", "tc_proj_zone_d"}
    assert len(draft_entry["blocking_items"]) == 2
    assert sorted(draft_entry["sheets"]) == [8, 15, 17]

    # Resolving project zone succeeds and skips the draft file without crashing
    rz = client.post("/projects/replay-two/to-check/tc_proj_zone_d/resolve?no_ifc=true", json={"value": "III"})
    assert rz.status_code == 200
    assert draft_id not in rz.json()["checked_joints"]

    # Ambiguous member=None linking item cascades cleanly even when an unrelated unlinked joint=None item exists,
    # and _apply_resolved_provenance avoids duplicate via-cascaded rows
    amb_proj = tmp_path / "projects" / "cascade-proj"
    j_dir = amb_proj / "joints"
    j_dir.mkdir(parents=True)
    joint_c1 = json.loads(EXAMPLE_JOINT.read_text(encoding="utf-8"))
    joint_c1["id"] = "C1xXB17@FIRST@L1"
    joint_c1["column"]["id"] = "C1"
    joint_c1["place"] = "L1"
    joint_c1["floor"] = "FIRST"
    (j_dir / "C1xXB17@FIRST@L1.json").write_text(json.dumps(joint_c1), encoding="utf-8")
    (amb_proj / "project.json").write_text(json.dumps({"id": "cascade-proj", "name": "Cascade", "status": "done"}), encoding="utf-8")
    (amb_proj / "provenance.json").write_text("[]", encoding="utf-8")
    (amb_proj / "to_check.json").write_text(
        json.dumps([
            {"id": "tc_unlinked", "member": "C1", "field": "main", "page": 7, "box_2d": None, "gemini": None, "parser": None, "reason": "ambiguous", "detail": "other", "layer": 1, "joint": None, "resolution": None, "level": None},
            {"id": "tc_col", "member": "C1", "field": "column.main", "page": 7, "box_2d": None, "gemini": None, "parser": {"value": "4-16 + 4-12"}, "reason": "disagree", "detail": "mixed", "layer": 1, "joint": "C1xXB17@FIRST@L1", "resolution": None, "level": None},
            {"id": "tc_link_amb", "member": None, "field": "column.main", "page": 0, "box_2d": None, "gemini": None, "parser": None, "reason": "ambiguous", "detail": "mixed linking", "layer": 1, "joint": "C1xXB17@FIRST@L1", "resolution": None, "level": None},
        ]),
        encoding="utf-8",
    )
    amb_ov = client.get("/projects/cascade-proj").json()
    assert amb_ov["to_check_counts"]["unresolved"] == 3
    assert amb_ov["to_check_counts"]["blocking_unresolved"] == 2
    assert amb_ov["to_check_counts"]["non_blocking_unresolved"] == 1
    amb_queue = client.get("/projects/cascade-proj/to-check").json()
    assert [row["id"] for row in amb_queue] == ["tc_col", "tc_link_amb", "tc_unlinked"]
    assert [row["blocks_joint"] for row in amb_queue] == [True, True, False]

    rc = client.post("/projects/cascade-proj/to-check/tc_col/resolve?no_ifc=true", json={"value": "8-16"})
    assert rc.status_code == 200
    assert rc.json()["checked_joints"] == ["C1xXB17@FIRST@L1"]
    bundle_c1 = client.get("/projects/cascade-proj/joints/C1xXB17%40FIRST%40L1/bundle").json()
    resolved_col_entries = [e for e in bundle_c1["provenance"] if e["field"] == "main" and e["status"] == "resolved"]
    assert len(resolved_col_entries) == 1

    # Mixed corner + face column main bars ("4-16 + 4-12") write bar_dia=16 and face_dia=12
    bad_mix = client.post("/projects/cascade-proj/to-check/tc_col/resolve?no_ifc=true", json={"value": "3-16 + 5-12"})
    assert bad_mix.status_code == 422

    rmix = client.post("/projects/cascade-proj/to-check/tc_col/resolve?no_ifc=true", json={"value": "4-16 + 4-12"})
    assert rmix.status_code == 200
    mixed_bundle = client.get("/projects/cascade-proj/joints/C1xXB17%40FIRST%40L1/bundle").json()
    assert mixed_bundle["joint"]["column"]["n_bars"] == 8
    assert mixed_bundle["joint"]["column"]["bar_dia"] == 16
    assert mixed_bundle["joint"]["column"]["face_dia"] == 12
    col_dias = sorted({round(b["dia"]) for b in mixed_bundle["scene"]["bars"] if b["member"] == "C1"})
    assert col_dias == [12, 16]


def test_demo_only_blocks_writes_and_model_calls_and_reports_health(tmp_path: Path, monkeypatch):
    from rebartwin.api import _safe_run_check
    from rebartwin.model import Joint

    monkeypatch.setenv("REBARTWIN_PROJECTS_DIR", str(tmp_path / "projects"))
    monkeypatch.setenv("REBARTWIN_REPLIES_DIR", str(tmp_path / "replies"))
    monkeypatch.setenv("DEMO_ONLY", "true")
    monkeypatch.setenv("GEMINI_API_KEY", "should-not-be-used")

    def boom():
        raise AssertionError("Gemini/Vision must never be constructed when DEMO_ONLY=true")

    app = create_app(transport_factory=boom, ocr_factory=boom)
    client = TestClient(app)

    proj_dir = tmp_path / "projects" / "existing-demo"
    proj_dir.mkdir(parents=True)
    (proj_dir / "project.json").write_text(
        json.dumps({"id": "existing-demo", "name": "Existing", "status": "done"}),
        encoding="utf-8",
    )
    tc_payload = [
        {
            "id": "tc_1",
            "member": None,
            "field": "settings.seismic_zone",
            "page": 0,
            "box_2d": None,
            "gemini": None,
            "parser": None,
            "reason": "missing",
            "detail": "Select seismic zone",
            "layer": 1,
            "joint": None,
            "resolution": None,
            "level": None,
        }
    ]
    (proj_dir / "to_check.json").write_text(json.dumps(tc_payload), encoding="utf-8")

    for url in ("/health", "/api/health"):
        hr = client.get(url)
        assert hr.status_code == 200
        assert hr.json() == {"status": "ok", "demo_only": True}

    for url in ("/projects", "/api/projects"):
        cr = client.post(url, json={"name": "Blocked"})
        assert cr.status_code == 403
        assert cr.headers["content-type"].startswith("application/problem+json")
        assert cr.json()["title"] == "Disabled in public demo"

    up = client.post(
        "/api/projects/existing-demo/drawings",
        files={"file": ("plan.pdf", b"%PDF-1.4\n", "application/pdf")},
        data={"sync": "true"},
    )
    assert up.status_code == 403
    assert up.json()["title"] == "Disabled in public demo"

    res = client.post("/api/projects/existing-demo/to-check/tc_1/resolve", json={"value": "III"})
    assert res.status_code == 403
    assert json.loads((proj_dir / "to_check.json").read_text(encoding="utf-8"))[0]["resolution"] is None

    # Read-only project listing and deterministic stateless check remain enabled without hitting model factories.
    assert [p["id"] for p in client.get("/api/projects").json()] == ["existing-demo"]
    joint_payload = json.loads(EXAMPLE_JOINT.read_text(encoding="utf-8"))
    chk = client.post("/api/joints/check", json=joint_payload)
    assert chk.status_code == 200
    assert chk.json()["fix"]["status"] == "fixed"

    # Even if _safe_run_check is called directly in demo mode, transport_factory is skipped.
    out_dir = tmp_path / "direct_check"
    rc = _safe_run_check(app, proj_dir, Joint.model_validate(joint_payload), out_dir, no_ifc=True)
    assert rc in (0, 1)


def test_single_service_serves_spa_and_static_assets(tmp_path: Path, monkeypatch):
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "wasm").mkdir(parents=True)
    (dist / "live" / "iit-demo").mkdir(parents=True)
    (dist / "demo").mkdir(parents=True)
    (dist / "index.html").write_text("<!doctype html><html><body>RebarTwin SPA</body></html>", encoding="utf-8")
    (dist / "assets" / "app.js").write_text("console.log('ok');", encoding="utf-8")
    (dist / "wasm" / "web-ifc.wasm").write_bytes(b"\x00asm\x01\x00\x00\x00")
    (dist / "live" / "iit-demo" / "bundle.json").write_text('{"joint":{"id":"C1"}}', encoding="utf-8")
    (dist / "live" / "iit-demo" / "joint.ifc").write_text("ISO-10303-21;", encoding="utf-8")

    monkeypatch.setenv("REBARTWIN_PROJECTS_DIR", str(tmp_path / "projects"))
    monkeypatch.setenv("REBARTWIN_WEB_DIST", str(dist))
    monkeypatch.delenv("DEMO_ONLY", raising=False)

    client = TestClient(create_app())

    for route in ("/", "/demo", "/demo/iit", "/demo/iit/report", "/projects/iit-demo", "/upload"):
        r = client.get(route, headers={"Accept": "text/html,application/xhtml+xml"})
        assert r.status_code == 200
        assert "RebarTwin SPA" in r.text
        assert r.headers["content-type"].startswith("text/html")

    # API GET endpoints remain JSON when requested cleanly without HTML browser Accept.
    api_list = client.get("/projects", headers={"Accept": "application/json"})
    assert api_list.status_code == 200
    assert api_list.json() == []

    h_browser = client.get("/api/health", headers={"Accept": "text/html"})
    assert h_browser.status_code == 200
    assert h_browser.json()["status"] == "ok"

    wasm_resp = client.get("/wasm/web-ifc.wasm")
    assert wasm_resp.status_code == 200
    assert wasm_resp.headers["content-type"].startswith("application/wasm")

    ifc_resp = client.get("/live/iit-demo/joint.ifc")
    assert ifc_resp.status_code == 200
    assert ifc_resp.headers["content-type"].startswith("application/x-step")

    bundle_resp = client.get("/live/iit-demo/bundle.json")
    assert bundle_resp.status_code == 200
    assert bundle_resp.json()["joint"]["id"] == "C1"

    missing_api = client.get("/api/no-such-endpoint")
    assert missing_api.status_code == 404
    assert missing_api.headers["content-type"].startswith("application/problem+json")

    missing_asset = client.get("/assets/missing.js")
    assert missing_asset.status_code == 404
    assert missing_asset.headers["content-type"].startswith("application/problem+json")
