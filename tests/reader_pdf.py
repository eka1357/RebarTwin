"""A small synthetic structural sheet, drawn with PyMuPDF inside the tests: a beam schedule, a column schedule, general
notes and a framing plan. No real drawing is used. The recorded Gemini replies in tests/fixtures/reader/ were written
against this exact layout, so change both together.

Joint on the plan: C4 (300 x 300, 8-16, ties 8φ @ 150 c/c) with B12 along X (230 x 450, top 5-20, bottom 4-16,
2L-8 @ 100) and B13 along Y (230 X 450, top 2-25+1-20, bottom 3-16, 8φ @ 150 c/c). B14 is in the schedule only.
Notes: clear cover to beams 25 mm, C.C. 40 to columns, M25, Fe500, seismic zone III.
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
