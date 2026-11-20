import { create } from "zustand";

export type ThemeMode = "dark" | "light";
export type ViewMode = "before" | "after";
export type ConcreteMode = "translucent" | "wireframe" | "hidden";
export type LabelMode = "failures" | "all" | "hidden";
export type CameraPreset = "iso" | "plan" | "elevation_x" | "elevation_y";
export type ReplaySpeed = 0.5 | 1 | 2;
export type InspectorTab = "findings" | "fix" | "workings" | "source";

export interface StatusIslandSummary {
  jointLabel: string;
  failCount: number;
  toCheckCount: number;
  zone: string;
  is13920: boolean;
  activity: string | null;
}

function readInitialTheme(): ThemeMode {
  if (typeof document !== "undefined") {
    if (document.documentElement.getAttribute("data-theme") === "light") return "light";
  }
  try {
    const saved = localStorage.getItem("rebartwin-theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // ignore storage restriction
  }
  return "dark";
}

function applyThemeToDom(theme: ThemeMode) {
  if (typeof document === "undefined") return;
  if (theme === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  try {
    localStorage.setItem("rebartwin-theme", theme);
  } catch {
    // ignore storage restriction
  }
}

interface WorkspaceState {
  theme: ThemeMode;
  activeJointKey: string | null;
  status: StatusIslandSummary;
  selectedBarId: string | null;
  hoveredBarId: string | null;
  selectedFindingIndex: number | null;
  inspectorTab: InspectorTab;
  sourceFocusMember: string | null;
  frameVersion: number;
  mode: ViewMode;
  optionIndex: number;
  chosenOptionIndex: number | null;
  chosenOptionByKey: Record<string, number>;
  concreteMode: ConcreteMode;
  labelMode: LabelMode;
  cameraPreset: CameraPreset;
  replayPlaying: boolean;
  replayIndex: number;
  replaySpeed: ReplaySpeed;
  replayFailedOnly: boolean;
  commandOpen: boolean;
  shortcutsOpen: boolean;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  syncJointContext: (jointKey: string) => boolean;
  setStatus: (patch: Partial<StatusIslandSummary>) => void;
  selectBar: (barId: string | null) => void;
  setHoveredBar: (barId: string | null) => void;
  selectFinding: (index: number | null) => void;
  setInspectorTab: (tab: InspectorTab) => void;
  setSourceFocusMember: (member: string | null) => void;
  triggerFrame: () => void;
  setMode: (mode: ViewMode) => void;
  setOptionIndex: (index: number) => void;
  setChosenOptionIndex: (index: number | null, key?: string) => void;
  setConcreteMode: (mode: ConcreteMode) => void;
  setLabelMode: (mode: LabelMode) => void;
  setCameraPreset: (preset: CameraPreset) => void;
  setReplay: (
    patch: Partial<{
      replayPlaying: boolean;
      replayIndex: number;
      replaySpeed: ReplaySpeed;
      replayFailedOnly: boolean;
    }>,
  ) => void;
  setCommandOpen: (open: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
  clearSelection: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  theme: readInitialTheme(),
  activeJointKey: null,
  status: {
    jointLabel: "C4 × B12",
    failCount: 6,
    toCheckCount: 0,
    zone: "II",
    is13920: false,
    activity: null,
  },
  selectedBarId: null,
  hoveredBarId: null,
  selectedFindingIndex: null,
  inspectorTab: "findings",
  sourceFocusMember: null,
  frameVersion: 0,
  mode: "before",
  optionIndex: 0,
  chosenOptionIndex: null,
  chosenOptionByKey: {},
  concreteMode: "translucent",
  labelMode: "failures",
  cameraPreset: "iso",
  replayPlaying: false,
  replayIndex: 0,
  replaySpeed: 1,
  replayFailedOnly: false,
  commandOpen: false,
  shortcutsOpen: false,

  setTheme: (theme) => {
    applyThemeToDom(theme);
    set({ theme });
  },
  toggleTheme: () => {
    const next: ThemeMode = get().theme === "dark" ? "light" : "dark";
    applyThemeToDom(next);
    set({ theme: next });
  },
  syncJointContext: (jointKey) => {
    if (get().activeJointKey === jointKey) return false;
    set({
      activeJointKey: jointKey,
      selectedBarId: null,
      hoveredBarId: null,
      selectedFindingIndex: null,
      mode: "before",
      optionIndex: 0,
      replayPlaying: false,
      replayIndex: 0,
    });
    return true;
  },
  setStatus: (patch) => set((s) => ({ status: { ...s.status, ...patch } })),
  selectBar: (selectedBarId) => set({ selectedBarId }),
  setHoveredBar: (hoveredBarId) => set({ hoveredBarId }),
  selectFinding: (selectedFindingIndex) => set({ selectedFindingIndex }),
  setInspectorTab: (inspectorTab) => set({ inspectorTab }),
  setSourceFocusMember: (sourceFocusMember) => set({ sourceFocusMember }),
  triggerFrame: () => set((s) => ({ frameVersion: s.frameVersion + 1 })),
  setMode: (mode) => set({ mode }),
  setOptionIndex: (optionIndex) => set({ optionIndex }),
  setChosenOptionIndex: (chosenOptionIndex, key) =>
    set((s) => {
      if (!key) return { chosenOptionIndex };
      const nextMap = { ...s.chosenOptionByKey };
      if (chosenOptionIndex === null) {
        delete nextMap[key];
      } else {
        nextMap[key] = chosenOptionIndex;
      }
      return { chosenOptionIndex, chosenOptionByKey: nextMap };
    }),
  setConcreteMode: (concreteMode) => set({ concreteMode }),
  setLabelMode: (labelMode) => set({ labelMode }),
  setCameraPreset: (cameraPreset) => set({ cameraPreset }),
  setReplay: (patch) => set(patch),
  setCommandOpen: (commandOpen) => set({ commandOpen }),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  clearSelection: () => set({ selectedBarId: null, selectedFindingIndex: null }),
}));
