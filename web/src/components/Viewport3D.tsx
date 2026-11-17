import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { formatFindingLabel, ifcToThree } from "../coords";
import { disposeLoadedModel, loadIfcModel, type LoadedIfcModel } from "../ifcLoader";
import type { BarMetadata, Finding } from "../types";

export type ConcreteMode = "translucent" | "wireframe" | "hidden";
export type LabelMode = "failures" | "all" | "hidden";

interface Viewport3DProps {
  ifcBuffer: ArrayBuffer | null;
  findings: Finding[];
  isAfterMode: boolean;
  selectedBarTag: string | null;
  selectedFindingIndex: number | null;
  onSelectBar: (meta: BarMetadata | null) => void;
  onSelectFinding: (index: number | null, barKey?: string) => void;
  concreteMode: ConcreteMode;
  labelMode: LabelMode;
  onBarsLoaded?: (bars: BarMetadata[]) => void;
  resetSignal: number;
}

interface LabelEntry {
  key: string;
  findingIndex: number;
  finding: Finding;
  worldPos: THREE.Vector3;
  text: string;
  isFail: boolean;
}

interface LabelDomRefs {
  dot: SVGCircleElement | null;
  ring: SVGCircleElement | null;
  line: SVGLineElement | null;
  pill: HTMLButtonElement | null;
}

const DEFAULT_CAM_POS = new THREE.Vector3(-1.35, 0.65, 2.05);
const DEFAULT_TARGET = new THREE.Vector3(-0.06, -0.22, 0.0);

function applyConcreteVisibility(loaded: LoadedIfcModel, mode: ConcreteMode) {
  for (const m of loaded.concreteMeshes) {
    m.visible = mode === "translucent";
  }
  for (const o of loaded.concreteOutlines) {
    o.visible = mode !== "hidden";
  }
}

function applyBarHighlight(
  loaded: LoadedIfcModel,
  selectedBarTag: string | null,
  selectedFindingIndex: number | null,
  findings: Finding[],
) {
  const highlighted = new Set<string>();
  if (selectedBarTag) highlighted.add(selectedBarTag);
  if (selectedFindingIndex != null && findings[selectedFindingIndex]) {
    for (const b of findings[selectedFindingIndex].bars) {
      highlighted.add(b);
    }
  }
  for (const mesh of loaded.barMeshes) {
    const meta = mesh.userData?.barMeta as BarMetadata | undefined;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    const isMatch = Boolean(meta && (highlighted.has(meta.tag) || highlighted.has(meta.globalId)));
    if (isMatch) {
      mat.color.setHex(0xffb74d);
      mat.emissive.setHex(0xe67e00);
      mat.emissiveIntensity = 0.75;
    } else {
      mat.color.setHex(mesh.userData.baseColor ?? 0x8896a6);
      mat.emissive.setHex(mesh.userData.baseEmissive ?? 0x000000);
      mat.emissiveIntensity = mesh.userData.baseEmissiveIntensity ?? 0;
    }
  }
}

export function Viewport3D({
  ifcBuffer,
  findings,
  isAfterMode,
  selectedBarTag,
  selectedFindingIndex,
  onSelectBar,
  onSelectFinding,
  concreteMode,
  labelMode,
  onBarsLoaded,
  resetSignal,
}: Viewport3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const modelRef = useRef<LoadedIfcModel | null>(null);
  const markersGroupRef = useRef<THREE.Group | null>(null);
  const labelDomMapRef = useRef<Map<string, LabelDomRefs>>(new Map());
  const hoveredMeshRef = useRef<THREE.Mesh | null>(null);
  const concreteModeRef = useRef<ConcreteMode>(concreteMode);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoadingModel, setIsLoadingModel] = useState(false);

  const visibleFindings = useMemo(() => {
    if (labelMode === "hidden" || isAfterMode) return [];
    const entries: LabelEntry[] = [];
    findings.forEach((f, idx) => {
      if (!f.at) return;
      if (labelMode === "failures" && f.status !== "fail") return;
      const [tx, ty, tz] = ifcToThree(f.at);
      entries.push({
        key: `${idx}-${f.rule}-${f.bars.join(",")}`,
        findingIndex: idx,
        finding: f,
        worldPos: new THREE.Vector3(tx, ty, tz),
        text: formatFindingLabel(f),
        isFail: f.status === "fail",
      });
    });
    return entries;
  }, [findings, labelMode, isAfterMode]);

  const visibleFindingsRef = useRef<LabelEntry[]>(visibleFindings);
  const onSelectBarRef = useRef(onSelectBar);

  useEffect(() => {
    concreteModeRef.current = concreteMode;
  }, [concreteMode]);

  useEffect(() => {
    visibleFindingsRef.current = visibleFindings;
  }, [visibleFindings]);

  useEffect(() => {
    onSelectBarRef.current = onSelectBar;
  }, [onSelectBar]);

  // Initialize Three.js scene once
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d131b);
    sceneRef.current = scene;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.01, 50);
    camera.position.copy(DEFAULT_CAM_POS);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(DEFAULT_TARGET);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 0.25;
    controls.maxDistance = 8.0;
    controls.update();
    controlsRef.current = controls;

    // Lighting tailored for metallic steel & translucent concrete
    const hemi = new THREE.HemisphereLight(0xeef4ff, 0x1a222d, 1.15);
    scene.add(hemi);
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.45);
    keyLight.position.set(2.5, 4.0, 3.0);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xa8c5ff, 0.75);
    fillLight.position.set(-3.0, 1.5, -2.5);
    scene.add(fillLight);
    const rimLight = new THREE.DirectionalLight(0xffe7cc, 0.45);
    rimLight.position.set(0.0, -2.0, 2.0);
    scene.add(rimLight);

    // Subtle ground grid below column base (-1.05 m)
    const grid = new THREE.GridHelper(3.2, 16, 0x2a394a, 0x1a2430);
    grid.position.y = -1.06;
    scene.add(grid);

    const markersGroup = new THREE.Group();
    scene.add(markersGroup);
    markersGroupRef.current = markersGroup;

    // Raycaster for bar click and hover
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downX = 0;
    let downY = 0;

    const setPointer = (ev: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const handlePointerDown = (ev: PointerEvent) => {
      downX = ev.clientX;
      downY = ev.clientY;
    };

    const handlePointerMove = (ev: PointerEvent) => {
      const loaded = modelRef.current;
      if (!loaded) return;
      setPointer(ev);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(loaded.barMeshes, false);
      const hitMesh = hits.length > 0 ? (hits[0].object as THREE.Mesh) : null;
      if (hoveredMeshRef.current !== hitMesh) {
        hoveredMeshRef.current = hitMesh;
        renderer.domElement.style.cursor = hitMesh ? "pointer" : "grab";
      }
    };

    const handlePointerUp = (ev: PointerEvent) => {
      const dist = Math.hypot(ev.clientX - downX, ev.clientY - downY);
      if (dist > 5) return;
      const loaded = modelRef.current;
      if (!loaded) return;
      setPointer(ev);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(loaded.barMeshes, false);
      if (hits.length > 0) {
        const mesh = hits[0].object as THREE.Mesh;
        const meta = mesh.userData?.barMeta as BarMetadata | undefined;
        onSelectBarRef.current(meta ?? null);
      } else {
        onSelectBarRef.current(null);
      }
    };

    renderer.domElement.style.cursor = "grab";
    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointermove", handlePointerMove);
    renderer.domElement.addEventListener("pointerup", handlePointerUp);

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        const h = entry.contentRect.height;
        if (w > 0 && h > 0) {
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        }
      }
    });
    resizeObserver.observe(container);

    // Project 3D finding positions -> 2D overlay with deterministic collision avoidance
    const projVec = new THREE.Vector3();
    let rafId = 0;

    const updateLabelPositions = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w <= 0 || h <= 0) return;

      const entries = visibleFindingsRef.current;
      interface Placed {
        key: string;
        ax: number;
        ay: number;
        lx: number;
        ly: number;
        pillW: number;
        pillH: number;
        visible: boolean;
      }

      const placed: Placed[] = [];
      for (const entry of entries) {
        const refs = labelDomMapRef.current.get(entry.key);
        if (!refs) continue;
        projVec.copy(entry.worldPos).project(camera);
        const behind = projVec.z > 1 || projVec.z < -1;
        const ax = (projVec.x * 0.5 + 0.5) * w;
        const ay = (-projVec.y * 0.5 + 0.5) * h;

        const pillW = refs.pill?.offsetWidth || 215;
        const pillH = refs.pill?.offsetHeight || 24;
        const pad = 12;

        // Place left-side callouts toward the left margin and center/right callouts toward the right
        const rawLx =
          ax < w * 0.42
            ? Math.min(Math.max(ax - pillW - 18, pad), w - pillW - pad)
            : Math.min(Math.max(ax + 48, pad), w - pillW - pad);
        const rawLy = Math.min(Math.max(ay - 44, pad), h - pillH - pad - 36);

        placed.push({
          key: entry.key,
          ax,
          ay,
          lx: rawLx,
          ly: rawLy,
          pillW,
          pillH,
          visible: !behind,
        });
      }

      // Sort top-to-bottom and fan overlapping labels upward so callouts sit cleanly above bars
      const vis = placed.filter((p) => p.visible).sort((a, b) => a.ay - b.ay || a.ax - b.ax);
      for (let i = vis.length - 2; i >= 0; i--) {
        const upper = vis[i];
        for (let j = i + 1; j < vis.length; j++) {
          const lower = vis[j];
          const horizOverlap =
            upper.lx < lower.lx + lower.pillW + 10 && upper.lx + upper.pillW + 10 > lower.lx;
          if (!horizOverlap) continue;
          const minGap = upper.pillH + 8;
          if (upper.ly > lower.ly - minGap) {
            upper.ly = lower.ly - minGap;
          }
        }
      }
      // Clamp top boundary and sweep downward if any item was pushed above top padding
      for (let i = 0; i < vis.length; i++) {
        vis[i].ly = Math.max(12, vis[i].ly);
        for (let j = 0; j < i; j++) {
          const prev = vis[j];
          const horizOverlap =
            vis[i].lx < prev.lx + prev.pillW + 10 && vis[i].lx + vis[i].pillW + 10 > prev.lx;
          if (horizOverlap && vis[i].ly < prev.ly + prev.pillH + 8) {
            vis[i].ly = prev.ly + prev.pillH + 8;
          }
        }
        vis[i].ly = Math.min(h - vis[i].pillH - 46, vis[i].ly);
      }

      for (const item of placed) {
        const refs = labelDomMapRef.current.get(item.key);
        if (!refs) continue;
        const disp = item.visible ? "" : "none";
        if (refs.dot) {
          refs.dot.style.display = disp;
          refs.dot.setAttribute("cx", item.ax.toFixed(1));
          refs.dot.setAttribute("cy", item.ay.toFixed(1));
        }
        if (refs.ring) {
          refs.ring.style.display = disp;
          refs.ring.setAttribute("cx", item.ax.toFixed(1));
          refs.ring.setAttribute("cy", item.ay.toFixed(1));
        }
        if (refs.pill) {
          refs.pill.style.display = disp;
          refs.pill.style.transform = `translate3d(${item.lx.toFixed(1)}px, ${item.ly.toFixed(1)}px, 0)`;
        }
        if (refs.line) {
          refs.line.style.display = disp;
          const targetX = Math.min(Math.max(item.ax, item.lx + 8), item.lx + item.pillW - 8);
          const targetY = item.ly + (item.ay > item.ly + item.pillH ? item.pillH : 0);
          refs.line.setAttribute("x1", item.ax.toFixed(1));
          refs.line.setAttribute("y1", item.ay.toFixed(1));
          refs.line.setAttribute("x2", targetX.toFixed(1));
          refs.line.setAttribute("y2", targetY.toFixed(1));
        }
      }
    };

    const animate = () => {
      rafId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
      updateLabelPositions();
    };
    animate();

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      controls.dispose();
      disposeLoadedModel(modelRef.current);
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Load IFC model whenever buffer or mode changes
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !ifcBuffer) return;

    let cancelled = false;

    loadIfcModel(ifcBuffer, findings, !isAfterMode)
      .then((loaded) => {
        if (cancelled) {
          disposeLoadedModel(loaded);
          return;
        }
        if (modelRef.current) {
          scene.remove(modelRef.current.root);
          disposeLoadedModel(modelRef.current);
        }
        modelRef.current = loaded;
        scene.add(loaded.root);
        applyConcreteVisibility(loaded, concreteModeRef.current);

        if (onBarsLoaded) {
          const seen = new Set<string>();
          const uniqueBars: BarMetadata[] = [];
          for (const { meta } of loaded.barsByKey.values()) {
            const k = `${meta.expressID}`;
            if (!seen.has(k)) {
              seen.add(k);
              uniqueBars.push(meta);
            }
          }
          onBarsLoaded(uniqueBars);
        }
        setLoadError(null);
        setIsLoadingModel(false);
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : String(err));
          setIsLoadingModel(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [ifcBuffer, findings, isAfterMode, onBarsLoaded]);

  // Apply concrete visibility mode without reloading IFC
  useEffect(() => {
    if (modelRef.current) {
      applyConcreteVisibility(modelRef.current, concreteMode);
    }
  }, [concreteMode, ifcBuffer, isAfterMode]);

  // Render small 3D sphere markers at each finding `at` point
  useEffect(() => {
    const grp = markersGroupRef.current;
    if (!grp) return;
    while (grp.children.length > 0) {
      const child = grp.children.pop()!;
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    }
    for (const entry of visibleFindings) {
      const selected = selectedFindingIndex === entry.findingIndex;
      const geom = new THREE.SphereGeometry(selected ? 0.011 : 0.007, 16, 12);
      const mat = new THREE.MeshBasicMaterial({
        color: selected ? 0xffca28 : entry.isFail ? 0xff4d47 : 0x4cc99b,
      });
      const sphere = new THREE.Mesh(geom, mat);
      sphere.position.copy(entry.worldPos);
      sphere.renderOrder = 4;
      grp.add(sphere);
    }
  }, [visibleFindings, selectedFindingIndex]);

  // Highlight selected bar or bars belonging to the selected finding
  useEffect(() => {
    const loaded = modelRef.current;
    if (!loaded) return;
    applyBarHighlight(loaded, selectedBarTag, selectedFindingIndex, findings);
  }, [selectedBarTag, selectedFindingIndex, findings, isAfterMode, ifcBuffer]);

  // Reset camera when requested
  useEffect(() => {
    if (resetSignal === 0) return;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    camera.position.copy(DEFAULT_CAM_POS);
    controls.target.copy(DEFAULT_TARGET);
    controls.update();
  }, [resetSignal]);

  const registerRef =
    <K extends keyof LabelDomRefs>(key: string, field: K) =>
    (el: LabelDomRefs[K]) => {
      if (!labelDomMapRef.current.has(key)) {
        labelDomMapRef.current.set(key, { dot: null, ring: null, line: null, pill: null });
      }
      labelDomMapRef.current.get(key)![field] = el;
    };

  return (
    <div className="viewport-wrap">
      <div ref={containerRef} className="viewport-canvas" />

      <svg className="labels-svg" aria-hidden="true">
        {visibleFindings.map((entry) => {
          const isSelected = selectedFindingIndex === entry.findingIndex;
          const cls = isSelected ? "leader-selected" : entry.isFail ? "leader-fail" : "leader-pass";
          return (
            <g key={entry.key} className={cls}>
              <line ref={registerRef(entry.key, "line")} className="leader-line" />
              <circle ref={registerRef(entry.key, "ring")} r={7} className="anchor-ring" />
              <circle ref={registerRef(entry.key, "dot")} r={3.5} className="anchor-dot" />
            </g>
          );
        })}
      </svg>

      <div className="labels-layer">
        {visibleFindings.map((entry) => {
          const isSelected = selectedFindingIndex === entry.findingIndex;
          return (
            <button
              key={entry.key}
              type="button"
              ref={registerRef(entry.key, "pill")}
              className={`gap-label ${entry.isFail ? "gap-label-fail" : "gap-label-pass"} ${
                isSelected ? "gap-label-selected" : ""
              }`}
              title={entry.finding.message}
              onClick={() => onSelectFinding(entry.findingIndex, entry.finding.bars[0])}
            >
              <span className="gap-label-dot" />
              <span>{entry.text}</span>
            </button>
          );
        })}
      </div>

      <div className="viewport-legend">
        <span className="legend-item">
          <span className="swatch swatch-fail" /> Failing bar
        </span>
        <span className="legend-item">
          <span className="swatch swatch-ok" /> Passing steel
        </span>
        <span className="legend-item">
          <span className="swatch swatch-concrete" /> Concrete (see-through)
        </span>
        <span className="legend-hint">Drag to orbit · Scroll to zoom · Click bar to inspect</span>
      </div>

      {isLoadingModel && <div className="viewport-status">Loading IFC geometry via web-ifc…</div>}
      {loadError && <div className="viewport-error">IFC error: {loadError}</div>}
    </div>
  );
}
