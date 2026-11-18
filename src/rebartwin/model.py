"""The joint as drawn: one column, the beams that frame into it, their bars, and the settings the rules need.

Everything is in millimetres. The column's centre line is the Z axis, Z = 0 is the top of the beams, and the beams
run along X and Y. A reader (Gemini plus the text parser) fills this model from the drawings; the engine never
guesses a value the drawing does not give. Anything assumed goes in `Joint.notes`.
"""
from __future__ import annotations

import math
import re
from typing import Literal

from pydantic import BaseModel, Field, model_validator

Exposure = Literal["mild", "moderate", "severe", "very_severe", "extreme"]
CoverTo = Literal["links", "main"]
Zone = Literal["II", "III", "IV", "V"]
Face = Literal["top", "bottom"]

_CALLOUT = re.compile(
    r"^\s*(\d+)\s*(?:nos?\.?)?\s*[-x×#@]?\s*(\d+(?:\.\d+)?)\s*(?:mm|φ|Φ|ø|#|T|Y)?\s*$", re.IGNORECASE)


def bar_area(dia: float) -> float:
    return math.pi * dia * dia / 4.0


class BarGroup(BaseModel):
    count: int = Field(ge=1)
    dia: float = Field(gt=0)

    @property
    def area(self) -> float:
        return self.count * bar_area(self.dia)


def parse_bars(text: str) -> list[BarGroup]:
    """Indian drawing notation, count then diameter: '5-20', '2-25 + 1-20', '2 nos 25', '3#16', '4-12φ'."""
    groups = []
    for part in text.split("+"):
        m = _CALLOUT.match(part)
        if not m:
            raise ValueError(f"can't read bar callout {part.strip()!r} in {text!r}; expected count-diameter like '5-20'")
        groups.append(BarGroup(count=int(m.group(1)), dia=float(m.group(2))))
    return groups


def format_bars(groups: list[BarGroup]) -> str:
    return " + ".join(f"{g.count}-{g.dia:g}" for g in groups)


class Layer(BaseModel):
    """One row of bars across a beam's width, in drawing notation. With two groups and the first of two bars, the
    first group sits at the corners and the second between them ('2-25 + 1-20'); otherwise left to right as written."""
    bars: str

    @property
    def groups(self) -> list[BarGroup]:
        return parse_bars(self.bars)

    def diameters(self) -> list[float]:
        g = self.groups
        if len(g) == 1:
            return [g[0].dia] * g[0].count
        if len(g) == 2 and g[0].count == 2:
            return [g[0].dia] + [g[1].dia] * g[1].count + [g[0].dia]
        return [x.dia for x in g for _ in range(x.count)]

    @property
    def area(self) -> float:
        return sum(x.area for x in self.groups)

    @property
    def count(self) -> int:
        return sum(x.count for x in self.groups)


class Column(BaseModel):
    id: str
    b: float = Field(gt=0, description="size along X, mm")
    h: float = Field(gt=0, description="size along Y, mm")
    n_bars: int = Field(ge=4)
    bar_dia: float = Field(gt=0, description="the bars' size; with face_dia, the four corner bars' size")
    face_dia: float | None = Field(default=None, gt=0, description="the size of the bars between the corners, when "
                                   "it differs from the corner bars' (a schedule's '4-16 + 4-12')")
    tie_dia: float = Field(default=8, gt=0)
    cover: float = Field(default=40, gt=0)
    cover_to: CoverTo = Field(default="main", description="what the cover is measured to: the ties or the main bars")
    bars_x: int | None = Field(default=None, description="bars on each face that runs along X, corners included")
    bars_y: int | None = Field(default=None, description="bars on each face that runs along Y, corners included")

    @model_validator(mode="after")
    def _share_bars(self):
        if self.face_dia is not None and self.n_bars <= 4:
            raise ValueError(f"{self.id}: face_dia needs bars between the corners; {self.n_bars} bars are all corners")
        if self.bars_x is None or self.bars_y is None:
            if self.n_bars % 2:
                raise ValueError(f"{self.id}: {self.n_bars} bars can't sit symmetrically on four faces; "
                                 "give bars_x and bars_y")
            pair = (self.n_bars + 4) // 2                  # bars_x + bars_y
            bx = max(2, round(pair * self.b / (self.b + self.h)))
            by = max(2, pair - bx)
            self.bars_x, self.bars_y = pair - by, by
        if 2 * (self.bars_x + self.bars_y) - 4 != self.n_bars:
            raise ValueError(f"{self.id}: {self.bars_x} and {self.bars_y} bars per face make "
                             f"{2 * (self.bars_x + self.bars_y) - 4} bars, not {self.n_bars}")
        return self

    @property
    def main_dias(self) -> list[float]:
        """The main bar sizes: the corner bars' first."""
        return [self.bar_dia] if self.face_dia is None else [self.bar_dia, self.face_dia]

    @property
    def area(self) -> float:
        """Main steel, mm²: four corner bars of bar_dia and the rest of face_dia (or all of bar_dia)."""
        face = self.face_dia if self.face_dia is not None else self.bar_dia
        return 4 * bar_area(self.bar_dia) + (self.n_bars - 4) * bar_area(face)

    @property
    def main_cover(self) -> float:
        """Concrete outside the main bars."""
        return self.cover if self.cover_to == "main" else self.cover + self.tie_dia

    @property
    def link_cover(self) -> float:
        """Concrete outside the ties: IS 456's nominal cover to all steel."""
        return self.cover - self.tie_dia if self.cover_to == "main" else self.cover


class Beam(BaseModel):
    id: str
    direction: Literal["x", "y"] = "x"
    b: float = Field(gt=0, description="width, mm")
    D: float = Field(gt=0, description="overall depth, mm")
    stirrup_dia: float = Field(default=8, gt=0)
    cover: float = Field(default=25, gt=0)
    cover_to: CoverTo = "links"
    top: list[Layer] = Field(min_length=1)
    bottom: list[Layer] = Field(default_factory=list)
    spacer: float = Field(default=25, gt=0, description="clear vertical gap between layers (the spacer bar), mm")

    @property
    def main_cover(self) -> float:
        return self.cover if self.cover_to == "main" else self.cover + self.stirrup_dia

    @property
    def link_cover(self) -> float:
        return self.cover - self.stirrup_dia if self.cover_to == "main" else self.cover

    def face(self, which: Face) -> list[Layer]:
        return self.top if which == "top" else self.bottom

    def area(self, which: Face) -> float:
        return sum(layer.area for layer in self.face(which))

    def max_dia(self) -> float:
        return max(d for layer in [*self.top, *self.bottom] for d in layer.diameters())


class Settings(BaseModel):
    aggregate: float = Field(default=20, gt=0, description="nominal maximum size of coarse aggregate, mm")
    exposure: Exposure = "mild"
    seismic_zone: Zone = "II"
    apply_is13920: bool | None = Field(default=None, description="None follows the zone: on in III, IV and V")
    stock_dias: list[float] = Field(default_factory=lambda: [12, 16, 20, 25],
                                    description="bar sizes a fix may use: what the site stocks")
    max_layers: int = Field(default=2, ge=1, le=3)

    @property
    def is13920(self) -> bool:
        if self.apply_is13920 is not None:
            return self.apply_is13920
        return self.seismic_zone in ("III", "IV", "V")


class Joint(BaseModel):
    id: str
    column: Column
    beams: list[Beam] = Field(min_length=1, max_length=2)
    settings: Settings = Field(default_factory=Settings)
    required_area: dict[str, float] = Field(
        default_factory=dict, description="'B12.top' -> mm² a fix must keep; by default the steel as drawn")
    notes: list[str] = Field(default_factory=list, description="assumptions the reader or a person made")
    place: str | None = Field(default=None, description="the column's grid place on the plans, e.g. 'F-14' or "
                                                        "'C/C1-25'; read from the drawing by the reader")
    floor: str | None = Field(default=None, description="the floor of the beams' plan, e.g. 'FIRST'")

    @model_validator(mode="after")
    def _one_beam_each_way(self):
        ways = [b.direction for b in self.beams]
        if len(set(ways)) != len(ways):
            raise ValueError("one beam per direction: a beam that runs through the joint is one beam")
        if len({b.id for b in self.beams} | {self.column.id}) != len(self.beams) + 1:
            raise ValueError("member ids must be unique")
        return self

    def beam(self, beam_id: str) -> Beam:
        for b in self.beams:
            if b.id == beam_id:
                return b
        raise KeyError(beam_id)

    def required(self, beam_id: str, face: Face) -> float:
        return self.required_area.get(f"{beam_id}.{face}", self.beam(beam_id).area(face))
