import { Eye, FileSearch } from "lucide-react";
import { forwardRef, useId } from "react";
import { StatusPill } from "../../components/StatusPill";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { describeFindingCardLabel } from "../../lib/a11y";
import { formatCalloutValue } from "../../lib/format";
import type { Finding, RuleMeta, SceneBar } from "../../types/bundle";
import { BarChip } from "./BarChip";
import { ClauseChip } from "./ClauseChip";
import { ToleranceGauge } from "./ToleranceGauge";

interface FindingCardProps {
  finding: Finding;
  index: number;
  active: boolean;
  ruleMeta?: RuleMeta;
  barsById: Map<string, SceneBar>;
  selectedBarId: string | null;
  onSelect: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
  onHoverFinding: (hovering: boolean) => void;
  onSelectBar: (barId: string) => void;
  onHoverBar: (barId: string | null) => void;
  onShowIn3d: () => void;
  onOpenSource: () => void;
}

/**
 * Finding card with concise aria-label on the card selection trigger,
 * details and ToleranceGauge linked via aria-describedby, plus secondary
 * interactive chips (ClauseChip, BarChips, Show in 3D, Source) layered cleanly above.
 */
export const FindingCard = forwardRef<HTMLElement, FindingCardProps>(function FindingCard(
  {
    finding,
    active,
    ruleMeta,
    barsById,
    selectedBarId,
    onSelect,
    onKeyDown,
    onHoverFinding,
    onSelectBar,
    onHoverBar,
    onShowIn3d,
    onOpenSource,
  },
  ref,
) {
  const descId = useId();
  const isFail = finding.status === "fail";
  const matchedBars = finding.bars
    .map((id) => barsById.get(id))
    .filter((b): b is SceneBar => Boolean(b));

  return (
    <article
      ref={ref}
      onMouseEnter={() => onHoverFinding(true)}
      onMouseLeave={() => onHoverFinding(false)}
      className={`relative rounded-[var(--radius-md)] border p-3 transition-colors duration-[var(--dur-1)] ${active
        ? isFail
          ? "border-2 border-fail bg-surface-raised"
          : "border-2 border-ring bg-surface-raised"
        : "border-border bg-surface-raised hover:border-border-strong"
        }`}
    >
      <button
        type="button"
        onClick={onSelect}
        onKeyDown={onKeyDown}
        aria-pressed={active}
        aria-label={describeFindingCardLabel(finding)}
        aria-describedby={descId}
        className="absolute inset-0 rounded-[var(--radius-md)] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      />

      <div className="pointer-events-none relative">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <StatusPill status={finding.status} size="sm" />
            <span className="text-xs font-medium text-foreground">{finding.title}</span>
          </div>
          <Badge variant={isFail ? "fail" : "pass"} className="font-num">
            {formatCalloutValue(finding)}
          </Badge>
        </div>

        <div id={descId} className="mt-1.5">
          <p className="text-xs leading-relaxed text-muted-foreground">{finding.message}</p>
          <ToleranceGauge finding={finding} />
        </div>
      </div>

      <div className="relative z-10 mt-2 flex flex-wrap items-center gap-1.5 border-t border-border/70 pt-2">
        <ClauseChip clause={finding.clause} ruleId={finding.rule} meta={ruleMeta} />

        {matchedBars.map((bar) => (
          <BarChip
            key={bar.id}
            bar={bar}
            active={selectedBarId === bar.id}
            onSelect={() => onSelectBar(bar.id)}
            onHover={(hovering) => onHoverBar(hovering ? bar.id : null)}
          />
        ))}

        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onShowIn3d}>
            <Eye className="h-3 w-3" aria-hidden="true" />
            <span>Show in 3D</span>
          </Button>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onOpenSource}>
            <FileSearch className="h-3 w-3" aria-hidden="true" />
            <span>Source</span>
          </Button>
        </div>
      </div>
    </article>
  );
});
