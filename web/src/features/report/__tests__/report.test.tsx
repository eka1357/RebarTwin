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

    expect(screen.getByRole("heading", { name: /Printable Joint Report/i })).toBeInTheDocument();
    expect(screen.getByText(/Zone II \(IS 13920 off\)/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Fails 6 checks/i })).toBeInTheDocument();
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
});
