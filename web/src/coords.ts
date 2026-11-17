import type { Finding, Vec3 } from "./types";

/** Scale from millimetres (IFC / engine coordinates) to metres (three.js scene units). */
export const MM_TO_M = 0.001;

/**
 * Convert an engine/IFC point in millimetres, Z-up `(x, y, z)`
 * into three.js Y-up metres `(x, z, -y) * 0.001`.
 * Matches `web-ifc`'s built-in `flatTransformation` axis & unit transform.
 */
export function ifcToThree(pt: Vec3): Vec3 {
  return [pt[0] * MM_TO_M, pt[2] * MM_TO_M, -pt[1] * MM_TO_M];
}

export function formatNumber(v: number): string {
  const rounded = Math.round(v * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/**
 * Format a finding's 3D callout directly from engine numbers, e.g.:
 *   "16 mm, needs 25 mm, IS 456:2000 cl. 26.3.2"
 *   "-18 mm (overlap), needs >= 0 mm, Geometry"
 */
export function formatFindingLabel(f: Finding): string {
  const measured = `${formatNumber(f.measured)} ${f.unit}`;
  const need = `${f.compare === "<=" ? "≤ " : ""}${formatNumber(f.limit)} ${f.unit}`;
  const suffix = f.rule === "GEOM-CLASH" && f.measured < 0 ? " (overlap)" : "";
  const shortClause = f.clause.replace(":2000", "").replace(":2016", "");
  return `${measured}${suffix}, needs ${need}, ${shortClause}`;
}
