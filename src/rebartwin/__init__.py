"""RebarTwin: rebuilds the steel at a beam-column joint in 3D from the drawing's numbers and proves, with geometry,
which IS 456 and IS 13920 detailing rules it breaks, then finds fixes that pass every rule. Advisory: the engineer
of record decides."""
from .check import Report, check
from .fixes import Candidate, Enumerator, FixResult, Proposer, ResizeColumn, SetFace, apply, feedback_lines, resolve
from .model import Beam, Column, Joint, Layer, Settings

__version__ = "0.1.0"
__all__ = ["Beam", "Candidate", "Column", "Enumerator", "FixResult", "Joint", "Layer", "Proposer", "Report",
           "ResizeColumn", "SetFace", "Settings", "apply", "check", "feedback_lines", "resolve"]
