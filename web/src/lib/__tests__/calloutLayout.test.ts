import { describe, expect, it } from "vitest";
import { resolveCalloutLayout, type PlacedCallout } from "../calloutLayout";

function hasAnyOverlap(placed: PlacedCallout[]): boolean {
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i];
      const b = placed[j];
      const sepX = a.lx + a.width <= b.lx || b.lx + b.width <= a.lx;
      const sepY = a.ly + a.height <= b.ly || b.ly + b.height <= a.ly;
      if (!sepX && !sepY) return true;
    }
  }
  return false;
}

describe("calloutLayout", () => {
  it("resolves 4 coinciding spacing anchors and 2 clash anchors with zero overlap", () => {
    const inputs = [
      { id: 0, ax: 240, ay: 300, width: 220, height: 26 },
      { id: 1, ax: 240, ay: 300, width: 220, height: 26 },
      { id: 2, ax: 240, ay: 300, width: 220, height: 26 },
      { id: 3, ax: 240, ay: 300, width: 220, height: 26 },
      { id: 18, ax: 430, ay: 300, width: 175, height: 26 },
      { id: 19, ax: 390, ay: 304, width: 175, height: 26 },
    ];

    const placed = resolveCalloutLayout(inputs, { width: 880, height: 640 });
    expect(placed).toHaveLength(6);
    expect(hasAnyOverlap(placed)).toBe(false);

    for (const p of placed) {
      expect(p.lx).toBeGreaterThanOrEqual(10);
      expect(p.ly).toBeGreaterThanOrEqual(10);
      expect(p.lx + p.width).toBeLessThanOrEqual(870);
      expect(p.ly + p.height).toBeLessThanOrEqual(590);
    }
  });

  it("handles up to 8 clustered pills cleanly on compact portrait screens", () => {
    const inputs = Array.from({ length: 8 }, (_, id) => ({
      id,
      ax: 160,
      ay: 180 + id * 2,
      width: 210,
      height: 24,
    }));

    const placed = resolveCalloutLayout(inputs, { width: 320, height: 360 });
    expect(placed).toHaveLength(8);
    expect(hasAnyOverlap(placed)).toBe(false);
  });
});
