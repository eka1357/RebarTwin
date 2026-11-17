"""R3: the Gemini channel with no key: recorded replies, retries, model-not-found, logging without drawing text,
tiling arithmetic, and the request the real transport builds."""
import json
import logging
from pathlib import Path
from types import SimpleNamespace

import pytest

pytest.importorskip("pymupdf")
pytest.importorskip("google.genai")

from reader_pdf import make_pdf  # noqa: E402

from rebartwin.reader import gemini  # noqa: E402
from rebartwin.reader.gemini import (GenAITransport, ModelNotFound, PageReading, ReadError, RecordedTransport,  # noqa: E402
                                     Reply, call, prompt, read_page, tile_boxes, tiles, to_page, to_tile)
from rebartwin.reader.ingest import ingest  # noqa: E402

FIXTURES = Path(__file__).parent / "fixtures" / "reader"


class Flaky:
    """Fails with the given errors in turn, then replies."""

    def __init__(self, errors, text='{"callouts": []}'):
        self.errors, self.text, self.calls = list(errors), text, 0

    def generate(self, **kw):
        self.calls += 1
        if self.errors:
            e = self.errors.pop(0)
            if isinstance(e, str):
                return Reply(e, kw["model"])
            raise e
        return Reply(self.text, kw["model"], 1200, 80)


class ApiError(Exception):
    def __init__(self, code, message="error"):
        super().__init__(f"{code} {message}")
        self.code = code


def _call(t, sleeps):
    return call(t, key="read-p1-t0", model="m", parts=[("text", "B12 5-20")], schema={},
                validate=PageReading.model_validate_json, sleep=sleeps.append)


def test_retries_rate_limits_and_server_errors_with_backoff():
    """Attempt 1 gets 429, attempt 2 gets 503, attempt 3 succeeds. Backoff is 2^(n-1) seconds plus up to 0.25 s of
    jitter: about 1 s, then about 2 s."""
    sleeps = []
    t = Flaky([ApiError(429), ApiError(503)])
    assert _call(t, sleeps).callouts == []
    assert t.calls == 3
    assert 1 <= sleeps[0] <= 1.25 and 2 <= sleeps[1] <= 2.25


def test_invalid_reply_is_retried_then_gives_up():
    sleeps = []
    assert _call(Flaky(["not json"]), sleeps).callouts == []
    with pytest.raises(ReadError):
        _call(Flaky(["{}"] * 4), sleeps)


def test_client_errors_are_not_retried():
    t = Flaky([ApiError(400, "bad request")])
    with pytest.raises(ApiError):
        _call(t, [])
    assert t.calls == 1


def test_model_not_found_is_its_own_error():
    with pytest.raises(ModelNotFound):
        _call(Flaky([ApiError(404, "models/gemini-4-argon is not found for API version v1beta")]), [])


def test_log_has_numbers_not_drawing_text(caplog, tmp_path: Path):
    """The log line carries the call id, model, tokens and latency; the drawing's words go to the model, never to
    the log."""
    page = ingest(make_pdf(tmp_path / "s.pdf"))[0]
    with caplog.at_level(logging.INFO, logger="rebartwin.reader"):
        read_page(page, RecordedTransport(FIXTURES), sleep=lambda s: None)
        _call(Flaky([ApiError(429)]), [])
    text = "\n".join(r.getMessage() for r in caplog.records)
    assert "read-p1-t0" in text and "latency_ms=" in text and "prompt_tokens=1200" in text
    for drawn in ("B12", "5-20", "230x450", "CLEAR COVER", "C4"):
        assert drawn not in text


def test_recorded_page_maps_boxes_and_pages(tmp_path: Path):
    page = ingest(make_pdf(tmp_path / "s.pdf"))[0]
    t = RecordedTransport(FIXTURES)
    found = read_page(page, t, sleep=lambda s: None)
    assert len(found) == 22
    assert {r.callout.page for r in found} == {1}
    assert found[0].box == (167, 129, 191, 173)            # one tile covering the page: boxes unchanged
    [sent] = t.calls
    assert sent["temperature"] == 0.0 and sent["model"] == "gemini-3.8-flash"
    assert sent["schema"]["properties"]["callouts"]["type"] == "array"
    kinds = [k for k, _ in sent["parts"]]
    assert kinds == ["image/png", "text"]


def test_model_comes_from_the_environment(monkeypatch, tmp_path: Path):
    monkeypatch.setenv("REBARTWIN_MODEL_READ", "gemini-test")
    page = ingest(make_pdf(tmp_path / "s.pdf"))[0]
    t = RecordedTransport(FIXTURES)
    read_page(page, t, sleep=lambda s: None)
    assert t.calls[0]["model"] == "gemini-test"


def test_prompt_says_numbers_come_from_the_drawing_and_sends_the_words(tmp_path: Path):
    page = ingest(make_pdf(tmp_path / "s.pdf"))[0]
    [tile] = tiles(page)
    text = prompt(page, tile, 1)
    assert "Every value comes only from this drawing" in text
    assert "8φ @ 150 c/c\t[" in text and "2L-8 @ 100\t[" in text
    assert "{words}" not in text and "page 1" in text


def test_tile_grid_by_hand():
    """An A1 sheet at 200 dpi is 841 x 594 mm = 6622 x 4677 px. With tiles of at most 3000 px: ceil(6622 / 3000) = 3
    columns, ceil(4677 / 3000) = 2 rows. Overlap 8%: 0.08 x 1000 / 2 = 40 in y, 0.08 x 1000 / 3 = 26.7 in x.
    Tile 1 spans y 0 to 500 + 40 = 540 and x 0 to 333.3 + 26.7 = 360. The middle column spans x 333.3 - 26.7 = 306.7
    to 666.7 + 26.7 = 693.3, so 307 to 693."""
    boxes = tile_boxes(6622, 4677)
    assert len(boxes) == 6
    assert boxes[0] == (0, 0, 540, 360)
    assert boxes[1] == (0, 307, 540, 693)
    assert boxes[5] == (460, 640, 1000, 1000)
    assert tile_boxes(2339, 1653) == [(0, 0, 1000, 1000)]


def test_tile_to_page_by_hand():
    """A tile covering the page's right half, (0, 500, 1000, 1000): a box (100, 200, 300, 400) in the tile is at
    y 100 x 1000 / 1000 = 100 to 300, x 500 + 200 x 500 / 1000 = 600 to 500 + 400 x 0.5 = 700 on the page."""
    tile = (0, 500, 1000, 1000)
    assert to_page([100, 200, 300, 400], tile) == (100, 600, 300, 700)
    assert to_page([300, 400, 100, 200], tile) == (100, 600, 300, 700)   # swapped corners are sorted
    assert to_tile((100, 600, 300, 700), tile) == (100, 200, 300, 400)


def test_large_sheet_is_read_in_tiles(tmp_path: Path):
    """At 600 dpi the A4 sheet is 7017 x 4958 px: 3 x 2 tiles, each a PNG of its own part of the page."""
    import pymupdf
    page = ingest(make_pdf(tmp_path / "s.pdf"), dpi=600)[0]
    parts = tiles(page)
    assert len(parts) == 6
    full = pymupdf.Pixmap(page.png)
    first = pymupdf.Pixmap(parts[0].png)
    assert abs(first.width - 0.36 * full.width) <= 2 and abs(first.height - 0.54 * full.height) <= 2


def test_genai_transport_builds_a_structured_request():
    sent = {}

    def generate_content(**kw):
        sent.update(kw)
        return SimpleNamespace(text='{"callouts": []}', model_version="gemini-3.8-flash-001",
                               usage_metadata=SimpleNamespace(prompt_token_count=10, candidates_token_count=2))

    client = SimpleNamespace(models=SimpleNamespace(generate_content=generate_content))
    reply = GenAITransport(client).generate(key="k", model="gemini-3.8-flash", parts=[("image/png", b"\x89PNG"),
                                            ("text", "hello")], schema={"type": "object"}, high_res=True)
    cfg = sent["config"]
    assert cfg.temperature == 0.0 and cfg.response_mime_type == "application/json"
    assert cfg.response_json_schema == {"type": "object"}
    assert sent["model"] == "gemini-3.8-flash" and len(sent["contents"]) == 2
    assert (reply.model, reply.prompt_tokens, reply.output_tokens) == ("gemini-3.8-flash-001", 10, 2)


def test_client_needs_a_key_or_vertex(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setenv("GOOGLE_GENAI_USE_VERTEXAI", "false")
    with pytest.raises(ReadError, match="GEMINI_API_KEY"):
        gemini.make_client()
    monkeypatch.setenv("GOOGLE_GENAI_USE_VERTEXAI", "true")
    monkeypatch.delenv("GOOGLE_CLOUD_PROJECT", raising=False)
    with pytest.raises(ReadError, match="GOOGLE_CLOUD_PROJECT"):
        gemini.make_client()


def test_load_env_fills_only_unset_values(monkeypatch, tmp_path: Path):
    env = tmp_path / ".env"
    env.write_text("# comment\nREBARTWIN_T1=from-file\nREBARTWIN_T2=\nREBARTWIN_T3='quoted'\n", encoding="utf-8")
    monkeypatch.setenv("REBARTWIN_T1", "already")
    monkeypatch.delenv("REBARTWIN_T2", raising=False)
    monkeypatch.delenv("REBARTWIN_T3", raising=False)
    gemini.load_env(env)
    import os
    assert os.environ["REBARTWIN_T1"] == "already"
    assert "REBARTWIN_T2" not in os.environ
    assert os.environ["REBARTWIN_T3"] == "quoted"


def test_recorded_transport_refuses_a_missing_recording(tmp_path: Path):
    with pytest.raises(ReadError):
        RecordedTransport(tmp_path).generate(key="nope", model="m", parts=[], schema={})
    (tmp_path / "x.json").write_text(json.dumps({"text": "{}", "model": "m2"}), encoding="utf-8")
    assert RecordedTransport(tmp_path).generate(key="x", model="m", parts=[], schema={}).model == "m2"
