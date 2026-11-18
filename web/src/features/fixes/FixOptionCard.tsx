import { AlertTriangle, Check, Eye, FileText, RotateCcw } from "lucide-react";
import { StatusPill } from "../../components/StatusPill";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  formatAfterColumnSize,
  formatArea,
  formatColumnMainSummary,
  formatMeasure,
  formatPercentDelta,
} from "../../lib/format";
import type { ColumnSpec, FixOption, Scene } from "../../types/bundle";
import { SectionGlyph } from "./SectionGlyph";

interface FixOptionCardProps {
  rank: number;
  option: FixOption;
  column?: ColumnSpec;
  beforeScene: Scene;
  afterScene?: Scene;
  isPreviewing: boolean;
  isChosen: boolean;
  onPreviewAfter: () => void;
  onShowBefore: () => void;
  onUseInReport: () => void;
  onOpenReport?: () => void;
}

function formatPlainFixTitle(option: FixOption): string {
  const f0 = option.faces[0];
  if (!f0) return option.candidate.title;
  const barSummary = f0.after.replace(" / ", " over ");
  return option.column ? `${barSummary}; ${option.candidate.title.split("; ").slice(-1)[0]}` : barSummary;
}

export function FixOptionCard({
  rank,
  option,
  column,
  beforeScene,
  afterScene,
  isPreviewing,
  isChosen,
  onPreviewAfter,
  onShowBefore,
  onUseInReport,
  onOpenReport,
}: FixOptionCardProps) {
  const primaryFace = option.faces[0];
  const hasRedesign = Boolean(option.column);
  const hasRecheck = option.flags.length > 0 && !hasRedesign;
  const pillStatus = hasRedesign ? "redesign" : hasRecheck ? "recheck" : "pass";

  return (
    <article
      className={`rounded-[var(--radius-md)] border p-3 transition-colors duration-[var(--dur-1)] ${
        isPreviewing
          ? "border-2 border-ring bg-surface-raised"
          : "border-border bg-surface-raised hover:border-border-strong"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5">
            <Badge variant="muted" className="font-num">
              #{rank}
            </Badge>
            <h3 className="font-num text-sm font-semibold text-foreground">
              {formatPlainFixTitle(option)}
            </h3>
          </div>
          <p className="text-xs text-muted-foreground">{option.candidate.title}</p>
        </div>
        <StatusPill status={pillStatus} size="sm" />
      </div>

      {option.column && column && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <SectionGlyph
            scene={beforeScene}
            columnId={column.id}
            caption="Before column"
            faceSummary={`${column.b} × ${column.h} · ${formatColumnMainSummary(column)}`}
          />
          <SectionGlyph
            scene={afterScene ?? beforeScene}
            columnId={column.id}
            caption="After column"
            faceSummary={`${formatAfterColumnSize(option.column)} · ${formatColumnMainSummary(column)}`}
          />
        </div>
      )}

      {primaryFace && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <SectionGlyph
            scene={beforeScene}
            beamId={primaryFace.beam}
            face={primaryFace.face}
            caption="Before"
            faceSummary={primaryFace.before}
          />
          <SectionGlyph
            scene={afterScene ?? beforeScene}
            beamId={primaryFace.beam}
            face={primaryFace.face}
            caption="After"
            faceSummary={primaryFace.after}
          />
        </div>
      )}

      {option.faces.length > 0 && (
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-border/70 pt-2.5 text-xs">
          {option.faces.map((fc) => (
            <div key={`${fc.beam}-${fc.face}`} className="contents">
              <div>
                <dt className="text-muted-foreground">
                  {fc.beam} {fc.face} steel
                </dt>
                <dd className="font-num font-medium text-foreground">
                  {formatArea(fc.area_provided)} ({formatPercentDelta(fc.overshoot_pct)})
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Effective depth</dt>
                <dd className="font-num font-medium text-foreground">
                  {formatMeasure(fc.depth_before, "mm")} → {formatMeasure(fc.depth_after, "mm")}
                </dd>
              </div>
            </div>
          ))}
          {option.column && (
            <div className="col-span-2">
              <dt className="text-muted-foreground">Column resize</dt>
              <dd className="font-num font-medium text-foreground">{option.column} mm</dd>
            </div>
          )}
        </dl>
      )}

      {option.flags.length > 0 && (
        <ul className="mt-2.5 space-y-1 rounded-[var(--radius-sm)] border border-advisory/35 bg-advisory-surface p-2 text-xs text-advisory">
          {option.flags.map((flag, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
              <span>{flag}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/70 pt-2.5">
        {isPreviewing ? (
          <Button variant="outline" size="sm" onClick={onShowBefore}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Show Before</span>
          </Button>
        ) : (
          <Button variant="default" size="sm" onClick={onPreviewAfter}>
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Preview After</span>
          </Button>
        )}
        <Button
          variant={isChosen ? "secondary" : "outline"}
          size="sm"
          aria-pressed={isChosen}
          onClick={onUseInReport}
        >
          {isChosen && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
          <span>{isChosen ? "Used in report" : "Use in report"}</span>
        </Button>
        {isChosen && onOpenReport && (
          <Button variant="outline" size="sm" onClick={onOpenReport}>
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Open report</span>
          </Button>
        )}
      </div>
    </article>
  );
}
