"""BCF 2.1 issues, one per failing check: the bars selected and coloured red, a camera on the spot, the clause,
the measured value against the limit, and the verified fix when there is one. Opens in BIM tools such as Revit (with
a BCF add-in), Solibri, BIMcollab and Navisworks.

The zip layout and the camera are adapted from ORCA's `document.bcf_zip` (MIT, IssueLab Inc.; THIRD_PARTY_NOTICES.md).
"""
from __future__ import annotations

import datetime as dt
import io
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

from .check import Report
from .guid import ifc_guid, stable_uuid
from .model import Joint
from .rules import CATALOGUE

PRIORITY = {"GEOM-CLASH": "Critical"}


def _xyz(tag: str, v) -> str:
    return f"<{tag}><X>{v[0]:.4f}</X><Y>{v[1]:.4f}</Y><Z>{v[2]:.4f}</Z></{tag}>"


def _camera(at_mm) -> str:
    """Looking at the spot from above and to one side, in metres as BCF expects."""
    target = [c / 1000.0 for c in at_mm]
    d = (-1.0, 1.0, -0.8)
    n = sum(x * x for x in d) ** 0.5
    d = tuple(x / n for x in d)
    eye = tuple(t - x * 1.6 for t, x in zip(target, d))
    side = (d[1], -d[0], 0.0)                     # direction × Z
    up = (side[1] * d[2] - side[2] * d[1], side[2] * d[0] - side[0] * d[2], side[0] * d[1] - side[1] * d[0])
    m = sum(x * x for x in up) ** 0.5
    up = tuple(x / m for x in up)
    return (f"<PerspectiveCamera>{_xyz('CameraViewPoint', eye)}{_xyz('CameraDirection', d)}"
            f"{_xyz('CameraUpVector', up)}<FieldOfView>60</FieldOfView></PerspectiveCamera>")


def export_bcf(joint: Joint, report: Report, path: str | Path, fix_note: str | None = None,
               author: str = "RebarTwin") -> int:
    """Write one topic per failing finding. Returns the number of topics."""
    now = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    buf = io.BytesIO()
    count = 0
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("bcf.version", '<?xml version="1.0" encoding="UTF-8"?>\n<Version VersionId="2.1" '
                   'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><DetailedVersion>2.1</DetailedVersion>'
                   '</Version>')
        for finding in report.failures:
            count += 1
            topic = str(stable_uuid(joint.id, "topic", finding.key))
            view = str(stable_uuid(joint.id, "view", finding.key))
            rule = CATALOGUE[finding.rule]
            desc = (f"{finding.message}. Measured {finding.measured:g} {finding.unit}, limit {finding.compare} "
                    f"{finding.limit:g} {finding.unit} ({finding.clause}). Basis: {rule.basis}")
            comments = [(author, "Found by geometry and arithmetic on the drawing's own numbers, not by a model. "
                                 "Advisory: the engineer of record decides.")]
            if fix_note:
                comments.append((author, fix_note))
            markup = ['<?xml version="1.0" encoding="UTF-8"?>\n<Markup xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
                      f'<Topic Guid="{topic}" TopicType="Issue" TopicStatus="Open">',
                      f"<Title>{escape(joint.id)}: {escape(finding.title)}</Title>",
                      f"<Priority>{PRIORITY.get(finding.rule, 'Major')}</Priority>",
                      f"<Labels>{escape(finding.clause)}</Labels><Labels>{escape(finding.rule)}</Labels>",
                      f"<CreationDate>{now}</CreationDate><CreationAuthor>{escape(author)}</CreationAuthor>",
                      f"<Description>{escape(desc)}</Description></Topic>"]
            for who, text in comments:
                markup.append(f'<Comment Guid="{stable_uuid(topic, text)}"><Date>{now}</Date><Author>{escape(who)}'
                              f'</Author><Comment>{escape(text)}</Comment><Viewpoint Guid="{view}"/></Comment>')
            markup.append(f'<Viewpoints Guid="{view}"><Viewpoint>viewpoint.bcfv</Viewpoint></Viewpoints></Markup>')
            z.writestr(f"{topic}/markup.bcf", "".join(markup))
            ids = [ifc_guid(joint.id, b) for b in finding.bars] or [ifc_guid(joint.id, m) for m in finding.members]
            comps = "".join(f'<Component IfcGuid="{g}"/>' for g in ids)
            colours = "".join(f'<Color Color="FFD0342C"><Component IfcGuid="{g}"/></Color>' for g in ids)
            camera = _camera(finding.at or (0.0, 0.0, 0.0))
            z.writestr(f"{topic}/viewpoint.bcfv",
                       f'<?xml version="1.0" encoding="UTF-8"?>\n<VisualizationInfo Guid="{view}" '
                       'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><Components>'
                       f'<Selection>{comps}</Selection><Visibility DefaultVisibility="true"/>'
                       f"<Coloring>{colours}</Coloring></Components>{camera}</VisualizationInfo>")
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_bytes(buf.getvalue())
    return count
