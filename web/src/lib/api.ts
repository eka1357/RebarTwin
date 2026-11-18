import type { Bundle } from "../types/bundle";

export interface ProblemDetail {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly problem?: ProblemDetail;

  constructor(status: number, message: string, problem?: ProblemDetail) {
    super(message);
    this.status = status;
    this.problem = problem;
  }
}

export interface ProjectSummary {
  id: string;
  name: string;
  status: "idle" | "reading" | "done" | "error";
  created_at?: string;
  pdf?: string | null;
  pages?: number[];
  error?: string | null;
}

export interface ProjectSheetInfo {
  page: number;
  words?: number;
  comments?: number;
  ocr?: boolean;
  ocr_words?: number;
  ocr_repairs?: number;
}

export interface WorstFailure {
  rule: string;
  clause: string;
  title: string;
  measured?: number;
  limit?: number;
  compare?: ">=" | "<=";
  margin?: number;
  unit?: string;
  message?: string;
}

export interface RuleFailureStat {
  rule: string;
  clause: string;
  title: string;
  failures: number;
  joints: number;
}

export interface BeamJunctionInfo {
  id: string;
  beams: string[];
  grid?: string | null;
  level?: string | null;
  page?: number | null;
  note?: string | null;
}

export interface DraftAcceptedValue {
  value: string;
  field?: string;
  layer?: number;
  field_id?: string;
  page?: number;
  level?: string | null;
  at?: string | null;
}

export interface BlockingItemSummary {
  id?: string | null;
  member?: string | null;
  field: string;
  reason: string;
  detail: string;
  page?: number;
  project_level?: boolean;
}

export interface ProjectCounts {
  found: number;
  checked: number;
  failing: number;
  blocked: number;
  passing: number;
}

export interface ProjectJointSummary {
  id: string;
  place?: string | null;
  floor?: string | null;
  storey?: string | null;
  grid?: string | null;
  level?: string | null;
  sheets?: number[];
  column: {
    id?: string;
    b?: number;
    h?: number;
    n_bars?: number;
    bar_dia?: number;
    section?: DraftAcceptedValue[] | null;
    main?: DraftAcceptedValue[] | null;
    ties?: DraftAcceptedValue[] | null;
    cover?: DraftAcceptedValue[] | null;
  };
  beams: Array<{
    id: string;
    b?: number;
    D?: number;
    direction?: string | null;
    section?: DraftAcceptedValue[] | null;
    top?: DraftAcceptedValue[] | null;
    top_extra_unplaced?: boolean;
    bottom?: DraftAcceptedValue[] | null;
    stirrups?: DraftAcceptedValue[] | null;
    cover?: DraftAcceptedValue[] | null;
    frames_into?: DraftAcceptedValue[] | null;
  }>;
  seismic_zone?: string | null;
  exposure?: string | null;
  status: "fail" | "to_check" | "pass";
  fix_status?: string | null;
  fail_count: number;
  blocked_count: number;
  blocking_item_ids?: string[];
  blocking_items?: BlockingItemSummary[];
  worst_failure?: WorstFailure | null;
  failing_rules?: string[];
  bundle_ready: boolean;
  draft?: boolean;
}

export interface ProjectDetail extends ProjectSummary {
  sheets: ProjectSheetInfo[];
  counts?: ProjectCounts;
  failures_by_rule?: RuleFailureStat[];
  beam_junctions?: BeamJunctionInfo[];
  joints: ProjectJointSummary[];
  to_check_counts: {
    total: number;
    unresolved: number;
    project_level_unresolved: number;
  };
  reading?: {
    counts?: Record<string, number>;
    seconds?: number;
    prompts?: Record<string, string>;
    link_model?: string | null;
  };
}

export interface ToCheckItem {
  id: string;
  joint: string | null;
  member: string | null;
  field: string;
  layer: number;
  level: string | null;
  page: number;
  box_2d: [number, number, number, number] | null;
  gemini: { value: string } | null;
  parser: { value: string } | null;
  reason: string;
  detail: string;
  resolution: { value: string; by: string; at: string; via?: string } | null;
  project_level?: boolean;
  resolved?: boolean;
}

export interface ResolveResponse {
  item: ToCheckItem;
  resolved_value: string;
  unlocked_joints: string[];
  checked_joints: string[];
  remaining_to_check: number;
}

export function apiBase(): string {
  return "/api";
}

async function handleJsonResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let problem: ProblemDetail | undefined;
    try {
      problem = (await res.json()) as ProblemDetail;
    } catch {
      // non-JSON response
    }
    const msg = problem?.detail || problem?.title || `API request failed (${res.status}).`;
    throw new ApiError(res.status, msg, problem);
  }
  return (await res.json()) as T;
}

export function jointBundleUrl(projectId: string, jointId: string): string {
  return `${apiBase()}/projects/${encodeURIComponent(projectId)}/joints/${encodeURIComponent(jointId)}/bundle`;
}

export function jointIfcUrl(projectId: string, jointId: string): string {
  return `${apiBase()}/projects/${encodeURIComponent(projectId)}/joints/${encodeURIComponent(jointId)}/joint.ifc`;
}

export function jointFixedIfcUrl(projectId: string, jointId: string, option = 0): string {
  const base = `${apiBase()}/projects/${encodeURIComponent(projectId)}/joints/${encodeURIComponent(jointId)}/fixed.ifc`;
  return option > 0 ? `${base}?option=${option}` : base;
}

export function jointIssuesBcfUrl(projectId: string, jointId: string): string {
  return `${apiBase()}/projects/${encodeURIComponent(projectId)}/joints/${encodeURIComponent(jointId)}/issues.bcf`;
}

export function pageCropUrl(
  projectId: string,
  page: number,
  box?: [number, number, number, number] | null,
): string {
  const base = `${apiBase()}/projects/${encodeURIComponent(projectId)}/pages/${page}.png`;
  if (!box) return base;
  return `${base}?crop=${box.join(",")}`;
}

export function projectEventsUrl(projectId: string): string {
  return `${apiBase()}/projects/${encodeURIComponent(projectId)}/events`;
}

export async function createProject(input: { id?: string; name?: string }): Promise<ProjectSummary> {
  const res = await fetch(`${apiBase()}/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return handleJsonResponse<ProjectSummary>(res);
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const res = await fetch(`${apiBase()}/projects`);
  return handleJsonResponse<ProjectSummary[]>(res);
}

export async function uploadDrawing(
  projectId: string,
  file: File,
  opts?: { pages?: string; replay?: boolean },
): Promise<{ project_id: string; pdf: string; status: string }> {
  const form = new FormData();
  form.append("file", file);
  if (opts?.pages?.trim()) form.append("pages", opts.pages.trim());
  if (opts?.replay) form.append("replay", "true");
  const res = await fetch(`${apiBase()}/projects/${encodeURIComponent(projectId)}/drawings`, {
    method: "POST",
    body: form,
  });
  return handleJsonResponse(res);
}

export async function getProject(projectId: string): Promise<ProjectDetail> {
  const res = await fetch(`${apiBase()}/projects/${encodeURIComponent(projectId)}`);
  return handleJsonResponse<ProjectDetail>(res);
}

export async function getToCheck(projectId: string): Promise<ToCheckItem[]> {
  const res = await fetch(`${apiBase()}/projects/${encodeURIComponent(projectId)}/to-check`);
  return handleJsonResponse<ToCheckItem[]>(res);
}

export async function resolveToCheckItem(
  projectId: string,
  itemId: string,
  value: string,
): Promise<ResolveResponse> {
  const res = await fetch(
    `${apiBase()}/projects/${encodeURIComponent(projectId)}/to-check/${encodeURIComponent(itemId)}/resolve`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    },
  );
  return handleJsonResponse<ResolveResponse>(res);
}

export async function getJointBundle(projectId: string, jointId: string): Promise<Bundle> {
  const res = await fetch(jointBundleUrl(projectId, jointId));
  return handleJsonResponse<Bundle>(res);
}

export async function checkJointJson(jointJson: unknown): Promise<Bundle> {
  const res = await fetch(`${apiBase()}/joints/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(jointJson),
  });
  return handleJsonResponse<Bundle>(res);
}
