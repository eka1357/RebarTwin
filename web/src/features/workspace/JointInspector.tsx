import { StatusPill } from "../../components/StatusPill";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { ScrollArea } from "../../components/ui/scroll-area";
import { Separator } from "../../components/ui/separator";
import { describeBarFull } from "../../lib/a11y";
import {
  formatBarMark,
  formatCalloutValue,
  formatClause,
  formatFindingValue,
} from "../../lib/format";
import { useWorkspaceStore } from "../../stores/workspace";
import type { Bundle } from "../../types/bundle";

export function JointInspector({ bundle }: { bundle: Bundle }) {
  const selectedBarId = useWorkspaceStore((s) => s.selectedBarId);
  const selectedFindingIndex = useWorkspaceStore((s) => s.selectedFindingIndex);
  const selectBar = useWorkspaceStore((s) => s.selectBar);
  const selectFinding = useWorkspaceStore((s) => s.selectFinding);
  const clearSelection = useWorkspaceStore((s) => s.clearSelection);

  const bars = bundle.scene.bars;
  const failingBars = bars.filter((b) => b.status === "fail");
  const failures = bundle.report.findings
    .map((f, index) => ({ f, index }))
    .filter((x) => x.f.status === "fail");

  const selectedBar = bars.find((b) => b.id === selectedBarId) ?? null;
  const sortedBars = [...bars].sort((a, b) => {
    if (a.status !== b.status) return a.status === "fail" ? -1 : 1;
    return a.id.localeCompare(b.id);
  });

  return (
    <aside
      id="inspector"
      aria-label="Joint inspector"
      className="flex h-full min-h-0 flex-col rounded-[var(--radius-lg)] border border-border bg-surface"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3.5">
        <div>
          <h2 className="font-display text-base font-semibold">
            {bundle.joint.column.id} × {bundle.joint.beams.map((b) => b.id).join(" / ")}
          </h2>
          <p className="font-num text-xs text-muted-foreground">
            {bars.length} bars · {failingBars.length} failing · Zone {bundle.report.seismic_zone}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill status={failures.length > 0 ? "fail" : "pass"} count={failures.length} />
          {(selectedBarId || selectedFindingIndex !== null) && (
            <Button variant="ghost" size="sm" onClick={clearSelection}>
              Clear
            </Button>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0 p-3.5">
        <div className="space-y-4">
          {selectedBar && (
            <section className="rounded-[var(--radius-md)] border border-border-strong bg-surface-raised p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-num text-sm font-semibold">
                  {selectedBar.id} · {formatBarMark(selectedBar.id, selectedBar.dia)}
                </span>
                <StatusPill status={selectedBar.status} size="sm" />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{describeBarFull(selectedBar)}</p>
              {selectedBar.findings.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs">
                  {selectedBar.findings.map((idx) => {
                    const f = bundle.report.findings[idx];
                    if (!f) return null;
                    return (
                      <li key={idx} className="text-fail">
                        {formatClause(f.clause)}: {formatFindingValue(f)}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}

          <section aria-label="Failing findings">
            <h3 className="mb-2 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Failing Checks ({failures.length})
            </h3>
            <div className="space-y-2">
              {failures.map(({ f, index }) => {
                const active = selectedFindingIndex === index;
                return (
                  <button
                    key={index}
                    type="button"
                    onClick={() => {
                      selectFinding(index);
                      selectBar(f.bars[0] ?? null);
                    }}
                    className={`w-full rounded-[var(--radius-md)] border p-2.5 text-left transition-colors duration-[var(--dur-1)] cursor-pointer ${
                      active
                        ? "border-fail bg-surface-raised"
                        : "border-border bg-surface-raised hover:border-border-strong"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-num text-xs font-medium text-foreground">
                        {formatClause(f.clause)}
                      </span>
                      <Badge variant="fail" className="font-num">
                        {formatCalloutValue(f)}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{f.message}</p>
                  </button>
                );
              })}
            </div>
          </section>

          <Separator />

          <section aria-label="Bars in 3D scene">
            <h3 className="mb-2 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Scene Bars ({bars.length} total, {failingBars.length} failing)
            </h3>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-1">
              {sortedBars.map((b) => {
                const active = selectedBarId === b.id;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => {
                      selectFinding(b.findings[0] ?? null);
                      selectBar(b.id);
                    }}
                    className={`flex items-center justify-between gap-2 rounded-[var(--radius-sm)] border px-2.5 py-1.5 text-left text-xs cursor-pointer ${
                      active
                        ? "border-ring bg-surface-raised"
                        : "border-border bg-surface-raised hover:border-border-strong"
                    }`}
                  >
                    <span className="sr-only">{describeBarFull(b)}</span>
                    <span aria-hidden="true" className="font-num font-medium text-foreground">
                      {b.id} ({formatBarMark(b.id, b.dia)})
                    </span>
                    <StatusPill status={b.status} size="sm" />
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </ScrollArea>
    </aside>
  );
}
