import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/ui/skeleton";
import { BeamJunctionsList } from "../features/project/BeamJunctionsList";
import { FailuresByRuleChart } from "../features/project/FailuresByRuleChart";
import { ProjectJointsTable } from "../features/project/ProjectJointsTable";
import {
  ProjectSummaryCards,
  type ProjectStatusFilter,
} from "../features/project/ProjectSummaryCards";
import { getProject, type ProjectDetail, type RuleFailureStat } from "../lib/api";
import { fetchDemoBundle } from "../lib/demoData";
import { formatNumber } from "../lib/format";
import {
  projectReportPath,
  projectReviewPath,
  projectUploadPath,
} from "../lib/routes";
import { useWorkspaceStore } from "../stores/workspace";
import type { Bundle } from "../types/bundle";

function buildOfflineIitProject(bundle: Bundle): ProjectDetail {
  const fails = bundle.report.findings.filter((f) => f.status === "fail");
  const ruleMap = new Map<string, RuleFailureStat>();
  for (const f of fails) {
    const existing = ruleMap.get(f.rule);
    if (existing) {
      existing.failures += 1;
    } else {
      ruleMap.set(f.rule, {
        rule: f.rule,
        clause: f.clause,
        title: f.title,
        failures: 1,
        joints: 1,
      });
    }
  }
  const worst = fails[0] ?? null;
  const pageNums = Object.keys(bundle.pages ?? {})
    .map((k) => Number.parseInt(k, 10))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);

  return {
    id: "iit-demo",
    name: "IIT Hyderabad Director Residence (offline)",
    pdf: "iith-director-residence-structural.pdf",
    status: "done",
    sheets: pageNums.map((page) => ({ page })),
    counts: {
      found: 1,
      checked: 1,
      failing: fails.length > 0 ? 1 : 0,
      blocked: 0,
      passing: fails.length === 0 ? 1 : 0,
    },
    failures_by_rule: [...ruleMap.values()].sort((a, b) => b.failures - a.failures),
    beam_junctions: [],
    joints: [
      {
        id: bundle.joint.id,
        place: bundle.joint.place ?? null,
        floor: bundle.joint.floor ?? null,
        grid: bundle.joint.place ?? null,
        level: bundle.joint.floor ?? null,
        sheets: pageNums,
        column: {
          id: bundle.joint.column.id,
          b: bundle.joint.column.b,
          h: bundle.joint.column.h,
          n_bars: bundle.joint.column.n_bars,
          bar_dia: bundle.joint.column.bar_dia,
          face_dia: bundle.joint.column.face_dia,
        },
        beams: bundle.joint.beams.map((b) => ({
          id: b.id,
          b: b.b,
          D: b.D,
          direction: b.direction,
        })),
        seismic_zone: bundle.report.seismic_zone,
        exposure: bundle.joint.settings.exposure,
        status: fails.length > 0 ? "fail" : "pass",
        fix_status: bundle.fix.status,
        fail_count: fails.length,
        blocked_count: 0,
        failing_rules: [...ruleMap.keys()],
        worst_failure: worst
          ? {
              rule: worst.rule,
              clause: worst.clause,
              title: worst.title,
              measured: worst.measured,
              limit: worst.limit,
              margin: worst.margin,
              unit: worst.unit,
            }
          : null,
        bundle_ready: true,
      },
    ],
    to_check_counts: {
      total: 0,
      unresolved: 0,
      blocking_unresolved: 0,
      non_blocking_unresolved: 0,
      project_level_unresolved: 0,
    },
  };
}

const OFFLINE_DEMO_PROJECT: ProjectDetail = {
  id: "c4-b12",
  name: "Worked Example (C4 × B12)",
  status: "done",
  sheets: [{ page: 1 }],
  counts: { found: 1, checked: 1, failing: 1, blocked: 0, passing: 0 },
  failures_by_rule: [
    {
      rule: "IS456-26.3.2-H",
      clause: "IS 456:2000 cl. 26.3.2",
      title: "Clear gap between parallel bars",
      failures: 4,
      joints: 1,
    },
    {
      rule: "GEOM-CLASH",
      clause: "Geometry",
      title: "Bars that run into each other",
      failures: 2,
      joints: 1,
    },
  ],
  beam_junctions: [],
  joints: [
    {
      id: "C4xB12",
      grid: "Worked example",
      level: "Deck assumption",
      sheets: [],
      column: { id: "C4", b: 300, h: 300, n_bars: 8, bar_dia: 16 },
      beams: [{ id: "B12", b: 230, D: 450, direction: "x" }],
      seismic_zone: "II",
      exposure: "mild",
      status: "fail",
      fix_status: "fixed",
      fail_count: 6,
      blocked_count: 0,
      failing_rules: ["IS456-26.3.2-H", "GEOM-CLASH"],
      worst_failure: {
        rule: "GEOM-CLASH",
        clause: "Geometry",
        title: "Bars that run into each other",
        measured: -18,
        limit: 0,
        margin: -18,
        unit: "mm",
      },
      bundle_ready: true,
    },
  ],
  to_check_counts: { total: 0, unresolved: 0, project_level_unresolved: 0 },
};

function deriveCounts(project: ProjectDetail) {
  if (project.counts) return project.counts;
  const failing = project.joints.filter((j) => j.status === "fail").length;
  const blocked = project.joints.filter((j) => j.status === "to_check").length;
  const passing = project.joints.filter((j) => j.status === "pass").length;
  return {
    found: project.joints.length,
    checked: failing + passing,
    failing,
    blocked,
    passing,
  };
}

function deriveRuleStats(project: ProjectDetail): RuleFailureStat[] {
  if (project.failures_by_rule) return project.failures_by_rule;
  const map = new Map<string, RuleFailureStat>();
  for (const j of project.joints) {
    if (j.status === "fail" && j.worst_failure) {
      const wf = j.worst_failure;
      const existing = map.get(wf.rule);
      if (existing) {
        existing.failures += j.fail_count;
        existing.joints += 1;
      } else {
        map.set(wf.rule, {
          rule: wf.rule,
          clause: wf.clause,
          title: wf.title,
          failures: j.fail_count,
          joints: 1,
        });
      }
    }
  }
  return [...map.values()].sort((a, b) => b.failures - a.failures || a.rule.localeCompare(b.rule));
}

export function ProjectRoute() {
  const { id = "c4-b12" } = useParams();
  const setStatus = useWorkspaceStore((s) => s.setStatus);
  const [statusFilter, setStatusFilter] = useState<ProjectStatusFilter>("all");
  const [ruleFilter, setRuleFilter] = useState<string | null>(null);

  const isIitOffline = id === "iit-demo";
  const isWorkedOffline = id === "c4-b12";
  const isOfflineDemo = isWorkedOffline || isIitOffline;

  const { data: fetchedProject, isLoading: apiLoading, error: apiError } = useQuery({
    queryKey: ["project", id],
    queryFn: () => getProject(id),
    enabled: !isOfflineDemo,
    retry: false,
    refetchInterval: (q) => (q.state.data?.status === "reading" ? 1500 : false),
  });

  const {
    data: offlineIitProject,
    isLoading: iitLoading,
    error: iitError,
  } = useQuery({
    queryKey: ["offline-iit-project"],
    queryFn: async () => buildOfflineIitProject(await fetchDemoBundle("iit")),
    enabled: isIitOffline,
    staleTime: Infinity,
    retry: false,
  });

  const isLoading = isWorkedOffline ? false : isIitOffline ? iitLoading : apiLoading;
  const error = isWorkedOffline ? null : isIitOffline ? iitError : apiError;
  const project = isWorkedOffline
    ? OFFLINE_DEMO_PROJECT
    : isIitOffline
      ? offlineIitProject
      : fetchedProject;

  const blockingToCheck = project
    ? (project.to_check_counts.blocking_unresolved ?? project.to_check_counts.unresolved)
    : 0;
  const nonBlockingToCheck = project
    ? (project.to_check_counts.non_blocking_unresolved ??
      Math.max(0, project.to_check_counts.unresolved - blockingToCheck))
    : 0;

  useEffect(() => {
    if (!project) return;
    const counts = deriveCounts(project);
    setStatus({
      jointLabel: project.name || project.id,
      failCount: counts.failing,
      toCheckCount: blockingToCheck,
      activity: project.status === "reading" ? "Reading drawing set" : null,
    });
  }, [project, blockingToCheck, setStatus]);

  const counts = project ? deriveCounts(project) : null;
  const ruleStats = project ? deriveRuleStats(project) : [];

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 space-y-5 p-4 sm:p-6">
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
            variant={blockingToCheck > 0 ? "default" : "outline"}
            size="sm"
            asChild
          >
            <Link to={projectReviewPath(id)}>
              To check ({formatNumber(blockingToCheck)})
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to={projectReportPath(id)}>Report</Link>
          </Button>
        </div>
      </div>

      {!isOfflineDemo && isLoading ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : !isOfflineDemo && (error || !project) ? (
        <div className="rounded-[var(--radius-lg)] border border-fail/40 bg-fail-surface p-4 text-sm text-fail">
          {error instanceof Error ? error.message : "Could not load project."}
        </div>
      ) : project && counts ? (
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

          <ProjectSummaryCards
            counts={counts}
            unresolvedToCheck={project.to_check_counts.unresolved}
            blockingToCheck={blockingToCheck}
            nonBlockingToCheck={nonBlockingToCheck}
            statusFilter={statusFilter}
            onSelectFilter={setStatusFilter}
          />

          <FailuresByRuleChart
            stats={ruleStats}
            selectedRule={ruleFilter}
            onSelectRule={setRuleFilter}
          />

          <ProjectJointsTable
            projectId={id}
            joints={project.joints}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            ruleFilter={ruleFilter}
            onClearRuleFilter={() => setRuleFilter(null)}
          />

          <BeamJunctionsList junctions={project.beam_junctions ?? []} />
        </>
      ) : null}
    </main>
  );
}
