import { useReducedMotion } from "motion/react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { selectCalloutFindings } from "../../lib/calloutLayout";
import { DURATION_MS } from "../../lib/motion";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { useWorkspaceStore } from "../../stores/workspace";
import type { Bundle, Finding } from "../../types/bundle";
import { SceneController } from "./SceneController";
import { ViewportCallouts, type ViewportCalloutsHandle } from "./ViewportCallouts";
import { ViewportToolbar } from "./ViewportToolbar";

const LazyOpenIfcDialog = lazy(() =>
  import("./OpenIfcDialog").then((m) => ({ default: m.OpenIfcDialog })),
);

interface ViewportProps {
  bundle: Bundle;
  ifcUrl?: string;
}

export function Viewport({ bundle, ifcUrl }: ViewportProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasWrapRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<SceneController | null>(null);
  const calloutsRef = useRef<ViewportCalloutsHandle | null>(null);

  const [ifcOpen, setIfcOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const reduced = Boolean(useReducedMotion());
  const theme = useWorkspaceStore((s) => s.theme);
  const mode = useWorkspaceStore((s) => s.mode);
  const optionIndex = useWorkspaceStore((s) => s.optionIndex);
  const inspectorTab = useWorkspaceStore((s) => s.inspectorTab);
  const replayIndex = useWorkspaceStore((s) => s.replayIndex);
  const replayPlaying = useWorkspaceStore((s) => s.replayPlaying);
  const selectedBarId = useWorkspaceStore((s) => s.selectedBarId);
  const hoveredBarId = useWorkspaceStore((s) => s.hoveredBarId);
  const selectedFindingIndex = useWorkspaceStore((s) => s.selectedFindingIndex);
  const frameVersion = useWorkspaceStore((s) => s.frameVersion);
  const concreteMode = useWorkspaceStore((s) => s.concreteMode);
  const labelMode = useWorkspaceStore((s) => s.labelMode);
  const cameraPreset = useWorkspaceStore((s) => s.cameraPreset);

  const selectBar = useWorkspaceStore((s) => s.selectBar);
  const setHoveredBar = useWorkspaceStore((s) => s.setHoveredBar);
  const selectFinding = useWorkspaceStore((s) => s.selectFinding);
  const setInspectorTab = useWorkspaceStore((s) => s.setInspectorTab);
  const setConcreteMode = useWorkspaceStore((s) => s.setConcreteMode);
  const setLabelMode = useWorkspaceStore((s) => s.setLabelMode);
  const setCameraPreset = useWorkspaceStore((s) => s.setCameraPreset);
  const clearSelection = useWorkspaceStore((s) => s.clearSelection);

  const attemptScenesCount = bundle.attempt_scenes?.length ?? 0;
  const isWorkingsActive =
    (inspectorTab === "workings" || replayPlaying) &&
    bundle.fix.attempts.length > 0 &&
    attemptScenesCount > 0;
  const hasAttemptScene = !isWorkingsActive || replayIndex < attemptScenesCount;
  const clampedAttemptSceneIndex =
    isWorkingsActive && attemptScenesCount > 0
      ? Math.min(Math.max(0, replayIndex), attemptScenesCount - 1)
      : -1;

  const activeAttempt = useMemo(() => {
    if (!isWorkingsActive) return null;
    const idx = Math.min(Math.max(0, replayIndex), bundle.fix.attempts.length - 1);
    return bundle.fix.attempts[idx] ?? null;
  }, [bundle.fix.attempts, isWorkingsActive, replayIndex]);

  const clampedOptionIndex =
    bundle.option_scenes.length > 0
      ? Math.min(Math.max(0, optionIndex), bundle.option_scenes.length - 1)
      : 0;

  const activeScene = useMemo(() => {
    if (isWorkingsActive && clampedAttemptSceneIndex >= 0 && bundle.attempt_scenes) {
      const att = bundle.attempt_scenes[clampedAttemptSceneIndex];
      if (att) {
        return {
          units: "mm" as const,
          up: "z" as const,
          concrete: att.concrete,
          bars: att.bars,
          loops: bundle.scene.loops,
        };
      }
    }
    if (mode === "after" && bundle.option_scenes[clampedOptionIndex]) {
      return bundle.option_scenes[clampedOptionIndex];
    }
    return bundle.scene;
  }, [
    bundle.attempt_scenes,
    bundle.option_scenes,
    bundle.scene,
    clampedAttemptSceneIndex,
    clampedOptionIndex,
    isWorkingsActive,
    mode,
  ]);

  const activeFindings = useMemo<Finding[]>(() => {
    if (isWorkingsActive) {
      if (!hasAttemptScene || !activeAttempt) return [];
      return activeAttempt.failures.map((f) => ({
        rule: f.rule,
        clause: f.clause,
        title: bundle.rules[f.rule]?.title ?? f.clause,
        status: "fail",
        measured: f.measured,
        limit: f.limit,
        compare: f.compare,
        margin: f.margin,
        unit: f.unit,
        members: [],
        bars: f.bars ?? [],
        at: f.at ?? null,
        span: f.span ?? null,
        message: f.message,
      }));
    }
    if (mode === "after") return [];
    return bundle.report.findings;
  }, [activeAttempt, bundle.report.findings, bundle.rules, hasAttemptScene, isWorkingsActive, mode]);

  const isTabletOrUp = useMediaQuery("(min-width: 768px)");
  const maxCallouts = isTabletOrUp ? 8 : 1;

  const { visibleFindings, mirroredFindings, overflowCount } = useMemo(
    () => selectCalloutFindings(activeFindings, labelMode, maxCallouts),
    [activeFindings, labelMode, maxCallouts],
  );

  const highlightedBarIds = useMemo(() => {
    const ids = new Set<string>();
    if (selectedBarId) ids.add(selectedBarId);
    if (selectedFindingIndex !== null) {
      const f: Finding | undefined = activeFindings[selectedFindingIndex];
      if (f) f.bars.forEach((b) => ids.add(b));
    }
    return Array.from(ids);
  }, [selectedBarId, selectedFindingIndex, activeFindings]);

  const highlightedRef = useRef(highlightedBarIds);
  const activeFindingsRef = useRef(activeFindings);
  const lastFramedVersionRef = useRef(frameVersion);
  const prevBundleKeyRef = useRef<string | null>(null);
  const hasLoadedSceneRef = useRef(false);

  const setMode = useWorkspaceStore((s) => s.setMode);

  useEffect(() => {
    activeFindingsRef.current = activeFindings;
  }, [activeFindings]);

  useEffect(() => {
    highlightedRef.current = highlightedBarIds;
    if (frameVersion !== lastFramedVersionRef.current) {
      lastFramedVersionRef.current = frameVersion;
      controllerRef.current?.frameBars(highlightedBarIds);
    }
  }, [highlightedBarIds, frameVersion]);

  const failCount = activeFindings.filter((f) => f.status === "fail").length;
  const affectedBars = activeScene.bars.filter((b) => b.status === "fail").length;
  const summaryText =
    isWorkingsActive && activeAttempt
      ? `Joint ${bundle.joint.id}: Workings attempt ${replayIndex + 1} of ${bundle.fix.attempts.length}, ${
          activeAttempt.passed ? "passes every check" : `${activeAttempt.failures.length} checks fail`
        }`
      : `Joint ${bundle.joint.id}: ${activeScene.bars.length} bars, ${failCount} checks fail, ${affectedBars} bars affected`;

  // Mount SceneController once
  useEffect(() => {
    const el = canvasWrapRef.current;
    if (!el) return;
    const ctrl = new SceneController(el, {
      theme: useWorkspaceStore.getState().theme,
      reducedMotion: reduced,
      callbacks: {
        onSelectBar: (barId) => {
          selectBar(barId);
          if (!barId) {
            selectFinding(null);
            return;
          }
          const findings = activeFindingsRef.current;
          const failIdx = findings.findIndex((f) => f.status === "fail" && f.bars.includes(barId));
          const anyIdx = findings.findIndex((f) => f.bars.includes(barId));
          const targetIdx = failIdx >= 0 ? failIdx : anyIdx;
          selectFinding(targetIdx >= 0 ? targetIdx : null);
          setInspectorTab("findings");
        },
        onHoverBar: (barId) => {
          setHoveredBar(barId);
        },
        onCameraUpdate: (_cam, size) => {
          const wrap = canvasWrapRef.current;
          if (wrap) {
            const bounds = ctrl.getProjectedSceneBounds();
            if (bounds) {
              wrap.dataset.jointBounds = JSON.stringify(bounds);
            }
            wrap.dataset.renderCount = String(Number(wrap.dataset.renderCount ?? "0") + 1);
          }
          calloutsRef.current?.updatePositions(ctrl, size);
        },
      },
    });
    controllerRef.current = ctrl;

    return () => {
      ctrl.dispose();
      controllerRef.current = null;
    };
    // Mount once; updates sync via dedicated effects below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
      requestAnimationFrame(() => {
        controllerRef.current?.handleContainerResize();
      });
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    controllerRef.current?.setTheme(theme);
  }, [theme]);

  useEffect(() => {
    controllerRef.current?.setReducedMotion(reduced);
  }, [reduced]);

  useEffect(() => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;
    const bundleKey = `${bundle.joint.id}|${bundle.report.seismic_zone}`;
    if (!hasLoadedSceneRef.current || prevBundleKeyRef.current !== bundleKey) {
      hasLoadedSceneRef.current = true;
      prevBundleKeyRef.current = bundleKey;
      ctrl.setScene(activeScene);
      ctrl.setPreset(useWorkspaceStore.getState().cameraPreset, false);
    } else if (isWorkingsActive) {
      ctrl.morphToScene(activeScene, { durationMs: reduced ? 0 : 400, instant: reduced });
    } else {
      ctrl.morphToScene(activeScene, { durationMs: DURATION_MS.morph });
    }
  }, [activeScene, bundle.joint.id, bundle.report.seismic_zone, isWorkingsActive, reduced]);

  useEffect(() => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;
    ctrl.setCalloutIndicators(activeFindings, labelMode, selectedFindingIndex);
    ctrl.renderImmediate();
  }, [activeFindings, labelMode, selectedFindingIndex, maxCallouts]);

  useEffect(() => {
    controllerRef.current?.setSelection(highlightedBarIds, hoveredBarId);
  }, [highlightedBarIds, hoveredBarId]);

  useEffect(() => {
    controllerRef.current?.applyConcreteMode(concreteMode);
  }, [concreteMode]);

  const handlePreset = useCallback(
    (preset: typeof cameraPreset) => {
      setCameraPreset(preset);
      controllerRef.current?.setPreset(preset);
    },
    [setCameraPreset],
  );

  const handleFrame = useCallback(() => {
    controllerRef.current?.frameBars(highlightedRef.current);
  }, []);

  const handleReset = useCallback(() => {
    setCameraPreset("iso");
    controllerRef.current?.setPreset("iso");
  }, [setCameraPreset]);

  const toggleFullscreen = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;
    if (!document.fullscreenElement) {
      void host.requestFullscreen?.().catch(() => {});
    } else {
      void document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  // Viewport keyboard shortcuts: Arrows orbit, +/- zoom, F frame, 0 reset, Esc clear
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      ctrl.orbit(-Math.PI / 16, 0);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      ctrl.orbit(Math.PI / 16, 0);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      ctrl.orbit(0, -Math.PI / 18);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      ctrl.orbit(0, Math.PI / 18);
    } else if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      ctrl.zoom(0.25);
    } else if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      ctrl.zoom(-0.25);
    } else if (e.key.toLowerCase() === "f") {
      e.preventDefault();
      handleFrame();
    } else if (e.key === "0") {
      e.preventDefault();
      handleReset();
    } else if (e.key === "Escape") {
      e.preventDefault();
      clearSelection();
    }
  };

  return (
    <div
      ref={hostRef}
      className="flex h-full min-h-[20rem] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface-sunken lg:min-h-0"
    >
      <ViewportToolbar
        preset={cameraPreset}
        concreteMode={concreteMode}
        labelMode={labelMode}
        isFullscreen={isFullscreen}
        hasSelection={highlightedBarIds.length > 0}
        onPresetChange={handlePreset}
        onCycleConcrete={() =>
          setConcreteMode(
            concreteMode === "translucent"
              ? "wireframe"
              : concreteMode === "wireframe"
                ? "hidden"
                : "translucent",
          )
        }
        onCycleLabels={() =>
          setLabelMode(
            labelMode === "failures" ? "all" : labelMode === "all" ? "hidden" : "failures",
          )
        }
        onFrame={handleFrame}
        onReset={handleReset}
        onToggleFullscreen={toggleFullscreen}
        onOpenIfc={() => setIfcOpen(true)}
      />

      {/* Interactive 3D region: keyboard shortcuts work when focused */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <div
        role="region"
        aria-label="3D joint viewport"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="relative flex-1 min-h-[50vh] md:min-h-0 overflow-hidden focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-[-2px]"
      >
        <div
          ref={canvasWrapRef}
          role="img"
          aria-label={summaryText}
          data-scene-mode={isWorkingsActive ? "workings" : mode}
          data-replay-attempt={isWorkingsActive ? String(replayIndex + 1) : undefined}
          data-scene-bar-ids={activeScene.bars.map((b) => b.id).join(",")}
          className="h-full min-h-[50vh] md:min-h-0 w-full"
        />

        {isWorkingsActive && activeAttempt && (
          <div className="pointer-events-none absolute top-3 left-3 flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-border-strong bg-surface-raised/95 px-2.5 py-1 text-xs shadow-[var(--shadow-overlay)]">
            <span className="font-num font-medium text-foreground">
              Workings · Attempt {replayIndex + 1} / {bundle.fix.attempts.length}
            </span>
            {!hasAttemptScene && (
              <span className="rounded-[var(--radius-xs)] border border-border bg-surface-sunken px-1.5 py-0.5 text-xs text-muted-foreground">
                No 3D for this attempt
              </span>
            )}
          </div>
        )}

        {!isWorkingsActive && mode === "after" && (
          <div className="pointer-events-auto absolute top-3 left-3 flex items-center gap-2 rounded-[var(--radius-md)] border border-border-strong bg-surface-raised/95 px-2.5 py-1 text-xs shadow-[var(--shadow-overlay)]">
            <span className="font-num font-medium text-foreground">
              After · Option #{clampedOptionIndex + 1}
            </span>
            <button
              type="button"
              onClick={() => setMode("before")}
              className="rounded-[var(--radius-xs)] border border-control-border bg-surface px-1.5 py-0.5 text-xs text-foreground hover:bg-surface-sunken cursor-pointer"
            >
              Show Before
            </button>
          </div>
        )}

        <ViewportCallouts
          ref={calloutsRef}
          visibleFindings={visibleFindings}
          mirroredFindings={mirroredFindings}
          overflowCount={overflowCount}
          labelMode={labelMode}
          selectedFindingIndex={selectedFindingIndex}
          onSelectFinding={(f, index) => {
            selectBar(f.bars[0] ?? null);
            selectFinding(index);
            setInspectorTab("findings");
          }}
          onOpenOverflow={() => {
            setInspectorTab("findings");
            const inspectorEl = document.getElementById("inspector");
            const firstBtn = inspectorEl?.querySelector("button");
            if (firstBtn instanceof HTMLElement) {
              firstBtn.focus();
            } else {
              inspectorEl?.focus();
            }
          }}
        />

        <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-border bg-surface/90 px-2.5 py-1.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 text-foreground">
            <span className="h-2.5 w-2.5 rounded-xs bg-fail" aria-hidden="true" /> Fails
          </span>
          <span className="inline-flex items-center gap-1.5 text-foreground">
            <span className="h-2.5 w-2.5 rounded-xs bg-steel" aria-hidden="true" /> Steel
          </span>
          <span className="font-num hidden sm:inline">
            Arrows orbit · +/- zoom · F frame · 0 reset
          </span>
        </div>

        <div aria-live="polite" className="sr-only">
          {selectedBarId ? `Selected bar ${selectedBarId}. Press F to frame.` : `${summaryText}.`}
        </div>
      </div>

      {ifcOpen && (
        <Suspense fallback={null}>
          <LazyOpenIfcDialog
            open={ifcOpen}
            onOpenChange={setIfcOpen}
            defaultIfcUrl={ifcUrl}
            findings={bundle.report.findings}
          />
        </Suspense>
      )}
    </div>
  );
}

export default Viewport;
