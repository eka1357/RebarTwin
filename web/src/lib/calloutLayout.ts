export interface CalloutInput {
  id: number;
  ax: number;
  ay: number;
  width: number;
  height: number;
}

export interface PlacedCallout {
  id: number;
  ax: number;
  ay: number;
  lx: number;
  ly: number;
  width: number;
  height: number;
  ex: number;
  ey: number;
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const GAP = 6;
const EDGE_PAD = 10;
const BOTTOM_SAFE_PAD = 50;

function overlaps(a: Box, b: Box): boolean {
  return a.x0 < b.x1 + GAP && a.x1 + GAP > b.x0 && a.y0 < b.y1 + GAP && a.y1 + GAP > b.y0;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

/**
 * Resolve non-overlapping 2D pill positions near each projected 3D anchor.
 * Preserves stable vertical/horizontal stack order across frames and keeps all
 * labels inside the visible viewport above the bottom legend strip.
 */
export function resolveCalloutLayout(
  items: CalloutInput[],
  canvasSize: { width: number; height: number },
): PlacedCallout[] {
  const cw = Math.max(canvasSize.width, 280);
  const ch = Math.max(canvasSize.height, 220);
  const maxBottom = Math.max(EDGE_PAD + 40, ch - BOTTOM_SAFE_PAD);

  const sorted = [...items].sort((a, b) => a.ay - b.ay || a.ax - b.ax || a.id - b.id);
  const placedBoxes: Box[] = [];
  const results: PlacedCallout[] = [];

  for (const item of sorted) {
    const w = Math.min(Math.max(item.width, 80), cw - EDGE_PAD * 2);
    const h = Math.max(item.height, 22);
    const minX = EDGE_PAD;
    const maxX = Math.max(minX, cw - EDGE_PAD - w);
    const minY = EDGE_PAD;
    const maxY = Math.max(minY, maxBottom - h);

    const stepY = h + GAP;
    const shiftX = Math.min(w * 0.52 + 16, cw * 0.28);
    const idealX = clamp(item.ax - w / 2, minX, maxX);
    const idealY = clamp(item.ay - h / 2 - 16, minY, maxY);

    // Candidate slots: (1) right above anchor, (2) flush above/below existing boxes in same x-column,
    // (3) outward side columns, (4) clean vertical step offsets around idealY.
    const candidates: Array<[number, number]> = [[idealX, idealY]];
    const flushYs: number[] = [];
    for (const b of placedBoxes) {
      if (idealX < b.x1 + GAP && idealX + w + GAP > b.x0) {
        flushYs.push(b.y0 - stepY, b.y1 + GAP);
      }
    }
    flushYs.sort((a, b) => Math.abs(a - idealY) - Math.abs(b - idealY));
    for (const fy of flushYs) {
      if (fy >= minY && fy <= maxY) {
        candidates.push([idealX, fy]);
      }
    }
    for (let k = 1; k <= 12; k++) {
      candidates.push(
        [idealX, clamp(idealY - k * stepY, minY, maxY)],
        [idealX, clamp(idealY + k * stepY, minY, maxY)],
      );
    }
    for (let k = 0; k <= 10; k++) {
      const signY = k % 2 === 0 ? -1 : 1;
      const row = Math.ceil(k / 2);
      const yCand = clamp(idealY + signY * row * stepY, minY, maxY);
      candidates.push([clamp(idealX - shiftX, minX, maxX), yCand], [clamp(idealX + shiftX, minX, maxX), yCand]);
    }

    let chosen: Box | null = null;
    for (const [lx, ly] of candidates) {
      const box: Box = { x0: lx, y0: ly, x1: lx + w, y1: ly + h };
      if (!placedBoxes.some((other) => overlaps(box, other))) {
        chosen = box;
        break;
      }
    }

    // Exact flush-to-neighbor vertical slots + fine sweep fallback to prevent 2px wasted fragments.
    if (!chosen) {
      const yCandidates = new Set<number>([minY, maxY]);
      for (const b of placedBoxes) {
        const below = b.y1 + GAP;
        const above = b.y0 - h - GAP;
        if (below >= minY && below <= maxY) yCandidates.add(below);
        if (above >= minY && above <= maxY) yCandidates.add(above);
      }
      for (let y = minY; y <= maxY; y += 6) {
        yCandidates.add(y);
      }
      const sortedYs = [...yCandidates].sort((a, b) => Math.abs(a - (item.ay - h / 2)) - Math.abs(b - (item.ay - h / 2)));
      const xCandidates = [
        clamp(item.ax - w / 2, minX, maxX),
        minX,
        maxX,
        clamp(cw / 2 - w / 2, minX, maxX),
      ];
      outer: for (const y of sortedYs) {
        for (const xCand of xCandidates) {
          const box: Box = { x0: xCand, y0: y, x1: xCand + w, y1: y + h };
          if (!placedBoxes.some((other) => overlaps(box, other))) {
            chosen = box;
            break outer;
          }
        }
      }
    }

    const finalBox = chosen ?? {
      x0: clamp(item.ax - w / 2, minX, maxX),
      y0: clamp(item.ay - h / 2, minY, maxY),
      x1: clamp(item.ax - w / 2, minX, maxX) + w,
      y1: clamp(item.ay - h / 2, minY, maxY) + h,
    };

    placedBoxes.push(finalBox);
    const ex = clamp(item.ax, finalBox.x0, finalBox.x1);
    const ey = clamp(item.ay, finalBox.y0, finalBox.y1);

    results.push({
      id: item.id,
      ax: item.ax,
      ay: item.ay,
      lx: Math.round(finalBox.x0 * 10) / 10,
      ly: Math.round(finalBox.y0 * 10) / 10,
      width: w,
      height: h,
      ex: Math.round(ex * 10) / 10,
      ey: Math.round(ey * 10) / 10,
    });
  }

  return results;
}
