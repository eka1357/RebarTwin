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


def test_read_writes_the_contract_and_checks_the_joint(tmp_path: Path, recorded, capsys):
    """Zone III with C4 at 300 mm and B13's 25 mm bars: IS 13920 cl. 7.1.1 needs 20 x 25 = 500 mm of column along
    B13, so the joint fails a rule and the command exits 1."""
    out = tmp_path / "proj"
    code = cli.main(["read", str(make_pdf(tmp_path / "s.pdf")), "--out", str(out), "--no-ifc"])
    printed = capsys.readouterr().out
    assert code == 1
    assert "22 values agreed, 1 to check" in printed

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
    assert reading["prompts"] == {"read": "read_v2", "link": "link_v3"}
    assert reading["counts"]["accepted"] == 22


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


def test_bundle_carries_its_sources_and_page_images(tmp_path: Path, recorded):
    """Every agreed value in the checked joint's bundle points at a page image beside bundle.json; defaults say so
    and point at nothing."""
    out = tmp_path / "proj"
    cli.main(["read", str(make_pdf(tmp_path / "s.pdf")), "--out", str(out), "--no-ifc"])
    folder = out / "joints" / "C4xB12xB13"
    bundle = json.loads((folder / "bundle.json").read_text(encoding="utf-8"))
    assert bundle["pages"] == {"1": "pages/page-1.png"}
    assert (folder / "pages" / "page-1.png").is_file()
    keys = {"path", "member", "field", "layer", "page", "box_2d", "text", "gemini", "parser", "status", "ocr_raw", "joined_from",
            "page_image", "refs"}
    assert all(set(e) == keys for e in bundle["provenance"])
    assert all(e["refs"] is None for e in bundle["provenance"])     # this sheet's frames_into are both-channel reads
    top = next(e for e in bundle["provenance"] if e["path"] == "beams[0].top[0].bars")
    assert (top["member"], top["field"], top["layer"], top["text"], top["parser"], top["status"], top["page_image"]) \
        == ("B12", "top", 1, "5-20", "5-20", "agreed", "pages/page-1.png")
    agg = next(e for e in bundle["provenance"] if e["path"] == "settings.aggregate")
    assert (agg["status"], agg["parser"], agg["page"], agg["page_image"]) == ("default", "20 mm", None, None)
    assert {e["status"] for e in bundle["provenance"]} == {"agreed", "default"}


def test_replay_reads_again_without_the_api(tmp_path: Path, recorded, monkeypatch, capsys):
    out = tmp_path / "proj"
    pdf = make_pdf(tmp_path / "s.pdf")
    cli.main(["read", str(pdf), "--out", str(out), "--no-ifc"])
    assert "2 model call(s), 0 replayed" in capsys.readouterr().out

    def no_api():
        raise AssertionError("--replay must not build a client")
    monkeypatch.setattr(gemini, "GenAITransport", no_api)
    code = cli.main(["read", str(pdf), "--out", str(out), "--no-ifc", "--replay"])
    printed = capsys.readouterr().out
    assert code == 1 and "0 model call(s), 2 replayed" in printed
    reading = json.loads((out / "reading.json").read_text(encoding="utf-8"))
    assert all(c["cached"] for c in reading["calls"]) and reading["tokens"] == {"prompt": 0, "output": 0}


def test_probe_prints_counts_only(tmp_path: Path, capsys):
    from reader_pdf import make_shx_pdf
    assert cli.main(["read", str(make_shx_pdf(tmp_path / "shx.pdf")), "--probe"]) == 0
    printed = capsys.readouterr().out
    assert "0 words, comments: 20 by AutoCAD SHX Text (20 merged as words)" in printed
    assert "needs OCR" not in printed
    assert "230x450" not in printed and "B12" not in printed


def test_an_api_refusal_stops_with_a_sentence(tmp_path: Path, monkeypatch, capsys):
    """A 402 (prepaid credit used up) on every read is not a model the key cannot use; the run stops cleanly and
    says where the saved replies are, instead of a traceback."""
    class Refused(Exception):
        code, status = 402, "RESOURCE_EXHAUSTED"

    class Broke:
        def generate(self, **kw):
            raise Refused("402 RESOURCE_EXHAUSTED")

    monkeypatch.setattr(gemini, "GenAITransport", lambda: Broke())
    code = cli.main(["read", str(make_pdf(tmp_path / "s.pdf")), "--out", str(tmp_path / "p"), "--no-ifc"])
    printed = capsys.readouterr().out
    assert code == 2 and "refused the call (402 RESOURCE_EXHAUSTED)" in printed and "replies" in printed
