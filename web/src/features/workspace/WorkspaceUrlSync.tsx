import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router";
import { useWorkspaceStore } from "../../stores/workspace";
import type { Bundle } from "../../types/bundle";

/**
 * Syncs `?f=<findingIndex>` and `?o=<optionIndex>` in workspace routes and resets
 * transient selection, Before/After mode, and replay state when switching joints,
 * including across route unmounts/remounts.
 */
export function WorkspaceUrlSync({ bundle }: { bundle: Bundle }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const hydratedJointRef = useRef<string | null>(null);

  const activeJointKey = useWorkspaceStore((s) => s.activeJointKey);
  const selectedFindingIndex = useWorkspaceStore((s) => s.selectedFindingIndex);
  const mode = useWorkspaceStore((s) => s.mode);
  const optionIndex = useWorkspaceStore((s) => s.optionIndex);

  const syncJointContext = useWorkspaceStore((s) => s.syncJointContext);
  const selectFinding = useWorkspaceStore((s) => s.selectFinding);
  const selectBar = useWorkspaceStore((s) => s.selectBar);
  const setMode = useWorkspaceStore((s) => s.setMode);
  const setOptionIndex = useWorkspaceStore((s) => s.setOptionIndex);
  const setInspectorTab = useWorkspaceStore((s) => s.setInspectorTab);

  const jointKey = `${bundle.joint.id}|${bundle.report.seismic_zone}`;

  // Reset stale transient state on joint change (even across routes) and hydrate ?f= / ?o=
  useEffect(() => {
    if (hydratedJointRef.current === jointKey) return;
    syncJointContext(jointKey);
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
    syncJointContext,
    selectBar,
    selectFinding,
    setInspectorTab,
    setMode,
    setOptionIndex,
  ]);

  // Write ?f= and ?o= back to URL only once store state belongs to this jointKey
  useEffect(() => {
    if (
      hydratedJointRef.current !== jointKey ||
      activeJointKey !== jointKey ||
      useWorkspaceStore.getState().activeJointKey !== jointKey
    ) {
      return;
    }
    const desiredF = selectedFindingIndex !== null ? String(selectedFindingIndex) : null;
    const desiredO =
      mode === "after" && bundle.fix.options[optionIndex] ? String(optionIndex) : null;

    setSearchParams(
      (prev) => {
        const currentF = prev.get("f");
        const currentO = prev.get("o");
        if (currentF === desiredF && currentO === desiredO) return prev;
        const next = new URLSearchParams(prev);
        if (desiredF !== null) next.set("f", desiredF);
        else next.delete("f");
        if (desiredO !== null) next.set("o", desiredO);
        else next.delete("o");
        return next;
      },
      { replace: true },
    );
  }, [
    activeJointKey,
    bundle.fix.options,
    jointKey,
    mode,
    optionIndex,
    selectedFindingIndex,
    setSearchParams,
  ]);

  return null;
}
