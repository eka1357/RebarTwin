import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import demoBundleRaw from "../../../../public/demo/C4xB12/bundle.json";
import { ifcToThree } from "../../../lib/coords";
import { formatFixToastSummary, NBSP } from "../../../lib/format";
import type { Bundle } from "../../../types/bundle";
import { FixPanel } from "../../fixes/FixPanel";
import { SectionGlyph } from "../../fixes/SectionGlyph";
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
});
