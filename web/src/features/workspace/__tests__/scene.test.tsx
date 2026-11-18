import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import demoBundleRaw from "../../../../public/demo/C4xB12/bundle.json";
import { ifcToThree } from "../../../lib/coords";
import { formatFixToastSummary, NBSP } from "../../../lib/format";
import type { Bundle } from "../../../types/bundle";
import { DemoTour } from "../../demo/DemoTour";
import { FixPanel } from "../../fixes/FixPanel";
import { SectionGlyph } from "../../fixes/SectionGlyph";
import { resolveBundlePageImageUrl } from "../../../lib/routes";
import { WorkingsTimeline } from "../../workings/WorkingsTimeline";
import { partitionSceneBars } from "../sceneMorph";
import { JointInspector } from "../JointInspector";
import { SourceCrop } from "../../source/SourceCrop";

describe("W3 Scene & Demo Bundle", () => {
  it("converts IFC mm Z-up coordinates to three.js metres Y-up", () => {
    const a = ifcToThree([-750, 0, -43]);
    expect(a[0]).toBeCloseTo(-0.75, 6);
    expect(a[1]).toBeCloseTo(-0.043, 6);
    expect(a[2]).toBeCloseTo(0, 6);

    const b = ifcToThree([102, -54, 600]);
    expect(b[0]).toBeCloseTo(0.102, 6);
    expect(b[1]).toBeCloseTo(0.6, 6);
    expect(b[2]).toBeCloseTo(0.054, 6);
  });

  it("loads the worked example with 17 bars and 7 failing bars", () => {
    const bundle = demoBundleRaw as unknown as Bundle;

    expect(bundle.scene.bars).toHaveLength(17);
    expect(bundle.scene.bars.filter((b) => b.status === "fail")).toHaveLength(7);

    render(<JointInspector bundle={bundle} />);
    expect(screen.getByText(/17 bars · 7 failing/i)).toBeInTheDocument();
    expect(
      screen.getAllByRole("img", { name: "16 millimetres; needs at least 25; short by 9 mm" }).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByRole("img", { name: "18 millimetres overlap; zero clearance allowed" }).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByRole("button", {
        name: "Fails: B12 top bars 1 and 2 are 16 mm apart, need 25 mm, IS 456 clause 26.3.2",
      }),
    ).toBeInTheDocument();

    // Clicking Source button inside a FindingCard switches tab and shows pitch-deck provenance message
    fireEvent.click(screen.getAllByRole("button", { name: "Source" })[0]);
    expect(
      screen.getByText(/This worked example was typed in from the pitch deck\./i),
    ).toBeInTheDocument();
  });

  it("partitions bars by id for Before -> After morph and renders to-scale SectionGlyphs", () => {
    const bundle = demoBundleRaw as unknown as Bundle;
    const afterScene = bundle.option_scenes[0];
    const part = partitionSceneBars(bundle.scene.bars, afterScene.bars);

    expect(part.matched.length).toBe(14);
    expect(part.removed.map((b) => b.id)).toEqual(["B12/T1-3", "B12/T1-4", "B12/T1-5"]);
    expect(part.added.map((b) => b.id)).toEqual(["B12/T2-1", "B12/T2-2"]);
    expect(formatFixToastSummary(bundle.fix.options[0].faces)).toBe(
      `1,571 → 1,610${NBSP}mm² · 5 bars → 4`,
    );

    render(
      <>
        <SectionGlyph
          scene={afterScene}
          beamId="B12"
          face="top"
          caption="After"
          faceSummary="2-25 / 2-20"
        />
        <FixPanel bundle={bundle} />
      </>,
    );

    expect(
      screen
        .getAllByRole("img", {
          name: /Beam B12 top face cross-section: layer 1 has 2 bars of 25 millimetres, layer 2 has 2 bars of 20 millimetres/i,
        })
        .length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/2-25 over 2-20/i)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Use in report/i })).toHaveLength(3);
  });

  it("replays all attempts with Gemini and Enumerator sources, rationales, rejecting clauses, Failed-only filter, and passing step", () => {
    const bundle = demoBundleRaw as unknown as Bundle;
    const total = bundle.fix.attempts.length;
    const passIdx = bundle.fix.attempts.findIndex((a) => a.passed);
    const enumIdx = bundle.fix.attempts.findIndex((a) => a.candidate.source === "enumerator");
    expect(total).toBeGreaterThanOrEqual(34);
    expect(passIdx).toBeGreaterThanOrEqual(0);
    expect(enumIdx).toBeGreaterThanOrEqual(0);

    render(<WorkingsTimeline bundle={bundle} />);

    expect(screen.getByText(new RegExp(`Attempt 1 of ${total} · Round 1`, "i"))).toBeInTheDocument();
    expect(screen.getAllByText("Gemini").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Gemini rationale:/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Geometry/i).length).toBeGreaterThanOrEqual(1);

    // Jump to passing attempt (Gemini)
    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(`Attempt ${passIdx + 1} \\(Round 1, Gemini\\): passes`, "i") }),
    );
    expect(screen.getByText(new RegExp(`Attempt ${passIdx + 1} of ${total} · Round 1`, "i"))).toBeInTheDocument();
    expect(screen.getByText(/Passes every IS 456, IS 13920, and geometry check/i)).toBeInTheDocument();

    // Jump to an Enumerator attempt and check source badge
    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(`Attempt ${enumIdx + 1} \\(Round 1, Enumerator\\):`, "i") }),
    );
    expect(screen.getAllByText("Enumerator").length).toBeGreaterThanOrEqual(1);

    // Jump back to passing step, turn on Failed only and step Next -> skips passing steps
    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(`Attempt ${passIdx + 1} \\(Round 1, Gemini\\): passes`, "i") }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Failed only/i }));
    fireEvent.click(screen.getByRole("button", { name: /Next attempt/i }));
    expect(screen.queryByText(/Passes every/i)).not.toBeInTheDocument();
  });

  it("advances DemoTour cleanly through all 5 beats including dynamic attempt count and Zone III switch", () => {
    const bundle = demoBundleRaw as unknown as Bundle;
    const total = bundle.fix.attempts.length;
    const onVariantChange = vi.fn();
    const onClose = vi.fn();

    render(
      <DemoTour
        open={true}
        onClose={onClose}
        variant="zone2"
        onVariantChange={onVariantChange}
        bundle={bundle}
      />,
    );

    expect(screen.getByRole("heading", { name: /Six checks fail/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Next \(Space\)/i }));
    expect(screen.getByRole("heading", { name: /Where each value came from/i })).toBeInTheDocument();
    expect(
      screen.getAllByText(/This worked example was typed in from the pitch deck\./i).length,
    ).toBeGreaterThanOrEqual(1);
    fireEvent.click(screen.getByRole("button", { name: /Next \(Space\)/i }));
    expect(screen.getByRole("heading", { name: /A fix that passes every rule/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Next \(Space\)/i }));
    expect(screen.getByRole("heading", { name: /Every attempt, shown/i })).toBeInTheDocument();
    expect(
      screen.getAllByText(new RegExp(`${total} arrangements tried; each failed one`, "i")).length,
    ).toBeGreaterThanOrEqual(1);
    fireEvent.click(screen.getByRole("button", { name: /Next \(Space\)/i }));
    expect(screen.getByRole("heading", { name: /Zone III changes the answer/i })).toBeInTheDocument();
    expect(onVariantChange).toHaveBeenCalledWith("zone3");
    fireEvent.click(screen.getByRole("button", { name: /Finish \(Space\)/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders provenance crops with Agreed, defaults, column storey, OCR raw, and bundle-relative image URLs", () => {
    expect(
      resolveBundlePageImageUrl("pages/page-2.png", "/live/proj/joints/C4xB12%40FIRST/bundle.json"),
    ).toBe("/live/proj/joints/C4xB12%40FIRST/pages/page-2.png");
    expect(
      resolveBundlePageImageUrl("pages/page-2.png", "/api/projects/proj/joints/C4xB12%40FIRST/bundle"),
    ).toBe("/api/projects/proj/joints/C4xB12%40FIRST/pages/page-2.png");

    const base = demoBundleRaw as unknown as Bundle;
    const withProv: Bundle = {
      ...base,
      pages: { "2": "pages/page-2.png" },
      provenance: [
        {
          path: "column.main",
          member: "C4",
          field: "main",
          layer: null,
          level: "FOUNDATION TO FIRST FLOOR",
          page: 2,
          box_2d: [120, 220, 180, 340],
          text: "8-16",
          gemini: "8-16",
          parser: "8-16",
          status: "agreed",
          ocr_raw: "4016",
          page_image: "pages/page-2.png",
        },
        {
          path: "settings.aggregate",
          member: null,
          field: null,
          layer: null,
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
      <SourceCrop
        bundle={withProv}
        focusMember="C4"
        bundleUrl="/live/proj/joints/C4xB12%40FIRST/bundle.json"
      />,
    );

    expect(screen.getByText("Agreed")).toBeInTheDocument();
    expect(screen.queryByText("Passes")).not.toBeInTheDocument();
    expect(screen.getByText(/Storey: FOUNDATION TO FIRST FLOOR/i)).toBeInTheDocument();
    expect(screen.getByText("OCR read '4016'")).toBeInTheDocument();
    expect(screen.getByText("Assumed, not on the drawing")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Drawing sheet page 2/i })).toHaveAttribute(
      "src",
      "/live/proj/joints/C4xB12%40FIRST/pages/page-2.png",
    );
  });
});
