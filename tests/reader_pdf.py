"""A small synthetic structural sheet, drawn with PyMuPDF inside the tests: a beam schedule, a column schedule, general
notes and a framing plan. No real drawing is used. The recorded Gemini replies in tests/fixtures/reader/ were written
against this exact layout, so change both together.

Joint on the plan: C4 (300 x 300, 8-16, ties 8φ @ 150 c/c) with B12 along X (230 x 450, top 5-20, bottom 4-16,
2L-8 @ 100) and B13 along Y (230 X 450, top 2-25+1-20, bottom 3-16, 8φ @ 150 c/c). B14 is in the schedule only.
Notes: clear cover to beams 25 mm, C.C. 40 to columns, M25, Fe500, seismic zone III, exposure mild.
"""
from __future__ import annotations

from pathlib import Path

# (x, y baseline in points, text) on an A4 landscape page, 842 x 595 pt.
TEXT = [
    (40, 60, "BEAM SCHEDULE"),
    (40, 90, "BEAM"), (110, 90, "SIZE"), (200, 90, "TOP"), (290, 90, "BOTTOM"), (380, 90, "STIRRUPS"),
    (40, 110, "B12"), (110, 110, "230x450"), (200, 110, "5-20"), (290, 110, "4-16"), (380, 110, "2L-8 @ 100"),
    (40, 130, "B13"), (110, 130, "230 X 450"), (200, 130, "2-25+1-20"), (290, 130, "3-16"),
    (380, 130, "8φ @ 150 c/c"),
    (40, 150, "B14"), (110, 150, "230x380"), (200, 150, "3-12"), (290, 150, "3-16"), (380, 150, "8φ @ 150 c/c"),
    (40, 200, "COLUMN SCHEDULE"),
    (40, 230, "COLUMN"), (110, 230, "SIZE"), (200, 230, "MAIN"), (290, 230, "TIES"),
    (40, 250, "C4"), (110, 250, "300x300"), (200, 250, "8-16"), (290, 250, "8φ @ 150 c/c"),
    (40, 300, "NOTES:"),
    (40, 320, "1. CLEAR COVER TO BEAMS 25 mm"),
    (40, 340, "2. C.C. 40 TO COLUMNS"),
    (40, 360, "3. CONCRETE M25, STEEL Fe500"),
    (40, 380, "4. SEISMIC ZONE III"),
    (40, 400, "5. EXPOSURE: MILD"),
    (560, 60, "FRAMING PLAN"),
    (600, 200, "C4"), (660, 200, "B12"),
    (603, 250, "B13"),
]


# What the sheet says, canonical. Anything accepted must be in here with exactly this value.
TRUTH = {
    ("B12", "section"): "230x450", ("B12", "top"): "5-20", ("B12", "bottom"): "4-16", ("B12", "links"): "2L-8@100",
    ("B13", "section"): "230x450", ("B13", "top"): "2-25 + 1-20", ("B13", "bottom"): "3-16",
    ("B13", "links"): "8@150",
    ("B14", "section"): "230x380", ("B14", "top"): "3-12", ("B14", "bottom"): "3-16", ("B14", "links"): "8@150",
    ("C4", "section"): "300x300", ("C4", "main"): "8-16", ("C4", "links"): "8@150",
    ("ALL_BEAMS", "cover"): "25", ("ALL_COLUMNS", "cover"): "40", ("ALL", "concrete_grade"): "M25",
    ("ALL", "steel_grade"): "Fe500", ("ALL", "seismic_zone"): "III",
    ("ALL", "exposure"): "mild",
    ("B12", "frames_into"): "C4", ("B13", "frames_into"): "C4",
}


def make_pdf(path: Path, rotate: int = 0) -> Path:
    import pymupdf

    doc = pymupdf.open()
    page = doc.new_page(width=842, height=595)
    font = pymupdf.Font("cjk")                   # has φ and ×, which base-14 Helvetica cannot encode
    tw = pymupdf.TextWriter(page.rect)
    for x, y, text in TEXT:
        tw.append((x, y), text, font=font, fontsize=9)
    tw.write_text(page)
    page.draw_rect(pymupdf.Rect(590, 180, 620, 210))     # the column on the plan
    page.draw_line((620, 195), (760, 195))               # B12 along X
    page.draw_line((605, 210), (605, 330))               # B13 along Y
    if rotate:
        page.set_rotation(rotate)
    doc.save(path)
    doc.close()
    return path


def make_shx_pdf(path: Path, rotate: int = 0) -> Path:
    """The same schedule rows written the way AutoCAD's SHX fonts export: no text layer, each string an annotation
    with author 'AutoCAD SHX Text'. Drawn here as Square annotations, whose border shows in the rendered image, so a
    test can check the box lands on ink; their appearance holds no text, like the real thing."""
    import pymupdf

    doc = pymupdf.open()
    page = doc.new_page(width=842, height=595)
    for x, y, text in (t for t in TEXT if 90 <= t[1] <= 150):
        a = page.add_rect_annot(pymupdf.Rect(x, y - 9, x + 6 * len(text), y + 3))
        a.set_colors(stroke=(0, 0, 0))
        a.set_border(width=1)
        a.set_info(title="AutoCAD SHX Text", content=text)
        a.update()
    if rotate:
        page.set_rotation(rotate)
    doc.save(path)
    doc.close()
    return path


def make_mixed_pdf(path: Path) -> Path:
    """The plain sheet plus three AutoCAD SHX comments: one repeating the plan's 'B12' label in the same place
    (dropped), one new callout written with AutoCAD codes, '8%%C @ 200 C/C' (kept, read as 8Ø @ 200 C/C), and an
    underlined title, '%%UCOLUMN DETAIL%%U' (kept as COLUMN DETAIL)."""
    import pymupdf

    make_pdf(path)
    doc = pymupdf.open(path)
    page = doc[0]
    b12 = next(w for w in page.get_text("words") if w[4] == "B12" and w[0] > 600)
    for rect, text in ((pymupdf.Rect(b12[:4]), "B12"), (pymupdf.Rect(560, 440, 640, 452), "8%%C @ 200 C/C"),
                       (pymupdf.Rect(560, 470, 660, 482), "%%UCOLUMN DETAIL%%U")):
        a = page.add_rect_annot(rect)
        a.set_info(title="AutoCAD SHX Text", content=text)
        a.update()
    doc.saveIncr()
    doc.close()
    return path


def make_vector_pdf(path: Path) -> Path:
    """A sheet whose text was exported as lines: no text layer and no comments, only vector paths. The words its
    OCR reply holds are in tests/fixtures/reader/ocr-p1-t0.json."""
    import pymupdf

    doc = pymupdf.open()
    page = doc.new_page(width=842, height=595)
    for k in range(40):                                   # strokes standing in for the outlined text and table
        page.draw_line((100 + 10 * k, 140), (105 + 10 * k, 160))
    page.draw_rect(pymupdf.Rect(90, 130, 520, 170))
    doc.save(path)
    doc.close()
    return path


# A column schedule laid out by storey, a beam schedule, and a first-floor beam layout, on one A4 sheet.
STOREY_TEXT = [
    (40, 60, "COLUMN SCHEDULE"),
    (120, 90, "FOUNDATION TO FIRST FLOOR"), (330, 90, "FIRST FLOOR TO TERRACE FLOOR"),
    (40, 120, "C4"), (120, 120, "300x450"), (200, 120, "8-20"), (330, 120, "300x450"), (410, 120, "8-16"),
    (40, 300, "BEAM SCHEDULE"),
    (40, 320, "B12"), (110, 320, "230x450"), (200, 320, "4-16"), (290, 320, "3-16"),
    (560, 60, "FIRST FLOOR BEAM LAYOUT"),
    (600, 200, "C4"), (660, 200, "B12"),
]


def make_storey_pdf(path: Path) -> Path:
    import pymupdf

    doc = pymupdf.open()
    page = doc.new_page(width=842, height=595)
    tw = pymupdf.TextWriter(page.rect)
    for x, y, text in STOREY_TEXT:
        tw.append((x, y), text, font=pymupdf.Font("cjk"), fontsize=9)
    tw.write_text(page)
    doc.save(path)
    doc.close()
    return path


def make_grid_pdf(path: Path, ruled: bool = True) -> Path:
    """A ruled column schedule by storey: each storey header is written on two lines inside its cell ("FOUNDATION TO"
    over "FIRST FLOOR"), and the bar values of neighbouring cells sit 4 pt apart, closer than a text height. Without
    the rules (`ruled` False) the same words are on the sheet with no grid."""
    import pymupdf

    doc = pymupdf.open()
    page = doc.new_page(width=842, height=595)
    xs, ys = [40, 120, 200, 280], [80, 112, 132]
    if ruled:
        for y in ys:
            page.draw_line((xs[0], y), (xs[-1], y))
        for x in xs:
            page.draw_line((x, ys[0]), (x, ys[-1]))
    tw = pymupdf.TextWriter(page.rect)
    font = pymupdf.Font("cjk")
    for x, y, text in [(45, 100, "COLUMN"), (125, 93, "FOUNDATION TO"), (125, 105, "FIRST FLOOR"),
                       (205, 93, "FIRST FLOOR TO"), (205, 105, "TERRACE FLOOR"),
                       (45, 125, "C4"), (178, 125, "8Ø16"), (202, 125, "8Ø12")]:
        tw.append((x, y), text, font=font, fontsize=7)
    tw.write_text(page)
    doc.save(path)
    doc.close()
    return path


# --- item 4: a beam layout and a column layout with one grid, and a sheet of beam elevations -------------------------
#
# Beam layout (page 1), points: grid x lines 1, 2, 3 at x = 150, 350, 550; y lines A, B, C1 at y = 150, 300, 450.
# Column layout (page 2): the same grid scaled 0.8 and moved (x' = 0.8 x + 60, y' = 0.8 y + 40), so 1, 2, 3 at
# x' = 180, 340, 500 and A, B, C1 at y' = 160, 280, 400. The y bubble "C1" is a grid line, not column C1.
PLAN_X = {"1": 150, "2": 350, "3": 550}
PLAN_Y = {"A": 150, "B": 300, "C1": 450}
COLUMN_AT = {"C2": ("A", "1"), "C3": ("A", "2"), "C4": ("A", "3"), "C5": ("B", "1"), "C6": ("B", "2"),
             "C8": ("C1", "1")}            # C7 is drawn 20 pt right of C1-3: near it, not on it


def _dashed(page, a, b, dash: float = 6, gap: float = 2) -> None:
    (x0, y0), (x1, y1) = a, b
    length = ((x1 - x0) ** 2 + (y1 - y0) ** 2) ** 0.5
    t = 0.0
    while t < length:
        e = min(t + dash, length)
        page.draw_line((x0 + (x1 - x0) * t / length, y0 + (y1 - y0) * t / length),
                       (x0 + (x1 - x0) * e / length, y0 + (y1 - y0) * e / length), color=(0.5, 0.5, 0.5))
        t = e + gap


def _grid(page, tw, font, xs: dict[str, float], ys: dict[str, float]) -> None:
    """Bubbles of radius 8 at y = 100 (numbers) and x = 100 (letters), each with a dashed 60 pt stub from its edge."""
    for label, x in xs.items():
        page.draw_circle((x, 100), 8)
        tw.append((x - 1.7 * len(label), 102), label, font=font, fontsize=6)
        _dashed(page, (x, 108), (x, 168))
    for label, y in ys.items():
        page.draw_circle((100, y), 8)
        tw.append((100 - 1.7 * len(label), y + 2), label, font=font, fontsize=6)
        _dashed(page, (108, y), (168, y))


def make_plan_pdf(path: Path) -> Path:
    """Page 1, FIRST FLOOR BEAM LAYOUT; page 2, COLUMN LAYOUT. Beams are two dashed edges 4 pt apart, stopping 5 pt
    short of each grid intersection; each label sits 2 pt above (XB) or 3 pt right of (YB) its band.

    XB1 along A, 1 to 2 and again 2 to 3 (same mark either side of C3); XB2 along B, 1 to 2, and XB3 along B, 2 to 3
    (different marks either side of C6; XB3 ends at B-3 with no column); YB1 along 1, A to B; YB2 along 2, B to C1
    (ends at C1-2, no column); YB3 along 3, A to C1 (ends at C1-3, where C7 is off the grid). C8 at C1-1 has no
    beam. A size "230x450" sits on XB2's band, 2 pt above it, beside the label."""
    import pymupdf

    doc = pymupdf.open()
    font = pymupdf.Font("cjk")
    beam = doc.new_page(width=842, height=595)
    tw = pymupdf.TextWriter(beam.rect)
    _grid(beam, tw, font, PLAN_X, PLAN_Y)
    tw.append((560, 560), "FIRST FLOOR BEAM LAYOUT", font=font, fontsize=8)

    def xb(label: str, y: float, x0: float, x1: float, size: str | None = None) -> None:
        _dashed(beam, (x0 + 5, y - 2), (x1 - 5, y - 2))
        _dashed(beam, (x0 + 5, y + 2), (x1 - 5, y + 2))
        tw.append((x0 + 20, y - 4), label, font=font, fontsize=6)
        if size:
            tw.append((x0 + 90, y - 4), size, font=font, fontsize=6)

    def yb(label: str, x: float, y0: float, y1: float) -> None:
        _dashed(beam, (x - 2, y0 + 5), (x - 2, y1 - 5))
        _dashed(beam, (x + 2, y0 + 5), (x + 2, y1 - 5))
        tw.append((x + 5, y0 + 40), label, font=font, fontsize=6)

    xb("XB1", 150, 150, 350)
    xb("XB1", 150, 350, 550)
    xb("XB2", 300, 150, 350, "230x450")
    xb("XB3", 300, 350, 550)
    yb("YB1", 150, 150, 300)
    yb("YB2", 350, 300, 450)
    yb("YB3", 550, 150, 450)
    tw.write_text(beam)

    col = doc.new_page(width=842, height=595)
    tw = pymupdf.TextWriter(col.rect)
    _grid(col, tw, font, {k: 0.8 * v + 60 for k, v in PLAN_X.items()}, {k: 0.8 * v + 40 for k, v in PLAN_Y.items()})
    tw.append((560, 560), "COLUMN LAYOUT", font=font, fontsize=8)
    places = {c: (0.8 * PLAN_X[x] + 60, 0.8 * PLAN_Y[y] + 40) for c, (y, x) in COLUMN_AT.items()}
    places["C7"] = (0.8 * PLAN_X["3"] + 60 + 20, 0.8 * PLAN_Y["C1"] + 40)
    for c, (x, y) in places.items():
        col.draw_rect(pymupdf.Rect(x - 5, y - 5, x + 5, y + 5), color=None, fill=(0.8, 0, 0.8))
        tw.append((x + 7, y + 2), c, font=font, fontsize=6)
    tw.write_text(col)
    doc.save(path)
    doc.close()
    return path


def make_elevation_pdf(path: Path) -> Path:
    """Two beam elevations, one above the other, each titled below its dimension line. XB6: edges at y = 100 and
    130, x 100 to 400, dimension line at 145, title "XB6(230x450)" at baseline 160, top callout "2Ø20" at baseline 95.
    XB5: edges at 200 and 230, dimension line at 245, title "XB5(230x450)" at baseline 260, top callout "2Ø16" at
    baseline 195 (below XB6's title) and bottom callout "3Ø12" at baseline 226 (inside, near the bottom edge). A
    callout "2Ø25" at x 600, under no elevation."""
    import pymupdf

    doc = pymupdf.open()
    page = doc.new_page(width=842, height=595)
    font = pymupdf.Font("cjk")
    tw = pymupdf.TextWriter(page.rect)
    for top, title, callouts in ((100, "XB6(230x450)", [(200, 95, "2Ø20")]),
                                 (200, "XB5(230x450)", [(200, 195, "2Ø16"), (260, 226, "3Ø12")])):
        page.draw_line((100, top), (400, top))
        page.draw_line((100, top + 30), (400, top + 30))
        page.draw_line((100, top + 45), (400, top + 45), color=(1, 0, 0))
        tw.append((100, top + 60), title, font=font, fontsize=6)
        for x, y, text in callouts:
            tw.append((x, y), text, font=font, fontsize=6)
    tw.append((600, 195), "2Ø25", font=font, fontsize=6)
    tw.write_text(page)
    doc.save(path)
    doc.close()
    return path
