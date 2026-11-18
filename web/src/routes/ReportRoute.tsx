import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { useEffect } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "../components/ui/toggle-group";
import { PrePourReport } from "../features/report/PrePourReport";
import {
  ApiError,
  getJointBundle,
  getProject,
  jointBundleUrl,
  jointFixedIfcUrl,
  jointIfcUrl,
  jointIssuesBcfUrl,
} from "../lib/api";
import {
  demoAssetUrl,
  fetchDemoBundle,
  type DemoVariant,
  type OfflineBundleKey,
} from "../lib/demoData";
import { jointPath, projectPath, projectReviewPath } from "../lib/routes";
import { useWorkspaceStore } from "../stores/workspace";

export function ReportRoute({ preset }: { preset?: "iit" } = {}) {
  const params = useParams();
  const isIitOffline = preset === "iit" || params.id === "iit-demo";
  const isWorkedDemo = !isIitOffline && (params.id ?? "c4-b12") === "c4-b12";
  const isOfflineDemo = isWorkedDemo || isIitOffline;
  const id = isIitOffline ? "iit-demo" : (params.id ?? "c4-b12");
  const [searchParams, setSearchParams] = useSearchParams();
  const setStatus = useWorkspaceStore((s) => s.setStatus);
  const chosenOptionByKey = useWorkspaceStore((s) => s.chosenOptionByKey);
  const chosenOptionIndex = useWorkspaceStore((s) => s.chosenOptionIndex);

  const demoVariant: DemoVariant = searchParams.get("variant") === "zone3" ? "zone3" : "zone2";
  const offlineKey: OfflineBundleKey = isIitOffline ? "iit" : demoVariant;
  const requestedJoint = searchParams.get("joint");

  const {
    data: project,
    isLoading: projectLoading,
    error: projectError,
  } = useQuery({
    queryKey: ["project", id],
    queryFn: () => getProject(id),
    enabled: !isOfflineDemo,
    retry: false,
  });

  const readyJoints = (project?.joints ?? []).filter((j) => j.bundle_ready);
  const targetJointId = isIitOffline
    ? "C1xXB17@FIRST@L1+M+M1-28"
    : isWorkedDemo
      ? "C4xB12"
      : requestedJoint ??
        readyJoints[0]?.id ??
        project?.joints[0]?.id ??
        null;

  const {
    data: bundle,
    isLoading: bundleLoading,
    error: bundleError,
  } = useQuery({
    queryKey: isOfflineDemo
      ? ["demo-bundle", offlineKey]
      : ["joint-bundle", id, targetJointId],
    queryFn: async () => {
      if (isOfflineDemo) {
        return fetchDemoBundle(offlineKey);
      }
      if (!targetJointId) {
        throw new Error("No ready joint found in project.");
      }
      return getJointBundle(id, targetJointId);
    },
    enabled: isOfflineDemo || Boolean(targetJointId),
    staleTime: isOfflineDemo ? Infinity : 0,
    retry: false,
  });

  const resolvedJointId =
    bundle?.joint.id ?? targetJointId ?? (isIitOffline ? "C1xXB17@FIRST@L1+M+M1-28" : "C4xB12");
  const reportKey = isIitOffline
    ? `iit-demo:${resolvedJointId}`
    : isWorkedDemo
      ? `c4-b12:${demoVariant}:${resolvedJointId}`
      : `${id}:${resolvedJointId}`;

  const rawOptParam = searchParams.get("option");
  const parsedOptParam = rawOptParam !== null ? Number.parseInt(rawOptParam, 10) : Number.NaN;
  const storedOpt =
    chosenOptionByKey[reportKey] ?? (isWorkedDemo ? chosenOptionIndex : null);

  const optionCount = bundle?.fix.options.length ?? 0;
  let effectiveOptionIndex = 0;
  let selectedExplicitly = false;
  if (Number.isInteger(parsedOptParam) && parsedOptParam >= 0 && parsedOptParam < optionCount) {
    effectiveOptionIndex = parsedOptParam;
    selectedExplicitly = true;
  } else if (storedOpt !== null && storedOpt !== undefined && storedOpt >= 0 && storedOpt < optionCount) {
    effectiveOptionIndex = storedOpt;
    selectedExplicitly = true;
  }

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

  const isLoading = (!isOfflineDemo && projectLoading) || bundleLoading;
  const activeError = projectError ?? bundleError;
  const isBlocked = activeError instanceof ApiError && activeError.status === 409;

  const backToJointHref = preset === "iit"
    ? "/demo/iit"
    : isIitOffline
      ? jointPath("iit-demo", resolvedJointId)
      : isWorkedDemo
        ? "/demo"
        : targetJointId
          ? jointPath(id, targetJointId)
          : projectPath(id);

  const updateParam = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    setSearchParams(next, { replace: true });
  };

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 space-y-4 p-4 sm:p-6 print:max-w-none print:p-0">
      {/* Screen-only report toolbar */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-border bg-surface px-4 py-3 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Print or save as PDF</span>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to={backToJointHref}>Back to joint</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to={projectPath(id)}>Back to project</Link>
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isWorkedDemo && (
            <ToggleGroup
              type="single"
              value={demoVariant}
              onValueChange={(v) => {
                if (v === "zone2" || v === "zone3") {
                  updateParam({
                    variant: v === "zone2" ? null : v,
                    option: null,
                  });
                }
              }}
              aria-label="Report seismic zone"
            >
              <ToggleGroupItem value="zone2">Zone II</ToggleGroupItem>
              <ToggleGroupItem value="zone3">Zone III</ToggleGroupItem>
            </ToggleGroup>
          )}

          {!isOfflineDemo && readyJoints.length > 1 && (
            <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Select joint">
              {readyJoints.map((j) => (
                <Button
                  key={j.id}
                  variant={j.id === targetJointId ? "default" : "outline"}
                  size="sm"
                  className="h-7 px-2 font-num text-xs"
                  onClick={() => updateParam({ joint: j.id, option: null })}
                >
                  {j.id}
                </Button>
              ))}
            </div>
          )}

          {bundle && bundle.fix.options.length > 1 && (
            <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Select fix option">
              {bundle.fix.options.map((_, idx) => (
                <Button
                  key={idx}
                  variant={effectiveOptionIndex === idx ? "secondary" : "outline"}
                  size="sm"
                  className="h-7 px-2 font-num text-xs"
                  onClick={() => updateParam({ option: String(idx) })}
                >
                  Option #{idx + 1}
                </Button>
              ))}
            </div>
          )}
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="report-a4 mx-auto min-h-96" />
      ) : activeError || !bundle ? (
        <div className="surface-paper rounded-[var(--radius-lg)] border p-6 space-y-3" data-theme="light">
          <h1 className="font-display text-2xl font-semibold text-foreground">
            Pre-pour check · {targetJointId ?? id}
          </h1>
          <p className="text-sm text-fail">
            {activeError instanceof Error
              ? activeError.message
              : "No ready joint found to generate a pre-pour report."}
          </p>
          {isBlocked && (
            <Button size="sm" asChild>
              <Link to={projectReviewPath(id, targetJointId ? { joint: targetJointId } : undefined)}>
                Resolve To check items
              </Link>
            </Button>
          )}
        </div>
      ) : (
        <PrePourReport
          projectName={
            isIitOffline
              ? "IIT Hyderabad Director Residence (offline)"
              : isWorkedDemo
                ? "C4 × B12 Worked Example (c4-b12)"
                : project?.name || id
          }
          projectPdf={
            isIitOffline
              ? "iith-director-residence-structural.pdf"
              : (project?.pdf ?? null)
          }
          reportDateIso={project?.created_at ?? null}
          bundle={bundle}
          bundleUrl={
            isOfflineDemo
              ? demoAssetUrl(offlineKey, "bundle.json")
              : jointBundleUrl(id, resolvedJointId)
          }
          chosenOptionIndex={effectiveOptionIndex}
          selectedExplicitly={selectedExplicitly}
          exports={
            isOfflineDemo
              ? {
                  jointIfc: demoAssetUrl(offlineKey, "joint.ifc"),
                  fixedIfc:
                    bundle.fix.options.length > 0 ? demoAssetUrl(offlineKey, "fixed.ifc") : null,
                  issuesBcf: demoAssetUrl(offlineKey, "issues.bcf"),
                }
              : {
                  jointIfc: jointIfcUrl(id, resolvedJointId),
                  fixedIfc:
                    bundle.fix.options.length > 0
                      ? jointFixedIfcUrl(id, resolvedJointId, effectiveOptionIndex)
                      : null,
                  issuesBcf: jointIssuesBcfUrl(id, resolvedJointId),
                }
          }
        />
      )}
    </main>
  );
}
