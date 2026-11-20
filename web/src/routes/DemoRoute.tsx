import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Compass } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { StatusPill } from "../components/StatusPill";
import { Button } from "../components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../components/ui/resizable";
import { Skeleton } from "../components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "../components/ui/toggle-group";
import { DemoTour } from "../features/demo/DemoTour";
import { JointInspector } from "../features/workspace/JointInspector";
import { ReplayUrlSync } from "../features/workspace/ReplayUrlSync";
import { WorkspaceUrlSync } from "../features/workspace/WorkspaceUrlSync";
import { demoAssetUrl, fetchDemoBundle, type DemoVariant } from "../lib/demoData";
import { projectReportPath } from "../lib/routes";
import { useMediaQuery } from "../lib/useMediaQuery";
import { useWorkspaceStore } from "../stores/workspace";

const LazyViewport = lazy(() => import("../features/workspace/Viewport"));

export function DemoRoute() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialVariant: DemoVariant =
    searchParams.get("zone") === "3" || searchParams.get("variant") === "zone3"
      ? "zone3"
      : "zone2";
  const [variant, setVariantState] = useState<DemoVariant>(initialVariant);
  const [tourOpen, setTourOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  const setStatus = useWorkspaceStore((s) => s.setStatus);
  const chosenOptionByKey = useWorkspaceStore((s) => s.chosenOptionByKey);
  const setMode = useWorkspaceStore((s) => s.setMode);
  const setReplay = useWorkspaceStore((s) => s.setReplay);
  const clearSelection = useWorkspaceStore((s) => s.clearSelection);

  const setVariant = (nextVariant: DemoVariant) => {
    setVariantState(nextVariant);
    const next = new URLSearchParams(searchParams);
    next.delete("variant");
    if (nextVariant === "zone3") {
      next.set("zone", "3");
    } else {
      next.delete("zone");
    }
    setSearchParams(next, { replace: true });
  };

  const {
    data: bundle,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["demo-bundle", variant],
    queryFn: () => fetchDemoBundle(variant),
    staleTime: Infinity,
  });

  // Prefetch the sibling seismic zone so full guided demo runs seamlessly with network off.
  useEffect(() => {
    const other: DemoVariant = variant === "zone2" ? "zone3" : "zone2";
    void queryClient.prefetchQuery({
      queryKey: ["demo-bundle", other],
      queryFn: () => fetchDemoBundle(other),
      staleTime: Infinity,
    });
  }, [queryClient, variant]);

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

  const reportKey = `c4-b12:${variant}:${bundle?.joint.id ?? "C4xB12"}`;
  const chosenOption = chosenOptionByKey[reportKey] ?? null;
  const reportHref = projectReportPath("c4-b12", {
    joint: bundle?.joint.id ?? "C4xB12",
    variant,
    option: chosenOption,
  });

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
                setMode("before");
                setReplay({ replayPlaying: false, replayIndex: 0 });
                setVariant(v);
              }
            }}
            aria-label="Seismic zone"
          >
            <ToggleGroupItem value="zone2">Zone II</ToggleGroupItem>
            <ToggleGroupItem value="zone3">Zone III</ToggleGroupItem>
          </ToggleGroup>

          <Button
            variant={tourOpen ? "secondary" : "outline"}
            size="sm"
            aria-expanded={tourOpen}
            onClick={() => setTourOpen((o) => !o)}
          >
            <Compass className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Guided tour</span>
          </Button>

          <Button variant="outline" size="sm" asChild>
            <Link to={reportHref}>Report</Link>
          </Button>
        </div>
      </div>

      <DemoTour
        open={tourOpen}
        onClose={() => setTourOpen(false)}
        variant={variant}
        onVariantChange={setVariant}
        bundle={bundle}
      />

      {bundle && (
        <>
          <WorkspaceUrlSync bundle={bundle} />
          <ReplayUrlSync totalAttempts={bundle.fix.attempts.length} />
        </>
      )}

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
              <ErrorBoundary compact>
                <Suspense fallback={<Skeleton className="h-full w-full" />}>
                  <LazyViewport bundle={bundle} ifcUrl={demoAssetUrl(variant, "joint.ifc")} />
                </Suspense>
              </ErrorBoundary>
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize={32} minSize={24} className="flex min-h-0 flex-col">
              <JointInspector
                bundle={bundle}
                bundleUrl={demoAssetUrl(variant, "bundle.json")}
                reportKey={reportKey}
                onOpenReport={(optIdx) =>
                  navigate(
                    projectReportPath("c4-b12", {
                      joint: bundle.joint.id,
                      variant,
                      option: optIdx,
                    }),
                  )
                }
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-3">
          <div className="min-h-72 md:h-[52vh]">
            <ErrorBoundary compact>
              <Suspense fallback={<Skeleton className="h-full w-full" />}>
                <LazyViewport bundle={bundle} ifcUrl={demoAssetUrl(variant, "joint.ifc")} />
              </Suspense>
            </ErrorBoundary>
          </div>
          <JointInspector
            bundle={bundle}
            bundleUrl={demoAssetUrl(variant, "bundle.json")}
            reportKey={reportKey}
            onOpenReport={(optIdx) =>
              navigate(
                projectReportPath("c4-b12", {
                  joint: bundle.joint.id,
                  variant,
                  option: optIdx,
                }),
              )
            }
          />
        </div>
      )}
    </main>
  );
}
