import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { StatusPill } from "../components/StatusPill";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/ui/skeleton";
import { JointInspector } from "../features/workspace/JointInspector";
import { ReplayUrlSync } from "../features/workspace/ReplayUrlSync";
import { WorkspaceUrlSync } from "../features/workspace/WorkspaceUrlSync";
import { ApiError, getJointBundle, jointBundleUrl, jointIfcUrl } from "../lib/api";
import { demoAssetUrl, fetchDemoBundle } from "../lib/demoData";
import {
  iitDemoReportPath,
  projectPath,
  projectReportPath,
  projectReviewPath,
} from "../lib/routes";
import { useWorkspaceStore } from "../stores/workspace";

const LazyViewport = lazy(() => import("../features/workspace/Viewport"));

export function JointRoute({ preset }: { preset?: "iit" } = {}) {
  const params = useParams();
  const isIitOffline = preset === "iit" || params.id === "iit-demo";
  const isWorkedOffline = !isIitOffline && params.id === "c4-b12";
  const isOfflineDemo = isWorkedOffline || isIitOffline;
  const id = isIitOffline ? "iit-demo" : (params.id ?? "c4-b12");
  const jointId = isIitOffline ? "C1xXB17@FIRST@L1+M+M1-28" : (params.jointId ?? "C4xB12");
  const navigate = useNavigate();
  const setStatus = useWorkspaceStore((s) => s.setStatus);
  const chosenOptionByKey = useWorkspaceStore((s) => s.chosenOptionByKey);

  const offlineKey = isIitOffline ? "iit" : "zone2";
  const resolvedBundleUrl = isOfflineDemo
    ? demoAssetUrl(offlineKey, "bundle.json")
    : jointBundleUrl(id, jointId);
  const resolvedIfcUrl = isOfflineDemo
    ? demoAssetUrl(offlineKey, "joint.ifc")
    : jointIfcUrl(id, jointId);

  const {
    data: bundle,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["joint-bundle", id, jointId],
    queryFn: async () => {
      if (isOfflineDemo) {
        return fetchDemoBundle(offlineKey);
      }
      return getJointBundle(id, jointId);
    },
    staleTime: isOfflineDemo ? Infinity : 0,
    retry: false,
  });

  useEffect(() => {
    if (!bundle) return;
    const failCount = bundle.report.findings.filter((f) => f.status === "fail").length;
    setStatus({
      jointLabel: `${bundle.joint.column.id} × ${bundle.joint.beams.map((b) => b.id).join(" / ")}`,
      failCount,
      ...(isOfflineDemo ? { toCheckCount: 0 } : {}),
      zone: bundle.report.seismic_zone,
      is13920: bundle.report.is13920,
      activity: null,
    });
  }, [bundle, isOfflineDemo, setStatus]);

  const isBlocked = error instanceof ApiError && error.status === 409;
  const resolvedJointId = bundle?.joint.id ?? jointId;
  const reportKey = `${id}:${resolvedJointId}`;
  const chosenOption = chosenOptionByKey[reportKey] ?? null;
  const buildReportUrl = (optIdx?: number | null) =>
    preset === "iit"
      ? iitDemoReportPath({ option: optIdx })
      : projectReportPath(id, {
          joint: resolvedJointId,
          option: optIdx,
        });
  const reportHref = buildReportUrl(chosenOption);

  return (
    <main className="flex flex-1 min-h-0 flex-col gap-3 p-3 sm:p-4 lg:overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-border bg-surface px-4 py-2.5">
        <div>
          <p className="font-num text-xs text-muted-foreground">
            {isIitOffline
              ? `IIT Hyderabad Director Residence · Offline checked joint (${jointId})`
              : `Project ${id} · Joint ${jointId}`}
          </p>
          <h1 className="font-display text-lg font-semibold sm:text-xl">
            {isIitOffline ? "IIT Real Joint: C1 × XB17" : `Joint Workspace: ${jointId}`}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {bundle && (
            <StatusPill
              status={bundle.report.findings.some((f) => f.status === "fail") ? "fail" : "pass"}
              count={bundle.report.findings.filter((f) => f.status === "fail").length}
            />
          )}
          {isBlocked && (
            <Button size="sm" asChild>
              <Link to={projectReviewPath(id, { joint: jointId })}>Go to To check</Link>
            </Button>
          )}
          <Button variant="outline" size="sm" asChild>
            <Link to={reportHref}>Report</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to={projectPath(id)}>Project</Link>
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="min-h-80 flex-1" />
      ) : error || !bundle ? (
        <div className="rounded-[var(--radius-lg)] border border-fail/40 bg-fail-surface p-6 text-sm text-fail space-y-3">
          <p>{error instanceof Error ? error.message : "Could not load joint bundle."}</p>
          {isBlocked && (
            <Button variant="outline" size="sm" asChild>
              <Link to={projectReviewPath(id, { joint: jointId })}>Resolve blocking To check items</Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="grid flex-1 min-h-0 gap-3 lg:grid-cols-[minmax(0,1fr)_25rem] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden">
          <WorkspaceUrlSync bundle={bundle} />
          <ReplayUrlSync totalAttempts={bundle.fix.attempts.length} />
          <div className="min-h-80 lg:h-full lg:min-h-0">
            <ErrorBoundary compact>
              <Suspense fallback={<Skeleton className="h-full w-full" />}>
                <LazyViewport bundle={bundle} ifcUrl={resolvedIfcUrl} />
              </Suspense>
            </ErrorBoundary>
          </div>
          <JointInspector
            bundle={bundle}
            bundleUrl={resolvedBundleUrl}
            reportKey={reportKey}
            onOpenReport={(optIdx) => navigate(buildReportUrl(optIdx))}
          />
        </div>
      )}
    </main>
  );
}
