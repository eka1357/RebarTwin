import { describe, expect, it } from "vitest";
import { describeFindingCardLabel } from "../a11y";
import {
  describeToleranceGauge,
  formatArea,
  formatBarMark,
  formatCalloutValue,
  formatClause,
  formatFindingValue,
  formatFixToastSummary,
  formatMeasure,
  formatNumber,
  formatOverlap,
  formatPercentDelta,
  NBSP,
} from "../format";
import { jointPath } from "../routes";

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

  it("formats clauses, bar marks, callouts, and percent deltas", () => {
    expect(formatClause("IS 456:2000 cl. 26.3.2")).toBe("IS 456 cl. 26.3.2");
    expect(formatClause("IS 13920:2016 cl. 7.1.1")).toBe("IS 13920 cl. 7.1.1");
    expect(formatBarMark("B12/T1-3", 20)).toBe("T1-3 ⌀20");
    expect(formatPercentDelta(2.5)).toBe("+2.5%");
    expect(
      formatCalloutValue({
        rule: "IS456-26.3.2-H",
        measured: 16,
        limit: 25,
        compare: ">=",
        unit: "mm",
        status: "fail",
      }),
    ).toBe(`16${NBSP}mm · needs 25`);
    expect(
      formatCalloutValue({
        rule: "GEOM-CLASH",
        measured: -18,
        limit: 0,
        compare: ">=",
        unit: "mm",
        status: "fail",
      }),
    ).toBe(`18${NBSP}mm overlap`);
  });

  it("describes tolerance gauges from signed engine margins", () => {
    expect(
      describeToleranceGauge({
        rule: "IS456-26.3.2-H",
        measured: 16,
        limit: 25,
        compare: ">=",
        margin: -9,
        unit: "mm",
        status: "fail",
      }),
    ).toBe("16 millimetres; needs at least 25; short by 9 mm");

    expect(
      describeToleranceGauge({
        rule: "GEOM-CLASH",
        measured: -18,
        limit: 0,
        compare: ">=",
        margin: -18,
        unit: "mm",
        status: "fail",
      }),
    ).toBe("18 millimetres overlap; zero clearance allowed");

    expect(
      describeToleranceGauge({
        rule: "IS456-26.3.2-H",
        measured: 33.333,
        limit: 25,
        compare: ">=",
        margin: 8.333,
        unit: "mm",
        status: "pass",
      }),
    ).toBe("33 millimetres; needs at least 25; passes with 8 mm margin");
  });

  it("formats fix toast summaries from engine before/after fields, card labels, and encoded @ joint paths", () => {
    expect(
      formatFixToastSummary([
        { area_before: 1570.8, area_provided: 1610.1, n_bars_before: 5, n_bars: 4 },
      ]),
    ).toBe(`1,571 → 1,610${NBSP}mm² · 5 bars → 4`);

    expect(
      describeFindingCardLabel({
        rule: "IS456-26.3.2-H",
        clause: "IS 456:2000 cl. 26.3.2",
        status: "fail",
        measured: 16,
        limit: 25,
        compare: ">=",
        unit: "mm",
        message: "B12 top bars 1 and 2 are 16 mm apart; with 20 mm aggregate and 20 mm bars the code needs 25 mm",
      }),
    ).toBe("Fails: B12 top bars 1 and 2 are 16 mm apart, need 25 mm, IS 456 clause 26.3.2");

    expect(jointPath("p1", "C4xB12@FIRST")).toBe("/projects/p1/joints/C4xB12%40FIRST");
  });
});
