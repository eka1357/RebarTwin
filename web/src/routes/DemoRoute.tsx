import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { StatusPill } from "../components/StatusPill";
import { Button } from "../components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../components/ui/resizable";
import { Skeleton } from "../components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "../components/ui/toggle-group";
import { JointInspector } from "../features/workspace/JointInspector";
import { ReplayUrlSync } from "../features/workspace/ReplayUrlSync";
import { demoAssetUrl, fetchDemoBundle, type DemoVariant } from "../lib/demoData";
import { useMediaQuery } from "../lib/useMediaQuery";
import { useWorkspaceStore } from "../stores/workspace";

const LazyViewport = lazy(() => import("../features/workspace/Viewport"));

export function DemoRoute() {
  const [variant, setVariant] = useState<DemoVariant>("zone2");
  const [searchParams, setSearchParams] = useSearchParams();
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  const setStatus = useWorkspaceStore((s) => s.setStatus);
  const selectedFindingIndex = useWorkspaceStore((s) => s.selectedFindingIndex);
  const selectFinding = useWorkspaceStore((s) => s.selectFinding);
  const selectBar = useWorkspaceStore((s) => s.selectBar);
  const clearSelection = useWorkspaceStore((s) => s.clearSelection);

  const {
    data: bundle,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["demo-bundle", variant],
    queryFn: () => fetchDemoBundle(variant),
  });

  useEffect(() => {
    if (!bundle) return;
    const failCount = bundle.report.findings.filter((f) => f.status === "fail").length;
    setStatus({
      jointLabel: `${bundle.joint.column.id} × ${bundle.joint.beams.map((b) => b.id).join(" / ")}`,
      failCount,
      toCheckCount: 0,
      zone: bundle.report.seismic_zone,
      is13920: bundle.report.is13920,
      activity: null,
    });
  }, [bundle, setStatus]);

  // Sync URL ?f= parameter
  useEffect(() => {
    const fParam = searchParams.get("f");
    if (fParam !== null && bundle) {
      const idx = Number(fParam);
      if (Number.isInteger(idx) && bundle.report.findings[idx]) {
        selectFinding(idx);
        selectBar(bundle.report.findings[idx].bars[0] ?? null);
      }
    }
    // Only hydrate on bundle/param arrival
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle]);

  useEffect(() => {
    const current = searchParams.get("f");
    if (selectedFindingIndex !== null) {
      if (current !== String(selectedFindingIndex)) {
        setSearchParams({ f: String(selectedFindingIndex) }, { replace: true });
      }
    } else if (current !== null) {
      setSearchParams({}, { replace: true });
    }
  }, [selectedFindingIndex, searchParams, setSearchParams]);

  return (
    <main className="flex flex-1 min-h-0 flex-col gap-3 p-3 sm:p-4 lg:overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-border bg-surface px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-lg font-semibold sm:text-xl">
            Worked Example: C4 × B12
          </h1>
          {bundle && (
            <StatusPill
              status={bundle.report.findings.some((f) => f.status === "fail") ? "fail" : "pass"}
              count={bundle.report.findings.filter((f) => f.status === "fail").length}
            />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            type="single"
            value={variant}
            onValueChange={(v) => {
              if (v === "zone2" || v === "zone3") {
                clearSelection();
                setVariant(v);
              }
            }}
            aria-label="Seismic zone"
          >
            <ToggleGroupItem value="zone2">Zone II</ToggleGroupItem>
            <ToggleGroupItem value="zone3">Zone III</ToggleGroupItem>
          </ToggleGroup>

          <Button variant="outline" size="sm" asChild>
            <Link to="/projects/c4-b12/report">Report</Link>
          </Button>
        </div>
      </div>

      {bundle && <ReplayUrlSync totalAttempts={bundle.fix.attempts.length} />}

      {isLoading ? (
        <div className="grid flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_25rem]">
          <Skeleton className="min-h-80 w-full" />
          <Skeleton className="min-h-80 w-full" />
        </div>
      ) : error || !bundle ? (
        <div className="rounded-[var(--radius-lg)] border border-fail/40 bg-fail-surface p-6 text-sm text-fail">
          {error instanceof Error ? error.message : "Could not load demo bundle."}
        </div>
      ) : isDesktop ? (
        <div className="flex-1 min-h-0">
          <ResizablePanelGroup orientation="horizontal" className="h-full min-h-0 gap-2">
            <ResizablePanel defaultSize={68} minSize={45} className="flex min-h-0 flex-col">
              <Suspense fallback={<Skeleton className="h-full w-full" />}>
                <LazyViewport bundle={bundle} ifcUrl={demoAssetUrl(variant, "joint.ifc")} />
              </Suspense>
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize={32} minSize={24} className="flex min-h-0 flex-col">
              <JointInspector bundle={bundle} />
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-3">
          <div className="h-[52vh] min-h-72">
            <Suspense fallback={<Skeleton className="h-full w-full" />}>
              <LazyViewport bundle={bundle} ifcUrl={demoAssetUrl(variant, "joint.ifc")} />
            </Suspense>
          </div>
          <JointInspector bundle={bundle} />
        </div>
      )}
    </main>
  );
}
