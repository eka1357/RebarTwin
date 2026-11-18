"""Places every bar of a joint in 3D, deterministically. Nothing here judges: `rules` measures what this builds.

Site practice it follows: main bars sit tight inside the ties and stirrups; bars in a layer are evenly spaced with
the outer bars in the corners; a second layer hangs below (or sits above) the first on a spacer, bars vertically in
line where the counts allow; where two beams cross, the second beam's bars pass under the first beam's top bars and
over its bottom bars.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from .model import Beam, Column, Joint, bar_area

EXTENT = 600.0   # how far bars run past the joint, mm: enough to see and check the joint region
Point = tuple[float, float, float]


@dataclass(frozen=True)
class Bar:
    id: str          # "C4/V3"; "B12/T1-3" is top layer 1, bar 3 across the width; "B12/B2-1"
    member: str
    role: str        # "column", "top" or "bottom"
    layer: int       # 0 for column bars
    index: int       # 1-based, across the width or around the column
    dia: float
    p0: Point
    p1: Point
    lateral: float = 0.0   # beam bars: position across the width (Y for an X beam, X for a Y beam)
    level: float = 0.0     # beam bars: centre height

    @property
    def area(self) -> float:
        return bar_area(self.dia)

    @property
    def label(self) -> str:
        if self.role == "column":
            return f"{self.member} column bar {self.index} ({self.dia:g} mm)"
        where = f"layer {self.layer} " if self.layer > 1 else ""
        return f"{self.member} {self.role} bar {self.index} {where}({self.dia:g} mm)".replace("  ", " ")


@dataclass(frozen=True)
class Loop:
    """A tie or stirrup. Drawn into the model; the clash rules leave it alone (main bars touch it by design)."""
    id: str
    member: str
    role: str        # "tie" or "stirrup"
    dia: float
    points: tuple[Point, ...]


@dataclass
class Cage:
    joint_id: str
    bars: list[Bar] = field(default_factory=list)
    loops: list[Loop] = field(default_factory=list)
    column_faces: dict[str, list[Bar]] = field(default_factory=dict)        # face -> bars along it, in order
    layers: dict[tuple[str, str, int], list[Bar]] = field(default_factory=dict)  # (beam, face, layer) -> bars
    effective_depth: dict[tuple[str, str], float] = field(default_factory=dict)  # (beam, face) -> d, mm
    z_range: tuple[float, float] = (0.0, 0.0)

    def bar(self, bar_id: str) -> Bar:
        for b in self.bars:
            if b.id == bar_id:
                return b
        raise KeyError(bar_id)


def spread(a: float, b: float, n: int) -> list[float]:
    if n == 1:
        return [(a + b) / 2]
    return [a + i * (b - a) / (n - 1) for i in range(n)]


def _layer_one(half: float, dias: list[float]) -> list[float]:
    """Centres across the width: outer bars touch the stirrup corners, the rest evenly spaced between them."""
    if len(dias) == 1:
        return [0.0]
    return spread(-half + dias[0] / 2, half - dias[-1] / 2, len(dias))


def _in_line(first: list[float], n: int, half: float, dias: list[float]) -> list[float]:
    """A further layer under (or over) layer 1: pairs from the outside in, the middle bar if layer 1 has one. When
    the counts can't line up, bars are spread evenly and the rule reports that they are not in line."""
    if n > len(first):
        return _layer_one(half, dias)
    picked, i, j = [], 0, len(first) - 1
    while len(picked) + 2 <= n and i < j:
        picked += [first[i], first[j]]
        i, j = i + 1, j - 1
    if len(picked) < n:
        picked.append(first[i] if i == j else 0.0)
    return sorted(picked)


def _column_bars(c: Column, z0: float, z1: float) -> tuple[list[Bar], dict[str, list[Bar]]]:
    """Corner bars sit in the corners of the ties; bars between them are spread evenly along each face, and every bar
    sits tight against the ties at its own size, so a smaller face bar (`face_dia`) is a little further in."""
    fd = c.face_dia if c.face_dia is not None else c.bar_dia
    ix = c.b / 2 - c.main_cover - c.bar_dia / 2
    iy = c.h / 2 - c.main_cover - c.bar_dia / 2
    fx = c.b / 2 - c.main_cover - fd / 2
    fy = c.h / 2 - c.main_cover - fd / 2
    xs, ys = spread(-ix, ix, c.bars_x), spread(-iy, iy, c.bars_y)
    if c.face_along_x is not None:                     # face bars placed by a fix, else spread evenly
        xs = [xs[0], *c.face_along_x, xs[-1]]
    if c.face_along_y is not None:
        ys = [ys[0], *c.face_along_y, ys[-1]]

    def along_x(x: float, side: int) -> tuple[float, float, float]:      # on a face that runs along X
        corner = x in (xs[0], xs[-1])
        return x, side * (iy if corner else fy), c.bar_dia if corner else fd

    def along_y(y: float, side: int) -> tuple[float, float, float]:      # on a face that runs along Y
        corner = y in (ys[0], ys[-1])
        return side * (ix if corner else fx), y, c.bar_dia if corner else fd

    faces_at = {"y-": [along_x(x, -1) for x in xs], "x+": [along_y(y, 1) for y in ys],
                "y+": [along_x(x, 1) for x in xs], "x-": [along_y(y, -1) for y in ys]}
    ring = (faces_at["y-"] + faces_at["x+"][1:] + list(reversed(faces_at["y+"][:-1]))
            + list(reversed(faces_at["x-"][1:-1])))
    bars = [Bar(f"{c.id}/V{k}", c.id, "column", 0, k, d, (x, y, z0), (x, y, z1))
            for k, (x, y, d) in enumerate(ring, 1)]
    at = {(round(b.p0[0], 6), round(b.p0[1], 6)): b for b in bars}
    faces = {f: [at[(round(x, 6), round(y, 6))] for x, y, _ in pts] for f, pts in faces_at.items()}
    return bars, faces


def _ties(c: Column, levels: list[float]) -> list[Loop]:
    hx = c.b / 2 - c.link_cover - c.tie_dia / 2
    hy = c.h / 2 - c.link_cover - c.tie_dia / 2
    return [Loop(f"{c.id}/TIE{k}", c.id, "tie", c.tie_dia,
                 ((-hx, -hy, z), (hx, -hy, z), (hx, hy, z), (-hx, hy, z)))
            for k, z in enumerate(levels, 1)]


def _stirrups(beam: Beam, column: Column) -> list[Loop]:
    hw = beam.b / 2 - beam.link_cover - beam.stirrup_dia / 2
    zt = -beam.link_cover - beam.stirrup_dia / 2
    zb = -beam.D + beam.link_cover + beam.stirrup_dia / 2
    half_col = column.b / 2 if beam.direction == "x" else column.h / 2
    out = []
    for k, s in enumerate([half_col + 50, half_col + 200, half_col + 350, half_col + 500], 1):
        for side, sign in (("L", -1), ("R", 1)):
            a = sign * s
            if beam.direction == "x":
                pts = ((a, -hw, zt), (a, hw, zt), (a, hw, zb), (a, -hw, zb))
            else:
                pts = ((-hw, a, zt), (hw, a, zt), (hw, a, zb), (-hw, a, zb))
            out.append(Loop(f"{beam.id}/ST{side}{k}", beam.id, "stirrup", beam.stirrup_dia, pts))
    return out


def build(joint: Joint) -> Cage:
    col = joint.column
    depth = max(b.D for b in joint.beams)
    z0, z1 = -depth - EXTENT, EXTENT
    cage = Cage(joint.id, z_range=(z0, z1))
    col_bars, cage.column_faces = _column_bars(col, z0, z1)
    cage.bars += col_bars
    cage.loops += _ties(col, [z1 - 100, -depth / 3, -2 * depth / 3, z0 + 100])

    top_floor: float | None = None      # lowest underside of earlier beams' top layer 1: later beams pass under it
    bottom_ceiling: float | None = None  # highest top of earlier beams' bottom layer 1: later beams pass over it
    for beam in joint.beams:
        half = beam.b / 2 - beam.main_cover
        reach = (col.b if beam.direction == "x" else col.h) / 2 + EXTENT
        first_lats: list[float] = []
        layer_one_extent: dict[str, float] = {}
        for face in ("top", "bottom"):
            layers = beam.face(face)
            if face == "top":
                edge = -beam.main_cover if top_floor is None else min(-beam.main_cover, top_floor)
            else:
                edge = -beam.D + beam.main_cover if bottom_ceiling is None else max(-beam.D + beam.main_cover,
                                                                                      bottom_ceiling)
            moment, steel = 0.0, 0.0
            for k, layer in enumerate(layers, 1):
                dias = layer.diameters()
                lats = _layer_one(half, dias) if k == 1 else _in_line(first_lats, len(dias), half, dias)
                if k == 1:
                    first_lats = lats
                row = []
                for i, (lat, d) in enumerate(zip(lats, dias), 1):
                    z = edge - d / 2 if face == "top" else edge + d / 2
                    if beam.direction == "x":
                        p0, p1 = (-reach, lat, z), (reach, lat, z)
                    else:
                        p0, p1 = (lat, -reach, z), (lat, reach, z)
                    tag = "T" if face == "top" else "B"
                    row.append(Bar(f"{beam.id}/{tag}{k}-{i}", beam.id, face, k, i, d, p0, p1, lat, z))
                    moment += bar_area(d) * ((-z) if face == "top" else (z + beam.D))
                    steel += bar_area(d)
                cage.layers[(beam.id, face, k)] = row
                cage.bars += row
                if face == "top":
                    far = min(b.level - b.dia / 2 for b in row)
                    if k == 1:
                        layer_one_extent["top"] = far
                    edge = far - beam.spacer
                else:
                    far = max(b.level + b.dia / 2 for b in row)
                    if k == 1:
                        layer_one_extent["bottom"] = far
                    edge = far + beam.spacer
            if steel:
                cage.effective_depth[(beam.id, face)] = beam.D - moment / steel
        if "top" in layer_one_extent:
            top_floor = layer_one_extent["top"] if top_floor is None else min(top_floor, layer_one_extent["top"])
        if "bottom" in layer_one_extent:
            bottom_ceiling = (layer_one_extent["bottom"] if bottom_ceiling is None
                              else max(bottom_ceiling, layer_one_extent["bottom"]))
        cage.loops += _stirrups(beam, col)
    return cage
