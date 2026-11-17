import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router";
import { useWorkspaceStore } from "../../stores/workspace";

/**
 * Syncs `?a=<attemptNumber>` (1-based) in workspace routes cleanly without
 * coupling WorkingsTimeline unit tests to Router context.
 */
export function ReplayUrlSync({ totalAttempts }: { totalAttempts: number }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const initializedRef = useRef(false);

  const inspectorTab = useWorkspaceStore((s) => s.inspectorTab);
  const replayIndex = useWorkspaceStore((s) => s.replayIndex);
  const replayPlaying = useWorkspaceStore((s) => s.replayPlaying);
  const setReplay = useWorkspaceStore((s) => s.setReplay);
  const setInspectorTab = useWorkspaceStore((s) => s.setInspectorTab);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const raw = searchParams.get("a");
    if (!raw || totalAttempts <= 0) return;
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed >= 1 && parsed <= totalAttempts) {
      setReplay({ replayIndex: parsed - 1, replayPlaying: false });
      setInspectorTab("workings");
    }
  }, [searchParams, totalAttempts, setReplay, setInspectorTab]);

  useEffect(() => {
    if (inspectorTab !== "workings" || replayPlaying || totalAttempts <= 0) return;
    const desired = String(Math.min(Math.max(1, replayIndex + 1), totalAttempts));
    if (searchParams.get("a") === desired) return;
    const next = new URLSearchParams(searchParams);
    next.set("a", desired);
    setSearchParams(next, { replace: true });
  }, [inspectorTab, replayIndex, replayPlaying, totalAttempts, searchParams, setSearchParams]);

  return null;
}
