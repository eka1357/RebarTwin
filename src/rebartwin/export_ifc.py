"""The cage as an IFC4 model: every bar an IfcReinforcingBar (a swept disk along its centre line), failing bars in
red, the concrete see-through, each bar carrying its mark, status and the clauses it fails in a property set.

IfcOpenShell is optional (`pip install ifcopenshell`); the checks never need it. `kernel_clashes` re-measures the
exported model with IfcOpenShell's own geometry kernel: a second, independent channel for the clash rule.
"""
from __future__ import annotations

from collections import defaultdict
from pathlib import Path

from .check import Report, check
from .guid import ifc_guid
from .layout import EXTENT, Cage
from .model import Joint

RED, STEEL, CONCRETE = (0.82, 0.20, 0.17), (0.45, 0.50, 0.56), (0.80, 0.78, 0.74)


def _api():
    try:
        import ifcopenshell
        import ifcopenshell.api.aggregate
        import ifcopenshell.api.context
        import ifcopenshell.api.geometry
        import ifcopenshell.api.project
        import ifcopenshell.api.pset
        import ifcopenshell.api.root
        import ifcopenshell.api.spatial
        import ifcopenshell.api.style
        import ifcopenshell.api.unit
    except ImportError as e:  # pragma: no cover - depends on the machine
        raise RuntimeError("IFC export needs IfcOpenShell: pip install ifcopenshell") from e
    return ifcopenshell


def export_ifc(joint: Joint, path: str | Path, report: Report | None = None, cage: Cage | None = None) -> dict[str, str]:
    """Write the joint to `path` and return each bar's GlobalId by bar id."""
    ifcopenshell = _api()
    api = ifcopenshell.api
    if report is None or cage is None:
        report, cage = check(joint)
    failed: dict[str, list[str]] = defaultdict(list)
    for f in report.failures:
        for bar_id in f.bars:
            failed[bar_id].append(f.clause)

    f = api.project.create_file(version="IFC4")
    project = api.root.create_entity(f, ifc_class="IfcProject", name=f"RebarTwin {joint.id}")
    project.GlobalId = ifc_guid(joint.id, "project")
    api.unit.assign_unit(f, units=[api.unit.add_si_unit(f, unit_type="LENGTHUNIT", prefix="MILLI")])
    model = api.context.add_context(f, context_type="Model")
    body = api.context.add_context(f, context_type="Model", context_identifier="Body", target_view="MODEL_VIEW",
                                   parent=model)
    site = api.root.create_entity(f, ifc_class="IfcSite", name="Site")
    building = api.root.create_entity(f, ifc_class="IfcBuilding", name="Building")
    storey = api.root.create_entity(f, ifc_class="IfcBuildingStorey", name=f"Joint {joint.id}")
    api.aggregate.assign_object(f, products=[site], relating_object=project)
    api.aggregate.assign_object(f, products=[building], relating_object=site)
    api.aggregate.assign_object(f, products=[storey], relating_object=building)

    def colour(name: str, rgb: tuple[float, float, float], transparency: float = 0.0):
        style = api.style.add_style(f, name=name)
        api.style.add_surface_style(f, style=style, ifc_class="IfcSurfaceStyleShading", attributes={
            "SurfaceColour": {"Name": None, "Red": rgb[0], "Green": rgb[1], "Blue": rgb[2]},
            "Transparency": transparency})
        return style

    red, steel, concrete = colour("Fails a rule", RED), colour("Steel", STEEL), colour("Concrete", CONCRETE, 0.75)

    def pt(p) -> object:
        return f.createIfcCartesianPoint([float(v) for v in p])

    def shape(items, kind: str, style, product):
        rep = f.createIfcShapeRepresentation(body, "Body", kind, items)
        api.geometry.assign_representation(f, product=product, representation=rep)
        api.style.assign_representation_styles(f, shape_representation=rep, styles=[style])
        api.geometry.edit_object_placement(f, product=product)

    def rectangle(x: float, y: float):
        return f.createIfcRectangleProfileDef("AREA", None, f.createIfcAxis2Placement2D(pt((0.0, 0.0)), None),
                                              float(x), float(y))

    products = []
    col = joint.column
    z0, z1 = cage.z_range
    column = api.root.create_entity(f, ifc_class="IfcColumn", name=col.id)
    column.GlobalId = ifc_guid(joint.id, col.id)
    solid = f.createIfcExtrudedAreaSolid(rectangle(col.b, col.h), f.createIfcAxis2Placement3D(pt((0, 0, z0)), None, None),
                                         f.createIfcDirection((0.0, 0.0, 1.0)), float(z1 - z0))
    shape([solid], "SweptSolid", concrete, column)
    products.append(column)
    for beam in joint.beams:
        along_x = beam.direction == "x"
        reach = (col.b if along_x else col.h) / 2 + EXTENT
        axis, ref = ((1.0, 0.0, 0.0), (0.0, 1.0, 0.0)) if along_x else ((0.0, 1.0, 0.0), (1.0, 0.0, 0.0))
        start = (-reach, 0.0, -beam.D / 2) if along_x else (0.0, -reach, -beam.D / 2)
        place = f.createIfcAxis2Placement3D(pt(start), f.createIfcDirection(axis), f.createIfcDirection(ref))
        solid = f.createIfcExtrudedAreaSolid(rectangle(beam.b, beam.D), place, f.createIfcDirection((0.0, 0.0, 1.0)),
                                             float(2 * reach))
        element = api.root.create_entity(f, ifc_class="IfcBeam", name=beam.id)
        element.GlobalId = ifc_guid(joint.id, beam.id)
        shape([solid], "SweptSolid", concrete, element)
        products.append(element)

    guids: dict[str, str] = {}
    for bar in cage.bars:
        element = api.root.create_entity(f, ifc_class="IfcReinforcingBar", predefined_type="MAIN", name=bar.label)
        element.GlobalId = guids[bar.id] = ifc_guid(joint.id, bar.id)
        element.Tag = bar.id
        element.NominalDiameter = float(bar.dia)
        element.CrossSectionArea = float(bar.area)
        element.BarLength = float(sum((a - b) ** 2 for a, b in zip(bar.p0, bar.p1)) ** 0.5)
        disk = f.createIfcSweptDiskSolid(f.createIfcPolyline([pt(bar.p0), pt(bar.p1)]), bar.dia / 2, None, None, None)
        shape([disk], "AdvancedSweptSolid", red if bar.id in failed else steel, element)
        props = {"Mark": bar.id, "Member": bar.member, "Role": bar.role, "Layer": bar.layer,
                 "DiameterMm": float(bar.dia), "Status": "FAIL" if bar.id in failed else "OK"}
        if bar.id in failed:
            props["FailedClauses"] = "; ".join(sorted(set(failed[bar.id])))
        api.pset.edit_pset(f, pset=api.pset.add_pset(f, product=element, name="RebarTwin_Bar"), properties=props)
        products.append(element)
    for loop in cage.loops:
        element = api.root.create_entity(f, ifc_class="IfcReinforcingBar", predefined_type="LIGATURE", name=loop.id)
        element.GlobalId = guids[loop.id] = ifc_guid(joint.id, loop.id)
        element.Tag = loop.id
        element.NominalDiameter = float(loop.dia)
        ring = f.createIfcPolyline([pt(p) for p in (*loop.points, loop.points[0])])
        shape([f.createIfcSweptDiskSolid(ring, loop.dia / 2, None, None, None)], "AdvancedSweptSolid", steel, element)
        products.append(element)
    api.spatial.assign_container(f, products=products, relating_structure=storey)
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    f.write(str(path))
    return guids


def kernel_clashes(path: str | Path, tolerance_m: float = 0.0005) -> set[frozenset[str]]:
    """Main-bar pairs that IfcOpenShell's OpenCASCADE kernel finds intersecting in an exported model, by bar mark.
    Independent of `geometry.py`: the two must agree."""
    ifcopenshell = _api()
    import ifcopenshell.geom

    f = ifcopenshell.open(str(path))
    bars = [e for e in f.by_type("IfcReinforcingBar") if e.PredefinedType == "MAIN"]
    settings = ifcopenshell.geom.settings()
    settings.set("use-world-coords", True)
    tree = ifcopenshell.geom.tree(backend="opencascade.trianglebvh")   # the brep backend has no *_many queries
    tree.add_iterator(ifcopenshell.geom.iterator(settings, f, include=bars))
    pairs = set()
    for clash in tree.clash_intersection_many(bars, bars, tolerance=tolerance_m, check_all=True):
        a, b = clash.a.get_argument(0), clash.b.get_argument(0)
        ea, eb = f.by_guid(a), f.by_guid(b)
        if ea.Tag.split("/")[0] != eb.Tag.split("/")[0]:
            pairs.add(frozenset((ea.Tag, eb.Tag)))
    return pairs
