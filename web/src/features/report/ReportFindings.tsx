import { CheckCircle2 } from "lucide-react";
import { StatusPill } from "../../components/StatusPill";
import { Badge } from "../../components/ui/badge";
import {
  formatCalloutValue,
  formatClause,
  formatNumber,
  groupReportFindings,
} from "../../lib/format";
import type { Bundle } from "../../types/bundle";
import { ToleranceGauge } from "../findings/ToleranceGauge";

interface ReportFindingsProps {
  bundle: Bundle;
}

/**
 * Failing and passing code checks formatted strictly from engine numbers,
 * grouping findings with identical rule, members, measured value, and limit
 * into one line and one ToleranceGauge.
 */
export function ReportFindings({ bundle }: ReportFindingsProps) {
  const failing = bundle.report.findings.filter((f) => f.status === "fail");
  const groupedFailing = groupReportFindings(failing);
  const passedEntries = Object.entries(bundle.report.passed);
  const totalPassed = passedEntries.reduce((sum, [, n]) => sum + n, 0);

  return (
    <section aria-labelledby="report-findings-heading" className="space-y-2.5 print:space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-1.5 print:pb-1">
        <h2 id="report-findings-heading" className="font-display text-base font-semibold text-foreground print:text-sm">
          {failing.length > 0 ? "Failing checks" : "Code checks"}
        </h2>
        <span className="font-num text-xs text-muted-foreground">
          {failing.length} failing · {formatNumber(totalPassed)} passing
        </span>
      </div>

      {failing.length === 0 ? (
        <div className="report-break-avoid flex items-center gap-2 rounded-[var(--radius-md)] border border-pass/40 bg-pass-surface p-3 text-sm text-pass print:p-2 print:text-xs">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            {bundle.report.is13920
              ? "Passes every check that applies as drawn."
              : `Passes every check that applies as drawn. IS 13920 is off in zone ${bundle.report.seismic_zone}.`}
          </span>
        </div>
      ) : (
        <ol className="space-y-2 print:space-y-1.5">
          {groupedFailing.map((group, idx) => {
            const f = group.representative;
            return (
              <li
                key={`${f.rule}-${idx}`}
                className="report-break-avoid rounded-[var(--radius-md)] border border-border bg-surface-raised p-2.5 print:p-1.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill status="fail" size="sm" />
                    <span className="text-sm font-medium text-foreground print:text-xs">{f.title}</span>
                    {group.count > 1 && (
                      <Badge variant="muted" className="font-num">
                        {group.count} checks
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="muted" className="font-num">
                      {formatClause(f.clause)}
                    </Badge>
                    <Badge variant="fail" className="font-num">
                      {formatCalloutValue(f)}
                    </Badge>
                  </div>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-foreground print:text-xs">{group.sentence}</p>
                <ToleranceGauge finding={f} />
              </li>
            );
          })}
        </ol>
      )}

      {passedEntries.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Checks passed ({formatNumber(totalPassed)}):{" "}
          {passedEntries
            .map(([ruleId, count]) => {
              const clause = bundle.rules[ruleId]?.clause;
              return `${formatClause(clause ?? ruleId)} (${formatNumber(count)})`;
            })
            .join(", ")}
          .
        </p>
      )}
    </section>
  );
}
