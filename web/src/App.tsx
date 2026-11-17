import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { FindingsPanel } from "./components/FindingsPanel";
import { FixPanel } from "./components/FixPanel";
import { Viewport3D, type ConcreteMode, type LabelMode } from "./components/Viewport3D";
import { WorkingsPanel } from "./components/WorkingsPanel";
import type { BarMetadata, Bundle } from "./types";
import "./styles.css";

type TabId = "findings" | "fixes" | "workings";

interface LoadedFiles {
  bundle: Bundle;
  jointIfc: ArrayBuffer;
  fixedIfc: ArrayBuffer | null;
  bcfBlob: Blob | null;
  sourceLabel: string;
}

function downloadBlob(data: ArrayBuffer | Blob, filename: string, mime: string) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function App() {
  const [availableJoints, setAvailableJoints] = useState<string[]>([]);
  const [activeJointDir, setActiveJointDir] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("joint") || "C4xB12";
  });
  const [loaded, setLoaded] = useState<LoadedFiles | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [tab, setTab] = useState<TabId>("findings");
  const [isAfterMode, setIsAfterMode] = useState(false);
  const [concreteMode, setConcreteMode] = useState<ConcreteMode>("translucent");
  const [labelMode, setLabelMode] = useState<LabelMode>("failures");
  const [resetSignal, setResetSignal] = useState(0);

  const [barsMap, setBarsMap] = useState<Map<string, BarMetadata>>(new Map());
  const [selectedBar, setSelectedBar] = useState<BarMetadata | null>(null);
  const [selectedFindingIndex, setSelectedFindingIndex] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Discover joints in ../out via Vite dev/preview index
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paramJoint = params.get("joint");

    fetch("/out-index.json")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { joints?: string[] } | null) => {
        if (data?.joints && data.joints.length > 0) {
          setAvailableJoints(data.joints);
          if (!paramJoint && !data.joints.includes("C4xB12")) {
            setActiveJointDir(data.joints[0]);
          }
        }
      })
      .catch(() => {
        // Fallback to default C4xB12
      });
  }, []);

  // Fetch bundle.json, joint.ifc, fixed.ifc, issues.bcf for activeJointDir
  useEffect(() => {
    if (!activeJointDir) return;
    let cancelled = false;
    const base = `/out/${encodeURIComponent(activeJointDir)}`;
    Promise.all([
      fetch(`${base}/bundle.json`).then((r) => {
        if (!r.ok) throw new Error(`Could not load ${base}/bundle.json (${r.status})`);
        return r.json() as Promise<Bundle>;
      }),
      fetch(`${base}/joint.ifc`).then((r) => {
        if (!r.ok) throw new Error(`Could not load ${base}/joint.ifc (${r.status})`);
        return r.arrayBuffer();
      }),
      fetch(`${base}/fixed.ifc`)
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .catch(() => null),
      fetch(`${base}/issues.bcf`)
        .then((r) => (r.ok ? r.blob() : null))
        .catch(() => null),
    ])
      .then(([bundle, jointIfc, fixedIfc, bcfBlob]) => {
        if (cancelled) return;
        setLoadError(null);
        setSelectedBar(null);
        setSelectedFindingIndex(null);
        setIsAfterMode(false);
        setLoaded({
          bundle,
          jointIfc,
          fixedIfc,
          bcfBlob,
          sourceLabel: `out/${activeJointDir}`,
        });
        setIsLoading(false);
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : String(err));
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeJointDir]);

  const handleUploadFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    const byName = new Map<string, File>();
    for (const f of files) {
      byName.set(f.name.toLowerCase(), f);
    }

    const bundleFile = byName.get("bundle.json");
    const jointIfcFile = byName.get("joint.ifc");
    if (!bundleFile || !jointIfcFile) {
      setLoadError(
        "Please select at least bundle.json and joint.ifc (optionally fixed.ifc, issues.bcf, provenance.json).",
      );
      return;
    }

    try {
      setLoadError(null);
      setIsLoading(true);
      const bundle = JSON.parse(await bundleFile.text()) as Bundle;
      const provFile = byName.get("provenance.json");
      if (provFile) {
        bundle.provenance = JSON.parse(await provFile.text());
      }
      const jointIfc = await jointIfcFile.arrayBuffer();
      const fixedIfcFile = byName.get("fixed.ifc");
      const fixedIfc = fixedIfcFile ? await fixedIfcFile.arrayBuffer() : null;
      const bcfFile = byName.get("issues.bcf") ?? null;

      setSelectedBar(null);
      setSelectedFindingIndex(null);
      setIsAfterMode(false);
      setLoaded({
        bundle,
        jointIfc,
        fixedIfc,
        bcfBlob: bcfFile,
        sourceLabel: "local upload",
      });
      setIsLoading(false);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
      setIsLoading(false);
    } finally {
      e.target.value = "";
    }
  };

  const handleBarsLoaded = useCallback((bars: BarMetadata[]) => {
    const next = new Map<string, BarMetadata>();
    for (const b of bars) {
      if (b.tag) next.set(b.tag, b);
      if (b.globalId) next.set(b.globalId, b);
    }
    setBarsMap(next);
  }, []);

  const handleSelectBar = useCallback((meta: BarMetadata | null) => {
    setSelectedBar(meta);
    setSelectedFindingIndex(null);
    if (meta) setTab("findings");
  }, []);

  const handleSelectFinding = useCallback(
    (index: number | null, barKey?: string) => {
      setSelectedFindingIndex(index);
      if (barKey && barsMap.has(barKey)) {
        setSelectedBar(barsMap.get(barKey)!);
      }
      if (index != null) setTab("findings");
    },
    [barsMap],
  );

  const handleToggleMode = useCallback((after: boolean) => {
    setIsAfterMode(after);
    setSelectedBar(null);
    setSelectedFindingIndex(null);
  }, []);

  const cycleConcreteMode = () => {
    setConcreteMode((m) =>
      m === "translucent" ? "wireframe" : m === "wireframe" ? "hidden" : "translucent",
    );
  };

  const cycleLabelMode = () => {
    setLabelMode((m) => (m === "failures" ? "all" : m === "all" ? "hidden" : "failures"));
  };

  const activeIfcBuffer = useMemo(() => {
    if (!loaded) return null;
    if (isAfterMode && loaded.fixedIfc) return loaded.fixedIfc;
    return loaded.jointIfc;
  }, [loaded, isAfterMode]);

  const failCount = useMemo(
    () => loaded?.bundle.report.findings.filter((f) => f.status === "fail").length ?? 0,
    [loaded],
  );

  const jointId = loaded?.bundle.joint.id ?? activeJointDir;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-group">
          <div className="brand-mark">RT</div>
          <div>
            <div className="brand-title">
              RebarTwin <span className="joint-chip">{jointId}</span>
              {loaded && (
                <span
                  className={`pill ${isAfterMode || failCount === 0 ? "pill-pass" : "pill-fail"}`}
                >
                  {isAfterMode ? "AFTER FIX · 0 FAIL" : `${failCount} FAIL`}
                </span>
              )}
            </div>
            <div className="brand-sub">
              Geometry decides · Advisory only (engineer of record decides)
            </div>
          </div>
        </div>

        <div className="toolbar-controls">
          {availableJoints.length > 1 && (
            <select
              className="select-control"
              value={activeJointDir}
              onChange={(e) => setActiveJointDir(e.target.value)}
              aria-label="Select checked joint"
            >
              {availableJoints.map((j) => (
                <option key={j} value={j}>
                  {j}
                </option>
              ))}
            </select>
          )}

          <div className="segmented segmented-top">
            <button
              type="button"
              className={!isAfterMode ? "seg-active" : ""}
              onClick={() => handleToggleMode(false)}
            >
              Before
            </button>
            <button
              type="button"
              className={isAfterMode ? "seg-active seg-after" : ""}
              disabled={!loaded?.fixedIfc}
              title={loaded?.fixedIfc ? "Toggle to fixed.ifc" : "No fixed.ifc available"}
              onClick={() => handleToggleMode(true)}
            >
              After
            </button>
          </div>

          <button type="button" className="btn-tool" onClick={cycleConcreteMode}>
            Concrete:{" "}
            {concreteMode === "translucent"
              ? "See-through"
              : concreteMode === "wireframe"
                ? "Outline"
                : "Off"}
          </button>

          <button type="button" className="btn-tool" onClick={cycleLabelMode}>
            Labels: {labelMode === "failures" ? "Failures" : labelMode === "all" ? "All" : "Off"}
          </button>

          <button type="button" className="btn-tool" onClick={() => setResetSignal((n) => n + 1)}>
            Reset View
          </button>

          <div className="download-group">
            <button
              type="button"
              className="btn-download"
              disabled={!loaded}
              onClick={() => {
                if (!loaded) return;
                if (isAfterMode && loaded.fixedIfc) {
                  downloadBlob(loaded.fixedIfc, `${jointId}-fixed.ifc`, "application/x-step");
                } else {
                  downloadBlob(loaded.jointIfc, `${jointId}-joint.ifc`, "application/x-step");
                }
              }}
              title="Download active IFC model"
            >
              ↓ {isAfterMode && loaded?.fixedIfc ? "fixed.ifc" : "joint.ifc"}
            </button>
            {loaded?.fixedIfc && !isAfterMode && (
              <button
                type="button"
                className="btn-download"
                onClick={() =>
                  downloadBlob(loaded.fixedIfc!, `${jointId}-fixed.ifc`, "application/x-step")
                }
                title="Download fixed IFC model"
              >
                ↓ fixed.ifc
              </button>
            )}
            <button
              type="button"
              className="btn-download"
              disabled={!loaded?.bcfBlob}
              onClick={() => {
                if (loaded?.bcfBlob) {
                  downloadBlob(loaded.bcfBlob, `${jointId}-issues.bcf`, "application/zip");
                }
              }}
              title="Download BCF 2.1 issues"
            >
              ↓ issues.bcf
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".json,.ifc,.bcf"
            style={{ display: "none" }}
            onChange={handleUploadFiles}
          />
          <button
            type="button"
            className="btn-tool"
            onClick={() => fileInputRef.current?.click()}
            title="Load bundle.json and joint.ifc from disk"
          >
            Load Files
          </button>
        </div>
      </header>

      <main className="workspace">
        <div className="canvas-pane">
          {loadError ? (
            <div className="empty-state">
              <h2>Could not load joint files</h2>
              <p>{loadError}</p>
              <p className="muted-note">
                Run <code>rebartwin check examples/c4_b12.json</code> to generate{" "}
                <code>out/C4xB12/bundle.json</code> and <code>joint.ifc</code>, or click{" "}
                <strong>Load Files</strong>.
              </p>
            </div>
          ) : isLoading || !loaded ? (
            <div className="empty-state">Loading RebarTwin bundle and IFC geometry…</div>
          ) : (
            <Viewport3D
              ifcBuffer={activeIfcBuffer}
              findings={loaded.bundle.report.findings}
              isAfterMode={isAfterMode}
              selectedBarTag={selectedBar?.tag ?? null}
              selectedFindingIndex={selectedFindingIndex}
              onSelectBar={handleSelectBar}
              onSelectFinding={handleSelectFinding}
              concreteMode={concreteMode}
              labelMode={labelMode}
              onBarsLoaded={handleBarsLoaded}
              resetSignal={resetSignal}
            />
          )}
        </div>

        <aside className="side-pane">
          <nav className="tabs">
            <button
              type="button"
              className={`tab-btn ${tab === "findings" ? "tab-active" : ""}`}
              onClick={() => setTab("findings")}
            >
              Findings {loaded ? `(${failCount} fail)` : ""}
            </button>
            <button
              type="button"
              className={`tab-btn ${tab === "fixes" ? "tab-active" : ""}`}
              onClick={() => setTab("fixes")}
            >
              Fix {loaded ? `(${loaded.bundle.fix.options.length})` : ""}
            </button>
            <button
              type="button"
              className={`tab-btn ${tab === "workings" ? "tab-active" : ""}`}
              onClick={() => setTab("workings")}
            >
              Workings {loaded ? `(${loaded.bundle.fix.attempts.length})` : ""}
            </button>
          </nav>

          {loaded ? (
            tab === "findings" ? (
              <FindingsPanel
                bundle={loaded.bundle}
                isAfterMode={isAfterMode}
                selectedBar={selectedBar}
                selectedFindingIndex={selectedFindingIndex}
                onSelectFinding={handleSelectFinding}
                onClearBar={() => {
                  setSelectedBar(null);
                  setSelectedFindingIndex(null);
                }}
              />
            ) : tab === "fixes" ? (
              <FixPanel
                bundle={loaded.bundle}
                isAfterMode={isAfterMode}
                hasFixedIfc={Boolean(loaded.fixedIfc)}
                onToggleMode={handleToggleMode}
              />
            ) : (
              <WorkingsPanel attempts={loaded.bundle.fix.attempts} />
            )
          ) : (
            <div className="panel-body">
              <div className="muted-note">Waiting for joint bundle…</div>
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}
export default App;
