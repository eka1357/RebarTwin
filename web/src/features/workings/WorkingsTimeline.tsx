import { ChevronLeft, ChevronRight, Filter, Link2, Pause, Play } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { StatusPill } from "../../components/StatusPill";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Slider } from "../../components/ui/slider";
import { formatCalloutValue, formatClause } from "../../lib/format";
import { useWorkspaceStore, type ReplaySpeed } from "../../stores/workspace";
import type { AttemptFailure, Bundle, Finding } from "../../types/bundle";
import { ClauseChip } from "../findings/ClauseChip";
import { ToleranceGauge } from "../findings/ToleranceGauge";

const SPEEDS: ReplaySpeed[] = [0.5, 1, 2];

function failureToGaugeFinding(f: AttemptFailure): Finding {
  return {
    rule: f.rule,
    clause: f.clause,
    title: f.clause,
    status: "fail",
    measured: f.measured,
    limit: f.limit,
    compare: f.rule === "GEOM-CLASH" || f.measured < f.limit ? ">=" : "<=",
    unit: f.unit,
    members: [],
    bars: f.bars ?? [],
    at: f.at ?? null,
    message: f.message,
  };
}

/**
 * Workings solver timeline grouped by round with passed/failed ticks,
 * Play/Pause, step, speed (0.5x/1x/2x), Failed-only filter, ?a= copy link,
 * and rejecting clauses with mini ToleranceGauges.
 */
export function WorkingsTimeline({ bundle }: { bundle: Bundle }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const attempts = bundle.fix.attempts;
  const attemptScenesCount = bundle.attempt_scenes?.length ?? 0;

  const replayPlaying = useWorkspaceStore((s) => s.replayPlaying);
  const replayIndex = useWorkspaceStore((s) => s.replayIndex);
  const replaySpeed = useWorkspaceStore((s) => s.replaySpeed);
  const replayFailedOnly = useWorkspaceStore((s) => s.replayFailedOnly);
  const setReplay = useWorkspaceStore((s) => s.setReplay);

  const safeIndex = Math.min(Math.max(0, replayIndex), Math.max(0, attempts.length - 1));
  const current = attempts[safeIndex];

  const navigableIndices = useMemo(() => {
    if (!replayFailedOnly) {
      return attempts.map((_, i) => i);
    }
    const failing = attempts
      .map((a, i) => ({ a, i }))
      .filter((x) => !x.a.passed)
      .map((x) => x.i);
    return failing.length > 0 ? failing : attempts.map((_, i) => i);
  }, [attempts, replayFailedOnly]);

  const rounds = useMemo(() => {
    const grouped = new Map<number, number[]>();
    attempts.forEach((a, idx) => {
      const list = grouped.get(a.round) ?? [];
      list.push(idx);
      grouped.set(a.round, list);
    });
    return [...grouped.entries()].sort((a, b) => a[0] - b[0]);
  }, [attempts]);

  // Auto-advance timer when playing: 900 ms a step at 1x
  useEffect(() => {
    if (!replayPlaying || navigableIndices.length === 0) return;
    const stepMs = Math.round(900 / replaySpeed);
    const id = window.setInterval(() => {
      const state = useWorkspaceStore.getState();
      const pos = navigableIndices.indexOf(state.replayIndex);
      const nextPos = pos >= 0 ? pos + 1 : 0;
      if (nextPos >= navigableIndices.length) {
        setReplay({ replayPlaying: false });
      } else {
        setReplay({ replayIndex: navigableIndices[nextPos] });
      }
    }, stepMs);
    return () => window.clearInterval(id);
  }, [replayPlaying, replaySpeed, navigableIndices, setReplay]);

  const posInNav = navigableIndices.indexOf(safeIndex);

  const stepBy = useCallback(
    (dir: -1 | 1) => {
      setReplay({ replayPlaying: false });
      if (posInNav === -1) {
        const target =
          dir > 0
            ? (navigableIndices.find((idx) => idx > safeIndex) ??
              navigableIndices[navigableIndices.length - 1])
            : ([...navigableIndices].reverse().find((idx) => idx < safeIndex) ??
              navigableIndices[0]);
        if (target !== undefined) setReplay({ replayIndex: target });
        return;
      }
      const nextPos = Math.min(Math.max(0, posInNav + dir), navigableIndices.length - 1);
      setReplay({ replayIndex: navigableIndices[nextPos] });
    },
    [navigableIndices, posInNav, safeIndex, setReplay],
  );

  const togglePlay = useCallback(() => {
    if (!replayPlaying) {
      const lastNav = navigableIndices[navigableIndices.length - 1] ?? 0;
      if (safeIndex >= lastNav && navigableIndices[0] !== undefined) {
        setReplay({ replayIndex: navigableIndices[0], replayPlaying: true });
        return;
      }
    }
    setReplay({ replayPlaying: !replayPlaying });
  }, [navigableIndices, replayPlaying, safeIndex, setReplay]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isSlider = target?.getAttribute("role") === "slider";
      if (e.key === "ArrowLeft" && !isSlider) {
        e.preventDefault();
        stepBy(-1);
      } else if (e.key === "ArrowRight" && !isSlider) {
        e.preventDefault();
        stepBy(1);
      } else if (e.key === " " && target?.tagName !== "BUTTON" && !isSlider) {
        e.preventDefault();
        togglePlay();
      }
    };
    el.addEventListener("keydown", onKeyDown);
    return () => el.removeEventListener("keydown", onKeyDown);
  }, [stepBy, togglePlay]);

  if (attempts.length === 0 || !current) {
    return (
      <p className="rounded-[var(--radius-md)] border border-border bg-surface-raised p-3 text-xs text-muted-foreground">
        No solver rework attempts needed for this joint.
      </p>
    );
  }

  const copyStepLink = () => {
    const url = new URL(window.location.href);
    url.searchParams.set("a", String(safeIndex + 1));
    void navigator.clipboard?.writeText(url.toString()).catch(() => {});
    toast.success(`Copied link for attempt ${safeIndex + 1}`);
  };

  const clauseSummary = current.passed
    ? "passes all rules"
    : `${current.failures.length} rejecting ${current.failures.length === 1 ? "clause" : "clauses"}: ${[...new Set(current.failures.map((f) => formatClause(f.clause)))].join(", ")}`;

  return (
    <div ref={rootRef} className="space-y-3">
      <div className="rounded-[var(--radius-md)] border border-border bg-surface-raised p-3 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2"
              aria-label="Previous attempt"
              disabled={safeIndex <= (navigableIndices[0] ?? 0)}
              onClick={() => stepBy(-1)}
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
            <Button
              variant={replayPlaying ? "secondary" : "default"}
              size="sm"
              className="h-7 px-2.5 text-xs"
              aria-label={replayPlaying ? "Pause replay" : "Play replay"}
              onClick={togglePlay}
            >
              {replayPlaying ? (
                <Pause className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Play className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>{replayPlaying ? "Pause" : "Play"}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2"
              aria-label="Next attempt"
              disabled={safeIndex >= (navigableIndices[navigableIndices.length - 1] ?? attempts.length - 1)}
              onClick={() => stepBy(1)}
            >
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>

          <div className="flex items-center gap-1">
            {SPEEDS.map((spd) => (
              <Button
                key={spd}
                variant={replaySpeed === spd ? "default" : "outline"}
                size="sm"
                className="h-6 px-1.5 font-num text-xs"
                aria-pressed={replaySpeed === spd}
                onClick={() => setReplay({ replaySpeed: spd })}
              >
                {spd}×
              </Button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            variant={replayFailedOnly ? "default" : "outline"}
            size="sm"
            className="h-6 px-2 text-xs"
            aria-pressed={replayFailedOnly}
            onClick={() => setReplay({ replayFailedOnly: !replayFailedOnly, replayPlaying: false })}
          >
            <Filter className="h-3 w-3" aria-hidden="true" />
            <span>Failed only</span>
          </Button>
          <Button variant="ghost" size="sm" className="h-6 px-2 font-num text-xs" onClick={copyStepLink}>
            <Link2 className="h-3 w-3" aria-hidden="true" />
            <span>?a={safeIndex + 1}</span>
          </Button>
        </div>

        <Slider
          aria-label="Attempt step"
          min={1}
          max={attempts.length}
          step={1}
          value={[safeIndex + 1]}
          onValueChange={([val]) => {
            if (val !== undefined) {
              setReplay({ replayPlaying: false, replayIndex: val - 1 });
            }
          }}
        />

        {/* Hairline ticks grouped by round: filled for passed, hollow for failed */}
        <div className="space-y-1.5 pt-0.5">
          {rounds.map(([roundNum, indices]) => (
            <div key={roundNum} className="space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-num">Round {roundNum}</span>
                <span className="font-num">{indices.length} attempts</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {indices.map((idx) => {
                  const att = attempts[idx];
                  const isCurrent = idx === safeIndex;
                  const dimmed = replayFailedOnly && att.passed;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setReplay({ replayPlaying: false, replayIndex: idx })}
                      aria-label={`Attempt ${idx + 1} (Round ${att.round}): ${att.passed ? "passes" : `fails ${att.failures.length} checks`}`}
                      aria-current={isCurrent ? "step" : undefined}
                      className={`inline-flex h-4 w-4 items-center justify-center rounded-[var(--radius-xs)] transition-transform duration-[var(--dur-1)] cursor-pointer ${
                        isCurrent ? "ring-2 ring-ring scale-110" : "hover:scale-110"
                      } ${dimmed ? "opacity-25" : ""}`}
                    >
                      <span
                        className={`block h-2.5 w-2.5 rounded-full ${
                          att.passed
                            ? "bg-pass"
                            : "border-2 border-fail bg-transparent"
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Current attempt details and rejecting clauses */}
      <article className="rounded-[var(--radius-md)] border border-border bg-surface-raised p-3 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-num text-xs font-semibold text-foreground">
            Attempt {safeIndex + 1} of {attempts.length} · Round {current.round}
          </span>
          <StatusPill status={current.passed ? "pass" : "fail"} size="sm" />
        </div>

        <div>
          <p className="font-num text-xs font-medium text-foreground">{current.candidate.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{current.candidate.rationale}</p>
        </div>

        {attemptScenesCount > 0 && safeIndex >= attemptScenesCount && (
          <p className="rounded-[var(--radius-sm)] border border-border bg-surface-sunken px-2 py-1 text-xs text-muted-foreground">
            3D bar geometry stored for the first {attemptScenesCount} attempts; rejecting clauses are
            shown for all {attempts.length}.
          </p>
        )}

        {current.passed ? (
          <div className="rounded-[var(--radius-sm)] border border-pass/40 bg-pass-surface p-2.5 text-xs text-pass">
            Passes every IS 456, IS 13920, and geometry check tested in this round.
          </div>
        ) : (
          <div className="space-y-2">
            {current.failures.map((fail, fi) => {
              const gaugeFinding = failureToGaugeFinding(fail);
              return (
                <div
                  key={`${fail.rule}-${fi}`}
                  className="rounded-[var(--radius-sm)] border border-border bg-surface p-2.5 space-y-1.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <ClauseChip
                      clause={fail.clause}
                      ruleId={fail.rule}
                      meta={bundle.rules[fail.rule]}
                    />
                    <Badge variant="fail" className="font-num">
                      {formatCalloutValue(gaugeFinding)}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{fail.message}</p>
                  <ToleranceGauge finding={gaugeFinding} />
                </div>
              );
            })}
          </div>
        )}
      </article>

      <div aria-live="polite" className="sr-only">
        Attempt {safeIndex + 1} of {attempts.length}, Round {current.round}: {clauseSummary}
      </div>
    </div>
  );
}
