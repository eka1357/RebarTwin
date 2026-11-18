import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import demoBundleRaw from "../../../../public/demo/C4xB12/bundle.json";
import demoZone3Raw from "../../../../public/demo/C4xB12-zone3/bundle.json";
import type { Bundle } from "../../../types/bundle";
import { PrePourReport } from "../PrePourReport";

const EXPORTS = {
  jointIfc: "/demo/C4xB12/joint.ifc",
  fixedIfc: "/demo/C4xB12/fixed.ifc",
  issuesBcf: "/demo/C4xB12/issues.bcf",
};

describe("W11 PrePourReport", () => {
  it("renders Zone II worked example header, verdict, failing checks, top fix, assumptions, provenance note, sign-off, and export links", () => {
    const bundle = demoBundleRaw as unknown as Bundle;

    render(
      <PrePourReport
        projectName="C4 × B12 Worked Example (c4-b12)"
        bundle={bundle}
        chosenOptionIndex={0}
        selectedExplicitly={false}
        exports={EXPORTS}
      />,
    );

    expect(screen.getByRole("heading", { name: /Pre-pour check · C4 × B12/i })).toBeInTheDocument();
    expect(screen.getAllByText(/IS 13920 is off in zone II/i)).toHaveLength(2);
    expect(screen.getByText(/Zone II \(IS 13920 off\)/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Fails 6 checks/i })).toBeInTheDocument();
    expect(
      screen.getByText(
        /B12 top bars 1-2, 2-3, 3-4 and 4-5 are 16\s*mm apart; IS 456 cl\. 26\.3\.2 needs 25\s*mm/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/C4 column bars 4 and 8 run into B12 top bar 3/i)).toBeInTheDocument();
    expect(screen.getByText(/Passes every check that applies once applied\. IS 13920 is off in zone II\./i)).toBeInTheDocument();
    expect(screen.getByText(/1,571 → 1,610/i)).toBeInTheDocument();
    expect(screen.getByText(/Top ranked/i)).toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: /Beam B12 top face cross-section/i })).toHaveLength(2);
    expect(screen.getAllByText(/recheck/i).length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByText(/Assumed, because the deck gives neither: bottom bars 4-16/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/This worked example was typed in from the pitch deck\./i),
    ).toBeInTheDocument();
    expect(screen.getByText("Checked by")).toBeInTheDocument();
    expect(screen.getByText("Engineer of record")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "joint.ifc" })).toHaveAttribute(
      "href",
      "/demo/C4xB12/joint.ifc",
    );
    expect(screen.getByRole("link", { name: "fixed.ifc" })).toHaveAttribute(
      "href",
      "/demo/C4xB12/fixed.ifc",
    );
    expect(screen.getByRole("link", { name: "issues.bcf" })).toHaveAttribute(
      "href",
      "/demo/C4xB12/issues.bcf",
    );
  });

  it("renders Zone III redesign report with chosen option badge and engineer of record warning", () => {
    const bundle = demoZone3Raw as unknown as Bundle;

    render(
      <PrePourReport
        projectName="C4 × B12 Worked Example (c4-b12)"
        bundle={bundle}
        chosenOptionIndex={1}
        selectedExplicitly={true}
        exports={{
          jointIfc: "/demo/C4xB12-zone3/joint.ifc",
          fixedIfc: "/demo/C4xB12-zone3/fixed.ifc",
          issuesBcf: "/demo/C4xB12-zone3/issues.bcf",
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: /Fails 7 checks/i })).toBeInTheDocument();
    expect(screen.getByText(/Zone III \(IS 13920 on\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Option #2 · Selected in workspace/i)).toBeInTheDocument();
    expect(screen.getAllByText(/engineer of record/i).length).toBeGreaterThanOrEqual(2);
  });

  it("renders Passes every check, provenance Agreed/Resolved/OCR rows, and default assumptions", () => {
    const base = demoBundleRaw as unknown as Bundle;
    const passingWithProv: Bundle = {
      ...base,
      report: {
        ...base.report,
        findings: base.report.findings.filter((f) => f.status === "pass"),
      },
      fix: {
        ...base.fix,
        status: "clean",
        summary: "Passes every check.",
        options: [],
      },
      provenance: [
        {
          path: "column.main",
          member: "C4",
          field: "main",
          layer: null,
          level: "FOUNDATION TO FIRST FLOOR",
          page: 2,
          box_2d: [100, 100, 200, 200],
          text: "8-16",
          gemini: "8-16",
          parser: "8-16",
          status: "agreed",
          ocr_raw: "4016",
          page_image: "pages/page-2.png",
        },
        {
          path: "beams[0].top[0].bars",
          member: "B12",
          field: "top",
          layer: 1,
          level: null,
          page: 4,
          box_2d: [220, 300, 260, 420],
          text: "4-20",
          gemini: "4-20",
          parser: "4-20",
          status: "resolved",
          ocr_raw: null,
          page_image: "pages/page-4.png",
        },
        {
          path: "settings.aggregate",
          member: null,
          field: null,
          layer: null,
          level: null,
          page: null,
          box_2d: null,
          text: null,
          gemini: null,
          parser: "20 mm",
          status: "default",
          ocr_raw: null,
          page_image: null,
        },
      ],
    };

    render(
      <PrePourReport
        projectName="Hostel Block B"
        projectPdf="struct.pdf"
        reportDateIso="2026-11-18T10:00:00Z"
        bundle={passingWithProv}
        chosenOptionIndex={0}
        selectedExplicitly={false}
        exports={{ ...EXPORTS, fixedIfc: null }}
      />,
    );

    expect(screen.getByRole("heading", { name: /Passes every check/i })).toBeInTheDocument();
    expect(screen.getByText(/Page 2, Page 4/i)).toBeInTheDocument();
    expect(screen.getByText("Agreed")).toBeInTheDocument();
    expect(screen.getByText("Resolved")).toBeInTheDocument();
    expect(screen.getByText(/Storey: FOUNDATION TO FIRST FLOOR/i)).toBeInTheDocument();
    expect(screen.getByText("OCR read '4016'")).toBeInTheDocument();
    expect(screen.getByText("Assumed, not on the drawing")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "fixed.ifc" })).not.toBeInTheDocument();
  });

  it("renders mixed corner and face column bars in PrePourReport and SectionGlyph from scene bars", () => {
    const base = demoBundleRaw as unknown as Bundle;
    const mixedColBars = base.scene.bars.map((bar, idx) =>
      bar.member === base.joint.column.id ? { ...bar, dia: idx % 2 === 0 ? 16 : 12 } : bar,
    );
    const mixedBundle: Bundle = {
      ...base,
      joint: {
        ...base.joint,
        column: {
          ...base.joint.column,
          id: "C1",
          n_bars: 8,
          bar_dia: 16,
          face_dia: 12,
        },
      },
      scene: {
        ...base.scene,
        concrete: base.scene.concrete.map((c) =>
          c.kind === "column" ? { ...c, id: "C1" } : c,
        ),
        bars: mixedColBars.map((b) =>
          b.member === base.joint.column.id ? { ...b, member: "C1" } : b,
        ),
      },
    };

    render(
      <PrePourReport
        projectName="Mixed Column Check"
        bundle={mixedBundle}
        chosenOptionIndex={0}
        selectedExplicitly={false}
        exports={EXPORTS}
      />,
    );

    expect(screen.getAllByText(/4-16 corners \+ 4-12 faces/i).length).toBeGreaterThanOrEqual(2);
    const colSvg = screen.getByRole("img", {
      name: /Column C1 cross-section: 4 bars of 16 millimetres, 4 bars of 12 millimetres/i,
    });
    expect(colSvg).toBeInTheDocument();
  });

  it("renders place_face_bars fixes cleanly in PrePourReport without labeling them Redesign", () => {
    const base = demoBundleRaw as unknown as Bundle;
    const colBars = base.scene.bars.map((bar, idx) =>
      bar.member === base.joint.column.id
        ? { ...bar, member: "C1", dia: idx % 2 === 0 ? 16 : 12 }
        : bar,
    );
    const fixedPlacementBundle: Bundle = {
      ...base,
      joint: {
        ...base.joint,
        column: {
          ...base.joint.column,
          id: "C1",
          n_bars: 8,
          bar_dia: 16,
          face_dia: 12,
        },
      },
      fix: {
        status: "fixed",
        summary: "Passes without a redesign.",
        attempts: [],
        blocking: {},
        options: [
          {
            candidate: {
              title: "XB17 top: 2-16 in layer 1, 2-12 in layer 2; C1 face bars at y = -40, 40 mm",
              source: "enumerator",
              rationale: "move face bars clear of beam bars",
              edits: [
                { kind: "set_face", beam: "B12", face: "top", layers: ["2-16", "2-12"] },
                { kind: "place_face_bars", along_y: [-40, 40] },
              ],
            },
            faces: base.fix.options[0].faces,
            column: "C1 face bars at y = -40, 40 mm",
            flags: [
              "C1's 12 mm face bars placed at y = -40, 40 mm from its centre line (the schedule does not dimension them), each at least 5 mm clear of the beams' bars: a placing tolerance chosen here, not a code rule. Show these positions on the drawing.",
            ],
          },
        ],
      },
      scene: {
        ...base.scene,
        concrete: base.scene.concrete.map((c) => (c.kind === "column" ? { ...c, id: "C1" } : c)),
        bars: colBars,
      },
      option_scenes: [
        {
          ...base.scene,
          concrete: base.scene.concrete.map((c) => (c.kind === "column" ? { ...c, id: "C1" } : c)),
          bars: colBars.map((b) => (b.member === "C1" ? { ...b, status: "pass" as const } : b)),
        },
      ],
    };

    render(
      <PrePourReport
        projectName="Placement Check"
        bundle={fixedPlacementBundle}
        chosenOptionIndex={0}
        selectedExplicitly={false}
        exports={EXPORTS}
      />,
    );

    expect(screen.queryByText(/^Redesign$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Redesign: column section changes/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Column face bars:/i)).toBeInTheDocument();
    expect(screen.getAllByText(/C1 face bars at y = -40, 40 mm/i).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/placing tolerance chosen here, not a code rule/i)).toBeInTheDocument();
  });
});
