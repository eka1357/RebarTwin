import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { StatusPill } from "../../components/StatusPill";
import { Badge } from "../../components/ui/badge";
import { formatArea, formatMeasure, formatNumber, formatPercentDelta } from "../../lib/format";
import type { Bundle } from "../../types/bundle";
import { SectionGlyph } from "../fixes/SectionGlyph";

interface ReportChosenFixProps {
  bundle: Bundle;
  chosenOptionIndex: number;
  selectedExplicitly: boolean;
}

/**
 * Chosen fix summary for the pre-pour report: before/after SectionGlyphs,
 * steel area before -> provided, effective depth change, column resize,
 * and every engineering recheck / redesign flag.
 */
export function ReportChosenFix({
  bundle,
  chosenOptionIndex,
  selectedExplicitly,
}: ReportChosenFixProps) {
  const options = bundle.fix.options;
  const clampedIdx =
    options.length > 0 ? Math.min(Math.max(0, chosenOptionIndex), options.length - 1) : 0;
  const option = options[clampedIdx];

  if (!option) {
    const isClean = bundle.fix.status === "clean";
    return (
      <section aria-labelledby="report-fix-heading" className="report-break-avoid space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-1.5">
          <h2 id="report-fix-heading" className="font-display text-base font-semibold text-foreground">
            Chosen fix
          </h2>
          <StatusPill status={isClean ? "pass" : "redesign"} size="sm" />
        </div>
        <p className="rounded-[var(--radius-md)] border border-border bg-surface-raised p-3 text-sm text-foreground">
          {isClean
            ? "No bar change required; joint passes as drawn."
            : `${bundle.fix.summary} The engineer of record decides.`}
        </p>
      </section>
    );
  }

  const hasRedesign = bundle.fix.status === "redesign" || Boolean(option.column);
  const hasRecheck = option.flags.length > 0 && !hasRedesign;
  const pillStatus = hasRedesign ? "redesign" : hasRecheck ? "recheck" : "pass";

  return (
    <section aria-labelledby="report-fix-heading" className="report-break-avoid space-y-3 print:space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-1.5 print:pb-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="report-fix-heading" className="font-display text-base font-semibold text-foreground print:text-sm">
            Chosen fix
          </h2>
          <Badge variant="muted" className="font-num">
            Option #{clampedIdx + 1} · {selectedExplicitly ? "Selected in workspace" : "Top ranked"}
          </Badge>
        </div>
        <StatusPill status={pillStatus} size="sm" />
      </div>

      <div className="rounded-[var(--radius-md)] border border-border bg-surface-raised p-3.5 space-y-3 print:p-2 print:space-y-1.5">
        <div>
          <p className="font-num text-sm font-semibold text-foreground">{option.candidate.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {bundle.report.is13920
              ? "Passes every check that applies (IS 456, IS 13920, and geometry) once applied."
              : `Passes every check that applies once applied. IS 13920 is off in zone ${bundle.report.seismic_zone}.`}
          </p>
        </div>

        {hasRedesign && (
          <div className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-advisory/40 bg-advisory-surface p-2.5 text-xs text-advisory">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              Redesign: column section changes{option.column ? ` (${option.column} mm)` : ""}. The
              engineer of record decides.
            </span>
          </div>
        )}

        {option.faces.map((fc) => (
          <div
            key={`${fc.beam}-${fc.face}`}
            className="grid gap-3 md:grid-cols-[auto_minmax(0,1fr)] md:items-center print:grid-cols-[auto_minmax(0,1fr)] print:items-center print:gap-2.5"
          >
            <div className="grid grid-cols-2 gap-2.5">
              <SectionGlyph
                scene={bundle.scene}
                beamId={fc.beam}
                face={fc.face}
                caption="Before"
                faceSummary={fc.before}
              />
              <SectionGlyph
                scene={bundle.option_scenes[clampedIdx] ?? bundle.scene}
                beamId={fc.beam}
                face={fc.face}
                caption="After"
                faceSummary={fc.after}
              />
            </div>

            <dl className="grid gap-2 text-xs sm:grid-cols-2 md:grid-cols-1 print:grid-cols-2 print:gap-x-4 print:gap-y-1">
              <div>
                <dt className="text-muted-foreground">
                  {fc.beam} {fc.face} bars
                </dt>
                <dd className="mt-0.5 font-num font-medium text-foreground">
                  {fc.before} → {fc.after} ({fc.n_bars_before} bars → {fc.n_bars})
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Effective depth</dt>
                <dd className="mt-0.5 font-num font-medium text-foreground">
                  {formatNumber(fc.depth_before)} → {formatMeasure(fc.depth_after, "mm")}
                </dd>
              </div>
              <div className="print:col-span-2">
                <dt className="text-muted-foreground">Steel area (before → provided)</dt>
                <dd className="mt-0.5 font-num font-medium text-foreground">
                  {formatNumber(fc.area_before)} → {formatArea(fc.area_provided)} (
                  {formatPercentDelta(fc.overshoot_pct)} vs {formatArea(fc.area_required)} needed)
                </dd>
              </div>
            </dl>
          </div>
        ))}

        {option.column && (
          <p className="font-num text-xs text-foreground">
            Column size: <span className="font-semibold">{option.column} mm</span>
          </p>
        )}

        {option.flags.length > 0 ? (
          <ul className="space-y-1.5 rounded-[var(--radius-sm)] border border-advisory/40 bg-advisory-surface p-2.5 text-xs text-advisory">
            {option.flags.map((flag, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{flag}</span>
              </li>
            ))}
          </ul>
        ) : (
          !hasRedesign && (
            <p className="flex items-center gap-1.5 text-xs text-pass">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>No effective depth or redesign flags raised for this option.</span>
            </p>
          )
        )}
      </div>
    </section>
  );
}
