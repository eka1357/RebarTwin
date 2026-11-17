"""`rebartwin read` end to end with recorded replies: the files the API and web app read, in the contract's shape,
and `check` run on each joint with nothing left to check."""
import json
from pathlib import Path

import pytest

pytest.importorskip("pymupdf")
pytest.importorskip("google.genai")

from reader_pdf import make_pdf  # noqa: E402

from rebartwin import cli  # noqa: E402
from rebartwin.model import Joint  # noqa: E402
from rebartwin.reader import gemini  # noqa: E402

FIXTURES = Path(__file__).parent / "fixtures" / "reader"


@pytest.fixture
def recorded(monkeypatch):
    monkeypatch.setattr(gemini, "GenAITransport", lambda: gemini.RecordedTransport(FIXTURES))
    monkeypatch.setattr(gemini.time, "sleep", lambda s: None)


def test_read_writes_the_contract_and_checks_the_joint(tmp_path: Path, recorded, capsys):
    """Zone III with C4 at 300 mm and B13's 25 mm bars: IS 13920 cl. 7.1.1 needs 20 x 25 = 500 mm of column along
    B13, so the joint fails a rule and the command exits 1."""
    out = tmp_path / "proj"
    code = cli.main(["read", str(make_pdf(tmp_path / "s.pdf")), "--out", str(out), "--no-ifc"])
    printed = capsys.readouterr().out
    assert code == 1
    assert "21 values agreed, 1 to check" in printed

    assert (out / "pages" / "page-1.png").is_file()
    joint = Joint.model_validate_json((out / "joints" / "C4xB12xB13.json").read_text(encoding="utf-8"))
    assert joint.beams[0].top[0].bars == "5-20"

    provenance = json.loads((out / "provenance.json").read_text(encoding="utf-8"))
    [p] = provenance
    assert p["joint"] == "C4xB12xB13"
    f = p["fields"]["beams[0].top[0].bars"]
    assert set(f) >= {"page", "box_2d", "text", "gemini", "parser", "status"}
    assert len(f["box_2d"]) == 4 and all(0 <= v <= 1000 for v in f["box_2d"])

    [item] = json.loads((out / "to_check.json").read_text(encoding="utf-8"))
    assert set(item) >= {"id", "joint", "field", "page", "box_2d", "gemini", "parser", "reason", "resolution"}
    assert (item["field"], item["reason"], item["joint"], item["resolution"]) == ("bottom", "disagree", None, None)

    bundle = json.loads((out / "joints" / "C4xB12xB13" / "bundle.json").read_text(encoding="utf-8"))
    assert any(x["rule"] == "IS13920-7.1.1" and x["status"] == "fail" for x in bundle["report"]["findings"])

    reading = json.loads((out / "reading.json").read_text(encoding="utf-8"))
    assert reading["prompts"] == {"read": "read_v1", "link": "link_v1"}
    assert reading["counts"]["accepted"] == 21


def test_blocked_joint_is_written_but_not_checked(tmp_path: Path, monkeypatch, capsys):
    """Copy the fixtures and corrupt B12's top in the read reply: the joint stays To check and check never runs."""
    fixtures = tmp_path / "fx"
    fixtures.mkdir()
    page = json.loads((FIXTURES / "read-p1-t0.json").read_text(encoding="utf-8"))
    for c in page["callouts"]:
        if (c["member"], c["field"]) == ("B12", "top"):
            c["value"] = "5-25"
    (fixtures / "read-p1-t0.json").write_text(json.dumps(page), encoding="utf-8")
    (fixtures / "link.json").write_text((FIXTURES / "link.json").read_text(encoding="utf-8"), encoding="utf-8")
    monkeypatch.setattr(gemini, "GenAITransport", lambda: gemini.RecordedTransport(fixtures))
    monkeypatch.setattr(gemini.time, "sleep", lambda s: None)

    out = tmp_path / "proj"
    code = cli.main(["read", str(make_pdf(tmp_path / "s.pdf")), "--out", str(out), "--no-ifc"])
    assert code == 2
    assert "To check" in capsys.readouterr().out
    assert (out / "joints" / "C4xB12xB13.json").is_file()
    assert not (out / "joints" / "C4xB12xB13").exists()
    items = json.loads((out / "to_check.json").read_text(encoding="utf-8"))
    assert any(i["joint"] == "C4xB12xB13" and i["field"] == "top" and i["reason"] == "disagree" for i in items)


def test_pages_option():
    assert cli._pages("1,3-5") == [1, 3, 4, 5]
    assert cli._pages(None) is None
