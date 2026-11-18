import { Info } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import type { BeamJunctionInfo } from "../../lib/api";

interface BeamJunctionsListProps {
  junctions: BeamJunctionInfo[];
}

/**
 * Informational panel for beam-on-beam junctions without a column.
 * Shown purely as coordination context and never surfaced as failures.
 */
export function BeamJunctionsList({ junctions }: BeamJunctionsListProps) {
  return (
    <section
      aria-labelledby="beam-junctions-heading"
      className="rounded-[var(--radius-lg)] border border-border bg-surface p-4 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <h2 id="beam-junctions-heading" className="font-display text-base font-semibold text-foreground">
            Beam-on-beam junctions ({junctions.length})
          </h2>
        </div>
        <Badge variant="muted">Information</Badge>
      </div>

      <p className="text-xs text-muted-foreground">
        Secondary beam intersections without a column. Shown for information only; IS 456 and IS
        13920 beam-column joint rules do not apply.
      </p>

      {junctions.length === 0 ? (
        <p className="rounded-[var(--radius-md)] border border-border bg-surface-sunken p-3 text-xs text-muted-foreground">
          No beam-on-beam junctions recorded for this drawing set.
        </p>
      ) : (
        <ul aria-label="Beam-on-beam junctions" className="grid gap-2 sm:grid-cols-2">
          {junctions.map((item) => (
            <li
              key={item.id}
              className="rounded-[var(--radius-md)] border border-border bg-surface-raised p-3 text-xs space-y-1"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-num font-semibold text-foreground">
                  {(item.beams ?? []).join(" into ")}
                </span>
                {item.grid && (
                  <Badge variant="muted" className="font-num">
                    Grid {item.grid}
                  </Badge>
                )}
              </div>
              <p className="font-num text-muted-foreground">
                {[
                  item.level ?? null,
                  item.page ? `Page ${item.page}` : null,
                  item.note ?? "No column at junction",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
