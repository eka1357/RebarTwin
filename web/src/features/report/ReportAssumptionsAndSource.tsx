import { CheckCircle2, HelpCircle } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { formatClause } from "../../lib/format";
import type { NormalizedProvenanceEntry } from "../../lib/provenance";
import type { Bundle } from "../../types/bundle";

interface ReportAssumptionsAndSourceProps {
  bundle: Bundle;
  entries: NormalizedProvenanceEntry[];
}

function VerificationStatus({ status }: { status: string }) {
  if (status === "resolved") {
    return (
      <Badge variant="check" className="gap-1">
        <HelpCircle className="h-3 w-3" aria-hidden="true" />
        <span>Resolved</span>
      </Badge>
    );
  }
  if (status === "geometry") {
    return (
      <Badge variant="muted" className="gap-1">
        <span>Geometry</span>
      </Badge>
    );
  }
  return (
    <Badge variant="pass" className="gap-1">
      <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
      <span>Agreed</span>
    </Badge>
  );
}

/**
 * Report assumptions (`Joint.notes` + provenance defaults marked "Assumed, not on the drawing")
 * and provenance ledger ("Where each value came from").
 */
export function ReportAssumptionsAndSource({ bundle, entries }: ReportAssumptionsAndSourceProps) {
  const defaultEntries = entries.filter((e) => e.status === "default");
  const drawnEntries = entries.filter((e) => e.status !== "default");

  const noteSet = new Set<string>();
  const combinedNotes: string[] = [];
  for (const n of [...bundle.joint.notes, ...bundle.report.notes]) {
    const trimmed = n.trim();
    if (trimmed && !noteSet.has(trimmed)) {
      noteSet.add(trimmed);
      combinedNotes.push(trimmed);
    }
  }
  // Group identical rule-skip explanations so related skipped clauses stay on one compact line.
  const skippedByReason = new Map<string, string[]>();
  for (const [ruleId, reason] of Object.entries(bundle.report.rules_skipped)) {
    const clause = formatClause(bundle.rules[ruleId]?.clause ?? ruleId);
    const list = skippedByReason.get(reason);
    if (list) list.push(clause);
    else skippedByReason.set(reason, [clause]);
  }
  const skippedGroups = [...skippedByReason.entries()];

  return (
    <div
      className={`space-y-5 print:space-y-2 ${
        drawnEntries.length === 0 ? "print:grid print:grid-cols-[1.8fr_1fr] print:gap-3 print:space-y-0 print:items-start" : ""
      }`}
    >
      <section aria-labelledby="report-assumptions-heading" className="report-break-avoid space-y-2.5 print:space-y-1">
        <h2
          id="report-assumptions-heading"
          className="border-b border-border pb-1.5 font-display text-base font-semibold text-foreground print:pb-1 print:text-sm"
        >
          Assumptions
        </h2>

        {combinedNotes.length === 0 && defaultEntries.length === 0 && skippedGroups.length === 0 ? (
          <p className="text-xs text-muted-foreground">No additional assumptions recorded.</p>
        ) : (
          <ul className="space-y-1.5 text-xs text-foreground print:space-y-0.5">
            {combinedNotes.map((note, idx) => (
              <li
                key={`note-${idx}`}
                className="rounded-[var(--radius-sm)] border border-border bg-surface-raised px-3 py-2 print:border-0 print:bg-transparent print:p-0"
              >
                {note}
              </li>
            ))}
            {defaultEntries.map((def) => (
              <li
                key={def.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-border bg-surface-raised px-3 py-2 print:border-0 print:bg-transparent print:p-0"
              >
                <span className="font-num text-foreground">
                  {def.path}: {def.parserText || def.text || ""}
                </span>
                <Badge variant="muted">Assumed, not on the drawing</Badge>
              </li>
            ))}
            {skippedGroups.map(([reason, clauses]) => (
              <li
                key={clauses.join(",")}
                className="rounded-[var(--radius-sm)] border border-border bg-surface-sunken px-3 py-2 text-muted-foreground print:border-0 print:bg-transparent print:p-0"
              >
                <span className="font-num font-medium text-foreground">
                  {clauses.join(", ")}:
                </span>{" "}
                {reason}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="report-provenance-heading" className="space-y-2.5 print:space-y-1">
        <h2
          id="report-provenance-heading"
          className="border-b border-border pb-1.5 font-display text-base font-semibold text-foreground print:pb-1 print:text-sm"
        >
          Where each value came from
        </h2>

        {entries.length === 0 ? (
          <p className="rounded-[var(--radius-md)] border border-border bg-surface-sunken p-3 text-xs leading-relaxed text-foreground print:p-2">
            This worked example was typed in from the pitch deck. Read a drawing to trace each value
            to its sheet.
          </p>
        ) : drawnEntries.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            All recorded values in this bundle came from default assumptions above.
          </p>
        ) : (
          <div
            role="region"
            aria-label="Source provenance values"
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
            tabIndex={0}
            className="overflow-x-auto rounded-[var(--radius-md)] border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-surface-sunken text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Member and field</th>
                  <th className="px-3 py-2 font-medium">Value</th>
                  <th className="px-3 py-2 font-medium">Sheet</th>
                  <th className="px-3 py-2 font-medium">Source status</th>
                </tr>
              </thead>
              <tbody>
                {drawnEntries.map((entry) => (
                  <tr key={entry.id} className="border-b border-border last:border-b-0 bg-surface-raised">
                    <td className="px-3 py-2 font-num text-foreground">
                      <div>
                        {entry.member
                          ? `${entry.member}${entry.building ? ` (${entry.building})` : ""}`
                          : entry.path}{" "}
                        · {entry.field}
                        {entry.layer !== null ? ` · Layer ${entry.layer}` : ""}
                      </div>
                      {entry.isColumn && entry.level && (
                        <div className="text-muted-foreground">Storey: {entry.level}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 font-num font-medium text-foreground">
                      <div>{entry.text ?? entry.geminiText ?? entry.parserText}</div>
                      {entry.ocrRaw && (
                        <div className="text-muted-foreground">OCR read &apos;{entry.ocrRaw}&apos;</div>
                      )}
                    </td>
                    <td className="px-3 py-2 font-num text-muted-foreground">
                      {entry.page !== null ? `Page ${entry.page}` : "Drawing"}
                    </td>
                    <td className="px-3 py-2">
                      <VerificationStatus status={entry.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
