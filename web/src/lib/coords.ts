export type Vec3 = [number, number, number];

/** Scale from millimetres (IFC / engine coordinates) to metres (three.js scene units). */
export const MM_TO_M = 0.001;

/**
 * Convert an engine/IFC point in millimetres, Z-up `(x, y, z)`
 * into three.js Y-up metres `(x, z, -y) * 0.001`.
 */
export function ifcToThree(pt: Vec3): Vec3 {
  return [pt[0] * MM_TO_M, pt[2] * MM_TO_M, -pt[1] * MM_TO_M];
}
