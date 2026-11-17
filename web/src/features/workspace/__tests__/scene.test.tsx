import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import demoBundleRaw from "../../../../public/demo/C4xB12/bundle.json";
import { ifcToThree } from "../../../lib/coords";
import { formatFixToastSummary, NBSP } from "../../../lib/format";
import type { Bundle } from "../../../types/bundle";
import { DemoTour } from "../../demo/DemoTour";
import { FixPanel } from "../../fixes/FixPanel";
import { SectionGlyph } from "../../fixes/SectionGlyph";
import { WorkingsTimeline } from "../../workings/WorkingsTimeline";
import { partitionSceneBars } from "../sceneMorph";
import { JointInspector } from "../JointInspector";

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
      screen.getAllByRole("img", { name: "16 millimetres; needs at least 25; short by 9" }).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByRole("img", { name: "18 millimetres overlap; zero clearance allowed" }).length,
    ).toBeGreaterThanOrEqual(1);

    // Clicking Source button inside a FindingCard switches tab and renders warm paper crop
    fireEvent.click(screen.getAllByRole("button", { name: "Source" })[0]);
    expect(screen.getByText(/Schedule callout/i)).toBeInTheDocument();
  });

  it("partitions bars by id for Before -> After morph and renders to-scale SectionGlyphs", () => {
    const bundle = demoBundleRaw as unknown as Bundle;
    const afterScene = bundle.option_scenes[0];
    const part = partitionSceneBars(bundle.scene.bars, afterScene.bars);

    expect(part.matched.length).toBe(14);
    expect(part.removed.map((b) => b.id)).toEqual(["B12/T1-3", "B12/T1-4", "B12/T1-5"]);
    expect(part.added.map((b) => b.id)).toEqual(["B12/T2-1", "B12/T2-2"]);
    expect(formatFixToastSummary(bundle.fix.options[0].faces)).toBe(
      `+39${NBSP}mm², 4 bars instead of 5`,
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

  it("replays all 34 attempts with rejecting clauses, Failed-only filter, and passing step", () => {
    const bundle = demoBundleRaw as unknown as Bundle;
    render(<WorkingsTimeline bundle={bundle} />);

    expect(screen.getByText(/Attempt 1 of 34 · Round 1/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Geometry/i).length).toBeGreaterThanOrEqual(1);

    // Jump to attempt 7 (first passing option in Zone II)
    fireEvent.click(screen.getByRole("button", { name: /Attempt 7 \(Round 1\): passes/i }));
    expect(screen.getByText(/Attempt 7 of 34 · Round 1/i)).toBeInTheDocument();
    expect(screen.getByText(/Passes every IS 456, IS 13920, and geometry check/i)).toBeInTheDocument();

    // Turn on Failed only and step Next -> skips passing steps to next failing step
    fireEvent.click(screen.getByRole("button", { name: /Failed only/i }));
    fireEvent.click(screen.getByRole("button", { name: /Next attempt/i }));
    expect(screen.queryByText(/Passes every/i)).not.toBeInTheDocument();
  });

  it("advances DemoTour cleanly through all 5 beats including Zone III switch", () => {
    const bundle = demoBundleRaw as unknown as Bundle;
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

    expect(screen.getByRole("heading", { name: /Six failing checks in Zone II/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Next \(Space\)/i }));
    expect(screen.getByRole("heading", { name: /Traced to the drawing schedule crop/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Next \(Space\)/i }));
    expect(screen.getByRole("heading", { name: /Validated 3D fix: 2-25 over 2-20/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Next \(Space\)/i }));
    expect(screen.getByRole("heading", { name: /Every solver attempt explained/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Next \(Space\)/i }));
    expect(screen.getByRole("heading", { name: /Seismic Zone III triggers IS 13920/i })).toBeInTheDocument();
    expect(onVariantChange).toHaveBeenCalledWith("zone3");
    fireEvent.click(screen.getByRole("button", { name: /Finish \(Space\)/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
