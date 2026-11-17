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
  members: string[];
  bars: string[];
  at: Vec3 | null;
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
  unit: string;
  message: string;
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
  area_required: number;
  area_provided: number;
  overshoot_pct: number;
  depth_before: number;
  depth_after: number;
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

/** Optional drawing provenance produced by Build 1 (when loaded from PDF drawings). */
export interface ProvenanceEntry {
  field: string;
  page: number;
  page_image?: string;
  box_2d: [number, number, number, number]; // [ymin, xmin, ymax, xmax] normalized 0..1000
  text: string;
  channel: string;
}

export interface Bundle {
  joint: JointSpec;
  report: ReportSpec;
  fix: FixResult;
  rules: Record<string, RuleMeta>;
  provenance?: Record<string, ProvenanceEntry> | ProvenanceEntry[];
  pages?: Record<string, string>;
}

export interface BarMetadata {
  expressID: number;
  globalId: string;
  tag: string;
  name: string;
  ifcType: string;
  predefinedType: string;
  member: string;
  role: string;
  layer: number | null;
  diameterMm: number | null;
  lengthMm: number | null;
  status: "FAIL" | "OK";
  failedClauses: string[];
  centerThree: Vec3;
}
