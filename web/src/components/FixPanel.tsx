import type { Bundle } from "../types";

interface FixPanelProps {
  bundle: Bundle;
  isAfterMode: boolean;
  hasFixedIfc: boolean;
  onToggleMode: (after: boolean) => void;
}

export function FixPanel({ bundle, isAfterMode, hasFixedIfc, onToggleMode }: FixPanelProps) {
  const { fix, rules } = bundle;
  const blockingEntries = Object.entries(fix.blocking).sort((a, b) => b[1] - a[1]);

  return (
    <div className="panel-body">
      <div className="card">
        <div className="card-header">
          <span
            className={`pill ${fix.status === "fixed" || fix.status === "clean" ? "pill-pass" : "pill-warn"}`}
          >
            {fix.status.toUpperCase()}
          </span>
          <span className="muted-note">
            {fix.options.length} verified option{fix.options.length === 1 ? "" : "s"}
          </span>
        </div>
        <p className="fix-summary">{fix.summary}</p>

        <div className="before-after-box">
          <div className="subhead">3D Model Comparison</div>
          <div className="segmented">
            <button
              type="button"
              className={!isAfterMode ? "seg-active" : ""}
              onClick={() => onToggleMode(false)}
            >
              Before (joint.ifc)
            </button>
            <button
              type="button"
              className={isAfterMode ? "seg-active seg-after" : ""}
              disabled={!hasFixedIfc}
              title={hasFixedIfc ? "Load fixed.ifc (Option 1)" : "No passing fixed.ifc available"}
              onClick={() => onToggleMode(true)}
            >
              After Fix (fixed.ifc)
            </button>
          </div>
          {!hasFixedIfc && (
            <p className="muted-note">No passing fix IFC was generated for this joint.</p>
          )}
        </div>
      </div>

      {fix.options.length > 0 && (
        <section className="section">
          <div className="section-title">Verified Options (Checked Against Every Rule)</div>
          <div className="options-list">
            {fix.options.map((opt, idx) => (
              <div key={idx} className={`card option-card ${idx === 0 ? "option-best" : ""}`}>
                <div className="option-head">
                  <div>
                    <span className="option-rank">
                      Option {idx + 1}
                      {idx === 0 ? " · Best (in fixed.ifc)" : ""}
                    </span>
                    <div className="option-title">{opt.candidate.title}</div>
                  </div>
                  <span className="source-badge">{opt.candidate.source}</span>
                </div>

                {opt.faces.map((fc, fIdx) => (
                  <div key={fIdx} className="face-change">
                    <div className="face-change-row">
                      <span>
                        <strong>
                          {fc.beam} {fc.face}
                        </strong>{" "}
                        (layers outermost first)
                      </span>
                      <span className="mono">
                        {fc.before} → <strong>{fc.after}</strong>
                      </span>
                    </div>
                    <div className="face-metrics">
                      <span>
                        Steel: <strong>{Math.round(fc.area_provided)} mm²</strong> vs{" "}
                        {Math.round(fc.area_required)} mm² (+{fc.overshoot_pct}%)
                      </span>
                      <span>
                        Effective depth d:{" "}
                        <strong>
                          {Math.round(fc.depth_before)} → {Math.round(fc.depth_after)} mm
                        </strong>
                      </span>
                    </div>
                  </div>
                ))}

                {opt.column && (
                  <div className="face-change">
                    <strong>Column resize:</strong> {opt.column} mm
                  </div>
                )}

                {opt.flags.map((flag, flagIdx) => (
                  <div key={flagIdx} className="flag-warning">
                    <strong>Recheck:</strong> {flag}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}

      {blockingEntries.length > 0 && (
        <section className="section">
          <div className="section-title">Why Other Candidates Were Rejected</div>
          <div className="blocking-list">
            {blockingEntries.map(([ruleId, count]) => {
              const meta = rules[ruleId];
              return (
                <div key={ruleId} className="blocking-row">
                  <div>
                    <strong>{meta?.clause ?? ruleId}</strong> — {meta?.title ?? ruleId}
                  </div>
                  <span className="pill pill-fail">{count} rejected</span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
