export type Vec3 = [number, number, number];

export interface LayerSpec {
  bars: string;
}

export interface ColumnSpec {
  id: string;
  b: number;
  h: number;
  n_bars: number;
  bar_dia: number;
  face_dia?: number | null;
  tie_dia: number;
  cover: number;
  cover_to: "links" | "main";
  bars_x: number | null;
  bars_y: number | null;
}

export interface BeamSpec {
  id: string;
  direction: "x" | "y";
  b: number;
  D: number;
  stirrup_dia: number;
  cover: number;
  cover_to: "links" | "main";
  top: LayerSpec[];
  bottom: LayerSpec[];
  spacer: number;
}

export interface SettingsSpec {
  aggregate: number;
  exposure: string;
  seismic_zone: string;
  apply_is13920: boolean | null;
  stock_dias: number[];
  max_layers: number;
}

export interface JointSpec {
  id: string;
  place?: string | null;
  floor?: string | null;
  column: ColumnSpec;
  beams: BeamSpec[];
  settings: SettingsSpec;
  required_area: Record<string, number>;
  notes: string[];
}

export interface Finding {
  rule: string;
  clause: string;
  title: string;
  status: "fail" | "pass";
  measured: number;
  limit: number;
  compare: ">=" | "<=";
  unit: string;
  margin: number;
  members: string[];
  bars: string[];
  at: Vec3 | null;
  span: [Vec3, Vec3] | null;
  message: string;
}

export interface ReportSpec {
  joint: string;
  seismic_zone: string;
  is13920: boolean;
  findings: Finding[];
  rules_run: string[];
  rules_skipped: Record<string, string>;
  passed: Record<string, number>;
  notes: string[];
}

export type EditSpec =
  | {
      kind: "set_face";
      beam: string;
      face: "top" | "bottom";
      layers: string[];
    }
  | {
      kind: "resize_column";
      b: number;
      h: number;
    };

export interface CandidateSpec {
  title: string;
  edits: EditSpec[];
  source: string;
  rationale: string;
}

export interface AttemptFailure {
  rule: string;
  clause: string;
  measured: number;
  limit: number;
  compare: ">=" | "<=";
  margin: number;
  unit: string;
  message: string;
  bars?: string[];
  at?: Vec3 | null;
  span?: [Vec3, Vec3] | null;
}

export interface AttemptSpec {
  round: number;
  candidate: CandidateSpec;
  passed: boolean;
  failures: AttemptFailure[];
}

export interface FaceChange {
  beam: string;
  face: "top" | "bottom";
  before: string;
  after: string;
  area_before: number;
  area_required: number;
  area_provided: number;
  overshoot_pct: number;
  depth_before: number;
  depth_after: number;
  n_bars_before: number;
  n_layers_before: number;
  n_bars: number;
  n_layers: number;
}

export interface FixOption {
  candidate: CandidateSpec;
  faces: FaceChange[];
  column: string | null;
  flags: string[];
}

export interface FixResult {
  status: "clean" | "fixed" | "redesign" | "no_fix";
  summary: string;
  options: FixOption[];
  attempts: AttemptSpec[];
  blocking: Record<string, number>;
}

export interface RuleMeta {
  clause: string;
  title: string;
  basis: string;
}

export interface SceneConcrete {
  id: string;
  kind: "column" | "beam";
  min: Vec3;
  max: Vec3;
}

export interface SceneBar {
  id: string;
  member: string;
  role: string;
  layer: number;
  index: number;
  dia: number;
  p0: Vec3;
  p1: Vec3;
  label: string;
  status: "fail" | "pass";
  findings: number[];
}

export interface SceneLoop {
  id: string;
  member: string;
  role: string;
  dia: number;
  points: Vec3[];
}

export interface Scene {
  units: "mm";
  up: "z";
  concrete: SceneConcrete[];
  bars: SceneBar[];
  loops: SceneLoop[];
}

export interface AttemptScene {
  concrete: SceneConcrete[];
  bars: SceneBar[];
}

export interface ProvenanceEntry {
  path?: string;
  member?: string | null;
  field: string | null;
  layer?: number | string | null;
  level?: string | null;
  page: number | null;
  page_image?: string | null;
  box_2d: [number, number, number, number] | null;
  text: string | null;
  channel?: string;
  gemini?: string | null;
  parser?: string | null;
  status?: string;
  ocr_raw?: string | null;
}

export interface Bundle {
  joint: JointSpec;
  report: ReportSpec;
  fix: FixResult;
  rules: Record<string, RuleMeta>;
  scene: Scene;
  option_scenes: Scene[];
  attempt_scenes?: AttemptScene[];
  provenance?: Record<string, ProvenanceEntry> | ProvenanceEntry[];
  pages?: Record<string, string>;
}
