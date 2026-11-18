import { FileText, HelpCircle, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { StatusPill } from "../../components/StatusPill";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import type { ProjectJointSummary } from "../../lib/api";
import { formatClause, formatNumber } from "../../lib/format";
import { jointPath, projectReportPath, projectReviewPath } from "../../lib/routes";
import type { ProjectStatusFilter } from "./ProjectSummaryCards";

const STATUS_RANK: Record<ProjectJointSummary["status"], number> = {
  fail: 0,
  to_check: 1,
  pass: 2,
};

interface ProjectJointsTableProps {
  projectId: string;
  joints: ProjectJointSummary[];
  statusFilter: ProjectStatusFilter;
  onStatusFilterChange: (next: ProjectStatusFilter) => void;
  ruleFilter: string | null;
  onClearRuleFilter: () => void;
}

/** Sort joints: failing first, then blocked (most blockers first), then passing. */
function sortProjectJoints(joints: ProjectJointSummary[]): ProjectJointSummary[] {
  return [...joints].sort((a, b) => {
    const rankDiff = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (rankDiff !== 0) return rankDiff;
    if (a.fail_count !== b.fail_count) return b.fail_count - a.fail_count;
    if (a.blocked_count !== b.blocked_count) return b.blocked_count - a.blocked_count;
    return a.id.localeCompare(b.id);
  });
}

function worstRuleSummary(j: ProjectJointSummary): string {
  if (j.status === "to_check") {
    return `Blocked by ${formatNumber(j.blocked_count)} To check ${j.blocked_count === 1 ? "item" : "items"}`;
  }
  if (j.status === "fail" && j.worst_failure) {
    return `${formatClause(j.worst_failure.clause)} · ${j.worst_failure.title}`;
  }
  if (j.status === "fail") {
    return `${formatNumber(j.fail_count)} failing ${j.fail_count === 1 ? "check" : "checks"}`;
  }
  return "Passes all applicable checks";
}

export function ProjectJointsTable({
  projectId,
  joints,
  statusFilter,
  onStatusFilterChange,
  ruleFilter,
  onClearRuleFilter,
}: ProjectJointsTableProps) {
  const [query, setQuery] = useState("");

  const sorted = useMemo(() => sortProjectJoints(joints), [joints]);
  const visibleJoints = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sorted.filter((j) => {
      if (statusFilter !== "all" && j.status !== statusFilter) return false;
      if (ruleFilter) {
        const hasRule =
          j.failing_rules?.includes(ruleFilter) || j.worst_failure?.rule === ruleFilter;
        if (!hasRule) return false;
      }
      if (!q) return true;
      const haystack = [
        j.id,
        j.grid ?? "",
        j.level ?? "",
        j.column.id ?? "",
        ...j.beams.map((b) => b.id),
        j.worst_failure?.clause ?? "",
        j.worst_failure?.title ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [query, ruleFilter, sorted, statusFilter]);

  return (
    <section
      aria-labelledby="project-joints-heading"
      className="rounded-[var(--radius-lg)] border border-border bg-surface p-4 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="project-joints-heading" className="font-display text-base font-semibold text-foreground">
            Joints ({formatNumber(visibleJoints.length)}
            {visibleJoints.length !== sorted.length ? ` of ${formatNumber(sorted.length)}` : ""})
          </h2>
          <p className="text-xs text-muted-foreground">
            Failing joints first, followed by blocked and passing joints.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <label htmlFor="project-joint-search" className="sr-only">
              Filter joints by id, grid, column, or beam
            </label>
            <Search
              className="pointer-events-none absolute top-2 left-2.5 h-3.5 w-3.5 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              id="project-joint-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search joint, grid, column, beam"
              className="h-8 w-full rounded-[var(--radius-md)] border border-control-border bg-surface-raised pl-8 pr-2.5 text-xs text-foreground placeholder:text-subtle-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          {ruleFilter && (
            <Button variant="outline" size="sm" className="h-8 px-2 text-xs" onClick={onClearRuleFilter}>
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Rule: {ruleFilter}</span>
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by status">
        {(
          [
            ["all", "All"],
            ["fail", "Fails"],
            ["to_check", "To check"],
            ["pass", "Passes"],
          ] as const
        ).map(([val, text]) => (
          <Button
            key={val}
            variant={statusFilter === val ? "default" : "outline"}
            size="sm"
            className="h-7 px-2.5 text-xs"
            aria-pressed={statusFilter === val}
            onClick={() => onStatusFilterChange(val)}
          >
            {text}
          </Button>
        ))}
      </div>

      {visibleJoints.length === 0 ? (
        <p className="rounded-[var(--radius-md)] border border-border bg-surface-sunken p-4 text-xs text-muted-foreground">
          No joints match the current filter.
        </p>
      ) : (
        <ol aria-label="Project joints list" className="space-y-2">
          {visibleJoints.map((j) => {
            const colSummary = `${j.column.id ?? "Col"}${j.column.b && j.column.h ? ` ${j.column.b} × ${j.column.h}` : ""}`;
            const beamSummary = j.beams
              .map((b) => `${b.id}${b.b && b.D ? ` ${b.b} × ${b.D}` : ""}`)
              .join(" · ");
            return (
              <li
                key={j.id}
                className="rounded-[var(--radius-md)] border border-border bg-surface-raised p-3"
              >
                <div className="flex flex-col gap-2.5 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="muted" className="font-num">
                        Grid {j.grid ?? "Unassigned"}
                      </Badge>
                      <h3 className="font-display text-sm font-semibold text-foreground">{j.id}</h3>
                      <StatusPill
                        status={j.status}
                        size="sm"
                        count={
                          j.status === "fail"
                            ? j.fail_count
                            : j.status === "to_check"
                              ? j.blocked_count
                              : undefined
                        }
                      />
                      {j.level && (
                        <span className="font-num text-xs text-muted-foreground">{j.level}</span>
                      )}
                    </div>
                    <p className="font-num text-xs text-muted-foreground">
                      {colSummary}
                      {beamSummary ? ` · ${beamSummary}` : ""}
                    </p>
                    <p
                      className={`text-xs ${
                        j.status === "fail"
                          ? "font-medium text-fail"
                          : j.status === "to_check"
                            ? "text-check"
                            : "text-muted-foreground"
                      }`}
                    >
                      {worstRuleSummary(j)}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    <Button variant="secondary" size="sm" asChild>
                      <Link to={jointPath(projectId, j.id)} aria-label={`Joint ${j.id}`}>
                        Joint
                      </Link>
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <Link
                        to={projectReportPath(projectId, { joint: j.id })}
                        aria-label={`Report for ${j.id}`}
                      >
                        <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Report</span>
                      </Link>
                    </Button>
                    <Button
                      variant={j.status === "to_check" ? "default" : "outline"}
                      size="sm"
                      asChild
                    >
                      <Link
                        to={projectReviewPath(projectId, { joint: j.id })}
                        aria-label={`To check items for ${j.id}`}
                      >
                        <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>To check</span>
                      </Link>
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
