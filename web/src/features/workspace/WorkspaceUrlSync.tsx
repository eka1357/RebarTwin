import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router";
import { useWorkspaceStore } from "../../stores/workspace";
import type { Bundle } from "../../types/bundle";

/**
 * Syncs `?f=<findingIndex>` and `?o=<optionIndex>` in workspace routes and resets
 * transient selection, Before/After mode, and replay state when switching joints.
 */
export function WorkspaceUrlSync({ bundle }: { bundle: Bundle }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const prevJointRef = useRef<string | null>(null);
  const hydratedJointRef = useRef<string | null>(null);

  const selectedFindingIndex = useWorkspaceStore((s) => s.selectedFindingIndex);
  const mode = useWorkspaceStore((s) => s.mode);
  const optionIndex = useWorkspaceStore((s) => s.optionIndex);

  const selectFinding = useWorkspaceStore((s) => s.selectFinding);
  const selectBar = useWorkspaceStore((s) => s.selectBar);
  const setMode = useWorkspaceStore((s) => s.setMode);
  const setOptionIndex = useWorkspaceStore((s) => s.setOptionIndex);
  const setInspectorTab = useWorkspaceStore((s) => s.setInspectorTab);
  const setReplay = useWorkspaceStore((s) => s.setReplay);
  const clearSelection = useWorkspaceStore((s) => s.clearSelection);

  const jointKey = `${bundle.joint.id}|${bundle.report.seismic_zone}`;

  // Reset stale transient state when navigating between different joints
  useEffect(() => {
    if (prevJointRef.current !== null && prevJointRef.current !== jointKey) {
      clearSelection();
      setMode("before");
      setOptionIndex(0);
      setReplay({ replayPlaying: false, replayIndex: 0 });
    }
    prevJointRef.current = jointKey;
  }, [jointKey, clearSelection, setMode, setOptionIndex, setReplay]);

  // Hydrate ?f= and ?o= when bundle arrives
  useEffect(() => {
    if (hydratedJointRef.current === jointKey) return;
    hydratedJointRef.current = jointKey;

    const fParam = searchParams.get("f");
    if (fParam !== null) {
      const idx = Number.parseInt(fParam, 10);
      if (Number.isInteger(idx) && idx >= 0 && bundle.report.findings[idx]) {
        selectFinding(idx);
        selectBar(bundle.report.findings[idx].bars[0] ?? null);
      }
    }

    const oParam = searchParams.get("o");
    if (oParam !== null) {
      const optIdx = Number.parseInt(oParam, 10);
      if (Number.isInteger(optIdx) && optIdx >= 0 && optIdx < bundle.fix.options.length) {
        setOptionIndex(optIdx);
        setMode("after");
        setInspectorTab("fix");
      }
    }
  }, [
    bundle,
    jointKey,
    searchParams,
    selectBar,
    selectFinding,
    setInspectorTab,
    setMode,
    setOptionIndex,
  ]);

  // Write ?f= and ?o= back to URL
  useEffect(() => {
    if (hydratedJointRef.current !== jointKey) return;
    const currentF = searchParams.get("f");
    const desiredF = selectedFindingIndex !== null ? String(selectedFindingIndex) : null;
    const currentO = searchParams.get("o");
    const desiredO =
      mode === "after" && bundle.fix.options[optionIndex] ? String(optionIndex) : null;

    if (currentF === desiredF && currentO === desiredO) return;

    const next = new URLSearchParams(searchParams);
    if (desiredF !== null) next.set("f", desiredF);
    else next.delete("f");

    if (desiredO !== null) next.set("o", desiredO);
    else next.delete("o");

    setSearchParams(next, { replace: true });
  }, [
    bundle.fix.options,
    jointKey,
    mode,
    optionIndex,
    searchParams,
    selectedFindingIndex,
    setSearchParams,
  ]);

  return null;
}
