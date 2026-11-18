import { AlertTriangle, CheckCircle2, HelpCircle, Layers } from "lucide-react";
import { formatNumber } from "../../lib/format";
import type { ProjectCounts } from "../../lib/api";

export type ProjectStatusFilter = "all" | "fail" | "to_check" | "pass";

interface ProjectSummaryCardsProps {
  counts: ProjectCounts;
  unresolvedToCheck: number;
  blockingToCheck?: number;
  nonBlockingToCheck?: number;
  statusFilter: ProjectStatusFilter;
  onSelectFilter: (next: ProjectStatusFilter) => void;
}

function formatToCheckDetail(
  unresolvedToCheck: number,
  blockingToCheck?: number,
  nonBlockingToCheck?: number,
): string {
  const blocking = blockingToCheck ?? unresolvedToCheck;
  const nonBlocking = nonBlockingToCheck ?? Math.max(0, unresolvedToCheck - blocking);
  const blockingText = `${formatNumber(blocking)} ${blocking === 1 ? "blocks a joint" : "block joints"}`;
  if (nonBlocking <= 0) {
    return blockingText;
  }
  return `${blockingText} · ${formatNumber(nonBlocking)} ${nonBlocking === 1 ? "other reading" : "other readings"}, none blocking`;
}

/**
 * Four clickable top summary tiles for project overview counts:
 * joints found, checked, failing, and blocked by To check.
 */
export function ProjectSummaryCards({
  counts,
  unresolvedToCheck,
  blockingToCheck,
  nonBlockingToCheck,
  statusFilter,
  onSelectFilter,
}: ProjectSummaryCardsProps) {
  const cards: Array<{
    key: ProjectStatusFilter;
    label: string;
    value: number;
    detail: string;
    Icon: typeof Layers;
    toneClass: string;
    borderClass: string;
  }> = [
      {
        key: "all",
        label: "Joints found",
        value: counts.found,
        detail: `${formatNumber(counts.checked)} checked`,
        Icon: Layers,
        toneClass: "text-foreground",
        borderClass: "border-border",
      },
      {
        key: "pass",
        label: "Checked",
        value: counts.checked,
        detail: `${formatNumber(counts.passing)} pass every rule`,
        Icon: CheckCircle2,
        toneClass: "text-pass",
        borderClass: "border-pass/40",
      },
      {
        key: "fail",
        label: "Failing",
        value: counts.failing,
        detail: "Fails IS 456, IS 13920, or clearance",
        Icon: AlertTriangle,
        toneClass: "text-fail",
        borderClass: "border-fail/40",
      },
      {
        key: "to_check",
        label: "Blocked by To check",
        value: counts.blocked,
        detail: formatToCheckDetail(unresolvedToCheck, blockingToCheck, nonBlockingToCheck),
        Icon: HelpCircle,
        toneClass: "text-check",
        borderClass: "border-check/40",
      },
    ];

  return (
    <section aria-label="Project joint counts" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map(({ key, label, value, detail, Icon, toneClass, borderClass }) => {
        const active = statusFilter === key;
        const clickTarget: ProjectStatusFilter =
          key === "all" ? "all" : statusFilter === key ? "all" : key;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={active}
            onClick={() => onSelectFilter(clickTarget)}
            className={`flex flex-col items-start justify-between rounded-[var(--radius-lg)] border bg-surface p-3.5 text-left transition-colors duration-[var(--dur-1)] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "border-2 border-ring bg-surface-raised" : `${borderClass} hover:bg-surface-raised`
              }`}
          >
            <div className="flex w-full items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">{label}</span>
              <Icon className={`h-4 w-4 shrink-0 ${toneClass}`} aria-hidden="true" />
            </div>
            <p className={`mt-2 font-num text-2xl font-semibold ${toneClass}`}>
              {formatNumber(value)}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
          </button>
        );
      })}
    </section>
  );
}
