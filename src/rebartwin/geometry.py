"""Exact distances between straight bars. Every number RebarTwin shows comes from here or from simple arithmetic on
the layout, never from a model or a mesh: a bar is a segment with a diameter, so the gap has a closed form."""
from __future__ import annotations

from .layout import Bar, Point

EPS = 1e-12


def _sub(a: Point, b: Point) -> Point:
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _dot(a: Point, b: Point) -> float:
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def _along(p: Point, d: Point, s: float) -> Point:
    return (p[0] + d[0] * s, p[1] + d[1] * s, p[2] + d[2] * s)


def _clamp(v: float) -> float:
    return 0.0 if v < 0.0 else 1.0 if v > 1.0 else v


def closest_points(p0: Point, p1: Point, q0: Point, q1: Point) -> tuple[float, Point, Point]:
    """Shortest distance between segments p0-p1 and q0-q1, and the closest point on each
    (Ericson, Real-Time Collision Detection, section 5.1.9)."""
    d1, d2, r = _sub(p1, p0), _sub(q1, q0), _sub(p0, q0)
    a, e, f = _dot(d1, d1), _dot(d2, d2), _dot(d2, r)
    if a <= EPS and e <= EPS:
        s = t = 0.0
    elif a <= EPS:
        s, t = 0.0, _clamp(f / e)
    else:
        c = _dot(d1, r)
        if e <= EPS:
            s, t = _clamp(-c / a), 0.0
        else:
            b = _dot(d1, d2)
            denom = a * e - b * b
            s = _clamp((b * f - c * e) / denom) if denom > EPS else 0.0
            t = (b * s + f) / e
            if t < 0.0:
                s, t = _clamp(-c / a), 0.0
            elif t > 1.0:
                s, t = _clamp((b - c) / a), 1.0
    cp, cq = _along(p0, d1, s), _along(q0, d2, t)
    gap = _sub(cp, cq)
    return _dot(gap, gap) ** 0.5, cp, cq


def clear_gap(a: Bar, b: Bar) -> tuple[float, Point]:
    """Surface-to-surface gap between two bars (negative means they overlap) and the point midway between them."""
    dist, cp, cq = closest_points(a.p0, a.p1, b.p0, b.p1)
    mid = ((cp[0] + cq[0]) / 2, (cp[1] + cq[1]) / 2, (cp[2] + cq[2]) / 2)
    return dist - (a.dia + b.dia) / 2, mid


def boxes_overlap(a: Bar, b: Bar) -> bool:
    """Cheap test before the exact one: do the bars' bounding boxes, grown by their radii, meet?"""
    for axis in range(3):
        lo_a = min(a.p0[axis], a.p1[axis]) - a.dia / 2
        hi_a = max(a.p0[axis], a.p1[axis]) + a.dia / 2
        lo_b = min(b.p0[axis], b.p1[axis]) - b.dia / 2
        hi_b = max(b.p0[axis], b.p1[axis]) + b.dia / 2
        if hi_a < lo_b or hi_b < lo_a:
            return False
    return True
