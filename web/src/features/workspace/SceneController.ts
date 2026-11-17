import CameraControls from "camera-controls";
import * as THREE from "three";
import { ifcToThree, MM_TO_M } from "../../lib/coords";
import type { CameraPreset, ConcreteMode, LabelMode, ThemeMode } from "../../stores/workspace";
import type { Finding, Scene, SceneBar, SceneConcrete, SceneLoop } from "../../types/bundle";
import { easeInOutCubic, partitionSceneBars } from "./sceneMorph";

CameraControls.install({ THREE });

const UP_Y = new THREE.Vector3(0, 1, 0);
const FIT_PADDING_RATIO = 0.12;
const ISO_DIR = new THREE.Vector3(-0.52, 0.34, 0.85).normalize();

export interface ProjectedBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
}

interface MorphBarEntry {
  kind: "tween" | "shrink" | "grow";
  entry: BarEntry;
  fromPos: THREE.Vector3;
  toPos: THREE.Vector3;
  fromQuat: THREE.Quaternion;
  toQuat: THREE.Quaternion;
  fromRadius: number;
  toRadius: number;
  fromLength: number;
  toLength: number;
  fromFail: number;
  toFail: number;
}

interface MorphConcreteEntry {
  mesh: THREE.Mesh;
  outline: THREE.LineSegments;
  fromPos: THREE.Vector3;
  toPos: THREE.Vector3;
  toScale: THREE.Vector3;
}

interface MorphState {
  startTime: number;
  durationMs: number;
  reducedFade: boolean;
  nextScene: Scene;
  bars: MorphBarEntry[];
  concretes: MorphConcreteEntry[];
}

interface ThemePalette {
  bg: THREE.Color;
  fail: THREE.Color;
  pass: THREE.Color;
  steel: THREE.Color;
  concrete: THREE.Color;
  edge: THREE.Color;
  rim: THREE.Color;
}

function cssColor(name: string, fallback: string): THREE.Color {
  if (typeof document !== "undefined") {
    const val = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (val) return new THREE.Color(val);
  }
  return new THREE.Color(fallback);
}

function readPalette(theme: ThemeMode): ThemePalette {
  return {
    bg: cssColor("--surface-sunken", theme === "light" ? "#eae6df" : "#0a0d11"),
    fail: cssColor("--fail", theme === "light" ? "#b42318" : "#ff6a3d"),
    pass: cssColor("--pass", theme === "light" ? "#126b43" : "#3dd68c"),
    steel: cssColor("--steel", "#9aa6b5"),
    concrete: cssColor("--concrete", "#cfc9bf"),
    edge: cssColor("--border-strong", theme === "light" ? "#bfb8ac" : "#3a4351"),
    rim: cssColor("--foreground", theme === "light" ? "#15191f" : "#eef1f4"),
  };
}

function closestPointOnSegment(a: THREE.Vector3, b: THREE.Vector3, p: THREE.Vector3): THREE.Vector3 {
  const ab = b.clone().sub(a);
  const lenSq = ab.lengthSq();
  if (lenSq < 1e-9) return a.clone();
  const t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / lenSq, 0, 1);
  return a.clone().addScaledVector(ab, t);
}

function buildFadingGrid(yFloor: number, bg: THREE.Color, edge: THREE.Color): THREE.LineSegments {
  const halfExtent = 2.0; // 2,000 mm each side
  const step = 0.1; // 100 mm minor
  const positions: number[] = [];
  const colors: number[] = [];

  const minorColor = bg.clone().lerp(edge, 0.25);
  const majorColor = bg.clone().lerp(edge, 0.55);

  const count = Math.round(halfExtent / step);
  const segs = 16;
  const maxR = halfExtent * 1.1;

  const pushSegment = (x0: number, z0: number, x1: number, z1: number, baseColor: THREE.Color) => {
    for (let s = 0; s < segs; s++) {
      const t0 = s / segs;
      const t1 = (s + 1) / segs;
      const ax = x0 + (x1 - x0) * t0;
      const az = z0 + (z1 - z0) * t0;
      const bx = x0 + (x1 - x0) * t1;
      const bz = z0 + (z1 - z0) * t1;

      const fa = Math.max(0, 1 - Math.hypot(ax, az) / maxR);
      const fb = Math.max(0, 1 - Math.hypot(bx, bz) / maxR);
      const ca = bg.clone().lerp(baseColor, fa * fa);
      const cb = bg.clone().lerp(baseColor, fb * fb);

      positions.push(ax, yFloor, az, bx, yFloor, bz);
      colors.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b);
    }
  };

  for (let i = -count; i <= count; i++) {
    const coord = Number((i * step).toFixed(3));
    const isMajor = i % 5 === 0; // 500 mm major
    const c = isMajor ? majorColor : minorColor;
    pushSegment(-halfExtent, coord, halfExtent, coord, c);
    pushSegment(coord, -halfExtent, coord, halfExtent, c);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const mat = new THREE.LineBasicMaterial({ vertexColors: true });
  const lines = new THREE.LineSegments(geom, mat);
  lines.renderOrder = -1;
  return lines;
}

export interface BarEntry {
  bar: SceneBar;
  mesh: THREE.Mesh;
  rimMesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  rimMaterial: THREE.MeshBasicMaterial;
  radius: number;
  length: number;
}

export interface SceneControllerCallbacks {
  onSelectBar?: (barId: string | null) => void;
  onHoverBar?: (barId: string | null) => void;
  onCameraUpdate?: (
    camera: THREE.PerspectiveCamera,
    size: { width: number; height: number },
  ) => void;
}

export class SceneController {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: CameraControls;
  private root: THREE.Group;
  private calloutGroup: THREE.Group;
  private grid: THREE.LineSegments | null = null;
  private currentFindings: Finding[] = [];
  private currentLabelMode: LabelMode = "failures";
  private activeFindingIndex: number | null = null;
  private sharedCylinder: THREE.CylinderGeometry;
  private sharedBox: THREE.BoxGeometry;

  private barEntries = new Map<string, BarEntry>();
  private barMeshes: THREE.Mesh[] = [];
  private loopMeshes: THREE.Mesh[] = [];
  private loopMaterials: THREE.MeshStandardMaterial[] = [];
  private concreteEntries = new Map<
    string,
    { mesh: THREE.Mesh; outline: THREE.LineSegments; size: THREE.Vector3; center: THREE.Vector3 }
  >();
  private concreteMeshes: THREE.Mesh[] = [];
  private concreteOutlines: THREE.LineSegments[] = [];
  private sceneBounds = new THREE.Box3();
  private morphState: MorphState | null = null;

  private palette: ThemePalette;
  private reducedMotion = false;
  private selectedIds = new Set<string>();
  private hoveredId: string | null = null;
  private concreteMode: ConcreteMode = "translucent";
  private currentPreset: CameraPreset = "iso";
  private hasOrbited = false;
  private needsRender = true;

  private callbacks: SceneControllerCallbacks;
  private resizeObserver: ResizeObserver;
  private rafId = 0;
  private lastTime = performance.now();
  private disposed = false;

  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private downPos = { x: 0, y: 0 };

  constructor(
    container: HTMLElement,
    options: {
      theme: ThemeMode;
      reducedMotion: boolean;
      callbacks?: SceneControllerCallbacks;
    },
  ) {
    this.container = container;
    this.reducedMotion = options.reducedMotion;
    this.callbacks = options.callbacks ?? {};
    this.palette = readPalette(options.theme);

    this.scene = new THREE.Scene();
    this.scene.background = this.palette.bg;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;
    this.camera = new THREE.PerspectiveCamera(42, width / height, 0.01, 60);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.controls = new CameraControls(this.camera, this.renderer.domElement);
    this.controls.minDistance = 0.25;
    this.controls.maxDistance = 15;
    this.controls.smoothTime = this.reducedMotion ? 0.001 : 0.22;
    this.controls.draggingSmoothTime = this.reducedMotion ? 0.001 : 0.1;
    this.controls.addEventListener("controlstart", () => {
      this.hasOrbited = true;
    });

    // DESIGN_SYSTEM.md: hemisphere plus one soft key light; no hard shadows.
    const hemi = new THREE.HemisphereLight(0xf3f6fb, 0x1a2029, 1.2);
    this.scene.add(hemi);
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.35);
    keyLight.position.set(2.4, 3.8, 2.8);
    this.scene.add(keyLight);

    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.calloutGroup = new THREE.Group();
    this.scene.add(this.calloutGroup);

    this.sharedCylinder = new THREE.CylinderGeometry(1, 1, 1, 18, 1);
    this.sharedBox = new THREE.BoxGeometry(1, 1, 1);

    this.bindPointerEvents();

    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        const h = entry.contentRect.height;
        if (w > 0 && h > 0) {
          this.handleContainerResize(w, h);
        }
      }
    });
    this.resizeObserver.observe(container);

    this.rafId = requestAnimationFrame(this.tick);
  }

  private bindPointerEvents() {
    const dom = this.renderer.domElement;
    dom.style.cursor = "grab";

    const updatePointer = (ev: PointerEvent) => {
      const rect = dom.getBoundingClientRect();
      this.pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const onDown = (ev: PointerEvent) => {
      this.downPos = { x: ev.clientX, y: ev.clientY };
    };

    const onMove = (ev: PointerEvent) => {
      updatePointer(ev);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hits = this.raycaster.intersectObjects(this.barMeshes, false);
      const hitId = hits.length > 0 ? String(hits[0].object.userData.barId ?? "") : null;
      if (hitId !== this.hoveredId) {
        this.hoveredId = hitId;
        dom.style.cursor = hitId ? "pointer" : "grab";
        this.refreshMaterials();
        this.callbacks.onHoverBar?.(hitId);
      }
    };

    const onUp = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - this.downPos.x, ev.clientY - this.downPos.y) > 5) return;
      updatePointer(ev);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hits = this.raycaster.intersectObjects(this.barMeshes, false);
      const hitId = hits.length > 0 ? String(hits[0].object.userData.barId ?? "") : null;
      this.callbacks.onSelectBar?.(hitId);
    };

    dom.addEventListener("pointerdown", onDown);
    dom.addEventListener("pointermove", onMove);
    dom.addEventListener("pointerup", onUp);

    this.unbindPointerEvents = () => {
      dom.removeEventListener("pointerdown", onDown);
      dom.removeEventListener("pointermove", onMove);
      dom.removeEventListener("pointerup", onUp);
    };
  }

  private unbindPointerEvents: () => void = () => { };

  private tick = () => {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame(this.tick);
    const now = performance.now();
    const delta = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;
    if (this.morphState) {
      this.advanceMorph(now);
      this.needsRender = true;
    }
    const cameraMoved = this.controls.update(delta);
    if (cameraMoved || this.needsRender) {
      this.needsRender = false;
      this.renderer.render(this.scene, this.camera);
      this.callbacks.onCameraUpdate?.(this.camera, {
        width: this.container.clientWidth,
        height: this.container.clientHeight,
      });
    }
  };

  setTheme(theme: ThemeMode) {
    this.palette = readPalette(theme);
    this.scene.background = this.palette.bg;
    this.rebuildGrid();
    this.refreshConcreteMaterials();
    this.refreshMaterials();
    this.rebuildCallouts();
    this.needsRender = true;
  }

  setReducedMotion(reduced: boolean) {
    this.reducedMotion = reduced;
    this.controls.smoothTime = reduced ? 0.001 : 0.22;
    this.controls.draggingSmoothTime = reduced ? 0.001 : 0.1;
  }

  setScene(sceneData: Scene) {
    this.morphState = null;
    this.clearSceneObjects();

    for (const c of sceneData.concrete) {
      this.addConcrete(c);
    }
    for (const bar of sceneData.bars) {
      this.addBar(bar);
    }
    for (const loop of sceneData.loops) {
      this.addLoop(loop);
    }

    this.sceneBounds = new THREE.Box3().setFromObject(this.root);
    this.rebuildGrid();
    this.applyConcreteMode(this.concreteMode);
    this.refreshMaterials();
    this.rebuildCallouts();
    this.needsRender = true;
  }

  /**
   * Morph cleanly from the current 3D scene to `nextScene` matching bars by `bar.id`:
   * moved bars tween (durationMs), removed bars shrink along length (300 ms),
   * added bars grow from centre after 200 ms; under reducedMotion, runs a 120 ms crossfade.
   */
  morphToScene(nextScene: Scene, options?: { durationMs?: number; instant?: boolean }) {
    if (options?.instant) {
      this.setScene(nextScene);
      this.renderImmediate();
      return;
    }
    if (this.morphState) {
      const prevTarget = this.morphState.nextScene;
      this.morphState = null;
      this.setScene(prevTarget);
    }
    if (this.reducedMotion) {
      this.setScene(nextScene);
      for (const entry of this.barEntries.values()) {
        entry.material.transparent = true;
        entry.material.opacity = 0.15;
      }
      this.morphState = {
        startTime: performance.now(),
        durationMs: 120,
        reducedFade: true,
        nextScene,
        bars: [],
        concretes: [],
      };
      this.renderImmediate();
      return;
    }

    const durationMs = options?.durationMs ?? 700;
    const prevBars = [...this.barEntries.values()].map((e) => e.bar);
    const { matched, added, removed } = partitionSceneBars(prevBars, nextScene.bars);

    const morphBars: MorphBarEntry[] = [];

    const barTransform = (bar: SceneBar) => {
      const p0 = new THREE.Vector3(...ifcToThree(bar.p0));
      const p1 = new THREE.Vector3(...ifcToThree(bar.p1));
      const center = p0.clone().add(p1).multiplyScalar(0.5);
      const dir = p1.clone().sub(p0);
      const length = Math.max(dir.length(), 0.001);
      const quat = new THREE.Quaternion().setFromUnitVectors(UP_Y, dir.clone().normalize());
      const radius = (bar.dia * MM_TO_M) / 2;
      return { center, length, quat, radius };
    };

    for (const { prev, next } of matched) {
      const entry = this.barEntries.get(prev.id);
      if (!entry) continue;
      const tNext = barTransform(next);
      morphBars.push({
        kind: "tween",
        entry,
        fromPos: entry.mesh.position.clone(),
        toPos: tNext.center,
        fromQuat: entry.mesh.quaternion.clone(),
        toQuat: tNext.quat,
        fromRadius: entry.radius,
        toRadius: tNext.radius,
        fromLength: entry.length,
        toLength: tNext.length,
        fromFail: prev.status === "fail" ? 1 : 0,
        toFail: next.status === "fail" ? 1 : 0,
      });
    }

    for (const bar of removed) {
      const entry = this.barEntries.get(bar.id);
      if (!entry) continue;
      morphBars.push({
        kind: "shrink",
        entry,
        fromPos: entry.mesh.position.clone(),
        toPos: entry.mesh.position.clone(),
        fromQuat: entry.mesh.quaternion.clone(),
        toQuat: entry.mesh.quaternion.clone(),
        fromRadius: entry.radius,
        toRadius: entry.radius,
        fromLength: entry.length,
        toLength: 0.0001,
        fromFail: bar.status === "fail" ? 1 : 0,
        toFail: bar.status === "fail" ? 1 : 0,
      });
    }

    for (const bar of added) {
      const entry = this.addBar(bar);
      entry.mesh.scale.set(entry.radius, 0.0001, entry.radius);
      entry.mesh.visible = false;
      morphBars.push({
        kind: "grow",
        entry,
        fromPos: entry.mesh.position.clone(),
        toPos: entry.mesh.position.clone(),
        fromQuat: entry.mesh.quaternion.clone(),
        toQuat: entry.mesh.quaternion.clone(),
        fromRadius: entry.radius,
        toRadius: entry.radius,
        fromLength: 0.0001,
        toLength: entry.length,
        fromFail: bar.status === "fail" ? 1 : 0,
        toFail: bar.status === "fail" ? 1 : 0,
      });
    }

    const morphConcretes: MorphConcreteEntry[] = [];
    for (const c of nextScene.concrete) {
      const prev = this.concreteEntries.get(c.id);
      if (!prev) continue;
      const a = ifcToThree(c.min);
      const b = ifcToThree(c.max);
      const min = new THREE.Vector3(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2]));
      const max = new THREE.Vector3(Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2]));
      const targetSize = max.clone().sub(min);
      const targetCenter = min.clone().add(max).multiplyScalar(0.5);
      morphConcretes.push({
        mesh: prev.mesh,
        outline: prev.outline,
        fromPos: prev.center.clone(),
        toPos: targetCenter,
        toScale: new THREE.Vector3(
          targetSize.x / Math.max(prev.size.x, 0.001),
          targetSize.y / Math.max(prev.size.y, 0.001),
          targetSize.z / Math.max(prev.size.z, 0.001),
        ),
      });
    }

    this.morphState = {
      startTime: performance.now(),
      durationMs,
      reducedFade: false,
      nextScene,
      bars: morphBars,
      concretes: morphConcretes,
    };
    this.needsRender = true;
  }

  private advanceMorph(now: number) {
    const morph = this.morphState;
    if (!morph) return;
    const raw = (now - morph.startTime) / Math.max(morph.durationMs, 1);
    const u = Math.min(1, Math.max(0, raw));

    if (morph.reducedFade) {
      const alpha = 0.15 + 0.85 * easeInOutCubic(u);
      for (const entry of this.barEntries.values()) {
        entry.material.transparent = u < 1;
        entry.material.opacity = alpha;
      }
      if (u >= 1) {
        this.morphState = null;
        this.refreshMaterials();
      }
      return;
    }

    const e = easeInOutCubic(u);
    for (const item of morph.bars) {
      const { entry } = item;
      if (item.kind === "tween") {
        entry.mesh.position.lerpVectors(item.fromPos, item.toPos, e);
        entry.mesh.quaternion.slerpQuaternions(item.fromQuat, item.toQuat, e);
        const r = THREE.MathUtils.lerp(item.fromRadius, item.toRadius, e);
        const len = THREE.MathUtils.lerp(item.fromLength, item.toLength, e);
        entry.mesh.scale.set(r, len, r);
        entry.rimMesh.position.copy(entry.mesh.position);
        entry.rimMesh.quaternion.copy(entry.mesh.quaternion);
        entry.rimMesh.scale.set(r * 1.24, len * 1.004, r * 1.24);
        const failMix = THREE.MathUtils.lerp(item.fromFail, item.toFail, e);
        entry.material.color.copy(this.palette.steel).lerp(this.palette.fail, failMix);
        entry.material.emissive.copy(this.palette.fail).multiplyScalar(failMix);
        entry.material.emissiveIntensity = failMix * 0.42;
      } else if (item.kind === "shrink") {
        const ks = Math.min(1, u / 0.43);
        const s = 1 - easeInOutCubic(ks);
        entry.mesh.visible = ks < 1;
        entry.mesh.scale.set(item.fromRadius, Math.max(0.0001, item.fromLength * s), item.fromRadius);
      } else {
        // Grow new bars from center after 200 ms delay
        const kg = u <= 0.285 ? 0 : Math.min(1, (u - 0.285) / 0.57);
        entry.mesh.visible = kg > 0;
        const g = easeInOutCubic(kg);
        entry.mesh.scale.set(
          item.toRadius,
          Math.max(0.0001, item.toLength * g),
          item.toRadius,
        );
      }
    }

    for (const c of morph.concretes) {
      c.mesh.position.lerpVectors(c.fromPos, c.toPos, e);
      c.outline.position.copy(c.mesh.position);
      const sx = THREE.MathUtils.lerp(1, c.toScale.x, e);
      const sy = THREE.MathUtils.lerp(1, c.toScale.y, e);
      const sz = THREE.MathUtils.lerp(1, c.toScale.z, e);
      c.mesh.scale.set(sx, sy, sz);
      c.outline.scale.set(sx, sy, sz);
    }

    if (u >= 1) {
      const target = morph.nextScene;
      this.morphState = null;
      this.setScene(target);
      this.renderImmediate();
    }
  }

  private clearSceneObjects() {
    this.barEntries.clear();
    this.concreteEntries.clear();
    this.barMeshes = [];
    this.loopMeshes = [];
    this.loopMaterials = [];
    this.concreteMeshes = [];
    this.concreteOutlines = [];

    while (this.root.children.length > 0) {
      const obj = this.root.children.pop()!;
      if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
        if (obj.geometry !== this.sharedCylinder && obj.geometry !== this.sharedBox) {
          obj.geometry.dispose();
        }
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    }
  }

  private rebuildGrid() {
    if (this.grid) {
      this.scene.remove(this.grid);
      this.grid.geometry.dispose();
      (this.grid.material as THREE.Material).dispose();
      this.grid = null;
    }
    const yFloor = Number.isFinite(this.sceneBounds.min.y) ? this.sceneBounds.min.y - 0.01 : -1.06;
    this.grid = buildFadingGrid(yFloor, this.palette.bg, this.palette.edge);
    this.scene.add(this.grid);
  }

  private addConcrete(c: SceneConcrete) {
    const a = ifcToThree(c.min);
    const b = ifcToThree(c.max);
    const min = new THREE.Vector3(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2]));
    const max = new THREE.Vector3(Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2]));
    const size = max.clone().sub(min);
    const center = min.clone().add(max).multiplyScalar(0.5);

    const geom = new THREE.BoxGeometry(size.x, size.y, size.z);
    const mat = new THREE.MeshPhysicalMaterial({
      color: this.palette.concrete,
      roughness: 0.85,
      metalness: 0,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.copy(center);
    mesh.renderOrder = 2;
    mesh.userData = { concreteId: c.id };
    this.root.add(mesh);
    this.concreteMeshes.push(mesh);

    const edgesGeom = new THREE.EdgesGeometry(geom, 25);
    const edgesMat = new THREE.LineBasicMaterial({
      color: this.palette.edge,
      transparent: true,
      opacity: 0.55,
    });
    const outline = new THREE.LineSegments(edgesGeom, edgesMat);
    outline.position.copy(center);
    outline.renderOrder = 3;
    this.root.add(outline);
    this.concreteOutlines.push(outline);
    this.concreteEntries.set(c.id, { mesh, outline, size, center });
  }

  private addBar(bar: SceneBar): BarEntry {
    const p0 = new THREE.Vector3(...ifcToThree(bar.p0));
    const p1 = new THREE.Vector3(...ifcToThree(bar.p1));
    const center = p0.clone().add(p1).multiplyScalar(0.5);
    const dir = p1.clone().sub(p0);
    const length = Math.max(dir.length(), 0.001);
    const quat = new THREE.Quaternion().setFromUnitVectors(UP_Y, dir.clone().normalize());
    const radius = (bar.dia * MM_TO_M) / 2;

    const material = new THREE.MeshStandardMaterial({
      color: bar.status === "fail" ? this.palette.fail : this.palette.steel,
      metalness: bar.status === "fail" ? 0.35 : 0.6,
      roughness: bar.status === "fail" ? 0.38 : 0.45,
      emissive: bar.status === "fail" ? this.palette.fail : new THREE.Color(0x000000),
      emissiveIntensity: bar.status === "fail" ? 0.42 : 0,
    });

    const mesh = new THREE.Mesh(this.sharedCylinder, material);
    mesh.position.copy(center);
    mesh.quaternion.copy(quat);
    mesh.scale.set(radius, length, radius);
    mesh.renderOrder = bar.status === "fail" ? 1 : 0;
    mesh.userData = { barId: bar.id };
    this.root.add(mesh);

    const rimMaterial = new THREE.MeshBasicMaterial({
      color: this.palette.rim,
      side: THREE.BackSide,
    });
    const rimMesh = new THREE.Mesh(this.sharedCylinder, rimMaterial);
    rimMesh.position.copy(center);
    rimMesh.quaternion.copy(quat);
    rimMesh.scale.set(radius * 1.24, length * 1.004, radius * 1.24);
    rimMesh.visible = false;
    this.root.add(rimMesh);

    const entry: BarEntry = {
      bar,
      mesh,
      rimMesh,
      material,
      rimMaterial,
      radius,
      length,
    };
    this.barMeshes.push(mesh);
    this.barEntries.set(bar.id, entry);
    return entry;
  }

  private addLoop(loop: SceneLoop) {
    if (loop.points.length < 2) return;
    const radius = (loop.dia * MM_TO_M) / 2;
    const pts = loop.points.map((p) => new THREE.Vector3(...ifcToThree(p)));
    const mat = new THREE.MeshStandardMaterial({
      color: this.palette.steel,
      metalness: 0.6,
      roughness: 0.45,
      transparent: true,
      opacity: 0.7,
    });
    this.loopMaterials.push(mat);

    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const dir = b.clone().sub(a);
      const len = dir.length();
      if (len < 1e-5) continue;
      const seg = new THREE.Mesh(this.sharedCylinder, mat);
      seg.position.copy(a.clone().add(b).multiplyScalar(0.5));
      seg.quaternion.setFromUnitVectors(UP_Y, dir.normalize());
      seg.scale.set(radius, len, radius);
      this.root.add(seg);
      this.loopMeshes.push(seg);
    }
  }

  setSelection(selectedBarIds: string[], hoveredId: string | null) {
    this.selectedIds = new Set(selectedBarIds);
    this.hoveredId = hoveredId;
    this.refreshMaterials();
    this.needsRender = true;
  }

  setCalloutIndicators(
    findings: Finding[],
    labelMode: LabelMode,
    selectedFindingIndex: number | null,
  ) {
    this.currentFindings = findings;
    this.currentLabelMode = labelMode;
    this.activeFindingIndex = selectedFindingIndex;
    this.rebuildCallouts();
    this.needsRender = true;
  }

  private clearCallouts() {
    while (this.calloutGroup.children.length > 0) {
      const obj = this.calloutGroup.children.pop()!;
      if (obj instanceof THREE.LineSegments || obj instanceof THREE.LineLoop || obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    }
  }

  private rebuildCallouts() {
    this.clearCallouts();
    if (this.currentLabelMode === "hidden") return;

    this.currentFindings.forEach((f, index) => {
      if (!f.at) return;
      if (this.currentLabelMode === "failures" && f.status !== "fail") return;

      const isSelected = this.activeFindingIndex === index;
      const hasActive = this.activeFindingIndex !== null;
      const color = f.status === "fail" ? this.palette.fail : this.palette.pass;
      const opacity = hasActive ? (isSelected ? 1 : 0.25) : f.status === "fail" ? 0.92 : 0.45;
      const atVec = new THREE.Vector3(...ifcToThree(f.at));

      if (f.rule === "GEOM-CLASH") {
        const radius = isSelected ? 0.042 : 0.032;
        const segments = 32;
        for (const plane of ["xz", "xy"] as const) {
          const pts: number[] = [];
          for (let i = 0; i < segments; i++) {
            const a = (i / segments) * Math.PI * 2;
            const ca = Math.cos(a) * radius;
            const sa = Math.sin(a) * radius;
            if (plane === "xz") {
              pts.push(atVec.x + ca, atVec.y, atVec.z + sa);
            } else {
              pts.push(atVec.x + ca, atVec.y + sa, atVec.z);
            }
          }
          const geom = new THREE.BufferGeometry();
          geom.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
          const ringMat = new THREE.LineBasicMaterial({
            color,
            transparent: true,
            opacity,
            depthTest: false,
          });
          const loop = new THREE.LineLoop(geom, ringMat);
          loop.renderOrder = 6;
          this.calloutGroup.add(loop);
        }
        return;
      }

      // Gap dimension line with extension stems and end ticks between the two affected bars.
      if (f.bars.length >= 2) {
        const eA = this.barEntries.get(f.bars[0]);
        const eB = this.barEntries.get(f.bars[1]);
        if (!eA || !eB) return;

        const qA = closestPointOnSegment(
          new THREE.Vector3(...ifcToThree(eA.bar.p0)),
          new THREE.Vector3(...ifcToThree(eA.bar.p1)),
          atVec,
        );
        const qB = closestPointOnSegment(
          new THREE.Vector3(...ifcToThree(eB.bar.p0)),
          new THREE.Vector3(...ifcToThree(eB.bar.p1)),
          atVec,
        );
        const gapVec = qB.clone().sub(qA);
        if (gapVec.lengthSq() < 1e-8) return;
        const n = gapVec.clone().normalize();
        const sA = qA.clone().addScaledVector(n, eA.radius);
        const sB = qB.clone().addScaledVector(n, -eB.radius);

        const liftAxis = Math.abs(n.y) < 0.85 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
        const lift = liftAxis.clone().multiplyScalar(isSelected ? 0.048 : 0.036);
        const dA = sA.clone().add(lift);
        const dB = sB.clone().add(lift);
        const tickHalf = liftAxis.clone().multiplyScalar(0.011);
        const serifA = dA.clone().addScaledVector(n, -0.008).add(tickHalf);
        const serifA2 = dA.clone().addScaledVector(n, 0.008).sub(tickHalf);
        const serifB = dB.clone().addScaledVector(n, -0.008).add(tickHalf);
        const serifB2 = dB.clone().addScaledVector(n, 0.008).sub(tickHalf);

        const pts = [
          // Main dimension span
          dA.x, dA.y, dA.z, dB.x, dB.y, dB.z,
          // Extension stems
          sA.x, sA.y, sA.z, dA.x + tickHalf.x, dA.y + tickHalf.y, dA.z + tickHalf.z,
          sB.x, sB.y, sB.z, dB.x + tickHalf.x, dB.y + tickHalf.y, dB.z + tickHalf.z,
          // End ticks
          serifA.x, serifA.y, serifA.z, serifA2.x, serifA2.y, serifA2.z,
          serifB.x, serifB.y, serifB.z, serifB2.x, serifB2.y, serifB2.z,
        ];
        const geom = new THREE.BufferGeometry();
        geom.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
        const mat = new THREE.LineBasicMaterial({
          color,
          transparent: true,
          opacity,
          depthTest: false,
        });
        const segs = new THREE.LineSegments(geom, mat);
        segs.renderOrder = 6;
        this.calloutGroup.add(segs);
        return;
      }

      // Column / member span dimension (e.g. IS 13920 cl. 7.1.1 across column along beam)
      if (f.span) {
        const dA = new THREE.Vector3(...ifcToThree(f.span[0]));
        const dB = new THREE.Vector3(...ifcToThree(f.span[1]));
        const spanVec = dB.clone().sub(dA);
        if (spanVec.lengthSq() < 1e-8) return;
        const n = spanVec.clone().normalize();
        const tickAxis = Math.abs(n.y) < 0.85 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
        const tickHalf = tickAxis.clone().multiplyScalar(isSelected ? 0.022 : 0.016);
        const serifA1 = dA.clone().add(tickHalf);
        const serifA2 = dA.clone().sub(tickHalf);
        const serifB1 = dB.clone().add(tickHalf);
        const serifB2 = dB.clone().sub(tickHalf);
        const slashHalf = n.clone().multiplyScalar(0.01).add(tickHalf);
        const slashA1 = dA.clone().sub(slashHalf);
        const slashA2 = dA.clone().add(slashHalf);
        const slashB1 = dB.clone().sub(slashHalf);
        const slashB2 = dB.clone().add(slashHalf);

        const pts = [
          dA.x, dA.y, dA.z, dB.x, dB.y, dB.z,
          serifA1.x, serifA1.y, serifA1.z, serifA2.x, serifA2.y, serifA2.z,
          serifB1.x, serifB1.y, serifB1.z, serifB2.x, serifB2.y, serifB2.z,
          slashA1.x, slashA1.y, slashA1.z, slashA2.x, slashA2.y, slashA2.z,
          slashB1.x, slashB1.y, slashB1.z, slashB2.x, slashB2.y, slashB2.z,
        ];
        const geom = new THREE.BufferGeometry();
        geom.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
        const mat = new THREE.LineBasicMaterial({
          color,
          transparent: true,
          opacity,
          depthTest: false,
        });
        const segs = new THREE.LineSegments(geom, mat);
        segs.renderOrder = 6;
        this.calloutGroup.add(segs);
      }
    });
  }

  applyConcreteMode(mode: ConcreteMode) {
    this.concreteMode = mode;
    for (const m of this.concreteMeshes) {
      m.visible = mode === "translucent";
    }
    for (const o of this.concreteOutlines) {
      o.visible = mode !== "hidden";
    }
    this.needsRender = true;
  }

  private refreshConcreteMaterials() {
    for (const m of this.concreteMeshes) {
      (m.material as THREE.MeshPhysicalMaterial).color.copy(this.palette.concrete);
    }
    for (const o of this.concreteOutlines) {
      (o.material as THREE.LineBasicMaterial).color.copy(this.palette.edge);
    }
  }

  private refreshMaterials() {
    const hasSelection = this.selectedIds.size > 0;
    for (const [id, entry] of this.barEntries) {
      const isFail = entry.bar.status === "fail";
      const isSelected = this.selectedIds.has(id);
      const isHovered = this.hoveredId === id;
      const dim = hasSelection && !isSelected && !isHovered;

      entry.material.color.copy(isFail ? this.palette.fail : this.palette.steel);
      entry.material.emissive.copy(isFail ? this.palette.fail : new THREE.Color(0x000000));
      entry.material.emissiveIntensity = isSelected || isHovered ? 0.65 : isFail ? 0.42 : 0;
      entry.material.transparent = dim;
      entry.material.opacity = dim ? 0.25 : 1;
      entry.material.needsUpdate = true;

      entry.rimMaterial.color.copy(this.palette.rim);
      entry.rimMesh.visible = isSelected || isHovered;
    }
    for (const mat of this.loopMaterials) {
      mat.color.copy(this.palette.steel);
      mat.opacity = hasSelection ? 0.25 : 0.7;
    }
  }

  handleContainerResize(width?: number, height?: number) {
    if (this.disposed) return;
    const w = width ?? this.container.clientWidth;
    const h = height ?? this.container.clientHeight;
    if (w <= 0 || h <= 0) return;

    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);

    if (!this.sceneBounds.isEmpty()) {
      this.fitBox(this.sceneBounds, this.hasOrbited ? "keep" : this.currentPreset, false);
    }
    this.renderImmediate(w, h);
  }

  renderImmediate(width?: number, height?: number) {
    if (this.disposed) return;
    const w = width ?? this.container.clientWidth;
    const h = height ?? this.container.clientHeight;
    if (w <= 0 || h <= 0) return;

    this.controls.update(0);
    this.camera.updateMatrixWorld();
    this.needsRender = false;
    this.renderer.render(this.scene, this.camera);
    this.callbacks.onCameraUpdate?.(this.camera, { width: w, height: h });
  }

  private fitBox(
    box: THREE.Box3,
    mode: CameraPreset | "keep",
    animate: boolean,
    paddingRatio = FIT_PADDING_RATIO,
  ) {
    if (box.isEmpty()) return;

    let theta = 0;
    let phi = Math.PI / 2;
    let useFitToBox = true;

    if (mode === "plan") {
      theta = 0;
      phi = 0.0001;
    } else if (mode === "elevation_x") {
      theta = 0;
      phi = Math.PI / 2;
    } else if (mode === "elevation_y") {
      theta = Math.PI / 2;
      phi = Math.PI / 2;
    } else if (mode === "iso") {
      theta = Math.atan2(ISO_DIR.x, ISO_DIR.z);
      phi = Math.acos(THREE.MathUtils.clamp(ISO_DIR.y, -1, 1));
      useFitToBox = false;
    } else {
      const spherical = this.controls.getSpherical(new THREE.Spherical(), true);
      theta = spherical.theta;
      phi = spherical.phi;
      useFitToBox = false;
    }

    // Project box extents onto the target view basis for proportional padding on all axes.
    const forward = new THREE.Vector3().setFromSphericalCoords(1, phi, theta).normalize();
    const right = new THREE.Vector3().crossVectors(UP_Y, forward);
    if (right.lengthSq() < 1e-6) {
      right.set(1, 0, 0);
    } else {
      right.normalize();
    }
    const camUp = new THREE.Vector3().crossVectors(forward, right).normalize();

    const { min, max } = box;
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    let minN = Infinity;
    let maxN = -Infinity;

    const pt = new THREE.Vector3();
    for (let ix = 0; ix < 2; ix++) {
      for (let iy = 0; iy < 2; iy++) {
        for (let iz = 0; iz < 2; iz++) {
          pt.set(ix ? max.x : min.x, iy ? max.y : min.y, iz ? max.z : min.z);
          const u = pt.dot(right);
          const v = pt.dot(camUp);
          const n = pt.dot(forward);
          if (u < minU) minU = u;
          if (u > maxU) maxU = u;
          if (v < minV) minV = v;
          if (v > maxV) maxV = v;
          if (n < minN) minN = n;
          if (n > maxN) maxN = n;
        }
      }
    }

    const projW = Math.max(maxU - minU, 0.2);
    const projH = Math.max(maxV - minV, 0.2);
    const projD = Math.max(maxN - minN, 0.2);
    const padX = projW * paddingRatio;
    const padY = projH * paddingRatio;

    if (useFitToBox) {
      void this.controls.rotateTo(theta, phi, animate);
      void this.controls.fitToBox(box, animate, {
        paddingLeft: padX,
        paddingRight: padX,
        paddingTop: padY,
        paddingBottom: padY,
      });
    } else {
      const center = box.getCenter(new THREE.Vector3());
      const dist = this.controls.getDistanceToFitBox(
        projW + padX * 2,
        projH + padY * 2,
        projD,
      );
      void this.controls.moveTo(center.x, center.y, center.z, animate);
      void this.controls.rotateTo(theta, phi, animate);
      void this.controls.dollyTo(Math.max(dist, this.controls.minDistance), animate);
      void this.controls.setFocalOffset(0, 0, 0, animate);
    }

    if (!animate) {
      this.renderImmediate();
    }
  }

  setPreset(preset: CameraPreset, animate = !this.reducedMotion) {
    this.currentPreset = preset;
    this.hasOrbited = false;
    this.needsRender = true;
    const targetBox = this.sceneBounds.isEmpty()
      ? new THREE.Box3(new THREE.Vector3(-0.75, -1.05, -0.225), new THREE.Vector3(0.75, 0.6, 0.225))
      : this.sceneBounds;
    this.fitBox(targetBox, preset, animate);
  }

  frameBars(barIds: string[]) {
    this.needsRender = true;
    const box = new THREE.Box3();
    for (const id of barIds) {
      const entry = this.barEntries.get(id);
      if (entry) {
        box.expandByObject(entry.mesh);
      }
    }
    if (box.isEmpty()) {
      if (this.sceneBounds.isEmpty()) return;
      box.copy(this.sceneBounds);
    } else {
      box.expandByScalar(0.18);
    }
    this.fitBox(box, this.hasOrbited ? "keep" : this.currentPreset, !this.reducedMotion);
  }

  orbit(azimuthRad: number, polarRad: number) {
    this.hasOrbited = true;
    this.needsRender = true;
    void this.controls.rotate(azimuthRad, polarRad, !this.reducedMotion);
  }

  zoom(delta: number) {
    this.needsRender = true;
    void this.controls.dolly(delta, !this.reducedMotion);
  }

  getProjectedSceneBounds(): ProjectedBounds | null {
    if (this.sceneBounds.isEmpty()) return null;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w <= 0 || h <= 0) return null;
    this.camera.updateMatrixWorld();

    const { min, max } = this.sceneBounds;
    const pt = new THREE.Vector3();
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (let ix = 0; ix < 2; ix++) {
      for (let iy = 0; iy < 2; iy++) {
        for (let iz = 0; iz < 2; iz++) {
          pt.set(ix ? max.x : min.x, iy ? max.y : min.y, iz ? max.z : min.z);
          pt.project(this.camera);
          const px = (pt.x * 0.5 + 0.5) * w;
          const py = (-pt.y * 0.5 + 0.5) * h;
          if (px < minX) minX = px;
          if (px > maxX) maxX = px;
          if (py < minY) minY = py;
          if (py > maxY) maxY = py;
        }
      }
    }

    return {
      minX: Math.round(minX * 10) / 10,
      maxX: Math.round(maxX * 10) / 10,
      minY: Math.round(minY * 10) / 10,
      maxY: Math.round(maxY * 10) / 10,
      width: w,
      height: h,
    };
  }

  projectWorld(pointMm: [number, number, number]): { x: number; y: number; visible: boolean } {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w <= 0 || h <= 0) return { x: 0, y: 0, visible: false };
    const [tx, ty, tz] = ifcToThree(pointMm);
    const v = new THREE.Vector3(tx, ty, tz).project(this.camera);
    return {
      x: (v.x * 0.5 + 0.5) * w,
      y: (-v.y * 0.5 + 0.5) * h,
      visible: v.z >= -1 && v.z <= 1,
    };
  }

  getBarCount(): number {
    return this.barEntries.size;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    this.resizeObserver.disconnect();
    this.unbindPointerEvents();
    this.clearSceneObjects();
    this.clearCallouts();
    if (this.grid) {
      this.scene.remove(this.grid);
      this.grid.geometry.dispose();
      (this.grid.material as THREE.Material).dispose();
    }
    this.sharedCylinder.dispose();
    this.sharedBox.dispose();
    this.controls.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
