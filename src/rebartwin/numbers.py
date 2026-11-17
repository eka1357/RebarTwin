"""One rounding rule for every number the engine writes as text: half away from zero on the decimal value as written.

It is the rule of `Intl.NumberFormat` (its default `halfExpand`), which the web app uses to format the engine's
numbers, so a value reads the same in a flag and on a card: 388.5 mm is "389 mm" in both. Python's own `:.0f` rounds
half to even on the binary value and would write "388".
"""
from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal


def half_up(x: float, places: int = 0) -> float:
    """388.5 -> 389, 2.5 -> 3, -0.5 -> -1, 2.675 at 2 places -> 2.68 (the decimal as written, not its binary)."""
    return float(Decimal(repr(float(x))).quantize(Decimal(1).scaleb(-places), rounding=ROUND_HALF_UP))


def fmt(x: float, places: int = 0) -> str:
    """`x` rounded by `half_up` and written with `places` decimals; never "-0"."""
    v = half_up(x, places)
    return f"{v:.{places}f}" if v != 0 else f"{0:.{places}f}"
