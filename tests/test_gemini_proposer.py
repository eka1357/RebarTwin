"""Unit tests for GeminiProposer: recorded replies (no key), filtering non-stock dias and excess layers,
failing Gemini candidates never ranked as passing, ModelNotFound fallback, and shared reply cache."""
from __future__ import annotations

import json
from pathlib import Path

from rebartwin.check import check
from rebartwin.fixes import Enumerator, resolve
from rebartwin.gemini_proposer import GeminiProposer
from rebartwin.model import Joint
from rebartwin.reader.gemini import CachingTransport, ModelNotFound, RecordedTransport, Reply, Transport

EXAMPLE = Path(__file__).parent.parent / "examples" / "c4_b12.json"


def _joint(zone: str = "II") -> Joint:
    j = Joint.model_validate_json(EXAMPLE.read_text(encoding="utf-8"))
    j.settings.seismic_zone = zone
    return j


def test_recorded_gemini_proposer_filters_stock_and_layers_and_never_ranks_failing(tmp_path: Path):
    """Gemini proposes:
    1) A valid failing bar change (4-25: fails clear gap -> kept in attempts, NEVER in options).
    2) A forbidden non-stock diameter (4-22: 22 mm not in [12,16,20,25] -> dropped BEFORE check).
    3) Too many layers (3 layers when max_layers=2 -> dropped BEFORE check).
    4) Unknown beam id ('B99' -> dropped BEFORE check).
    5) Valid passing fix (2-25 / 2-20 -> kept, checked by engine, ranked deterministically).
    6-7) Extra candidates truncated after 6 total raw candidates (7th candidate ignored).
    """
    fx = tmp_path / "fx"
    fx.mkdir()
    reply_payload = {
        "candidates": [
            {
                "edits": [{"kind": "set_face", "beam": "B12", "face": "top", "layers": ["4-25"]}],
                "rationale": "Try four 25 mm bars in one layer for wide clear gap.",
            },
            {
                "edits": [{"kind": "set_face", "beam": "B12", "face": "top", "layers": ["4-22"]}],
                "rationale": "Should be dropped because 22 mm is not stocked.",
            },
            {
                "edits": [
                    {
                        "kind": "set_face",
                        "beam": "B12",
                        "face": "top",
                        "layers": ["2-20", "2-16", "1-12"],
                    }
                ],
                "rationale": "Should be dropped because 3 layers exceeds max_layers=2.",
            },
            {
                "edits": [{"kind": "set_face", "beam": "B99", "face": "top", "layers": ["4-20"]}],
                "rationale": "Should be dropped because beam B99 does not exist.",
            },
            {
                "edits": [{"kind": "set_face", "beam": "B12", "face": "top", "layers": ["2-25", "2-20"]}],
                "rationale": "Split top steel into two 25s outer over two 20s to clear center column bar.",
            },
            {
                "edits": [{"kind": "set_face", "beam": "B12", "face": "top", "layers": ["4-20", "1-20"]}],
                "rationale": "Five 20 mm bars split 4 over 1 fails spacing.",
            },
            {
                "edits": [{"kind": "set_face", "beam": "B12", "face": "top", "layers": ["2-20", "3-16"]}],
                "rationale": "Seventh candidate exceeds 6-candidate limit and must be dropped.",
            },
        ]
    }
    (fx / "propose-r1.json").write_text(json.dumps(reply_payload), encoding="utf-8")

    rec = RecordedTransport(fx)
    cache = CachingTransport(rec, tmp_path / "cache")
    proposer = GeminiProposer(cache)

    j = _joint("II")
    res = resolve(j, proposers=[proposer, Enumerator()])

    gemini_attempts = [a for a in res.attempts if a.candidate.source == "gemini"]
    titles = [a.candidate.title for a in gemini_attempts]

    # Only 3 valid surviving Gemini candidates from first 6 raw entries:
    assert len(gemini_attempts) == 3
    assert "B12 top: 4-25" in titles
    assert "B12 top: 2-25 in layer 1, 2-20 in layer 2" in titles
    assert "B12 top: 4-20 in layer 1, 1-20 in layer 2" in titles

    # Non-stock 4-22, 3-layer, B99, and 7th candidate never entered attempts or options!
    all_titles = [a.candidate.title for a in res.attempts]
    assert not any("22" in t for t in all_titles)
    assert not any("B99" in t for t in all_titles)
    assert not any("layer 3" in t for t in all_titles)
    assert not any("1-12" in t for t in titles)
    assert not any("3-16" in t for t in titles)

    # Failing Gemini candidates (4-25, 4-20/1-20) must be marked failed and NEVER in passing options
    failing_gemini = [a for a in gemini_attempts if not a.passed]
    assert len(failing_gemini) == 2
    opt_titles = {o.candidate.title for o in res.options}
    assert "B12 top: 4-25" not in opt_titles
    assert "B12 top: 4-20 in layer 1, 1-20 in layer 2" not in opt_titles

    # Rationale and source preserved cleanly; re-run uses CachingTransport with zero extra calls
    pass_attempt = next(a for a in gemini_attempts if a.passed)
    assert pass_attempt.candidate.rationale.startswith("Split top steel")
    assert len(rec.calls) == 1

    res2 = resolve(j, proposers=[GeminiProposer(CachingTransport(None, tmp_path / "cache")), Enumerator()])
    assert len(rec.calls) == 1
    assert res2.options[0].candidate.title == res.options[0].candidate.title


def test_gemini_proposer_uses_link_model_and_fallback_and_passes_feedback(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("REBARTWIN_MODEL_LINK", "gemini-4-argon")
    monkeypatch.setenv("REBARTWIN_MODEL_FALLBACK", "gemini-3.8-flash")

    class FallbackTransport:
        def __init__(self) -> None:
            self.calls: list[dict] = []

        def generate(self, *, key: str, model: str, parts: list, schema: dict, high_res: bool = False) -> Reply:
            self.calls.append({"key": key, "model": model, "prompt": parts[0][1]})
            if model == "gemini-4-argon":
                err = RuntimeError("404 model not found")
                setattr(err, "code", 404)
                raise err
            if key == "propose-r1":
                payload = {
                    "candidates": [
                        {
                            "edits": [{"kind": "set_face", "beam": "B12", "face": "top", "layers": ["4-16", "4-16"]}],
                            "rationale": "Round 1 bar layout before column resize.",
                        }
                    ]
                }
            else:
                payload = {
                    "candidates": [
                        {
                            "edits": [
                                {"kind": "set_face", "beam": "B12", "face": "top", "layers": ["4-16", "4-16"]},
                                {"kind": "resize_column", "b": 325, "h": 300},
                            ],
                            "rationale": "Grow C4 to 325 mm along B12 for 16 mm bars under cl. 7.1.1.",
                        }
                    ]
                }
            return Reply(json.dumps(payload), model=model, prompt_tokens=100, output_tokens=50)

    tr: Transport = FallbackTransport()
    j3 = _joint("III")
    rep3, _ = check(j3)
    res = resolve(j3, proposers=[GeminiProposer(CachingTransport(tr, tmp_path / "cache")), Enumerator()])

    assert tr.calls[0]["model"] == "gemini-4-argon"
    assert tr.calls[1]["model"] == "gemini-3.8-flash"
    # Round 2 prompt received Round 1 feedback lines mentioning 7.1.1 failure
    r2_calls = [c for c in tr.calls if c["key"] == "propose-r2"]
    assert r2_calls and "IS 13920" in r2_calls[-1]["prompt"]
    assert rep3.failures
    assert res.status == "redesign"
    assert res.options[0].candidate.source == "gemini"
    assert "325" in res.options[0].candidate.title
