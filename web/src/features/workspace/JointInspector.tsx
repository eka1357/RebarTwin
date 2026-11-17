import { useEffect, useMemo, useRef, useState } from "react";
import { StatusPill } from "../../components/StatusPill";
import { Button } from "../../components/ui/button";
import { ScrollArea } from "../../components/ui/scroll-area";
import { Separator } from "../../components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { describeBarFull } from "../../lib/a11y";
import { formatBarMark, formatClause, formatFindingValue } from "../../lib/format";
import { useWorkspaceStore, type InspectorTab } from "../../stores/workspace";
import type { Bundle, Finding } from "../../types/bundle";
import { BarChip } from "../findings/BarChip";
import { FindingCard } from "../findings/FindingCard";
import { FixPanel } from "../fixes/FixPanel";
import { SourceCrop } from "../source/SourceCrop";

type FindingFilter = "fail" | "pass" | "all";

export function JointInspector({ bundle }: { bundle: Bundle }) {
  const [filter, setFilter] = useState<FindingFilter>("fail");
  const cardRefs = useRef<Map<number, HTMLElement | null>>(new Map());
  const triggerRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);

  const selectedBarId = useWorkspaceStore((s) => s.selectedBarId);
  const selectedFindingIndex = useWorkspaceStore((s) => s.selectedFindingIndex);
  const inspectorTab = useWorkspaceStore((s) => s.inspectorTab);
  const sourceFocusMember = useWorkspaceStore((s) => s.sourceFocusMember);

  const selectBar = useWorkspaceStore((s) => s.selectBar);
  const setHoveredBar = useWorkspaceStore((s) => s.setHoveredBar);
  const selectFinding = useWorkspaceStore((s) => s.selectFinding);
  const setInspectorTab = useWorkspaceStore((s) => s.setInspectorTab);
  const setSourceFocusMember = useWorkspaceStore((s) => s.setSourceFocusMember);
  const triggerFrame = useWorkspaceStore((s) => s.triggerFrame);
  const clearSelection = useWorkspaceStore((s) => s.clearSelection);

  const bars = bundle.scene.bars;
  const barsById = useMemo(() => new Map(bars.map((b) => [b.id, b])), [bars]);
  const failingBars = bars.filter((b) => b.status === "fail");
  const allFindings = useMemo(
    () => bundle.report.findings.map((f, index) => ({ f, index })),
    [bundle.report.findings],
  );
  const failCount = allFindings.filter((x) => x.f.status === "fail").length;
  const passCount = allFindings.length - failCount;

  const filteredFindings = useMemo(() => {
    return allFindings.filter(({ f, index }) => {
      if (index === selectedFindingIndex) return true;
      if (filter === "fail") return f.status === "fail";
      if (filter === "pass") return f.status === "pass";
      return true;
    });
  }, [allFindings, filter, selectedFindingIndex]);

  const selectedBar = barsById.get(selectedBarId ?? "") ?? null;
  const sortedBars = useMemo(
    () =>
      [...bars].sort((a, b) => {
        if (a.status !== b.status) return a.status === "fail" ? -1 : 1;
        return a.id.localeCompare(b.id);
      }),
    [bars],
  );

  // Scroll matching FindingCard inside inspector ScrollArea without scrolling the window
  useEffect(() => {
    if (selectedFindingIndex === null || inspectorTab !== "findings") return;
    const cardEl = cardRefs.current.get(selectedFindingIndex);
    const viewportEl = scrollAreaRef.current?.querySelector<HTMLElement>(
      "[data-radix-scroll-area-viewport]",
    );
    if (!cardEl || !viewportEl || viewportEl.scrollHeight <= viewportEl.clientHeight + 1) return;
    const cRect = cardEl.getBoundingClientRect();
    const vRect = viewportEl.getBoundingClientRect();
    if (cRect.top < vRect.top) {
      viewportEl.scrollTop -= vRect.top - cRect.top + 8;
    } else if (cRect.bottom > vRect.bottom) {
      viewportEl.scrollTop += cRect.bottom - vRect.bottom + 8;
    }
  }, [selectedFindingIndex, inspectorTab]);

  const selectFindingAndFrame = (f: Finding, index: number) => {
    selectFinding(index);
    selectBar(f.bars[0] ?? null);
    triggerFrame();
  };

  return (
    <aside
      id="inspector"
      aria-label="Joint inspector"
      className="flex h-full min-h-0 flex-col rounded-[var(--radius-lg)] border border-border bg-surface"
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border p-3.5">
        <div>
          <h2 className="font-display text-base font-semibold">
            {bundle.joint.column.id} × {bundle.joint.beams.map((b) => b.id).join(" / ")}
          </h2>
          <p className="font-num text-xs text-muted-foreground">
            {bars.length} bars · {failingBars.length} failing · Zone {bundle.report.seismic_zone}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill status={failCount > 0 ? "fail" : "pass"} count={failCount} />
          {(selectedBarId || selectedFindingIndex !== null) && (
            <Button variant="ghost" size="sm" onClick={clearSelection}>
              Clear
            </Button>
          )}
        </div>
      </div>

      <Tabs
        value={inspectorTab}
        onValueChange={(v) => setInspectorTab(v as InspectorTab)}
        className="flex flex-1 min-h-0 flex-col"
      >
        <div className="shrink-0 border-b border-border px-3.5 py-2">
          <TabsList className="w-full justify-between">
            <TabsTrigger value="findings" className="flex-1">
              Findings
            </TabsTrigger>
            <TabsTrigger value="fix" className="flex-1">
              Fix
            </TabsTrigger>
            <TabsTrigger value="workings" className="flex-1">
              Workings
            </TabsTrigger>
            <TabsTrigger value="source" className="flex-1">
              Source
            </TabsTrigger>
          </TabsList>
        </div>

        <ScrollArea ref={scrollAreaRef} className="flex-1 min-h-0 p-3.5">
          <TabsContent value="findings" className="mt-0 space-y-4">
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

            <section aria-label="Findings list">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex items-center gap-1" role="group" aria-label="Filter findings">
                  {(
                    [
                      ["fail", `Fails (${failCount})`],
                      ["pass", `Passes (${passCount})`],
                      ["all", `All (${allFindings.length})`],
                    ] as const
                  ).map(([key, label]) => (
                    <Button
                      key={key}
                      variant={filter === key ? "default" : "outline"}
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => setFilter(key)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2.5">
                {filteredFindings.map(({ f, index }, pos) => (
                  <FindingCard
                    key={`${f.rule}-${index}`}
                    ref={(el) => {
                      cardRefs.current.set(index, el);
                      triggerRefs.current[pos] = el?.querySelector("button") ?? null;
                    }}
                    finding={f}
                    index={index}
                    active={selectedFindingIndex === index}
                    ruleMeta={bundle.rules[f.rule]}
                    barsById={barsById}
                    selectedBarId={selectedBarId}
                    onSelect={() => selectFindingAndFrame(f, index)}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        triggerRefs.current[Math.min(pos + 1, filteredFindings.length - 1)]?.focus();
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        triggerRefs.current[Math.max(pos - 1, 0)]?.focus();
                      }
                    }}
                    onHoverFinding={(hovering) => setHoveredBar(hovering ? (f.bars[0] ?? null) : null)}
                    onSelectBar={(barId) => {
                      selectBar(barId);
                      selectFinding(index);
                      triggerFrame();
                    }}
                    onHoverBar={(barId) => setHoveredBar(barId)}
                    onShowIn3d={() => selectFindingAndFrame(f, index)}
                    onOpenSource={() => {
                      setSourceFocusMember(f.members[0] ?? null);
                      setInspectorTab("source");
                    }}
                  />
                ))}
              </div>
            </section>

            <Separator />

            <section aria-label="Bars in 3D scene">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Scene Bars ({bars.length} total, {failingBars.length} failing)
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {sortedBars.map((b) => (
                  <BarChip
                    key={b.id}
                    bar={b}
                    active={selectedBarId === b.id}
                    onSelect={() => {
                      const idx = b.findings[0] ?? null;
                      selectBar(b.id);
                      selectFinding(idx);
                      triggerFrame();
                    }}
                    onHover={(hovering) => setHoveredBar(hovering ? b.id : null)}
                  />
                ))}
              </div>
            </section>
          </TabsContent>

          <TabsContent value="fix" className="mt-0">
            <FixPanel bundle={bundle} />
          </TabsContent>

          <TabsContent value="workings" className="mt-0 text-xs text-muted-foreground">
            Attempt-by-attempt solver replay ({bundle.fix.attempts.length} attempts) arrives in W7.
          </TabsContent>

          <TabsContent value="source" className="mt-0">
            <SourceCrop bundle={bundle} focusMember={sourceFocusMember} />
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </aside>
  );
}
