import { useState } from "react";
import { formatNumber } from "../coords";
import type { BarMetadata, Bundle, Finding } from "../types";
import { ProvenanceCrop } from "./ProvenanceCrop";

interface FindingsPanelProps {
  bundle: Bundle;
  isAfterMode: boolean;
  selectedBar: BarMetadata | null;
  selectedFindingIndex: number | null;
  onSelectFinding: (index: number | null, barKey?: string) => void;
  onClearBar: () => void;
}

function findingMatchesBar(f: Finding, bar: BarMetadata): boolean {
  if (f.bars.includes(bar.tag) || f.bars.includes(bar.globalId)) return true;
  if (f.bars.length === 0 && bar.member && f.members.includes(bar.member)) return true;
  return false;
}

export function FindingsPanel({
  bundle,
  isAfterMode,
  selectedBar,
  selectedFindingIndex,
  onSelectFinding,
  onClearBar,
}: FindingsPanelProps) {
  const [showPassing, setShowPassing] = useState(false);
  const [showRules, setShowRules] = useState(false);

  const { report, joint, rules } = bundle;
  const failures = report.findings
    .map((f, index) => ({ f, index }))
    .filter((x) => x.f.status === "fail");
  const passes = report.findings
    .map((f, index) => ({ f, index }))
    .filter((x) => x.f.status === "pass");

  const barFindings = selectedBar
    ? report.findings
        .map((f, index) => ({ f, index }))
        .filter(({ f }) => findingMatchesBar(f, selectedBar))
    : [];

  const verdictText =
    failures.length === 0
      ? "passes every rule checked"
      : `fails ${failures.length} check${failures.length > 1 ? "s" : ""}`;

  return (
    <div className="panel-body">
      {/* Verdict banner */}
      <div className={`verdict-card ${isAfterMode || failures.length === 0 ? "verdict-pass" : "verdict-fail"}`}>
        <div className="verdict-title">
          {isAfterMode
            ? `${joint.id}: passes every rule checked (After Fix)`
            : `${joint.id}: ${verdictText}`}
        </div>
        <div className="verdict-sub">
          Seismic zone {report.seismic_zone} · IS 13920 {report.is13920 ? "on" : "off"} ·{" "}
          {joint.settings.exposure.replace("_", " ")} exposure · {joint.settings.aggregate} mm aggregate
        </div>
      </div>

      {/* Selected bar inspector */}
      {selectedBar ? (
        <section className="card selected-bar-card">
          <div className="card-header">
            <div>
              <span className={`pill ${selectedBar.status === "FAIL" && !isAfterMode ? "pill-fail" : "pill-pass"}`}>
                {isAfterMode ? "OK" : selectedBar.status}
              </span>{" "}
              <strong>{selectedBar.tag || selectedBar.name}</strong>
            </div>
            <button type="button" className="btn-link" onClick={onClearBar}>
              Clear
            </button>
          </div>
          <div className="bar-specs">
            <div>
              <span className="spec-k">Name</span>
              <span className="spec-v">{selectedBar.name}</span>
            </div>
            <div>
              <span className="spec-k">Member / Role</span>
              <span className="spec-v">
                {selectedBar.member || "—"} · {selectedBar.role}
                {selectedBar.layer ? ` (layer ${selectedBar.layer})` : ""}
              </span>
            </div>
            <div>
              <span className="spec-k">Diameter / Length</span>
              <span className="spec-v">
                {selectedBar.diameterMm != null ? `${selectedBar.diameterMm} mm` : "—"}
                {selectedBar.lengthMm != null ? ` · ${Math.round(selectedBar.lengthMm)} mm` : ""}
              </span>
            </div>
            <div>
              <span className="spec-k">IFC GlobalId</span>
              <span className="spec-v mono">{selectedBar.globalId}</span>
            </div>
          </div>

          <div className="subhead">Findings on this bar</div>
          {isAfterMode ? (
            <p className="muted-note">In After Fix mode (`fixed.ifc`), every bar satisfies all checked rules.</p>
          ) : barFindings.length === 0 ? (
            <p className="muted-note">No direct findings recorded against this bar.</p>
          ) : (
            <div className="mini-findings">
              {barFindings.map(({ f, index }) => (
                <button
                  key={index}
                  type="button"
                  className={`finding-row ${f.status === "fail" ? "finding-fail" : "finding-pass"} ${
                    selectedFindingIndex === index ? "finding-active" : ""
                  }`}
                  onClick={() => onSelectFinding(index, selectedBar.tag)}
                >
                  <div className="finding-row-top">
                    <span className={`pill ${f.status === "fail" ? "pill-fail" : "pill-pass"}`}>
                      {f.status.toUpperCase()}
                    </span>
                    <span className="clause-tag">{f.clause}</span>
                    <span className="measure-chip">
                      {formatNumber(f.measured)} {f.unit} ({f.compare} {formatNumber(f.limit)} {f.unit})
                    </span>
                  </div>
                  <div className="finding-msg">{f.message}</div>
                </button>
              ))}
            </div>
          )}

          <ProvenanceCrop
            bar={selectedBar}
            provenance={bundle.provenance}
            pages={bundle.pages}
            notes={joint.notes}
          />
        </section>
      ) : (
        <div className="hint-box">
          Click any bar in the 3D joint (or a gap label) to inspect its GlobalId, rule findings, and drawing provenance.
        </div>
      )}

      {/* Failing checks list */}
      <section className="section">
        <div className="section-title">
          {isAfterMode ? "Original Failures Resolved (Before)" : `Failing Checks (${failures.length})`}
        </div>
        <div className="findings-list">
          {failures.map(({ f, index }) => (
            <button
              key={index}
              type="button"
              className={`finding-row finding-fail ${
                selectedFindingIndex === index ? "finding-active" : ""
              } ${isAfterMode ? "finding-muted" : ""}`}
              onClick={() => onSelectFinding(index, f.bars[0])}
            >
              <div className="finding-row-top">
                <span className="clause-tag">{f.clause}</span>
                <span className="measure-chip">
                  {formatNumber(f.measured)} {f.unit} · needs {f.compare} {formatNumber(f.limit)} {f.unit}
                </span>
              </div>
              <div className="finding-msg">{f.message}</div>
              {f.bars.length > 0 && (
                <div className="finding-bars">Bars: {f.bars.join(", ")}</div>
              )}
            </button>
          ))}
        </div>
      </section>

      {/* Passing checks toggle */}
      <section className="section">
        <button type="button" className="collapse-toggle" onClick={() => setShowPassing((v) => !v)}>
          <span>Passing Checks ({passes.length})</span>
          <span>{showPassing ? "Hide" : "Show"}</span>
        </button>
        {showPassing && (
          <div className="findings-list">
            {passes.map(({ f, index }) => (
              <button
                key={index}
                type="button"
                className={`finding-row finding-pass ${
                  selectedFindingIndex === index ? "finding-active" : ""
                }`}
                onClick={() => onSelectFinding(index, f.bars[0])}
              >
                <div className="finding-row-top">
                  <span className="clause-tag">{f.clause}</span>
                  <span className="measure-chip">
                    {formatNumber(f.measured)} {f.unit} ({f.compare} {formatNumber(f.limit)} {f.unit})
                  </span>
                </div>
                <div className="finding-msg">{f.message}</div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Rules & Assumptions */}
      <section className="section">
        <button type="button" className="collapse-toggle" onClick={() => setShowRules((v) => !v)}>
          <span>Rules Audited & Assumptions</span>
          <span>{showRules ? "Hide" : "Show"}</span>
        </button>
        {showRules && (
          <div className="rules-audit">
            {report.rules_run.map((id) => {
              const r = rules[id];
              return (
                <div key={id} className="audit-item">
                  <div className="audit-head">
                    <strong>{r?.clause ?? id}</strong> — {r?.title} ({report.passed[id] ?? 0} passed)
                  </div>
                  {r?.basis && <div className="muted-note">Basis: {r.basis}</div>}
                </div>
              );
            })}
            {Object.entries(report.rules_skipped).map(([id, why]) => (
              <div key={id} className="audit-item audit-skipped">
                <div className="audit-head">
                  <strong>{rules[id]?.clause ?? id}</strong> — Not run
                </div>
                <div className="muted-note">{why}</div>
              </div>
            ))}
            {joint.notes.length > 0 && (
              <div className="audit-item">
                <div className="audit-head">
                  <strong>Assumptions</strong>
                </div>
                <ul className="notes-list">
                  {joint.notes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
