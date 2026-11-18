"""R3: the Gemini channel with no key: recorded replies, one retry layer, models a key cannot use, logging without
drawing text, the reply cache, concurrent tiles, tiling arithmetic, and the request the real transport builds."""
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


def _call(t):
    return call(t, key="read-p1-t0", model="m", parts=[("text", "B12 5-20")], schema={},
                validate=PageReading.model_validate_json)


def test_transport_errors_are_not_retried_here():
    """google-genai already retries 408, 429 and 5xx with backoff; a second layer here would multiply the waits. So a
    503 that reaches `call` is raised as is, after one attempt."""
    t = Flaky([ApiError(503)])
    with pytest.raises(ApiError):
        _call(t)
    assert t.calls == 1
    assert gemini.RETRY["attempts"] == 4 and gemini.RETRY["max_delay"] == 60
    assert {429, 500, 503} <= set(gemini.RETRY["http_status_codes"])


def test_invalid_reply_is_retried_then_gives_up():
    t = Flaky(["not json"])
    assert _call(t).callouts == [] and t.calls == 2
    with pytest.raises(ReadError):
        _call(Flaky(["{}"] * 4))


@pytest.mark.parametrize("error", [
    ApiError(404, "models/gemini-4-argon is not found for API version v1beta"),
    ApiError(403, "permission denied"),
    ApiError(429, "Quota exceeded for metric generate_content_free_tier_requests, limit: 0, model: gemini-4-argon"),
])
def test_a_model_this_key_cannot_use_fails_at_once(error):
    t = Flaky([error])
    with pytest.raises(ModelNotFound):
        _call(t)
    assert t.calls == 1


def test_an_ordinary_rate_limit_is_not_a_missing_model():
    """A 429 with a real quota that ran out (after the SDK's retries) is an error, not a reason to switch models."""
    with pytest.raises(ApiError):
        _call(Flaky([ApiError(429, "Quota exceeded, limit: 15, retry in 20s")]))


def test_log_has_numbers_not_drawing_text(caplog, tmp_path: Path):
    """The log line carries the call id, model, tokens and latency; the drawing's words go to the model, never to
    the log."""
    page = ingest(make_pdf(tmp_path / "s.pdf"))[0]
    with caplog.at_level(logging.INFO, logger="rebartwin.reader"):
        read_page(page, RecordedTransport(FIXTURES))
        _call(Flaky(["not json"]))
    text = "\n".join(r.getMessage() for r in caplog.records)
    assert "read-p1-t0" in text and "latency_ms=" in text and "prompt_tokens=1200" in text
    for drawn in ("B12", "5-20", "230x450", "CLEAR COVER", "C4"):
        assert drawn not in text


def test_recorded_page_maps_boxes_and_pages(tmp_path: Path):
    page = ingest(make_pdf(tmp_path / "s.pdf"))[0]
    t = RecordedTransport(FIXTURES)
    found = read_page(page, t)
    assert len(found) == 23
    assert {r.callout.page for r in found} == {1}
    assert found[0].box == (167, 129, 191, 173)            # one tile covering the page: boxes unchanged
    [sent] = t.calls
    assert sent["model"] == "gemini-3.8-flash"
    assert sent["schema"]["properties"]["callouts"]["type"] == "array"
    kinds = [k for k, _ in sent["parts"]]
    assert kinds == ["image/png", "text"]


def test_model_comes_from_the_environment(monkeypatch, tmp_path: Path):
    monkeypatch.setenv("REBARTWIN_MODEL_READ", "gemini-test")
    page = ingest(make_pdf(tmp_path / "s.pdf"))[0]
    t = RecordedTransport(FIXTURES)
    read_page(page, t)
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
    assert cfg.response_mime_type == "application/json"
    assert cfg.temperature is None and cfg.top_p is None and cfg.top_k is None      # deprecated on Gemini 3.6+
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


def test_replies_are_saved_and_replayed(tmp_path: Path):
    """The first read calls the model once per tile and saves the reply; the second replays it with no transport at
    all. A different model is a different key, so nothing is replayed for it."""
    page = ingest(make_pdf(tmp_path / "s.pdf"))[0]
    live = RecordedTransport(FIXTURES)
    first = gemini.CachingTransport(live, tmp_path / "replies")
    a = read_page(page, first)
    assert len(live.calls) == 1 and [c.cached for c in first.ledger] == [False]
    assert len(list((tmp_path / "replies").glob("*.json"))) == 1
    again = gemini.CachingTransport(None, tmp_path / "replies")
    b = read_page(page, again)
    assert [r.callout for r in a] == [r.callout for r in b] and [c.cached for c in again.ledger] == [True]
    with pytest.raises(ReadError, match="no saved reply"):
        read_page(page, again, model="another-model")


def test_reply_hash_covers_model_and_every_part():
    base = gemini.reply_hash("m", [("image/png", b"tile"), ("text", "<!-- read_v1 --> words")])
    assert base == gemini.reply_hash("m", [("image/png", b"tile"), ("text", "<!-- read_v1 --> words")])
    assert base != gemini.reply_hash("m2", [("image/png", b"tile"), ("text", "<!-- read_v1 --> words")])
    assert base != gemini.reply_hash("m", [("image/png", b"tile2"), ("text", "<!-- read_v1 --> words")])
    assert base != gemini.reply_hash("m", [("image/png", b"tile"), ("text", "<!-- read_v2 --> words")])


def test_tiles_run_concurrently_and_results_keep_tile_order(tmp_path: Path):
    """Six tiles at 600 dpi with three workers: at most three calls in flight at once, and the callouts come back in
    tile order whatever order the calls finish in."""
    import threading
    import time as _time
    page = ingest(make_pdf(tmp_path / "s.pdf"), dpi=600)[0]
    state = {"now": 0, "most": 0}
    lock = threading.Lock()

    class Slow:
        def generate(self, *, key, model, parts, schema, high_res=False):
            with lock:
                state["now"] += 1
                state["most"] = max(state["most"], state["now"])
            _time.sleep(0.05 * (6 - int(key[-1])))               # later tiles finish first
            with lock:
                state["now"] -= 1
            t = int(key[-1])
            return Reply(json.dumps({"callouts": [{"member": f"B{t}", "field": "section", "value": "230x450",
                                                    "box_2d": [10, 10, 20, 20]}]}), model)

    found = read_page(page, Slow(), concurrency=3)
    assert state["most"] == 3
    assert [r.callout.member for r in found] == [f"B{t}" for t in range(6)]


def test_a_dropped_connection_is_retried_here():
    """'Server disconnected without sending a response' has no status code, so the SDK does not retry it. call()
    retries it with backoff (2 s, then 4 s) and then succeeds; a status-code error is still raised at once."""
    RemoteProtocolError = type("RemoteProtocolError", (Exception,), {"__module__": "httpx2._exceptions"})
    sleeps = []
    t = Flaky([RemoteProtocolError("Server disconnected"), RemoteProtocolError("Server disconnected")])
    out = call(t, key="k", model="m", parts=[], schema={}, validate=PageReading.model_validate_json,
               sleep=sleeps.append)
    assert out.callouts == [] and t.calls == 3 and sleeps == [2, 4]
    t = Flaky([RemoteProtocolError("x")] * 3)
    with pytest.raises(Exception, match="x"):
        call(t, key="k", model="m", parts=[], schema={}, validate=PageReading.model_validate_json, sleep=sleeps.append)
    assert t.calls == 3
    own = Flaky([ReadError("no recorded reply")])                 # the reader's own ReadError is not a dropped line
    with pytest.raises(ReadError):
        call(own, key="k", model="m", parts=[], schema={}, validate=PageReading.model_validate_json, sleep=sleeps.append)
    assert own.calls == 1


def test_reply_caches_use_the_shared_folder_when_set(tmp_path, monkeypatch):
    """With REBARTWIN_REPLIES_DIR set, every reply cache (Gemini read, linking, proposer, Vision) saves there, whatever
    folder its caller names; unset or empty, the caller's folder."""
    from rebartwin.reader.gemini import CachingTransport
    from rebartwin.reader.ocr import CachingOcr
    shared = tmp_path / "shared"
    assert CachingTransport(None, tmp_path / "own").directory == tmp_path / "own"
    monkeypatch.setenv("REBARTWIN_REPLIES_DIR", str(shared))
    assert CachingTransport(None, tmp_path / "own").directory == shared
    assert CachingOcr(None, tmp_path / "own").directory == shared
