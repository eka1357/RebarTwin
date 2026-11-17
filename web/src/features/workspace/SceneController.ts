import CameraControls from "camera-controls";
import * as THREE from "three";
import { ifcToThree, MM_TO_M } from "../../lib/coords";
import type { CameraPreset, ConcreteMode, ThemeMode } from "../../stores/workspace";
import type { Scene, SceneBar, SceneConcrete, SceneLoop } from "../../types/bundle";

CameraControls.install({ THREE });

const UP_Y = new THREE.Vector3(0, 1, 0);

interface ThemePalette {
  bg: THREE.Color;
  fail: THREE.Color;
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
    steel: cssColor("--steel", "#9aa6b5"),
    concrete: cssColor("--concrete", "#cfc9bf"),
    edge: cssColor("--border-strong", theme === "light" ? "#bfb8ac" : "#3a4351"),
    rim: cssColor("--foreground", theme === "light" ? "#15191f" : "#eef1f4"),
  };
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
  private grid: THREE.LineSegments | null = null;
  private sharedCylinder: THREE.CylinderGeometry;
  private sharedBox: THREE.BoxGeometry;

  private barEntries = new Map<string, BarEntry>();
  private barMeshes: THREE.Mesh[] = [];
  private loopMeshes: THREE.Mesh[] = [];
  private loopMaterials: THREE.MeshStandardMaterial[] = [];
  private concreteMeshes: THREE.Mesh[] = [];
  private concreteOutlines: THREE.LineSegments[] = [];
  private sceneBounds = new THREE.Box3();

  private palette: ThemePalette;
  private reducedMotion = false;
  private selectedIds = new Set<string>();
  private hoveredId: string | null = null;
  private concreteMode: ConcreteMode = "translucent";
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
    this.renderer.setSize(width, height);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.controls = new CameraControls(this.camera, this.renderer.domElement);
    this.controls.minDistance = 0.25;
    this.controls.maxDistance = 10;
    this.controls.smoothTime = this.reducedMotion ? 0.001 : 0.22;
    this.controls.draggingSmoothTime = this.reducedMotion ? 0.001 : 0.1;

    // DESIGN_SYSTEM.md: hemisphere plus one soft key light; no hard shadows.
    const hemi = new THREE.HemisphereLight(0xf3f6fb, 0x1a2029, 1.2);
    this.scene.add(hemi);
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.35);
    keyLight.position.set(2.4, 3.8, 2.8);
    this.scene.add(keyLight);

    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.sharedCylinder = new THREE.CylinderGeometry(1, 1, 1, 18, 1);
    this.sharedBox = new THREE.BoxGeometry(1, 1, 1);

    this.bindPointerEvents();

    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        const h = entry.contentRect.height;
        if (w > 0 && h > 0) {
          this.camera.aspect = w / h;
          this.camera.updateProjectionMatrix();
          this.renderer.setSize(w, h);
          this.needsRender = true;
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

  private unbindPointerEvents: () => void = () => {};

  private tick = () => {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame(this.tick);
    const now = performance.now();
    const delta = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;
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
    this.needsRender = true;
  }

  setReducedMotion(reduced: boolean) {
    this.reducedMotion = reduced;
    this.controls.smoothTime = reduced ? 0.001 : 0.22;
    this.controls.draggingSmoothTime = reduced ? 0.001 : 0.1;
  }

  setScene(sceneData: Scene) {
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
    this.needsRender = true;
  }

  private clearSceneObjects() {
    this.barEntries.clear();
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
  }

  private addBar(bar: SceneBar) {
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

    this.barMeshes.push(mesh);
    this.barEntries.set(bar.id, {
      bar,
      mesh,
      rimMesh,
      material,
      rimMaterial,
      radius,
      length,
    });
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

  setPreset(preset: CameraPreset) {
    this.needsRender = true;
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    if (this.sceneBounds.isEmpty()) {
      center.set(0, -0.22, 0);
      size.set(1.5, 1.65, 0.3);
    } else {
      this.sceneBounds.getCenter(center);
      this.sceneBounds.getSize(size);
    }
    const radius = Math.max(size.length() * 0.5, 0.5);
    const dist = radius * 1.95;
    const animate = !this.reducedMotion;

    if (preset === "plan") {
      void this.controls.setLookAt(
        center.x,
        center.y + dist,
        center.z + 0.001,
        center.x,
        center.y,
        center.z,
        animate,
      );
      return;
    }
    if (preset === "elevation_x") {
      void this.controls.setLookAt(
        center.x,
        center.y,
        center.z + dist,
        center.x,
        center.y,
        center.z,
        animate,
      );
      return;
    }
    if (preset === "elevation_y") {
      void this.controls.setLookAt(
        center.x + dist,
        center.y,
        center.z,
        center.x,
        center.y,
        center.z,
        animate,
      );
      return;
    }
    // Default Iso view matching worked example framing
    void this.controls.setLookAt(
      center.x - dist * 0.56,
      center.y + dist * 0.36,
      center.z + dist * 0.85,
      center.x - 0.04,
      center.y,
      center.z,
      animate,
    );
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
    }
    // Add modest padding around single bars so fitToBox isn't overly tight
    box.expandByScalar(0.18);
    void this.controls.fitToBox(box, !this.reducedMotion, {
      paddingLeft: 0.15,
      paddingRight: 0.15,
      paddingTop: 0.15,
      paddingBottom: 0.15,
    });
  }

  orbit(azimuthRad: number, polarRad: number) {
    this.needsRender = true;
    void this.controls.rotate(azimuthRad, polarRad, !this.reducedMotion);
  }

  zoom(delta: number) {
    this.needsRender = true;
    void this.controls.dolly(delta, !this.reducedMotion);
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
