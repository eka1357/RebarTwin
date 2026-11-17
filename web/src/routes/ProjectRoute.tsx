import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Link, useParams } from "react-router";
import { StatusPill } from "../components/StatusPill";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/ui/skeleton";
import { getProject } from "../lib/api";
import {
  jointPath,
  projectReportPath,
  projectReviewPath,
  projectUploadPath,
} from "../lib/routes";
import { useWorkspaceStore } from "../stores/workspace";

export function ProjectRoute() {
  const { id = "c4-b12" } = useParams();
  const setStatus = useWorkspaceStore((s) => s.setStatus);

  const isOfflineDemo = id === "c4-b12";
  const { data: project, isLoading, error } = useQuery({
    queryKey: ["project", id],
    queryFn: () => getProject(id),
    enabled: !isOfflineDemo,
    retry: false,
    refetchInterval: (q) => (q.state.data?.status === "reading" ? 1500 : false),
  });

  useEffect(() => {
    if (!project) return;
    setStatus({
      jointLabel: project.name || project.id,
      toCheckCount: project.to_check_counts.unresolved,
      activity: project.status === "reading" ? "Reading drawing set" : null,
    });
  }, [project, setStatus]);

  // Keep static fallback for the offline demo shell route (/projects/c4-b12)
  if (!project && !isLoading && id === "c4-b12") {
    return (
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-num text-xs text-muted-foreground">Project · {id}</p>
            <h1 className="font-display text-2xl font-semibold">Joints Overview</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to={projectUploadPath(id)}>Upload PDF</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to={projectReviewPath(id)}>To check</Link>
            </Button>
            <Button size="sm" asChild>
              <Link to={projectReportPath(id)}>Report</Link>
            </Button>
          </div>
        </div>

        <section className="rounded-[var(--radius-lg)] border border-border bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-semibold">C4 × B12</h2>
              <p className="font-num text-xs text-muted-foreground">
                C4 300 × 300 · B12 230 × 450 · Zone II
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StatusPill status="fail" count={6} />
              <Button variant="secondary" size="sm" asChild>
                <Link to={jointPath(id, "C4xB12")}>Inspect joint</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-num text-xs text-muted-foreground">
            Project · {project?.name ?? id}
            {project?.pdf ? ` · ${project.pdf}` : ""}
          </p>
          <h1 className="font-display text-2xl font-semibold">Joints Overview</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to={projectUploadPath(id)}>Upload PDF</Link>
          </Button>
          <Button
            variant={
              project && project.to_check_counts.unresolved > 0 ? "default" : "outline"
            }
            size="sm"
            asChild
          >
            <Link to={projectReviewPath(id)}>
              To check ({project?.to_check_counts.unresolved ?? 0})
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to={projectReportPath(id)}>Report</Link>
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : error || !project ? (
        <div className="rounded-[var(--radius-lg)] border border-fail/40 bg-fail-surface p-4 text-sm text-fail">
          {error instanceof Error ? error.message : "Could not load project."}
        </div>
      ) : (
        <>
          {project.status === "reading" && (
            <div className="rounded-[var(--radius-lg)] border border-check/40 bg-check-surface p-4 text-xs text-check">
              Reading drawing set in progress. Refreshing automatically as joints become ready.
            </div>
          )}

          {project.to_check_counts.project_level_unresolved > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-check/40 bg-check-surface p-4">
              <p className="text-xs text-foreground">
                {project.to_check_counts.project_level_unresolved} project-level To check item(s)
                block every joint until confirmed.
              </p>
              <Button size="sm" asChild>
                <Link to={projectReviewPath(id)}>Resolve project items</Link>
              </Button>
            </div>
          )}

          {project.joints.length === 0 ? (
            <div className="surface-paper rounded-[var(--radius-lg)] border p-6 text-sm">
              {project.status === "error"
                ? project.error || "Reading stopped with an error."
                : "No joints linked yet. Upload a drawing set to start reading."}
            </div>
          ) : (
            <div className="space-y-3">
              {project.joints.map((j) => {
                const beamSummary = j.beams
                  .map((b) => `${b.id} ${b.b ?? ""}×${b.D ?? ""}`)
                  .join(" · ");
                return (
                  <section
                    key={j.id}
                    className="rounded-[var(--radius-lg)] border border-border bg-surface p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="font-display text-base font-semibold">{j.id}</h2>
                          {j.seismic_zone && (
                            <Badge variant="muted" className="font-num">
                              Zone {j.seismic_zone}
                            </Badge>
                          )}
                        </div>
                        <p className="font-num text-xs text-muted-foreground">
                          {j.column.id ?? "Col"} {j.column.b ?? ""} × {j.column.h ?? ""}
                          {beamSummary ? ` · ${beamSummary}` : ""}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {j.status === "to_check" ? (
                          <>
                            <StatusPill status="to_check" count={j.blocked_count} />
                            <Button variant="outline" size="sm" asChild>
                              <Link to={projectReviewPath(id)}>Resolve To check</Link>
                            </Button>
                          </>
                        ) : (
                          <>
                            <StatusPill
                              status={j.fail_count > 0 ? "fail" : "pass"}
                              count={j.fail_count > 0 ? j.fail_count : undefined}
                            />
                            <Button variant="secondary" size="sm" asChild>
                              <Link to={jointPath(id, j.id)}>Inspect joint</Link>
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}
    </main>
  );
}
