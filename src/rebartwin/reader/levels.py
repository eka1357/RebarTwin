"""Storeys and floors as drawings write them.

A column schedule laid out by storey has headers like "FOUNDATION TO FIRST FLOOR", "FIRST FLOOR TO TERRACE FLOOR"
and "TERRACE FLOOR TO LMR/OHT LVL"; a beam layout is for one floor ("FIRST FLOOR BEAM LAYOUT"). A joint at the first
floor's beams takes the column's storey that ends there: FOUNDATION TO FIRST FLOOR.

`floor` reduces either kind of text to the floor's name ("FIRST", "TERRACE", "LMR OHT") so they compare: case,
punctuation and the words FLOOR, LVL, LEVEL, SLAB, BEAM, LAYOUT, PLAN and SCHEDULE do not count.
"""
from __future__ import annotations

import re

_FILLER = {"FLOOR", "FLOORS", "FLR", "FL", "LVL", "LEVEL", "LEVELS", "SLAB", "BEAM", "BEAMS", "LAYOUT", "PLAN",
           "SCHEDULE", "OF", "THE", "AT", "DETAILS", "DETAIL"}
_FLOOR_WORD = re.compile(
    r"\b(FOUNDATION|FOOTING|PLINTH|GROUND|STILT|BASEMENT|CELLAR|FIRST|SECOND|THIRD|FOURTH|FIFTH|SIXTH|TERRACE|ROOF|"
    r"LMR|OHT|MUMTY|HEADROOM|\d+(?:ST|ND|RD|TH))\b")
_TO = re.compile(r"\s+(?:TO|UPTO|UP TO)\s+|\s*[-–]\s*(?=[A-Z])")


def floor(text: str | None) -> str | None:
    """'FIRST FLOOR BEAM LAYOUT' -> 'FIRST'; 'LMR/OHT LVL' -> 'LMR OHT'; None or empty -> None."""
    if not text:
        return None
    words = re.sub(r"[^A-Z0-9 ]+", " ", text.upper().replace("/", " ")).split()
    kept = [w for w in words if w not in _FILLER]
    return " ".join(kept) or None


def storey(text: str | None) -> tuple[str, str] | None:
    """'FOUNDATION TO FIRST FLOOR' -> ('FOUNDATION', 'FIRST'); text without a 'TO' -> None."""
    if not text:
        return None
    parts = _TO.split(" ".join(text.upper().split()), maxsplit=1)
    if len(parts) != 2:
        return None
    a, b = floor(parts[0]), floor(parts[1])
    return (a, b) if a and b else None


def same_level(a: str | None, b: str | None) -> bool:
    """Two level texts name the same storey (both ends) or the same floor."""
    sa, sb = storey(a), storey(b)
    if sa or sb:
        return sa == sb
    return floor(a) == floor(b)


def is_storey_header(text: str) -> bool:
    """Text that reads as a storey range: two floor names joined by TO."""
    s = storey(text)
    return bool(s and _FLOOR_WORD.search(text.upper()))


def ends_at(level: str | None, at_floor: str | None) -> bool:
    """Does a column value's storey end at the beams' floor? A value with no storey fits every floor."""
    s = storey(level)
    if s is None:
        return floor(level) is None or floor(level) == at_floor
    return s[1] == at_floor
