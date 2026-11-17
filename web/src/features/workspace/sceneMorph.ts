import type { SceneBar } from "../../types/bundle";

export interface MorphPartition {
  matched: Array<{ prev: SceneBar; next: SceneBar }>;
  added: SceneBar[];
  removed: SceneBar[];
}

/** Partition previous and next scene bars strictly by `bar.id` for matched morphing. */
export function partitionSceneBars(prevBars: SceneBar[], nextBars: SceneBar[]): MorphPartition {
  const prevMap = new Map(prevBars.map((b) => [b.id, b]));
  const nextIds = new Set(nextBars.map((b) => b.id));

  const matched: Array<{ prev: SceneBar; next: SceneBar }> = [];
  const added: SceneBar[] = [];
  const removed: SceneBar[] = [];

  for (const next of nextBars) {
    const prev = prevMap.get(next.id);
    if (prev) {
      matched.push({ prev, next });
    } else {
      added.push(next);
    }
  }
  for (const prev of prevBars) {
    if (!nextIds.has(prev.id)) {
      removed.push(prev);
    }
  }

  return { matched, added, removed };
}

export function easeInOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}
