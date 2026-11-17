import { useEffect, useMemo, useState } from "react";
import { formatNumber } from "../coords";
import type { AttemptSpec } from "../types";

interface WorkingsPanelProps {
  attempts: AttemptSpec[];
}

type FilterMode = "all" | "passed" | "failed";

export function WorkingsPanel({ attempts }: WorkingsPanelProps) {
  const [filter, setFilter] = useState<FilterMode>("all");
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);

  const filtered = useMemo(() => {
    if (filter === "passed") return attempts.filter((a) => a.passed);
    if (filter === "failed") return attempts.filter((a) => !a.passed);
    return attempts;
  }, [attempts, filter]);

  const safeIndex = Math.min(cursor, Math.max(0, filtered.length - 1));
  const active = filtered[safeIndex] ?? null;

  const passedCount = useMemo(() => attempts.filter((a) => a.passed).length, [attempts]);
  const failedCount = attempts.length - passedCount;

  const handleFilterChange = (nextFilter: FilterMode) => {
    setFilter(nextFilter);
    setCursor(0);
    setPlaying(false);
  };

  useEffect(() => {
    if (!playing || filtered.length === 0) return;
    const timer = window.setInterval(() => {
      setCursor((prev) => {
        if (prev + 1 >= filtered.length) {
          setPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 850);
    return () => window.clearInterval(timer);
  }, [playing, filtered.length]);

  if (attempts.length === 0) {
    return (
      <div className="panel-body">
        <div className="hint-box">
          No fix attempts recorded — the joint already passed every checked rule.
        </div>
      </div>
    );
  }

  return (
    <div className="panel-body">
      <div className="workings-banner">
        <strong>Workings Replay (ORCA loop)</strong>
        <p className="muted-note">
          Every candidate proposal — whether enumerator or Gemini — is tested by the deterministic
          geometry &amp; code checker. Nothing passes unless every rule holds.
        </p>
      </div>

      {/* Filter */}
      <div className="filter-row">
        <button
          type="button"
          className={`filter-chip ${filter === "all" ? "filter-active" : ""}`}
          onClick={() => handleFilterChange("all")}
        >
          All ({attempts.length})
        </button>
        <button
          type="button"
          className={`filter-chip ${filter === "passed" ? "filter-active" : ""}`}
          onClick={() => handleFilterChange("passed")}
        >
          Passed ({passedCount})
        </button>
        <button
          type="button"
          className={`filter-chip ${filter === "failed" ? "filter-active" : ""}`}
          onClick={() => handleFilterChange("failed")}
        >
          Rejected ({failedCount})
        </button>
      </div>

      {/* Replay controls */}
      <div className="card replay-controls">
        <div className="transport-row">
          <button
            type="button"
            className="btn-step"
            onClick={() => {
              setPlaying(false);
              setCursor(0);
            }}
            disabled={safeIndex === 0}
            title="First attempt"
          >
            |&lt;
          </button>
          <button
            type="button"
            className="btn-step"
            onClick={() => {
              setPlaying(false);
              setCursor((c) => Math.max(0, c - 1));
            }}
            disabled={safeIndex === 0}
            title="Previous attempt"
          >
            &lt; Prev
          </button>
          <button
            type="button"
            className="btn-play"
            onClick={() => {
              if (!playing && safeIndex >= filtered.length - 1) setCursor(0);
              setPlaying((p) => !p);
            }}
          >
            {playing ? "Pause" : "Play"}
          </button>
          <button
            type="button"
            className="btn-step"
            onClick={() => {
              setPlaying(false);
              setCursor((c) => Math.min(filtered.length - 1, c + 1));
            }}
            disabled={safeIndex >= filtered.length - 1}
            title="Next attempt"
          >
            Next &gt;
          </button>
          <button
            type="button"
            className="btn-step"
            onClick={() => {
              setPlaying(false);
              setCursor(filtered.length - 1);
            }}
            disabled={safeIndex >= filtered.length - 1}
            title="Last attempt"
          >
            &gt;|
          </button>
        </div>

        <div className="scrubber-row">
          <input
            type="range"
            min={0}
            max={Math.max(0, filtered.length - 1)}
            value={safeIndex}
            onChange={(e) => {
              setPlaying(false);
              setCursor(Number(e.target.value));
            }}
            aria-label="Attempt scrubber"
          />
          <span className="mono scrubber-count">
            {safeIndex + 1} / {filtered.length}
          </span>
        </div>
      </div>

      {/* Active attempt card */}
      {active && (
        <div className={`card attempt-detail ${active.passed ? "attempt-pass" : "attempt-fail"}`}>
          <div className="card-header">
            <span className={`pill ${active.passed ? "pill-pass" : "pill-fail"}`}>
              {active.passed ? "PASSED CHECKER" : "REJECTED BY CHECKER"}
            </span>
            <span className="muted-note">
              Round {active.round} · {active.candidate.source}
            </span>
          </div>

          <div className="attempt-title">{active.candidate.title}</div>
          {active.candidate.rationale && (
            <div className="attempt-rationale">{active.candidate.rationale}</div>
          )}

          <div className="edits-chips">
            {active.candidate.edits.map((e, i) => (
              <span key={i} className="edit-chip mono">
                {e.kind === "set_face"
                  ? `${e.beam}.${e.face} = [${e.layers.join(" / ")}]`
                  : `column = ${e.b} × ${e.h}`}
              </span>
            ))}
          </div>

          {active.passed ? (
            <div className="pass-confirm">
              All rules satisfied: spacing, cover, clashes, and detailing checks pass.
            </div>
          ) : (
            <div className="reject-list">
              <div className="subhead">
                Clauses that rejected this candidate ({active.failures.length})
              </div>
              {active.failures.map((fail, idx) => (
                <div key={idx} className="reject-item">
                  <div className="finding-row-top">
                    <span className="clause-tag">{fail.clause}</span>
                    <span className="measure-chip">
                      {formatNumber(fail.measured)} {fail.unit} vs {formatNumber(fail.limit)}{" "}
                      {fail.unit}
                    </span>
                  </div>
                  <div className="finding-msg">{fail.message}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Attempt log */}
      <section className="section">
        <div className="section-title">All Tested Candidates</div>
        <div className="attempt-log">
          {filtered.map((att, idx) => {
            const firstClause = att.failures[0]?.clause;
            return (
              <button
                key={`${att.round}-${att.candidate.title}-${idx}`}
                type="button"
                className={`attempt-row ${idx === safeIndex ? "attempt-row-active" : ""}`}
                onClick={() => {
                  setPlaying(false);
                  setCursor(idx);
                }}
              >
                <span className="mono attempt-num">#{idx + 1}</span>
                <span className={`dot-status ${att.passed ? "dot-pass" : "dot-fail"}`} />
                <span className="attempt-row-title">{att.candidate.title}</span>
                <span className="attempt-row-tag">
                  {att.passed
                    ? "PASS"
                    : `${firstClause ?? "FAIL"}${att.failures.length > 1 ? ` (+${att.failures.length - 1})` : ""}`}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
