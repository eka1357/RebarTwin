import { FileText, HelpCircle } from "lucide-react";
import { Link } from "react-router";
import { StatusPill } from "../../components/StatusPill";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import type { ProjectJointSummary } from "../../lib/api";
import { formatClause, formatNumber } from "../../lib/format";
import { jointPath, projectReportPath, projectReviewPath } from "../../lib/routes";
import { DraftJointDetails } from "./DraftJointDetails";

function worstRuleSummary(j: ProjectJointSummary): string {
  if (j.status === "to_check") {
    const prefix = j.draft ? "Incomplete draft · blocked by" : "Blocked by";
    return `${prefix} ${formatNumber(j.blocked_count)} To check ${j.blocked_count === 1 ? "item" : "items"}`;
  }
  if (j.status === "fail" && j.worst_failure) {
    return `${formatClause(j.worst_failure.clause)} · ${j.worst_failure.title}`;
  }
  if (j.status === "fail") {
    return `${formatNumber(j.fail_count)} failing ${j.fail_count === 1 ? "check" : "checks"}`;
  }
  return "Passes all applicable checks";
}

export function ProjectJointRow({
  projectId,
  joint: j,
}: {
  projectId: string;
  joint: ProjectJointSummary;
}) {
  const placeLabel = j.place ?? j.grid;
  const floorLabel = j.floor ?? j.level;
  const col = j.column ?? {};
  const beams = j.beams ?? [];
  const colSummary = `${col.id ?? "Col"}${col.b && col.h ? ` ${col.b} × ${col.h}` : ""}`;
  const beamSummary = beams
    .map((b) => `${b.id}${b.b && b.D ? ` ${b.b} × ${b.D}` : ""}`)
    .join(" · ");
  const blockers = j.blocking_items ?? [];

  return (
    <li className="rounded-[var(--radius-md)] border border-border bg-surface-raised p-3">
      <div className="flex flex-col gap-2.5 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="muted" className="font-num">
              {placeLabel
                ? `Grid ${placeLabel}`
                : j.draft
                  ? "Place not on the drawing yet"
                  : "Unassigned"}
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
            {j.draft && <Badge variant="muted">Draft</Badge>}
            {floorLabel && (
              <span className="font-num text-xs text-muted-foreground">{floorLabel}</span>
            )}
            {j.storey && j.storey !== floorLabel && (
              <span className="font-num text-xs text-muted-foreground">{j.storey}</span>
            )}
          </div>

          {j.draft ? (
            <DraftJointDetails joint={j} />
          ) : (
            <p className="font-num text-xs text-muted-foreground">
              {colSummary}
              {beamSummary ? ` · ${beamSummary}` : ""}
            </p>
          )}

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

          {blockers.length > 0 && (
            <ul
              aria-label={`Blocking items for ${j.id}`}
              className="space-y-1 border-t border-border/70 pt-1.5 text-xs text-muted-foreground"
            >
              {blockers.slice(0, 4).map((b, idx) => (
                <li key={b.id ?? `${j.id}-blocker-${idx}`}>
                  <span className="font-num font-medium text-foreground">
                    {b.project_level ? "Project" : b.member ?? "Joint"}
                  </span>
                  {` · ${b.field} · ${b.detail}`}
                </li>
              ))}
              {blockers.length > 4 && (
                <li className="text-muted-foreground">
                  +{formatNumber(blockers.length - 4)} more items in To check
                </li>
              )}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {!j.draft && (
            <>
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
            </>
          )}
          <Button variant={j.status === "to_check" ? "default" : "outline"} size="sm" asChild>
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
}
