"""Stable IFC GlobalIds: the same bar in the same joint gets the same id in every run, so the IFC, the BCF issues
and the viewer always point at the same element (an ORCA habit: elements are addressed by GlobalId)."""
from __future__ import annotations

import uuid

NAMESPACE = uuid.UUID("5d3c1a2e-8b4f-5e6a-9c7d-0e1f2a3b4c5d")
_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$"


def compress(hex32: str) -> str:
    """A 32-digit hex UUID as IFC's 22-character base-64 GlobalId (the same encoding as ifcopenshell.guid)."""
    bs = [int(hex32[i:i + 2], 16) for i in range(0, 32, 2)]

    def b64(v: int, n: int = 4) -> str:
        return "".join(_CHARS[(v // 64 ** i) % 64] for i in range(n))[::-1]

    return b64(bs[0], 2) + "".join(b64((bs[i] << 16) + (bs[i + 1] << 8) + bs[i + 2]) for i in range(1, 16, 3))


def stable_uuid(*parts: str) -> uuid.UUID:
    return uuid.uuid5(NAMESPACE, "/".join(parts))


def ifc_guid(*parts: str) -> str:
    return compress(stable_uuid(*parts).hex)
