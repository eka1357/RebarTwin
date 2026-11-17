import { useReducedMotion } from "motion/react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatCalloutValue, formatClause } from "../../lib/format";
import { useWorkspaceStore } from "../../stores/workspace";
import type { Bundle, Finding } from "../../types/bundle";
import { SceneController } from "./SceneController";
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
  const anchorRefs = useRef<Map<number, HTMLButtonElement | null>>(new Map());

  const [ifcOpen, setIfcOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const reduced = Boolean(useReducedMotion());
  const theme = useWorkspaceStore((s) => s.theme);
  const mode = useWorkspaceStore((s) => s.mode);
  const optionIndex = useWorkspaceStore((s) => s.optionIndex);
  const selectedBarId = useWorkspaceStore((s) => s.selectedBarId);
  const hoveredBarId = useWorkspaceStore((s) => s.hoveredBarId);
  const selectedFindingIndex = useWorkspaceStore((s) => s.selectedFindingIndex);
  const concreteMode = useWorkspaceStore((s) => s.concreteMode);
  const labelMode = useWorkspaceStore((s) => s.labelMode);
  const cameraPreset = useWorkspaceStore((s) => s.cameraPreset);

  const selectBar = useWorkspaceStore((s) => s.selectBar);
  const setHoveredBar = useWorkspaceStore((s) => s.setHoveredBar);
  const selectFinding = useWorkspaceStore((s) => s.selectFinding);
  const setConcreteMode = useWorkspaceStore((s) => s.setConcreteMode);
  const setLabelMode = useWorkspaceStore((s) => s.setLabelMode);
  const setCameraPreset = useWorkspaceStore((s) => s.setCameraPreset);
  const clearSelection = useWorkspaceStore((s) => s.clearSelection);

  const activeScene = useMemo(() => {
    if (mode === "after" && bundle.option_scenes[optionIndex]) {
      return bundle.option_scenes[optionIndex];
    }
    return bundle.scene;
  }, [bundle, mode, optionIndex]);

  const activeFindings = useMemo(() => {
    if (mode === "after") return [];
    return bundle.report.findings;
  }, [bundle.report.findings, mode]);

  const visibleFindings = useMemo(() => {
    if (labelMode === "hidden") return [];
    return activeFindings
      .map((f, index) => ({ f, index }))
      .filter(({ f }) => Boolean(f.at) && (labelMode === "all" || f.status === "fail"))
      .slice(0, 8);
  }, [activeFindings, labelMode]);

  const visibleFindingsRef = useRef(visibleFindings);

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

  useEffect(() => {
    visibleFindingsRef.current = visibleFindings;
  }, [visibleFindings]);

  useEffect(() => {
    highlightedRef.current = highlightedBarIds;
  }, [highlightedBarIds]);

  const failCount = activeFindings.filter((f) => f.status === "fail").length;
  const affectedBars = activeScene.bars.filter((b) => b.status === "fail").length;
  const summaryText = `Joint ${bundle.joint.id}: ${activeScene.bars.length} bars, ${failCount} checks fail, ${affectedBars} bars affected`;

  // Mount SceneController once
  useEffect(() => {
    const el = canvasWrapRef.current;
    if (!el) return;
    const ctrl = new SceneController(el, {
      theme: useWorkspaceStore.getState().theme,
      reducedMotion: reduced,
      callbacks: {
        onSelectBar: (barId) => {
          selectFinding(null);
          selectBar(barId);
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
          for (const { f, index } of visibleFindingsRef.current) {
            const btn = anchorRefs.current.get(index);
            if (!btn || !f.at) continue;
            const pos = ctrl.projectWorld(f.at);
            if (!pos.visible) {
              btn.style.display = "none";
            } else {
              btn.style.display = "";
              const halfW = (btn.offsetWidth || 160) / 2 + 8;
              const px = Math.min(Math.max(pos.x, halfW), Math.max(halfW, size.width - halfW));
              const py = Math.min(Math.max(pos.y, 20), Math.max(20, size.height - 44));
              btn.style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0) translate(-50%, -50%)`;
            }
          }
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
    ctrl.setScene(activeScene);
    ctrl.setPreset(useWorkspaceStore.getState().cameraPreset, false);
  }, [activeScene]);

  useEffect(() => {
    controllerRef.current?.renderImmediate();
  }, [visibleFindings]);

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
        className="relative flex-1 min-h-0 overflow-hidden focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-[-2px]"
      >
        <div ref={canvasWrapRef} role="img" aria-label={summaryText} className="h-full w-full" />

        <div className="pointer-events-none absolute inset-0">
          {visibleFindings.map(({ f, index }) => (
            <button
              key={`${f.rule}-${index}`}
              type="button"
              ref={(el) => {
                anchorRefs.current.set(index, el);
              }}
              onClick={() => {
                selectBar(f.bars[0] ?? null);
                selectFinding(index);
              }}
              className={`pointer-events-auto absolute top-0 left-0 inline-flex items-center gap-1.5 rounded-[var(--radius-xs)] border px-1.5 py-0.5 font-num text-xs font-medium shadow-[var(--shadow-overlay)] cursor-pointer ${
                selectedFindingIndex === index
                  ? "border-ring bg-primary text-primary-foreground"
                  : f.status === "fail"
                    ? "border-fail/60 bg-surface-raised/95 text-fail"
                    : "border-pass/60 bg-surface-raised/95 text-pass"
              }`}
              title={f.message}
            >
              <span>{formatCalloutValue(f)}</span>{" "}
              <span
                className={
                  selectedFindingIndex === index
                    ? "text-primary-foreground"
                    : "text-muted-foreground"
                }
              >
                · {formatClause(f.clause)}
              </span>
            </button>
          ))}
        </div>

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
