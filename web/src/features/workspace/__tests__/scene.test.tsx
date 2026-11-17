import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import demoBundleRaw from "../../../../public/demo/C4xB12/bundle.json";
import { ifcToThree } from "../../../lib/coords";
import type { Bundle } from "../../../types/bundle";
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
  });
});
