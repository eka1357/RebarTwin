import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { Link, useParams } from "react-router";
import { StatusPill } from "../components/StatusPill";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/ui/skeleton";
import { JointInspector } from "../features/workspace/JointInspector";
import { ReplayUrlSync } from "../features/workspace/ReplayUrlSync";
import { demoAssetUrl, fetchDemoBundle } from "../lib/demoData";

const LazyViewport = lazy(() => import("../features/workspace/Viewport"));

export function JointRoute() {
  const { id = "c4-b12", jointId = "C4xB12" } = useParams();

  const {
    data: bundle,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["joint-bundle", id, jointId],
    queryFn: () => fetchDemoBundle("zone2"),
  });

  return (
    <main className="flex flex-1 min-h-0 flex-col gap-3 p-3 sm:p-4 lg:overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-border bg-surface px-4 py-2.5">
        <div>
          <p className="font-num text-xs text-muted-foreground">
            Project {id} · Joint {jointId}
          </p>
          <h1 className="font-display text-lg font-semibold sm:text-xl">
            Joint Workspace: {jointId}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {bundle && (
            <StatusPill
              status={bundle.report.findings.some((f) => f.status === "fail") ? "fail" : "pass"}
              count={bundle.report.findings.filter((f) => f.status === "fail").length}
            />
          )}
          <Button variant="outline" size="sm" asChild>
            <Link to={`/projects/${id}`}>Project</Link>
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="min-h-80 flex-1" />
      ) : error || !bundle ? (
        <div className="rounded-[var(--radius-lg)] border border-fail/40 bg-fail-surface p-6 text-sm text-fail">
          {error instanceof Error ? error.message : "Could not load joint bundle."}
        </div>
      ) : (
        <div className="grid flex-1 min-h-0 gap-3 lg:grid-cols-[minmax(0,1fr)_25rem] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden">
          <ReplayUrlSync totalAttempts={bundle.fix.attempts.length} />
          <div className="min-h-80 lg:h-full lg:min-h-0">
            <Suspense fallback={<Skeleton className="h-full w-full" />}>
              <LazyViewport bundle={bundle} ifcUrl={demoAssetUrl("zone2", "joint.ifc")} />
            </Suspense>
          </div>
          <JointInspector bundle={bundle} />
        </div>
      )}
    </main>
  );
}
