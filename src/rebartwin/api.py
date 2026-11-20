"""FastAPI service for RebarTwin: stateless joint checking, project reading via SSE, To check resolution,
bundle/export serving, and normalized drawing crops (`application/problem+json` errors).
"""
from __future__ import annotations

import json
import mimetypes
import os
import re
import shutil
import threading
import time
import uuid
from collections import OrderedDict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from fastapi import APIRouter, FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from pydantic import BaseModel

from .check import check
from .cli import run_check
from .fixes import Enumerator, Proposer, apply, resolve as resolve_fixes
from .gemini_proposer import GeminiProposer
from .model import Exposure, Joint, Zone, format_bars, parse_bars
from .reader.agree import Accepted, ToCheck, agree
from .reader.gemini import READ_PROMPT, GenAITransport, CachingTransport, ReadError, load_env, read_pages, replies_dir
from .reader.ingest import box_2d, ingest
from .reader.link import LINK_PROMPT, USED_FIELDS, blocks as item_blocks_joint, link, project_level as model_project_level
from .reader.ocr import CachingOcr, VisionTransport, ocr_pages
from .reader.parser import parse_page
from .reader.plan import read_plans, support_map
from .reader.pipeline import attach_sources, write_drafts
from .report import bundle as build_bundle
from .rules import CATALOGUE

_SAFE_ID_RE = re.compile(r"^[A-Za-z0-9._@+-]+$")
_SECTION_RE = re.compile(r"^\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(?:mm)?\s*$", re.IGNORECASE)
_DIA_RE = re.compile(r"(?:\d+\s*L\s*[-–]\s*)?(?:Ø|Φ|ø|φ|#)?\s*(\d+(?:\.\d+)?)\s*(?:mm|φ|Φ|ø)?", re.IGNORECASE)
_NUM_RE = re.compile(r"^\s*(\d+(?:\.\d+)?)\s*(?:mm)?\s*$", re.IGNORECASE)


class ProblemError(Exception):
    def __init__(self, status: int, title: str, detail: str, error_type: str = "about:blank") -> None:
        super().__init__(detail)
        self.status = status
        self.title = title
        self.detail = detail
        self.error_type = error_type


def _problem_response(status: int, title: str, detail: str, instance: str, error_type: str = "about:blank") -> JSONResponse:
    return JSONResponse(
        status_code=status,
        media_type="application/problem+json",
        content={
            "type": error_type,
            "title": title,
            "status": status,
            "detail": detail,
            "instance": instance,
        },
    )


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _projects_root() -> Path:
    return Path(os.environ.get("REBARTWIN_PROJECTS_DIR", "web/public/live"))


_EXTRA_MEDIA_TYPES = {
    ".wasm": "application/wasm",
    ".ifc": "application/x-step",
    ".bcf": "application/zip",
    ".md": "text/markdown; charset=utf-8",
}


def _web_dist_dir() -> Path:
    env_dist = os.environ.get("REBARTWIN_WEB_DIST")
    if env_dist:
        return Path(env_dist)
    repo_dist = Path(__file__).resolve().parents[2] / "web" / "dist"
    if repo_dist.is_dir():
        return repo_dist
    return Path.cwd() / "web" / "dist"


def _static_file_response(path: Path) -> FileResponse:
    media = _EXTRA_MEDIA_TYPES.get(path.suffix.lower())
    if not media:
        media, _ = mimetypes.guess_type(str(path))
    return FileResponse(path, media_type=media)


def _serve_spa_path(full_path: str) -> FileResponse:
    rel = full_path.lstrip("/")
    if rel == "api" or rel.startswith("api/"):
        raise ProblemError(404, "Endpoint not found", f"API endpoint /{rel} was not found.")
    dist_root = _web_dist_dir().resolve()
    if rel:
        candidate = (dist_root / rel).resolve()
        if not candidate.is_relative_to(dist_root):
            raise ProblemError(400, "Invalid path", "Path escapes web bundle root.")
        if candidate.is_file():
            return _static_file_response(candidate)
        if rel.startswith(("assets/", "wasm/")):
            raise ProblemError(404, "Asset not found", f"Static asset /{rel} was not found.")
    index_file = dist_root / "index.html"
    if index_file.is_file():
        return FileResponse(index_file, media_type="text/html; charset=utf-8")
    raise ProblemError(404, "Not found", f"Path /{rel} was not found.")


def _is_demo_only() -> bool:
    """Public demo lock: defaults on when running under Cloud Run (`K_SERVICE`),
    disabling uploads, To check writes, and every Gemini/Vision call."""
    raw = os.environ.get("DEMO_ONLY")
    if raw is not None and raw.strip() != "":
        return raw.strip().lower() in ("1", "true", "yes", "on")
    return bool(os.environ.get("K_SERVICE"))


def _require_writable(action: str) -> None:
    if _is_demo_only():
        raise ProblemError(
            403,
            "Disabled in public demo",
            f"{action} is disabled in public demo mode (DEMO_ONLY=true).",
        )


def _replies_dir() -> Path:
    """Shared reply cache folder so repeated uploads replay saved model/OCR calls."""
    load_env()
    return replies_dir(Path("out/_replies"))


def _collect_blocking_items(
    tc_items: list[dict[str, Any]],
    tc_by_id: dict[str, dict[str, Any]],
    j_data: dict[str, Any],
    joint_id: str,
) -> list[dict[str, Any]]:
    """Collect unresolved To check items blocking a joint or draft, summarized for overview UI."""
    blockers = [t for t in tc_items if isinstance(t, dict) and _dict_blocks_joint(t, joint_id)]
    seen = {str(t["id"]) for t in blockers if t.get("id")}
    for inline in j_data.get("to_check") or []:
        if not isinstance(inline, dict) or inline.get("resolution") is not None:
            continue
        tid = str(inline.get("id") or "")
        if tid and (tid in tc_by_id or tid in seen):
            continue
        if tid:
            seen.add(tid)
        blockers.append(inline)
    return [
        {
            "id": t.get("id"),
            "member": t.get("member"),
            "field": t.get("field"),
            "reason": t.get("reason"),
            "detail": t.get("detail"),
            "page": t.get("page"),
            "project_level": _dict_is_project_level(t),
        }
        for t in blockers
    ]


def _extract_joint_pages(
    j_data: dict[str, Any],
    b_data: dict[str, Any] | None,
    prov_record: dict[str, Any] | None,
    blocking_items: list[dict[str, Any]],
) -> list[int]:
    """Collect distinct 1-based drawing page numbers referenced by a joint or draft."""
    pages: set[int] = set()
    prov_entries = (b_data or {}).get("provenance") if isinstance((b_data or {}).get("provenance"), list) else []
    for entry in prov_entries:
        if isinstance(entry, dict) and entry.get("status") != "default":
            if isinstance(entry.get("page"), int) and entry["page"] > 0:
                pages.add(entry["page"])
    if not pages and prov_record:
        for raw_val in (prov_record.get("fields") or {}).values():
            rows = raw_val if isinstance(raw_val, list) else ([raw_val] if isinstance(raw_val, dict) else [])
            for row in rows:
                if isinstance(row, dict) and isinstance(row.get("page"), int) and row["page"] > 0:
                    pages.add(row["page"])
    col = j_data.get("column")
    if isinstance(col, dict):
        for key in ("section", "main", "ties", "cover"):
            val = col.get(key)
            if isinstance(val, list):
                for entry in val:
                    if isinstance(entry, dict) and isinstance(entry.get("page"), int) and entry["page"] > 0:
                        pages.add(entry["page"])
    beams = j_data.get("beams")
    if isinstance(beams, list):
        for beam in beams:
            if isinstance(beam, dict):
                for key in ("section", "top", "bottom", "stirrups", "cover", "frames_into"):
                    val = beam.get(key)
                    if isinstance(val, list):
                        for entry in val:
                            if isinstance(entry, dict) and isinstance(entry.get("page"), int) and entry["page"] > 0:
                                pages.add(entry["page"])
    for blocker in blocking_items:
        if isinstance(blocker.get("page"), int) and blocker["page"] > 0:
            pages.add(blocker["page"])
    return sorted(pages)


def _normalize_beam_junctions(p_dir: Path, reading: dict[str, Any]) -> list[dict[str, Any]]:
    """Normalize beam-on-beam and off-grid junctions from beam_junctions.json or reading.json."""
    raw = _read_json(p_dir / "beam_junctions.json", None)
    if raw is None:
        raw = reading.get("beam_junctions")
    if raw is None and isinstance(reading.get("plans"), dict):
        raw = reading["plans"].get("junctions")
    if raw is None and isinstance(reading.get("junctions"), list):
        raw = [row for row in reading["junctions"] if isinstance(row, dict) and not row.get("column")]
    if not isinstance(raw, list):
        return []

    out: list[dict[str, Any]] = []
    for idx, row in enumerate(raw):
        if not isinstance(row, dict):
            continue
        if row.get("beam"):
            beams = [str(row["beam"])]
        else:
            beams = [str(b) for b in (row.get("beams") or []) if b]
        if not beams:
            continue
        at_val = row.get("at")
        if isinstance(at_val, list):
            grid = ", ".join(str(x) for x in at_val if x) or None
        elif isinstance(at_val, str) and at_val:
            grid = at_val
        else:
            grid = row.get("grid")
        jid = str(
            row.get("id")
            or (f"{'+'.join(beams)}@{grid}" if grid else f"{'+'.join(beams)}@p{row.get('page', idx + 1)}")
        )
        out.append({
            "id": jid,
            "beams": beams,
            "grid": grid,
            "level": row.get("level"),
            "page": row.get("page"),
            "note": row.get("note") or row.get("detail") or row.get("kind"),
        })
    return out


def _validate_id(raw: str, label: str = "identifier") -> str:
    if not raw or ".." in raw or "/" in raw or "\\" in raw or raw.startswith(".") or not _SAFE_ID_RE.fullmatch(raw):
        raise ProblemError(400, f"Invalid {label}", f"{label.capitalize()} {raw!r} contains disallowed characters.")
    return raw


def _project_dir(project_id: str) -> Path:
    safe_id = _validate_id(project_id, "project id")
    d = _projects_root() / safe_id
    if not (d / "project.json").is_file():
        raise ProblemError(404, "Project not found", f"Project {safe_id!r} does not exist.")
    return d


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug[:48] or f"proj-{uuid.uuid4().hex[:8]}"


def _read_json(path: Path, default: Any = None) -> Any:
    if not path.is_file():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def _write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")


def _parse_pages_arg(spec: str | None) -> list[int] | None:
    if not spec or not spec.strip():
        return None
    pages: list[int] = []
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            a_s, _, b_s = part.partition("-")
            a, b = int(a_s), int(b_s)
            if a <= 0 or b < a:
                raise ValueError(f"invalid page range {part!r}")
            pages.extend(range(a, b + 1))
        else:
            p = int(part)
            if p <= 0:
                raise ValueError(f"invalid page {part!r}")
            pages.append(p)
    return sorted(set(pages))


def _dict_is_project_level(item: dict[str, Any]) -> bool:
    return (
        item.get("joint") is None
        and item.get("field") in USED_FIELDS
        and (
            item.get("member") in ("ALL", "ALL_BEAMS", "ALL_COLUMNS")
            or item.get("field") in ("seismic_zone", "exposure")
        )
    )


def _dict_blocks_joint(item: dict[str, Any], joint_id: str) -> bool:
    return item.get("resolution") is None and (item.get("joint") == joint_id or _dict_is_project_level(item))


def _project_joint_ids(p_dir: Path) -> set[str]:
    """Return every joint or draft id on disk in `joints/`."""
    joints_dir = p_dir / "joints"
    if not joints_dir.is_dir():
        return set()
    ids: set[str] = set()
    for jf in joints_dir.glob("*.json"):
        is_draft = jf.name.endswith(".draft.json")
        fallback_id = jf.name[: -len(".draft.json")] if is_draft else jf.stem
        j_data = _read_json(jf, {})
        if isinstance(j_data, dict):
            ids.add(str(j_data.get("id") or fallback_id))
        else:
            ids.add(fallback_id)
    return ids


def _dict_blocks_any_joint(item: dict[str, Any], known_joint_ids: set[str]) -> bool:
    """True when resolving this item can unlock a joint or draft (vs non-blocking readings)."""
    if _dict_is_project_level(item):
        return True
    jid = item.get("joint")
    if not jid:
        return False
    return (not known_joint_ids) or (str(jid) in known_joint_ids)


def _dict_is_assigned_to_joint(item: dict[str, Any], joint_id: str, member_ids: set[str]) -> bool:
    if _dict_is_project_level(item):
        return True
    if item.get("joint") == joint_id:
        return True
    return (
        item.get("joint") is None
        and not item.get("building")
        and item.get("member") in member_ids
        and item.get("field") in USED_FIELDS
    )


def _normalize_zone(raw: str) -> Zone:
    cleaned = raw.strip().upper().removeprefix("ZONE").strip()
    aliases = {"2": "II", "3": "III", "4": "IV", "5": "V"}
    cleaned = aliases.get(cleaned, cleaned)
    if cleaned not in ("II", "III", "IV", "V"):
        raise ProblemError(422, "Invalid seismic zone", f"Seismic zone must be II, III, IV, or V; got {raw!r}.")
    return cleaned  # type: ignore[return-value]


def _normalize_exposure(raw: str) -> Exposure:
    cleaned = raw.strip().lower().replace(" ", "_").replace("-", "_")
    allowed = ("mild", "moderate", "severe", "very_severe", "extreme")
    if cleaned not in allowed:
        raise ProblemError(422, "Invalid exposure condition", f"Exposure must be one of {', '.join(allowed)}; got {raw!r}.")
    return cleaned  # type: ignore[return-value]


def _validate_resolution(item: dict[str, Any], raw_value: str) -> str:
    val = raw_value.strip()
    if not val:
        raise ProblemError(422, "Empty resolution", "Provide a non-empty value when resolving a To check item.")
    field = str(item.get("field") or "")
    leaf = field.rsplit(".", 1)[-1]

    if leaf == "seismic_zone":
        return _normalize_zone(val)
    if leaf == "exposure":
        return _normalize_exposure(val)
    if leaf in ("top", "top_extra", "bottom", "bottom_extra", "main"):
        try:
            groups = parse_bars(val)
        except ValueError as exc:
            raise ProblemError(422, "Invalid bar callout", str(exc)) from exc
        if leaf == "main":
            total_n = sum(g.count for g in groups)
            dias = {g.dia for g in groups}
            uniform = len(dias) == 1
            corner_and_face = len(groups) == 2 and groups[0].count == 4 and total_n > 4
            if total_n < 4 or total_n % 2 != 0 or not (uniform or corner_and_face):
                raise ProblemError(
                    422,
                    "Invalid column main bars",
                    "Column main steel needs an even total >= 4 of one size (for example 8-16) "
                    "or four corner bars plus face bars (for example 4-16 + 4-12).",
                )
        return format_bars(groups)
    if leaf == "section":
        m = _SECTION_RE.match(val)
        if not m or float(m.group(1)) <= 0 or float(m.group(2)) <= 0:
            raise ProblemError(422, "Invalid section size", f"Expected width × depth in mm (for example 230x450); got {raw_value!r}.")
        return f"{float(m.group(1)):g}x{float(m.group(2)):g}"
    if leaf in ("links", "ties", "stirrups"):
        if not _DIA_RE.search(val):
            raise ProblemError(422, "Invalid link callout", f"Expected stirrup or tie callout (for example 2L-8@100); got {raw_value!r}.")
        return val
    if leaf == "cover":
        m = _NUM_RE.match(val)
        if not m or float(m.group(1)) <= 0:
            raise ProblemError(422, "Invalid cover", f"Expected positive cover in mm (for example 25); got {raw_value!r}.")
        return f"{float(m.group(1)):g}"
    return val


def _apply_resolution_to_joint(joint: Joint, item: dict[str, Any], value: str) -> list[str]:
    """Mutate `joint` with a validated person resolution and return updated provenance paths."""
    field = str(item.get("field") or "")
    leaf = field.rsplit(".", 1)[-1]
    member = item.get("member")
    touched: list[str] = []

    if leaf == "seismic_zone":
        joint.settings.seismic_zone = _normalize_zone(value)
        touched.append("settings.seismic_zone")
    elif leaf == "exposure":
        joint.settings.exposure = _normalize_exposure(value)
        touched.append("settings.exposure")
    elif leaf == "aggregate":
        m = _NUM_RE.match(value)
        if m:
            joint.settings.aggregate = float(m.group(1))
            touched.append("settings.aggregate")
    elif leaf == "cover":
        c_val = float(_NUM_RE.match(value).group(1))  # validated earlier
        if member in (joint.column.id, "ALL", "ALL_COLUMNS") or field == "column.cover":
            joint.column.cover = c_val
            touched.append("column.cover")
        for i, beam in enumerate(joint.beams):
            if member in (beam.id, "ALL", "ALL_BEAMS") or field.startswith(f"beams[{i}]."):
                beam.cover = c_val
                touched.append(f"beams[{i}].cover")
    elif leaf == "section":
        b_v, d_v = (float(x) for x in _SECTION_RE.match(value).groups())  # type: ignore[union-attr]
        if member == joint.column.id or field == "column.section":
            joint.column.b = b_v
            joint.column.h = d_v
            touched.append("column.section")
        for i, beam in enumerate(joint.beams):
            if member == beam.id or field == f"beams[{i}].section":
                beam.b = b_v
                beam.D = d_v
                touched.append(f"beams[{i}].section")
    elif leaf == "main":
        groups = parse_bars(value)
        if member == joint.column.id or field == "column.main" or member is None:
            joint.column.n_bars = sum(g.count for g in groups)
            joint.column.bar_dia = groups[0].dia
            joint.column.face_dia = (
                groups[1].dia if len(groups) == 2 and groups[1].dia != groups[0].dia else None
            )
            joint.column.bars_x = None
            joint.column.bars_y = None
            joint.column = type(joint.column).model_validate(joint.column.model_dump())
            touched.append("column.main")
    elif leaf in ("links", "ties", "stirrups"):
        dia_m = _DIA_RE.search(value)
        if dia_m:
            dia = float(dia_m.group(1))
            if member in (joint.column.id, "ALL", "ALL_COLUMNS") or field == "column.ties":
                joint.column.tie_dia = dia
                touched.append("column.ties")
            for i, beam in enumerate(joint.beams):
                if member in (beam.id, "ALL", "ALL_BEAMS") or field.startswith(f"beams[{i}]."):
                    beam.stirrup_dia = dia
                    touched.append(f"beams[{i}].stirrups")
    elif leaf in ("top", "top_extra", "bottom", "bottom_extra"):
        face_name = "top" if leaf.startswith("top") else "bottom"
        layer_num = max(1, int(item.get("layer") or 1))
        for i, beam in enumerate(joint.beams):
            if member == beam.id or field.startswith(f"beams[{i}]."):
                target_list = beam.top if face_name == "top" else beam.bottom
                while len(target_list) < layer_num:
                    target_list.append(type(target_list[0])(bars=value) if target_list else {"bars": value})  # type: ignore[arg-type]
                target_list[layer_num - 1] = target_list[layer_num - 1].model_copy(update={"bars": value})
                suffix = "[0].bars" if len(target_list) == 1 else ""
                touched.append(f"beams[{i}].{face_name}{suffix}")

    if member:
        note = f"To check resolved by person: {member} {leaf} set to {value}."
    else:
        note = f"To check resolved by person: {field} set to {value}."
    if note not in joint.notes:
        joint.notes.append(note)
    return touched


def _mark_satisfied_linking_items(
    items: list[dict[str, Any]],
    joint: Joint,
    touched_paths: list[str],
    resolved_value: str,
    via_id: str,
    now_iso: str,
) -> None:
    """Resolve derived linking 'missing' items (e.g. 'no accepted field gives beams[0].top')
    once all member-level items feeding that joint path are resolved."""
    for tc in items:
        if tc.get("resolution") is not None or tc.get("joint") != joint.id:
            continue
        if tc.get("reason") not in ("missing", "ambiguous") or tc.get("member") is not None:
            continue
        tc_path = str(tc.get("field") or "")
        matches_touched = any(p == tc_path or p.startswith(f"{tc_path}[") for p in touched_paths)
        if not matches_touched:
            continue

        # Check whether any unresolved member-level item still maps to the same path
        leaf = tc_path.rsplit(".", 1)[-1]
        target_member: str | None = None
        if tc_path.startswith("column."):
            target_member = joint.column.id
        elif tc_path.startswith("beams["):
            idx_s = tc_path[6 : tc_path.index("]")]
            target_member = joint.beams[int(idx_s)].id

        related_fields = (
            {leaf, f"{leaf}_extra"}
            if leaf in ("top", "bottom")
            else {"links" if leaf in ("ties", "stirrups") else leaf}
        )
        still_pending_member = any(
            other.get("resolution") is None
            and other.get("id") != via_id
            and other.get("member") == target_member
            and other.get("field") in related_fields
            and (other.get("joint") == joint.id or _dict_is_project_level(other))
            for other in items
        )
        if not still_pending_member:
            tc["resolution"] = {"value": resolved_value, "by": "person", "at": now_iso, "via": via_id}


def _apply_resolved_provenance(
    project_dir: Path,
    joint: Joint,
    prov_record: dict[str, Any],
    items: list[dict[str, Any]],
) -> None:
    """Attach every resolved To check item touching `joint` into its bundle.json provenance + pages."""
    bundle_path = project_dir / "joints" / joint.id / "bundle.json"
    if not bundle_path.is_file():
        return
    bundle_data = _read_json(bundle_path, {})
    fields_map: dict[str, Any] = prov_record.get("fields", {})

    accepted_index: dict[str, dict[str, Any]] = {}
    reading = _read_json(project_dir / "reading.json", {})
    for a in reading.get("accepted", []):
        if isinstance(a, dict) and a.get("id"):
            accepted_index[a["id"]] = a

    entries: list[dict[str, Any]] = []
    for path, raw_prov in fields_map.items():
        plist = raw_prov if isinstance(raw_prov, list) else [raw_prov]
        for p in plist:
            if not isinstance(p, dict):
                continue
            acc = accepted_index.get(p.get("field_id", ""), {})
            page_num = p.get("page")
            entries.append({
                "path": path,
                "member": acc.get("member") or p.get("member"),
                "field": acc.get("field") or p.get("field") or path.rsplit(".", 1)[-1],
                "layer": acc.get("layer") if acc else p.get("layer"),
                "level": p.get("level") or acc.get("level"),
                "building": p.get("building") or acc.get("building"),
                "inverted": bool(p.get("inverted") or acc.get("inverted")),
                "page": page_num,
                "box_2d": p.get("box_2d"),
                "text": p.get("text"),
                "gemini": p.get("gemini"),
                "parser": p.get("parser"),
                "status": p.get("status", "agreed"),
                "ocr_raw": p.get("ocr_raw"),
                "joined_from": p.get("joined_from"),
                "page_image": f"pages/page-{page_num}.png" if page_num else None,
                "refs": [
                    {**r, "page_image": f"pages/page-{r['page']}.png"}
                    for r in (p.get("refs") or [])
                    if isinstance(r, dict)
                ] or None,
            })

    # Include resolved items that didn't already overwrite a fields entry or cascade via another item
    existing_paths = {e["path"] for e in entries}
    seen_resolved: set[tuple[str | None, str]] = set()
    members = {joint.column.id, *(b.id for b in joint.beams)}
    for tc in items:
        res = tc.get("resolution")
        if not res or res.get("via"):
            continue
        if not _dict_is_assigned_to_joint(tc, joint.id, members):
            continue
        t_path = str(tc.get("field") or "resolved")
        leaf = t_path.rsplit(".", 1)[-1]
        if t_path in existing_paths:
            continue
        resolved_key = (tc.get("member"), leaf)
        if resolved_key in seen_resolved:
            continue
        existing_paths.add(t_path)
        seen_resolved.add(resolved_key)
        page_num = tc.get("page") or None
        gemini_v = (tc.get("gemini") or {}).get("value") if isinstance(tc.get("gemini"), dict) else None
        entries.append({
            "path": t_path,
            "member": tc.get("member"),
            "field": leaf,
            "layer": tc.get("layer"),
            "level": tc.get("level"),
            "page": page_num,
            "box_2d": tc.get("box_2d"),
            "text": res.get("value"),
            "gemini": gemini_v,
            "parser": res.get("value"),
            "status": "resolved",
            "ocr_raw": None,
            "page_image": f"pages/page-{page_num}.png" if page_num else None,
        })

    # Re-include default assumptions from `defaults` map if recorded
    defaults_map: dict[str, str] = prov_record.get("defaults", {})
    for d_path, d_val in defaults_map.items():
        if d_path in existing_paths or any(e["path"] == d_path for e in entries):
            continue
        entries.append({
            "path": d_path,
            "member": None,
            "field": None,
            "layer": None,
            "level": None,
            "page": None,
            "box_2d": None,
            "text": None,
            "gemini": None,
            "parser": d_val,
            "status": "default",
            "ocr_raw": None,
            "page_image": None,
        })

    # Copy cited page images (and geometry ref pages) alongside bundle.json
    ref_pages = {
        int(r["page"])
        for e in entries
        for r in (e.get("refs") or [])
        if isinstance(r, dict) and r.get("page")
    }
    pages = sorted({int(e["page"]) for e in entries if e.get("page")} | ref_pages)
    pages_dir = bundle_path.parent / "pages"
    pages_dir.mkdir(exist_ok=True)
    for n in pages:
        src_png = project_dir / "pages" / f"page-{n}.png"
        if src_png.is_file():
            shutil.copyfile(src_png, pages_dir / f"page-{n}.png")

    bundle_data["provenance"] = entries
    bundle_data["pages"] = {str(n): f"pages/page-{n}.png" for n in pages}
    _write_json(bundle_path, bundle_data)


def _safe_run_check(
    app: FastAPI,
    project_dir: Path,
    joint: Joint,
    out_dir: Path,
    *,
    no_ifc: bool,
    cache: CachingTransport | None = None,
) -> int:
    """Run check/resolve with GeminiProposer + Enumerator when a Gemini transport or key is available,
    falling back deterministically to Enumerator alone if no model access or replay miss occurs."""
    del project_dir  # Reply caches live in shared REBARTWIN_REPLIES_DIR, not per-project folders.
    proposers: list[Proposer] | None = None
    if not _is_demo_only():
        transport_factory: Callable[[], Any] | None = getattr(app.state, "transport_factory", None)
        if cache is not None:
            proposers = [GeminiProposer(cache), Enumerator()]
        elif transport_factory is not None or os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_GENAI_USE_VERTEXAI", "").lower() in ("1", "true", "yes"):
            try:
                tr = transport_factory() if transport_factory else GenAITransport()
                proposers = [GeminiProposer(CachingTransport(tr, _replies_dir())), Enumerator()]
            except ReadError:
                proposers = None

    if proposers is not None:
        try:
            return run_check(joint, out_dir, no_ifc=no_ifc, proposers=proposers)
        except ReadError:
            pass
    return run_check(joint, out_dir, no_ifc=no_ifc)


class _EventHub:
    """Thread-safe SSE pub/sub backed by `<project>/events.jsonl` for reconnect replay."""

    def __init__(self) -> None:
        self._lock = threading.Condition()
        self._channels: dict[str, list[dict[str, Any]]] = {}
        self._done: dict[str, bool] = {}

    def reset(self, project_id: str, project_dir: Path) -> None:
        with self._lock:
            self._channels[project_id] = []
            self._done[project_id] = False
            ev_path = project_dir / "events.jsonl"
            if ev_path.exists():
                ev_path.unlink()
            self._lock.notify_all()

    def emit(self, project_id: str, project_dir: Path, event: str, data: dict[str, Any]) -> None:
        payload = {"event": event, "data": data}
        line = json.dumps(payload, ensure_ascii=False) + "\n"
        with self._lock:
            with (project_dir / "events.jsonl").open("a", encoding="utf-8") as fh:
                fh.write(line)
            self._channels.setdefault(project_id, []).append(payload)
            if event in ("done", "error"):
                self._done[project_id] = True
            self._lock.notify_all()

    def snapshot_from_disk(self, project_id: str, project_dir: Path) -> list[dict[str, Any]]:
        ev_path = project_dir / "events.jsonl"
        if not ev_path.is_file():
            return []
        events: list[dict[str, Any]] = []
        for line in ev_path.read_text(encoding="utf-8").splitlines():
            if line.strip():
                events.append(json.loads(line))
        return events

    def stream(self, project_id: str, project_dir: Path):
        idx = 0
        # Seed from memory or disk if server restarted cleanly
        disk_events = self.snapshot_from_disk(project_id, project_dir)
        while idx < len(disk_events):
            ev = disk_events[idx]
            idx += 1
            yield _format_sse(ev["event"], ev["data"])
            if ev["event"] in ("done", "error"):
                return

        while True:
            with self._lock:
                chan = self._channels.get(project_id)
                if chan is None:
                    proj = _read_json(project_dir / "project.json", {})
                    if proj.get("status") in ("done", "error", "idle"):
                        return
                while True:
                    chan = self._channels.get(project_id, [])
                    if idx < len(chan):
                        ev = chan[idx]
                        idx += 1
                        break
                    if self._done.get(project_id):
                        return
                    notified = self._lock.wait(timeout=15.0)
                    if not notified:
                        ev = None
                        break
            if ev is None:
                yield ": keepalive\n\n"
            else:
                yield _format_sse(ev["event"], ev["data"])
                if ev["event"] in ("done", "error"):
                    return


def _format_sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


class ProjectCreate(BaseModel):
    id: str | None = None
    name: str | None = None


class ResolveRequest(BaseModel):
    value: str


def _execute_read_job(
    app: FastAPI,
    hub: _EventHub,
    project_id: str,
    project_dir: Path,
    pdf_path: Path,
    pages_spec: str | None,
    replay: bool,
    concurrency: int,
    no_ifc: bool,
) -> None:
    meta_path = project_dir / "project.json"
    meta = _read_json(meta_path, {"id": project_id, "name": project_id})

    def update_meta(**updates: Any) -> None:
        meta.update(updates)
        _write_json(meta_path, meta)

    try:
        if _is_demo_only():
            raise ReadError("Reading PDF drawings and model calls are disabled in public demo mode.")
        load_env()
        t0 = time.perf_counter()
        parsed_pages = _parse_pages_arg(pages_spec)
        sheets = ingest(pdf_path, project_dir, dpi=200, pages=parsed_pages)
        update_meta(status="reading", pages=[p.number for p in sheets], error=None)

        replies_dir = _replies_dir()
        transport_factory: Callable[[], Any] | None = getattr(app.state, "transport_factory", None)
        ocr_factory: Callable[[], Any] | None = getattr(app.state, "ocr_factory", None)

        if replay:
            transport = None
            ocr_tr = None
        else:
            if transport_factory:
                transport = transport_factory()
            else:
                try:
                    transport = GenAITransport()
                except ReadError:
                    if any(replies_dir.glob("*.json")):
                        transport = None
                    else:
                        raise
            if ocr_factory:
                ocr_tr = ocr_factory()
            else:
                ocr_tr = VisionTransport() if os.environ.get("VISION_API_KEY") else None

        cache = CachingTransport(transport, replies_dir)
        all_matches = []
        all_reads = []
        ocr_skipped: list[int] = []

        for sheet in sheets:
            hub.emit(
                project_id,
                project_dir,
                "page_started",
                {
                    "page": sheet.number,
                    "total": len(sheets),
                    "pages": [p.number for p in sheets],
                    "needs_ocr": sheet.needs_ocr,
                },
            )
            if sheet.needs_ocr:
                ocr_skipped.extend(
                    ocr_pages(
                        [sheet],
                        CachingOcr(ocr_tr, replies_dir, cache.ledger),
                        tile_px=3000,
                        concurrency=concurrency,
                    )
                )
            matches_p = parse_page(sheet)
            reads_p = read_pages([sheet], cache, tile_px=3000, concurrency=concurrency)
            all_matches.extend(matches_p)
            all_reads.extend(reads_p)

            page_ag = agree(reads_p, matches_p, [sheet])
            hub.emit(
                project_id,
                project_dir,
                "page_read",
                {
                    "page": sheet.number,
                    "total": len(sheets),
                    "agreed": len(page_ag.accepted),
                    "to_check": len(page_ag.to_check),
                    "unassigned": len(page_ag.unassigned),
                    "ocr": sheet.ocr_words,
                    "ocr_repairs": sheet.ocr_repairs,
                },
            )

        agreement = agree(all_reads, all_matches, sheets, support_map(sheets))
        plans = read_plans(sheets, agreement)    # joints from geometry: code-made frames_into (reader/plan.py)
        linked = link(agreement, cache)

        joints_dir = project_dir / "joints"
        joints_dir.mkdir(exist_ok=True)
        for v in linked.joints:
            (joints_dir / f"{v.joint.id}.json").write_text(v.joint.model_dump_json(indent=1), encoding="utf-8")
        write_drafts(joints_dir, linked)

        provenance = [
            {
                "joint": v.joint.id,
                "fields": v.provenance,
                "defaults": v.defaults,
                "link_notes": linked.link_notes.get(v.joint.id, []),
            }
            for v in linked.joints
        ]
        _write_json(project_dir / "provenance.json", provenance)
        tc_items = [t.to_json() for t in linked.to_check]
        _write_json(project_dir / "to_check.json", tc_items)

        blocked_counts = {
            v.joint.id: n
            for v in linked.joints
            if (n := sum(item_blocks_joint(t, v.joint.id) for t in linked.to_check))
        }

        from dataclasses import asdict
        calls = [asdict(c) for c in cache.ledger]
        reading = {
            "pdf": pdf_path.name,
            "pages": [p.number for p in sheets],
            "dpi": 200,
            "tile_px": 3000,
            "prompts": {"read": READ_PROMPT, "link": LINK_PROMPT},
            "link_model": linked.model,
            "seconds": round(time.perf_counter() - t0, 1),
            "text_layer": [
                {
                    "page": p.number,
                    "words": p.text_words,
                    "annotations": p.annotations,
                    "comments": p.comments,
                    "ocr": p.needs_ocr,
                    "ocr_words": p.ocr_words,
                    "ocr_repairs": p.ocr_repairs,
                }
                for p in sheets
            ],
            "ocr_skipped": ocr_skipped,
            "counts": {
                "callouts": len(all_reads),
                "parser_matches": len(all_matches),
                "accepted": len(agreement.accepted),
                "to_check": len(linked.to_check),
                "unassigned": len(agreement.unassigned),
                "joints": len(linked.joints),
                "drafts": len(linked.drafts),
                "ocr_repairs": sum(p.ocr_repairs for p in sheets),
            },
            "tokens": {
                "prompt": sum(c["prompt_tokens"] or 0 for c in calls if not c["cached"]),
                "output": sum(c["output_tokens"] or 0 for c in calls if not c["cached"]),
            },
            "calls": calls,
            "accepted": [{**asdict(a), "box": box_2d(a.box), "gemini_box": box_2d(a.gemini_box)} for a in agreement.accepted],
            "plans": plans,
            "unassigned": [t.to_json() for t in agreement.unassigned],
        }
        _write_json(project_dir / "reading.json", reading)

        fields_by_id = {f.id: f for f in agreement.accepted}
        ready_ids: list[str] = []
        for v in linked.joints:
            jid = v.joint.id
            if blocked_counts.get(jid):
                continue
            _safe_run_check(app, project_dir, v.joint, joints_dir / jid, no_ifc=no_ifc, cache=cache)
            attach_sources(joints_dir / jid / "bundle.json", v, fields_by_id, project_dir)
            b_json = _read_json(joints_dir / jid / "bundle.json", {})
            fails = sum(1 for f in b_json.get("report", {}).get("findings", []) if f.get("status") == "fail")
            ready_ids.append(jid)
            hub.emit(
                project_id,
                project_dir,
                "joint_ready",
                {"joint": jid, "fail_count": fails, "status": "fail" if fails else "pass"},
            )

        update_meta(status="done", error=None)
        hub.emit(
            project_id,
            project_dir,
            "done",
            {
                "pages": len(sheets),
                "joints": len(linked.joints),
                "drafts": len(linked.drafts),
                "ready": ready_ids,
                "to_check": len(linked.to_check),
            },
        )
    except ReadError as exc:
        msg = str(exc)
        update_meta(status="error", error=msg)
        hub.emit(project_id, project_dir, "error", {"message": msg})
    except Exception as exc:  # noqa: BLE001
        code = getattr(exc, "code", None)
        if isinstance(code, int):
            msg = f"Model API refused call ({code} {getattr(exc, 'status', '')}). Cached replies are preserved."
        else:
            msg = f"Reading failed ({type(exc).__name__}): {exc}"
        update_meta(status="error", error=msg)
        hub.emit(project_id, project_dir, "error", {"message": msg})


def create_app(
    *,
    transport_factory: Callable[[], Any] | None = None,
    ocr_factory: Callable[[], Any] | None = None,
) -> FastAPI:
    app = FastAPI(title="RebarTwin API", version="0.1.0")
    app.state.transport_factory = transport_factory
    app.state.ocr_factory = ocr_factory
    hub = _EventHub()
    crop_lock = threading.Lock()
    crop_bytes_cache: OrderedDict[tuple[str, int, str], bytes] = OrderedDict()
    page_pixmap_cache: OrderedDict[tuple[str, int], Any] = OrderedDict()

    @app.middleware("http")
    async def spa_navigation_fallback(request: Request, call_next: Any) -> Response:
        if request.method == "GET":
            path = request.url.path
            accept = request.headers.get("accept", "")
            if "text/html" in accept and not path.startswith("/api") and path != "/health":
                if (_web_dist_dir() / "index.html").is_file():
                    try:
                        return _serve_spa_path(path)
                    except ProblemError:
                        pass
        return await call_next(request)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(ProblemError)
    async def handle_problem(request: Request, exc: ProblemError) -> JSONResponse:
        return _problem_response(exc.status, exc.title, exc.detail, str(request.url.path), exc.error_type)

    @app.exception_handler(HTTPException)
    async def handle_http_exception(request: Request, exc: HTTPException) -> JSONResponse:
        return _problem_response(exc.status_code, "Request error", str(exc.detail), str(request.url.path))

    @app.exception_handler(RequestValidationError)
    async def handle_validation(request: Request, exc: RequestValidationError) -> JSONResponse:
        return _problem_response(422, "Validation failed", json.dumps(exc.errors(), default=str), str(request.url.path))

    api = APIRouter()

    @api.get("/health")
    async def health() -> dict[str, Any]:
        return {"status": "ok", "demo_only": _is_demo_only()}

    @api.post("/joints/check")
    async def check_joint_stateless(joint: Joint, zone: Zone | None = None) -> dict[str, Any]:
        target = joint.model_copy(deep=True)
        if zone:
            target.settings.seismic_zone = zone
        rep, cage = check(target)
        fix = resolve_fixes(target)
        return build_bundle(target, rep, fix, cage)

    @api.get("/projects")
    async def list_projects() -> list[dict[str, Any]]:
        root = _projects_root()
        if not root.is_dir():
            return []
        out = []
        for child in sorted(root.iterdir()):
            meta = _read_json(child / "project.json")
            if isinstance(meta, dict):
                out.append(meta)
        return out

    @api.post("/projects", status_code=201)
    async def create_project(body: ProjectCreate | None = None) -> dict[str, Any]:
        _require_writable("Creating projects")
        raw_id = body.id if body and body.id else (
            _slugify(body.name) if body and body.name else f"proj-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
        )
        proj_id = _validate_id(raw_id, "project id")
        p_dir = _projects_root() / proj_id
        p_dir.mkdir(parents=True, exist_ok=True)
        meta = {
            "id": proj_id,
            "name": (body.name if body and body.name else proj_id),
            "status": "idle",
            "created_at": _utc_now(),
            "pdf": None,
            "pages": [],
            "error": None,
        }
        _write_json(p_dir / "project.json", meta)
        return meta

    @api.post("/projects/{project_id}/drawings", status_code=202)
    async def upload_drawing(
        project_id: str,
        file: UploadFile = File(...),
        pages: str | None = Form(None),
        replay: bool = Form(False),
        concurrency: int = Form(3),
        sync: bool = Form(False),
        no_ifc: bool = Form(False),
    ) -> dict[str, Any]:
        _require_writable("Uploading drawings")
        p_dir = _project_dir(project_id)
        safe_name = Path(file.filename or "drawing.pdf").name
        if not safe_name.lower().endswith(".pdf"):
            raise ProblemError(400, "Invalid file type", "Only PDF drawing sets (.pdf) are accepted.")
        raw = await file.read()
        if not raw.startswith(b"%PDF"):
            raise ProblemError(400, "Invalid PDF", "Uploaded file does not start with a %PDF header.")

        # Validate page range syntax upfront before launching thread
        try:
            _parse_pages_arg(pages)
        except ValueError as exc:
            raise ProblemError(400, "Invalid page filter", str(exc)) from exc

        pdf_path = p_dir / safe_name
        pdf_path.write_bytes(raw)
        hub.reset(project_id, p_dir)

        meta = _read_json(p_dir / "project.json", {})
        meta.update({"status": "reading", "pdf": safe_name, "error": None})
        _write_json(p_dir / "project.json", meta)

        if sync:
            _execute_read_job(app, hub, project_id, p_dir, pdf_path, pages, replay, concurrency, no_ifc)
        else:
            threading.Thread(
                target=_execute_read_job,
                args=(app, hub, project_id, p_dir, pdf_path, pages, replay, concurrency, no_ifc),
                daemon=True,
            ).start()
        return {"project_id": project_id, "pdf": safe_name, "status": "reading"}

    @api.get("/projects/{project_id}/events")
    async def stream_events(project_id: str):
        p_dir = _project_dir(project_id)
        return StreamingResponse(
            hub.stream(project_id, p_dir),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    @api.get("/projects/{project_id}")
    def get_project(project_id: str) -> dict[str, Any]:
        p_dir = _project_dir(project_id)
        meta = _read_json(p_dir / "project.json", {})
        reading = _read_json(p_dir / "reading.json", {})
        tc_items: list[dict[str, Any]] = _read_json(p_dir / "to_check.json", [])
        tc_by_id = {str(t["id"]): t for t in tc_items if isinstance(t, dict) and t.get("id")}
        prov_all: list[dict[str, Any]] = _read_json(p_dir / "provenance.json", [])
        prov_by_joint = {p.get("joint"): p for p in prov_all if isinstance(p, dict)}

        joints_list: list[dict[str, Any]] = []
        rule_failures: dict[str, int] = {}
        rule_joints: dict[str, set[str]] = {}
        rule_meta: dict[str, tuple[str, str]] = {}

        joints_dir = p_dir / "joints"
        if joints_dir.is_dir():
            for jf in sorted(joints_dir.glob("*.json")):
                is_draft_file = jf.name.endswith(".draft.json")  # incomplete joint: shown as blocked, never checked
                jid = jf.name[: -len(".draft.json")] if is_draft_file else jf.stem
                j_data = _read_json(jf, {})
                if not isinstance(j_data, dict):
                    continue
                is_draft = is_draft_file or bool(j_data.get("draft"))
                joint_id = str(j_data.get("id") or jid)
                b_dir = joints_dir / jid
                b_data = None if is_draft else (
                    _read_json(b_dir / "bundle.json") if (b_dir / "bundle.json").is_file() else None
                )
                blocking_items = _collect_blocking_items(tc_items, tc_by_id, j_data, joint_id)
                blocking_ids = [str(item["id"]) for item in blocking_items if item.get("id")]
                blocked_n = len(blocking_items)

                explicit_place = j_data.get("place") or j_data.get("grid") or j_data.get("location")
                explicit_floor = j_data.get("floor") or j_data.get("level")
                explicit_storey = j_data.get("storey")
                sheet_pages = _extract_joint_pages(
                    j_data, b_data, prov_by_joint.get(joint_id), blocking_items,
                )

                worst_failure: dict[str, Any] | None = None
                joint_failing_rules: list[str] = []
                if b_data and blocked_n == 0 and not is_draft:
                    findings = b_data.get("report", {}).get("findings", [])
                    failing_findings = [f for f in findings if f.get("status") == "fail"]
                    fail_n = len(failing_findings)
                    fix_status = b_data.get("fix", {}).get("status")
                    j_status = "fail" if fail_n > 0 else "pass"

                    for f in failing_findings:
                        rid = str(f.get("rule") or "")
                        if not rid:
                            continue
                        rule_failures[rid] = rule_failures.get(rid, 0) + 1
                        rule_joints.setdefault(rid, set()).add(joint_id)
                        if rid not in rule_meta:
                            cat = CATALOGUE.get(rid)
                            rule_meta[rid] = (
                                str(f.get("clause") or (cat.clause if cat else rid)),
                                str(f.get("title") or (cat.title if cat else rid)),
                            )
                        if rid not in joint_failing_rules:
                            joint_failing_rules.append(rid)

                    if failing_findings:
                        worst = min(
                            failing_findings,
                            key=lambda f: (
                                0 if str(f.get("rule", "")).startswith("IS13920")
                                else 1 if f.get("rule") == "GEOM-CLASH"
                                else 2,
                                float(f.get("margin", 0.0)),
                                str(f.get("rule", "")),
                            ),
                        )
                        worst_failure = {
                            "rule": worst.get("rule"),
                            "clause": worst.get("clause"),
                            "title": worst.get("title"),
                            "measured": worst.get("measured"),
                            "limit": worst.get("limit"),
                            "compare": worst.get("compare"),
                            "margin": worst.get("margin"),
                            "unit": worst.get("unit"),
                            "message": worst.get("message"),
                        }
                else:
                    fail_n = 0
                    fix_status = None
                    j_status = "to_check"

                settings_data = j_data.get("settings") if isinstance(j_data.get("settings"), dict) else {}
                column_data = j_data.get("column") if isinstance(j_data.get("column"), dict) else {}
                beams_data = j_data.get("beams") if isinstance(j_data.get("beams"), list) else []

                joints_list.append({
                    "id": joint_id,
                    "place": explicit_place,
                    "floor": explicit_floor,
                    "storey": explicit_storey,
                    "grid": explicit_place,
                    "level": explicit_floor,
                    "sheets": sheet_pages,
                    "column": column_data,
                    "beams": beams_data,
                    "seismic_zone": settings_data.get("seismic_zone"),
                    "exposure": settings_data.get("exposure"),
                    "status": j_status,
                    "fix_status": fix_status,
                    "fail_count": fail_n,
                    "blocked_count": blocked_n,
                    "blocking_item_ids": blocking_ids,
                    "blocking_items": blocking_items,
                    "worst_failure": worst_failure,
                    "failing_rules": joint_failing_rules,
                    "bundle_ready": bool(b_data and blocked_n == 0 and not is_draft),
                    "draft": is_draft,
                })

        # Failures first, then to_check (most blockers first), then pass
        order = {"fail": 0, "to_check": 1, "pass": 2}
        joints_list.sort(
            key=lambda j: (order.get(j["status"], 9), -j["fail_count"], -j["blocked_count"], j["id"]),
        )

        failures_by_rule = [
            {
                "rule": rid,
                "clause": rule_meta[rid][0],
                "title": rule_meta[rid][1],
                "failures": count,
                "joints": len(rule_joints.get(rid, ())),
            }
            for rid, count in rule_failures.items()
        ]
        failures_by_rule.sort(key=lambda r: (-int(r["failures"]), -int(r["joints"]), str(r["rule"])))

        beam_junctions = _normalize_beam_junctions(p_dir, reading)

        unresolved = [t for t in tc_items if t.get("resolution") is None]
        proj_level_unresolved = [t for t in unresolved if _dict_is_project_level(t)]
        all_blocking_ids = {
            str(bid) for j in joints_list for bid in j.get("blocking_item_ids", []) if bid
        }
        blocking_tc = [
            t for t in unresolved
            if (t.get("id") in all_blocking_ids) or _dict_is_project_level(t)
        ]
        extra_inline_blocking = sum(1 for bid in all_blocking_ids if bid not in tc_by_id)
        blocking_unresolved_count = len(blocking_tc) + extra_inline_blocking
        non_blocking_unresolved_count = max(0, len(unresolved) - len(blocking_tc))
        sheets_info = reading.get("text_layer", [])
        if not sheets_info and isinstance(meta.get("pages"), list):
            sheets_info = [{"page": p} for p in meta["pages"]]

        return {
            **meta,
            "sheets": sheets_info,
            "counts": {
                "found": len(joints_list),
                "checked": sum(1 for j in joints_list if j["status"] in ("fail", "pass")),
                "failing": sum(1 for j in joints_list if j["status"] == "fail"),
                "blocked": sum(1 for j in joints_list if j["status"] == "to_check"),
                "passing": sum(1 for j in joints_list if j["status"] == "pass"),
            },
            "failures_by_rule": failures_by_rule,
            "beam_junctions": beam_junctions,
            "joints": joints_list,
            "to_check_counts": {
                "total": len(tc_items),
                "unresolved": len(unresolved),
                "blocking_unresolved": blocking_unresolved_count,
                "non_blocking_unresolved": non_blocking_unresolved_count,
                "project_level_unresolved": len(proj_level_unresolved),
            },
            "reading": {
                "counts": reading.get("counts", {}),
                "seconds": reading.get("seconds"),
                "prompts": reading.get("prompts"),
                "link_model": reading.get("link_model"),
            },
        }

    @api.get("/projects/{project_id}/to-check")
    def get_to_check(project_id: str) -> list[dict[str, Any]]:
        p_dir = _project_dir(project_id)
        items: list[dict[str, Any]] = _read_json(p_dir / "to_check.json", [])
        known_joint_ids = _project_joint_ids(p_dir)
        enriched: list[dict[str, Any]] = []
        for idx, item in enumerate(items):
            is_proj = _dict_is_project_level(item)
            is_blocking = _dict_blocks_any_joint(item, known_joint_ids)
            enriched.append({
                **item,
                "project_level": is_proj,
                "blocks_joint": is_blocking,
                "resolved": item.get("resolution") is not None,
                "_order": (
                    0 if item.get("resolution") is None else 1,
                    0 if is_proj else 1,
                    0 if is_blocking else 1,
                    idx,
                ),
            })
        enriched.sort(key=lambda x: x["_order"])
        for row in enriched:
            row.pop("_order", None)
        return enriched

    @api.post("/projects/{project_id}/to-check/{item_id}/resolve")
    def resolve_to_check_item(
        project_id: str,
        item_id: str,
        body: ResolveRequest,
        no_ifc: bool = False,
    ) -> dict[str, Any]:
        _require_writable("Resolving To check items")
        p_dir = _project_dir(project_id)
        tc_path = p_dir / "to_check.json"
        items: list[dict[str, Any]] = _read_json(tc_path, [])
        target = next((t for t in items if t.get("id") == item_id), None)
        if not target:
            raise ProblemError(404, "To check item not found", f"Item {item_id!r} was not found in project {project_id!r}.")
        if target.get("reason") == "unsupported":
            raise ProblemError(
                409,
                "Cannot clear unsupported item",
                target.get("detail") or "This item cannot be cleared in To check.",
            )

        normalized = _validate_resolution(target, body.value)
        now_iso = _utc_now()
        target["resolution"] = {"value": normalized, "by": "person", "at": now_iso}

        # Determine affected joints and update them + re-check unlocked ones
        joints_dir = p_dir / "joints"
        prov_all: list[dict[str, Any]] = _read_json(p_dir / "provenance.json", [])
        prov_by_joint = {p.get("joint"): p for p in prov_all if isinstance(p, dict)}

        unlocked_joints: list[str] = []
        checked_joints: list[str] = []

        if joints_dir.is_dir():
            joint_models: dict[str, Joint] = {}
            for jf in sorted(joints_dir.glob("*.json")):
                if jf.name.endswith(".draft.json"):             # drafts are not Joints until complete
                    continue
                jid = jf.stem
                j_model = Joint.model_validate_json(jf.read_text(encoding="utf-8"))
                members = {j_model.column.id, *(b.id for b in j_model.beams)}
                if _dict_is_assigned_to_joint(target, jid, members):
                    touched = _apply_resolution_to_joint(j_model, target, normalized)
                    _mark_satisfied_linking_items(items, j_model, touched, normalized, target["id"], now_iso)
                    jf.write_text(j_model.model_dump_json(indent=1), encoding="utf-8")
                joint_models[jid] = j_model

            _write_json(tc_path, items)

            for jid, j_model in joint_models.items():
                members = {j_model.column.id, *(b.id for b in j_model.beams)}
                blocked_after = sum(1 for t in items if _dict_blocks_joint(t, jid))
                if blocked_after == 0:
                    unlocked_joints.append(jid)
                    bundle_exists = (joints_dir / jid / "bundle.json").is_file()
                    if _dict_is_assigned_to_joint(target, jid, members) or not bundle_exists:
                        _safe_run_check(app, p_dir, j_model, joints_dir / jid, no_ifc=no_ifc)
                        _apply_resolved_provenance(
                            p_dir,
                            j_model,
                            prov_by_joint.get(jid, {"joint": jid, "fields": {}}),
                            items,
                        )
                        checked_joints.append(jid)
        else:
            _write_json(tc_path, items)

        remaining = sum(1 for t in items if t.get("resolution") is None)
        return {
            "item": target,
            "resolved_value": normalized,
            "unlocked_joints": unlocked_joints,
            "checked_joints": checked_joints,
            "remaining_to_check": remaining,
        }

    def _joint_folder(project_id: str, joint: str) -> Path:
        p_dir = _project_dir(project_id)
        safe_joint = _validate_id(joint, "joint id")
        tc_items: list[dict[str, Any]] = _read_json(p_dir / "to_check.json", [])
        blocked_n = sum(1 for t in tc_items if _dict_blocks_joint(t, safe_joint))
        if blocked_n > 0:
            raise ProblemError(
                409,
                "Joint blocked by To check",
                f"Joint {safe_joint!r} still has {blocked_n} unresolved To check item(s).",
            )
        j_dir = p_dir / "joints" / safe_joint
        if not (j_dir / "bundle.json").is_file():
            raise ProblemError(404, "Joint bundle not found", f"Bundle for joint {safe_joint!r} is not built.")
        return j_dir

    @api.get("/projects/{project_id}/joints/{joint}/bundle")
    def get_joint_bundle(project_id: str, joint: str) -> dict[str, Any]:
        p_dir = _project_dir(project_id)
        j_dir = _joint_folder(project_id, joint)
        data = _read_json(j_dir / "bundle.json", {})

        # Attach level from provenance.json when available so column storey renders cleanly
        prov_all = _read_json(p_dir / "provenance.json", [])
        prov_record = next((p for p in prov_all if p.get("joint") == joint), None)
        if prov_record and isinstance(data.get("provenance"), list):
            fields_map = prov_record.get("fields", {})
            for entry in data["provenance"]:
                if isinstance(entry, dict) and entry.get("level") is None:
                    raw = fields_map.get(entry.get("path"))
                    candidates = raw if isinstance(raw, list) else ([raw] if isinstance(raw, dict) else [])
                    match = next(
                        (c for c in candidates if c.get("page") == entry.get("page") and c.get("box_2d") == entry.get("box_2d")),
                        candidates[0] if candidates else None,
                    )
                    if match and match.get("level"):
                        entry["level"] = match["level"]
        return data

    @api.get("/projects/{project_id}/joints/{joint}/joint.ifc")
    def get_joint_ifc(project_id: str, joint: str):
        j_dir = _joint_folder(project_id, joint)
        path = j_dir / "joint.ifc"
        if not path.is_file():
            raise ProblemError(404, "IFC file not found", "joint.ifc was not generated for this joint.")
        return FileResponse(path, media_type="application/x-step", filename=f"{joint}.ifc")

    @api.get("/projects/{project_id}/joints/{joint}/fixed.ifc")
    def get_fixed_ifc(project_id: str, joint: str, option: int = Query(0, ge=0)):
        j_dir = _joint_folder(project_id, joint)
        if option == 0:
            path = j_dir / "fixed.ifc"
            if not path.is_file():
                raise ProblemError(404, "Fixed IFC not found", "No passing fix IFC was generated for this joint.")
            return FileResponse(path, media_type="application/x-step", filename=f"{joint}-fixed.ifc")

        # Generate requested fix option IFC cleanly on demand
        b_data = _read_json(j_dir / "bundle.json", {})
        options = b_data.get("fix", {}).get("options", [])
        if option >= len(options):
            raise ProblemError(404, "Fix option not found", f"Option index {option} out of range.")
        target_path = j_dir / f"fixed-opt{option}.ifc"
        if not target_path.is_file():
            from .export_ifc import export_ifc
            from .fixes import Candidate
            j_model = Joint.model_validate(b_data["joint"])
            cand = Candidate.model_validate(options[option]["candidate"])
            try:
                export_ifc(apply(j_model, cand), target_path)
            except RuntimeError as exc:
                raise ProblemError(501, "IFC export unavailable", str(exc)) from exc
        return FileResponse(target_path, media_type="application/x-step", filename=f"{joint}-fixed-{option}.ifc")

    @api.get("/projects/{project_id}/joints/{joint}/issues.bcf")
    def get_issues_bcf(project_id: str, joint: str):
        j_dir = _joint_folder(project_id, joint)
        path = j_dir / "issues.bcf"
        if not path.is_file():
            raise ProblemError(404, "BCF file not found", "issues.bcf was not found for this joint.")
        return FileResponse(path, media_type="application/zip", filename=f"{joint}.bcf")

    @api.get("/projects/{project_id}/joints/{joint}/report.md")
    def get_report_md(project_id: str, joint: str):
        j_dir = _joint_folder(project_id, joint)
        path = j_dir / "report.md"
        if not path.is_file():
            raise ProblemError(404, "Report not found", "report.md was not found for this joint.")
        return FileResponse(path, media_type="text/markdown; charset=utf-8", filename=f"{joint}-report.md")

    @api.get("/projects/{project_id}/joints/{joint}/pages/{filename}")
    def get_joint_page_image(project_id: str, joint: str, filename: str):
        j_dir = _joint_folder(project_id, joint)
        safe_file = _validate_id(filename, "page filename")
        path = j_dir / "pages" / safe_file
        if not path.is_file():
            path = _project_dir(project_id) / "pages" / safe_file
        if not path.is_file():
            raise ProblemError(404, "Page image not found", f"Page asset {safe_file!r} was not found.")
        return FileResponse(path, media_type="image/png")

    @api.get("/projects/{project_id}/pages/{page_num}.png")
    def get_page_png(project_id: str, page_num: int, crop: str | None = None):
        p_dir = _project_dir(project_id)
        png_path = p_dir / "pages" / f"page-{page_num}.png"
        if not png_path.is_file():
            raise ProblemError(404, "Page not found", f"Page {page_num} image was not rendered.")
        if not crop:
            return FileResponse(png_path, media_type="image/png")

        parts = [p.strip() for p in crop.split(",")]
        if len(parts) != 4:
            raise ProblemError(400, "Invalid crop box", "Expected ?crop=ymin,xmin,ymax,xmax in 0..1000 coordinates.")
        try:
            ymin, xmin, ymax, xmax = (float(x) for x in parts)
        except ValueError as exc:
            raise ProblemError(400, "Invalid crop box", "Crop coordinates must be numbers.") from exc

        import pymupdf

        mtime_ns = png_path.stat().st_mtime_ns
        crop_key = (str(png_path), mtime_ns, crop)
        with crop_lock:
            cached_bytes = crop_bytes_cache.get(crop_key)
            if cached_bytes is not None:
                crop_bytes_cache.move_to_end(crop_key)
                return Response(
                    content=cached_bytes,
                    media_type="image/png",
                    headers={"Cache-Control": "private, max-age=300"},
                )
            page_key = (str(png_path), mtime_ns)
            src = page_pixmap_cache.get(page_key)
            if src is None:
                src = pymupdf.Pixmap(str(png_path))
                page_pixmap_cache[page_key] = src
                if len(page_pixmap_cache) > 2:
                    page_pixmap_cache.popitem(last=False)
            else:
                page_pixmap_cache.move_to_end(page_key)

            x0 = max(0, min(src.width - 1, int(xmin * src.width / 1000.0)))
            y0 = max(0, min(src.height - 1, int(ymin * src.height / 1000.0)))
            x1 = max(x0 + 1, min(src.width, int(xmax * src.width / 1000.0)))
            y1 = max(y0 + 1, min(src.height, int(ymax * src.height / 1000.0)))
            clip = pymupdf.IRect(x0, y0, x1, y1)
            sub = pymupdf.Pixmap(src.colorspace, clip, src.alpha)
            sub.copy(src, clip)
            png_bytes = sub.tobytes("png")
            crop_bytes_cache[crop_key] = png_bytes
            if len(crop_bytes_cache) > 256:
                crop_bytes_cache.popitem(last=False)
        return Response(
            content=png_bytes,
            media_type="image/png",
            headers={"Cache-Control": "private, max-age=300"},
        )

    app.include_router(api, prefix="/api")
    app.include_router(api)

    @app.get("/", include_in_schema=False)
    def serve_root():
        return _serve_spa_path("")

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str):
        return _serve_spa_path(full_path)

    return app


app = create_app()
