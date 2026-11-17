import { describe, expect, it } from "vitest";
import {
  formatArea,
  formatBarMark,
  formatClause,
  formatFindingValue,
  formatMeasure,
  formatNumber,
  formatOverlap,
  formatPercentDelta,
  NBSP,
} from "../format";

describe("format.ts", () => {
  it("uses non-breaking spaces between numbers and units", () => {
    expect(formatMeasure(16, "mm")).toBe(`16${NBSP}mm`);
    expect(formatArea(1610)).toBe(`1,610${NBSP}mm²`);
  });

  it("uses en-IN grouping for larger numbers", () => {
    expect(formatNumber(100000)).toBe("1,00,000");
    expect(formatArea(125430)).toBe(`1,25,430${NBSP}mm²`);
  });

  it("never rounds a failing value onto its limit", () => {
    expect(formatMeasure(24.6, "mm", { limit: 25, compare: ">=", status: "fail" })).toBe(
      `24.6${NBSP}mm`,
    );
    expect(formatMeasure(24.96, "mm", { limit: 25, compare: ">=", status: "fail" })).toBe(
      `24.96${NBSP}mm`,
    );
    expect(formatMeasure(0.4, "mm", { limit: 0, compare: "<=", status: "fail" })).toBe(
      `0.4${NBSP}mm`,
    );
  });

  it("rounds passing lengths to the nearest millimetre", () => {
    expect(formatMeasure(33.333, "mm", { limit: 25, compare: ">=", status: "pass" })).toBe(
      `33${NBSP}mm`,
    );
  });

  it("formats overlaps positively without negative signs", () => {
    expect(formatOverlap(-18)).toBe(`18${NBSP}mm overlap`);
    expect(formatOverlap(-0.4)).toBe(`0.4${NBSP}mm overlap`);
    expect(
      formatFindingValue({
        rule: "GEOM-CLASH",
        measured: -18,
        limit: 0,
        compare: ">=",
        unit: "mm",
        status: "fail",
      }),
    ).toBe(`18${NBSP}mm overlap`);
  });

  it("formats clauses, bar marks, and percent deltas", () => {
    expect(formatClause("IS 456:2000 cl. 26.3.2")).toBe("IS 456 cl. 26.3.2");
    expect(formatClause("IS 13920:2016 cl. 7.1.1")).toBe("IS 13920 cl. 7.1.1");
    expect(formatBarMark("B12/T1-3", 20)).toBe("T1-3 ⌀20");
    expect(formatPercentDelta(2.5)).toBe("+2.5%");
  });
});
