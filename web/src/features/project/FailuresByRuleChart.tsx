import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import type { RuleFailureStat } from "../../lib/api";
import { formatClause, formatNumber } from "../../lib/format";

interface FailuresByRuleChartProps {
  stats: RuleFailureStat[];
  selectedRule: string | null;
  onSelectRule: (ruleId: string | null) => void;
}

/**
 * Simple horizontal bar chart of failing checks by BIS/geometry rule.
 * Uses clause badges, AlertTriangle icons, hatched bars, and tabular counts
 * so status is never communicated by colour alone.
 */
export function FailuresByRuleChart({
  stats,
  selectedRule,
  onSelectRule,
}: FailuresByRuleChartProps) {
  const maxFailures = Math.max(1, ...stats.map((s) => s.failures));

  return (
    <section
      aria-labelledby="failures-by-rule-heading"
      className="rounded-[var(--radius-lg)] border border-border bg-surface p-4 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="failures-by-rule-heading" className="font-display text-base font-semibold text-foreground">
            Failures by rule
          </h2>
          <p className="text-xs text-muted-foreground">
            Click a rule bar to filter the joint list below.
          </p>
        </div>
        {selectedRule && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => onSelectRule(null)}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Clear rule filter</span>
          </Button>
        )}
      </div>

      {stats.length === 0 ? (
        <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-pass/40 bg-pass-surface p-3 text-xs text-pass">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Zero failing rules across checked joints.</span>
        </div>
      ) : (
        <ul aria-label="Failing checks by rule" className="space-y-2.5">
          {stats.map((stat) => {
            const pct = Math.max(6, Math.round((stat.failures / maxFailures) * 100));
            const active = selectedRule === stat.rule;
            return (
              <li key={stat.rule}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => onSelectRule(active ? null : stat.rule)}
                  className={`w-full rounded-[var(--radius-md)] border p-2.5 text-left transition-colors duration-[var(--dur-1)] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    active
                      ? "border-2 border-ring bg-surface-raised"
                      : "border-border bg-surface-raised/60 hover:border-border-strong hover:bg-surface-raised"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-fail" aria-hidden="true" />
                      <Badge variant="muted" className="font-num">
                        {formatClause(stat.clause)}
                      </Badge>
                      <span className="font-medium text-foreground">{stat.title}</span>
                    </div>
                    <span className="font-num font-semibold text-foreground shrink-0">
                      {formatNumber(stat.failures)} {stat.failures === 1 ? "fail" : "fails"} ·{" "}
                      {formatNumber(stat.joints)} {stat.joints === 1 ? "joint" : "joints"}
                    </span>
                  </div>

                  <div
                    aria-hidden="true"
                    className="mt-2 h-2.5 w-full overflow-hidden rounded-[var(--radius-xs)] border border-border bg-surface-sunken"
                  >
                    <div
                      className="h-full border-r border-fail"
                      style={{
                        width: `${pct}%`,
                        backgroundImage:
                          "repeating-linear-gradient(135deg, var(--fail) 0 3px, color-mix(in srgb, var(--fail) 35%, transparent) 3px 6px)",
                      }}
                    />
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
