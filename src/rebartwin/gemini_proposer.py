"""Gemini fix proposer implementing `fixes.Proposer` via `reader/gemini.py`'s `call()`."""
from __future__ import annotations

import json
import math
import os
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field

from .check import Report
from .fixes import Attempt, Candidate, ResizeColumn, SetFace, apply, feedback_lines
from .model import Face, Joint, Layer, format_bars, parse_bars
from .reader.gemini import CachingTransport, ModelNotFound, Transport, call
from .reader.link import DEFAULT_FALLBACK, DEFAULT_LINK_MODEL

PROPOSE_PROMPT = "propose_v1"
PROMPT_PATH = Path(__file__).parent / "reader" / "prompts" / f"{PROPOSE_PROMPT}.md"
MAX_CANDIDATES = 6


class ProposedEdit(BaseModel):
    """Single flat schema edit accepted by Gemini structured JSON output."""

    kind: Literal["set_face", "resize_column"]
    beam: str | None = Field(default=None, description="For set_face: beam id from joint.beams")
    face: Face | None = Field(default=None, description="For set_face: 'top' or 'bottom'")
    layers: list[str] | None = Field(
        default=None,
        description="For set_face: bar notation per layer, outermost layer first (e.g. ['2-25', '2-20'])",
    )
    b: float | None = Field(default=None, description="For resize_column: column size along X in mm")
    h: float | None = Field(default=None, description="For resize_column: column size along Y in mm")


class ProposedCandidate(BaseModel):
    title: str = Field(default="")
    edits: list[ProposedEdit] = Field(min_length=1)
    rationale: str = Field(min_length=1, description="Concise one-line rationale")


class ProposalReply(BaseModel):
    candidates: list[ProposedCandidate] = Field(default_factory=list)


def _layers_text(layers: list[str]) -> str:
    if len(layers) == 1:
        return layers[0]
    return ", ".join(f"{s} in layer {k}" for k, s in enumerate(layers, 1))


def _canonical_title(joint: Joint, edits: list[SetFace | ResizeColumn]) -> str:
    parts: list[str] = []
    for edit in edits:
        if isinstance(edit, SetFace):
            parts.append(f"{edit.beam} {edit.face}: {_layers_text(edit.layers)}")
        else:
            parts.append(f"{joint.column.id} {edit.b:g} × {edit.h:g}")
    return "; ".join(parts)


def _in_stock(dia: float, stock: list[float]) -> bool:
    return any(abs(dia - allowed) <= 1e-6 for allowed in stock)


def _filter_candidates(joint: Joint, raw_candidates: list[ProposedCandidate]) -> list[Candidate]:
    """Validate every Gemini candidate against stock_dias, max_layers, and joint model BEFORE engine checks."""
    beam_ids = {b.id for b in joint.beams}
    stock = list(joint.settings.stock_dias)
    max_layers = joint.settings.max_layers
    out: list[Candidate] = []

    for raw in raw_candidates[:MAX_CANDIDATES]:
        edits: list[SetFace | ResizeColumn] = []
        valid = True
        for raw_edit in raw.edits:
            if raw_edit.kind == "set_face":
                if raw_edit.beam not in beam_ids or raw_edit.face not in ("top", "bottom"):
                    valid = False
                    break
                layers_in = raw_edit.layers or []
                if not (1 <= len(layers_in) <= max_layers):
                    valid = False
                    break
                canonical_layers: list[str] = []
                for layer_str in layers_in:
                    try:
                        groups = parse_bars(layer_str)
                    except ValueError:
                        valid = False
                        break
                    if not groups or any(not _in_stock(g.dia, stock) for g in groups):
                        valid = False
                        break
                    canonical_layers.append(format_bars(groups))
                if not valid:
                    break
                edits.append(SetFace(beam=raw_edit.beam, face=raw_edit.face, layers=canonical_layers))
            else:
                b_val, h_val = raw_edit.b, raw_edit.h
                if (
                    b_val is None
                    or h_val is None
                    or not math.isfinite(b_val)
                    or not math.isfinite(h_val)
                    or b_val <= 0
                    or h_val <= 0
                ):
                    valid = False
                    break
                edits.append(ResizeColumn(b=float(b_val), h=float(h_val)))

        if not valid or not edits:
            continue

        rationale = " ".join(raw.rationale.split())
        if not rationale:
            continue

        cand = Candidate(
            title=_canonical_title(joint, edits),
            edits=edits,
            source="gemini",
            rationale=rationale,
        )
        # Ensure Layer / Joint model invariants hold before letting fix loop check geometry
        try:
            trial = apply(joint, cand)
            for beam in trial.beams:
                for layer in [*beam.top, *beam.bottom]:
                    Layer(bars=layer.bars).diameters()
        except (ValueError, KeyError):
            continue

        out.append(cand)
    return out


def build_prompt(joint: Joint, report: Report, history: list[Attempt], round_num: int) -> str:
    required = {}
    for beam in joint.beams:
        req_top = joint.required(beam.id, "top")
        req_bot = joint.required(beam.id, "bottom")
        if joint.settings.is13920:
            req_bot = max(req_bot, beam.area("top") / 2.0)
        required[f"{beam.id}.top"] = round(req_top, 1)
        required[f"{beam.id}.bottom"] = round(req_bot, 1)

    joint_payload = {
        "joint": joint.model_dump(),
        "effective_required_area_mm2": required,
        "is13920": joint.settings.is13920,
    }
    failures_payload = [
        {
            "rule": f.rule,
            "clause": f.clause,
            "measured": f.measured,
            "limit": f.limit,
            "compare": f.compare,
            "unit": f.unit,
            "members": f.members,
            "bars": f.bars,
            "message": f.message,
        }
        for f in report.failures
    ]
    fb = "\n".join(feedback_lines(history)) or "(none yet; Round 1)"

    template = PROMPT_PATH.read_text(encoding="utf-8")
    return (
        template.replace("{round}", str(round_num))
        .replace("{joint_json}", json.dumps(joint_payload, ensure_ascii=False, indent=1))
        .replace("{failures}", json.dumps(failures_payload, ensure_ascii=False, indent=1))
        .replace("{feedback}", fb)
    )


class GeminiProposer:
    """Fix proposer backed by Gemini via `reader.gemini.call()`. Never decides pass/fail."""

    name = "gemini"

    def __init__(
        self,
        transport: Transport | CachingTransport,
        *,
        model: str | None = None,
        fallback: str | None = None,
    ) -> None:
        self.transport = transport
        self.model = model
        self.fallback = fallback

    def propose(self, joint: Joint, report: Report, history: list[Attempt], round: int) -> list[Candidate]:
        prompt_text = build_prompt(joint, report, history, round)
        model = self.model or os.environ.get("REBARTWIN_MODEL_LINK") or DEFAULT_LINK_MODEL
        fallback = self.fallback or os.environ.get("REBARTWIN_MODEL_FALLBACK") or DEFAULT_FALLBACK
        schema = ProposalReply.model_json_schema()
        parts: list[tuple[str, Any]] = [("text", prompt_text)]
        key = f"propose-r{round}"

        try:
            reply = call(
                self.transport,
                key=key,
                model=model,
                parts=parts,
                schema=schema,
                validate=ProposalReply.model_validate_json,
            )
        except ModelNotFound:
            reply = call(
                self.transport,
                key=key,
                model=fallback,
                parts=parts,
                schema=schema,
                validate=ProposalReply.model_validate_json,
            )
        return _filter_candidates(joint, reply.candidates)
