import { AlertTriangle, CheckCircle2, Download } from "lucide-react";
import { StatusPill } from "../../components/StatusPill";
import { Button } from "../../components/ui/button";
import { formatColumnMainSummary, formatMeasure, formatReportDate } from "../../lib/format";
import { getProvenanceSheetPages, normalizeProvenanceEntries } from "../../lib/provenance";
import type { Bundle } from "../../types/bundle";
import { ReportAssumptionsAndSource } from "./ReportAssumptionsAndSource";
import { ReportChosenFix } from "./ReportChosenFix";
import { ReportFindings } from "./ReportFindings";

interface ReportExportUrls {
  jointIfc: string;
  fixedIfc: string | null;
  issuesBcf: string;
}

interface PrePourReportProps {
  projectName: string;
  projectPdf?: string | null;
  reportDateIso?: string | null;
  bundle: Bundle;
  bundleUrl?: string;
  chosenOptionIndex: number;
  selectedExplicitly: boolean;
  exports: ReportExportUrls;
}

/**
 * Print-ready A4 pre-pour joint report forced onto light paper tokens.
 * Hides interactive export/navigation chrome under `@media print`.
 */
export function PrePourReport({
  projectName,
  projectPdf,
  reportDateIso,
  bundle,
  bundleUrl,
  chosenOptionIndex,
  selectedExplicitly,
  exports,
}: PrePourReportProps) {
  const entries = normalizeProvenanceEntries(bundle, bundleUrl);
  const sheetPages = getProvenanceSheetPages(entries);
  const columnLevel = bundle.joint.floor ?? entries.find((e) => e.isColumn && e.level)?.level ?? null;

  const failCount = bundle.report.findings.filter((f) => f.status === "fail").length;
  const col = bundle.joint.column;
  const beamsSummary = bundle.joint.beams
    .map((b) => `${b.id} ${b.b} × ${b.D} mm`)
    .join("; ");
  const jointDisplay = `${col.id} × ${bundle.joint.beams.map((b) => b.id).join(" / ")}`;

  const verdictText =
    failCount > 0 ? `Fails ${failCount} ${failCount === 1 ? "check" : "checks"}` : "Passes every check";
  const sheetsText =
    sheetPages.length > 0
      ? sheetPages.map((p) => `Page ${p}`).join(", ")
      : "Pitch deck worked example (no sheets)";

  return (
    <article
      data-theme="light"
      aria-label={`Pre-pour joint report for ${bundle.joint.id}`}
      className="report-a4 surface-paper mx-auto rounded-[var(--radius-lg)] border p-6 shadow-xs sm:p-8 space-y-5 print:space-y-1.5"
    >
      {/* Header: project, joint id, sheets, zone, date */}
      <header className="space-y-3 border-b border-border pb-3 print:space-y-1 print:pb-1.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-num text-xs uppercase tracking-[0.08em] text-muted-foreground print:hidden">
              RebarTwin Pre-Pour Check
            </p>
            <h1 className="mt-1 font-display text-2xl font-semibold text-foreground print:mt-0 print:text-lg">
              Pre-pour check · {jointDisplay}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground print:mt-0 print:text-xs">
              {bundle.report.is13920
                ? "IS 456:2000 and IS 13920:2016 detailing verification"
                : `IS 456:2000 detailing check. IS 13920 is off in zone ${bundle.report.seismic_zone}.`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={failCount > 0 ? "fail" : "pass"} count={failCount > 0 ? failCount : undefined} />
          </div>
        </div>

        <dl className="grid gap-3 rounded-[var(--radius-md)] border border-border bg-surface-raised p-3.5 text-xs sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-[1fr_1.4fr_1fr] print:gap-x-3 print:gap-y-1 print:p-2">
          <div>
            <dt className="text-muted-foreground">Project</dt>
            <dd className="mt-0.5 font-medium text-foreground">
              {projectName}
              {projectPdf ? ` (${projectPdf})` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Joint</dt>
            <dd className="mt-0.5 font-num font-semibold text-foreground">
              {bundle.joint.id} · {col.id} {col.b} × {col.h} mm ({formatColumnMainSummary(col)})
              {beamsSummary ? `; ${beamsSummary}` : ""}
              {columnLevel ? ` · ${columnLevel}` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Sheets</dt>
            <dd className="mt-0.5 font-num text-foreground">{sheetsText}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Seismic zone</dt>
            <dd className="mt-0.5 font-num font-medium text-foreground">
              Zone {bundle.report.seismic_zone} (IS 13920 {bundle.report.is13920 ? "on" : "off"})
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Exposure and aggregate</dt>
            <dd className="mt-0.5 font-num text-foreground">
              {bundle.joint.settings.exposure.replace(/_/g, " ")},{" "}
              {formatMeasure(bundle.joint.settings.aggregate, "mm")} aggregate
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Date</dt>
            <dd className="mt-0.5 font-num text-foreground">{formatReportDate(reportDateIso)}</dd>
          </div>
        </dl>
      </header>

      {/* Verdict banner: status never by colour alone */}
      <section
        aria-labelledby="report-verdict-heading"
        className={`report-break-avoid rounded-[var(--radius-md)] border p-4 print:p-2 ${failCount > 0
          ? "border-fail/40 bg-fail-surface"
          : "border-pass/40 bg-pass-surface"
          }`}
      >
        <div className="flex flex-wrap items-center gap-2.5">
          {failCount > 0 ? (
            <AlertTriangle className="h-5 w-5 shrink-0 text-fail" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="h-5 w-5 shrink-0 text-pass" aria-hidden="true" />
          )}
          <h2
            id="report-verdict-heading"
            className={`font-display text-lg font-semibold print:text-base ${failCount > 0 ? "text-fail" : "text-pass"}`}
          >
            {verdictText}
          </h2>
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-foreground print:mt-0.5 print:text-xs">{bundle.fix.summary}</p>
      </section>

      <ReportFindings bundle={bundle} />

      <ReportChosenFix
        bundle={bundle}
        chosenOptionIndex={chosenOptionIndex}
        selectedExplicitly={selectedExplicitly}
      />

      <ReportAssumptionsAndSource bundle={bundle} entries={entries} />

      {/* Sign-off block */}
      <section aria-labelledby="report-signoff-heading" className="report-break-avoid space-y-3 pt-2 print:space-y-1 print:pt-0">
        <h2
          id="report-signoff-heading"
          className="border-b border-border pb-1.5 font-display text-base font-semibold text-foreground print:pb-1 print:text-sm"
        >
          Sign-off
        </h2>
        <div className="grid gap-6 rounded-[var(--radius-md)] border border-border bg-surface-raised p-4 sm:grid-cols-3 print:grid-cols-3 print:gap-4 print:p-2">
          <div>
            <div className="h-8 border-b border-control-border print:h-5" aria-hidden="true" />
            <p className="mt-1.5 text-xs font-medium text-foreground print:mt-1">Checked by</p>
          </div>
          <div>
            <div className="h-8 border-b border-control-border print:h-5" aria-hidden="true" />
            <p className="mt-1.5 text-xs font-medium text-foreground print:mt-1">Engineer of record</p>
          </div>
          <div>
            <div className="h-8 border-b border-control-border print:h-5" aria-hidden="true" />
            <p className="mt-1.5 text-xs font-medium text-foreground print:mt-1">Date</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Advisory check computed from closed-form bar geometry. The engineer of record decides.
        </p>
      </section>

      {/* Screen-only export links */}
      <section
        aria-label="Engineering file downloads"
        className="no-print flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 print:hidden"
      >
        <span className="text-xs font-medium text-muted-foreground">Model and issue exports</span>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={exports.jointIfc} download="joint.ifc">
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span>joint.ifc</span>
            </a>
          </Button>
          {exports.fixedIfc && (
            <Button variant="outline" size="sm" asChild>
              <a href={exports.fixedIfc} download="fixed.ifc">
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                <span>fixed.ifc</span>
              </a>
            </Button>
          )}
          <Button variant="outline" size="sm" asChild>
            <a href={exports.issuesBcf} download="issues.bcf">
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span>issues.bcf</span>
            </a>
          </Button>
        </div>
      </section>
    </article>
  );
}
