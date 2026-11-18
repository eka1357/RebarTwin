import type { Finding } from "../types/bundle";

export const NBSP = "\u00a0";

/** Format a plain integer or decimal using Indian locale grouping (e.g. 1,610 or 1,00,000). */
export function formatNumber(
  value: number,
  options?: { minimumFractionDigits?: number; maximumFractionDigits?: number },
): string {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: options?.minimumFractionDigits ?? 0,
    maximumFractionDigits: options?.maximumFractionDigits ?? 0,
  }).format(value);
}

/**
 * Format a measured value with its unit (non-breaking space, en-IN grouping).
 * Lengths round to the nearest mm unless that would round a failing value onto
 * (or across) its limit, e.g. 24.6 failing >= 25 renders "24.6 mm", not "25 mm".
 */
export function formatMeasure(
  value: number,
  unit: string,
  opts?: {
    limit?: number;
    compare?: ">=" | "<=";
    status?: "fail" | "pass";
  },
): string {
  let decimals = 0;

  const isFailing =
    opts?.status === "fail" ||
    (opts?.limit !== undefined &&
      (opts.compare === "<=" ? value > opts.limit : value < opts.limit));

  if (isFailing && opts?.limit !== undefined) {
    for (let d = 0; d <= 3; d++) {
      const factor = 10 ** d;
      const roundedVal = Math.round(value * factor) / factor;
      const roundedLimit = Math.round(opts.limit * factor) / factor;
      const distinctAndFailing =
        opts.compare === "<=" ? roundedVal > roundedLimit : roundedVal < roundedLimit;
      decimals = d;
      if (distinctAndFailing && roundedVal !== roundedLimit) {
        break;
      }
    }
  }

  const numStr = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);

  return `${numStr}${NBSP}${unit}`;
}

/** Format an overlap from a negative clear gap (-18 -> "18 mm overlap", -0.4 -> "0.4 mm overlap"). */
export function formatOverlap(measuredMm: number): string {
  const overlap = Math.abs(measuredMm);
  let decimals = 0;
  for (let d = 0; d <= 3; d++) {
    const factor = 10 ** d;
    if (Math.round(overlap * factor) / factor > 0 || overlap === 0) {
      decimals = d;
      break;
    }
    decimals = d;
  }
  const numStr = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(overlap);
  return `${numStr}${NBSP}mm overlap`;
}

export function formatArea(mm2: number): string {
  return `${formatNumber(mm2)}${NBSP}mm²`;
}

export function formatPercentDelta(pct: number): string {
  const sign = pct > 0 ? "+" : "";
  const formatted = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: Number.isInteger(pct) ? 0 : 1,
    maximumFractionDigits: 1,
  }).format(pct);
  return `${sign}${formatted}%`;
}

/** Strip BIS year suffixes when displaying concise clause tags ("IS 456:2000 cl. 26.3.2" -> "IS 456 cl. 26.3.2"). */
export function formatClause(clause: string): string {
  return clause.replace(":2000", "").replace(":2016", "");
}

/** Single bar chip label: "B12/T1-3" + 20 -> "T1-3 ⌀20". */
export function formatBarMark(barId: string, diaMm: number): string {
  const shortId = barId.includes("/") ? barId.split("/").slice(1).join("/") : barId;
  const diaStr = Number.isInteger(diaMm) ? String(diaMm) : diaMm.toFixed(1);
  return `${shortId} ⌀${diaStr}`;
}

function formatDiaToken(diaMm: number): string {
  return Number.isInteger(diaMm) ? String(diaMm) : diaMm.toFixed(1);
}

/**
 * Column main steel summary: uniform "8-16", or mixed "4-16 corners + 4-12 faces".
 */
export function formatColumnMainSummary(col: {
  n_bars: number;
  bar_dia: number;
  face_dia?: number | null;
}): string {
  const cornerDia = formatDiaToken(col.bar_dia);
  if (col.face_dia == null || col.face_dia === col.bar_dia || col.n_bars <= 4) {
    return `${col.n_bars}-${cornerDia}`;
  }
  const faceCount = col.n_bars - 4;
  return `4-${cornerDia} corners + ${faceCount}-${formatDiaToken(col.face_dia)} faces`;
}

/** Extract destination size from Option.column ("200 × 450 -> 200 × 550" -> "200 × 550"). */
export function formatAfterColumnSize(columnChange: string): string {
  const parts = columnChange.split("->");
  return parts[parts.length - 1]?.trim() || columnChange;
}

export function formatFindingValue(f: {
  rule: string;
  measured: number;
  limit: number;
  compare: ">=" | "<=";
  unit: string;
  status: "fail" | "pass";
}): string {
  if (f.rule === "GEOM-CLASH" && f.measured < 0) {
    return formatOverlap(f.measured);
  }
  return formatMeasure(f.measured, f.unit, {
    limit: f.limit,
    compare: f.compare,
    status: f.status,
  });
}

/**
 * Format primary 3D callout text before the clause suffix:
 * - "16 mm · needs 25" for clear-spacing or minimum checks
 * - "18 mm overlap" for geometry clashes
 */
export function formatCalloutValue(f: {
  rule: string;
  measured: number;
  limit: number;
  compare: ">=" | "<=";
  unit: string;
  status: "fail" | "pass";
}): string {
  const valueStr = formatFindingValue(f);
  if (f.rule === "GEOM-CLASH" && f.measured < 0) {
    return valueStr;
  }
  const limitDecimals = Number.isInteger(f.limit) ? 0 : 1;
  const limitStr = formatNumber(f.limit, {
    minimumFractionDigits: limitDecimals,
    maximumFractionDigits: limitDecimals,
  });
  const verb = f.compare === "<=" ? "max" : "needs";
  return `${valueStr} · ${verb} ${limitStr}`;
}

function unitWords(unit: string): string {
  if (unit === "mm") return "millimetres";
  if (unit === "mm²") return "square millimetres";
  return unit;
}

function numSpeech(value: number, limit?: number, compare?: ">=" | "<=", status?: "fail" | "pass"): string {
  let decimals = 0;
  if (status === "fail" && limit !== undefined) {
    for (let d = 0; d <= 3; d++) {
      const factor = 10 ** d;
      const rv = Math.round(value * factor) / factor;
      const rl = Math.round(limit * factor) / factor;
      const distinct = compare === "<=" ? rv > rl : rv < rl;
      decimals = d;
      if (distinct && rv !== rl) break;
    }
  }
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

function formatMarginValue(margin: number, unit: string, status: "fail" | "pass"): string {
  const absMargin = Math.abs(margin);
  const numStr =
    absMargin > 0 && absMargin < 1
      ? new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(absMargin)
      : status === "fail" && absMargin > 0
        ? new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 }).format(absMargin)
        : numSpeech(absMargin);
  return unit ? `${numStr} ${unit}` : numStr;
}

/**
 * Accessibility sentence describing a ToleranceGauge, e.g.:
 * "16 millimetres; needs at least 25; short by 9 mm"
 * "18 millimetres overlap; zero clearance allowed"
 */
export function describeToleranceGauge(f: {
  rule: string;
  measured: number;
  limit: number;
  compare: ">=" | "<=";
  margin: number;
  unit: string;
  status: "fail" | "pass";
}): string {
  const unitName = unitWords(f.unit);
  if (f.rule === "GEOM-CLASH" && f.measured < 0) {
    const ov = numSpeech(Math.abs(f.measured), 0, "<=", "fail");
    return `${ov} ${unitName} overlap; zero clearance allowed`;
  }
  const mStr = numSpeech(f.measured, f.limit, f.compare, f.status);
  const lStr = numSpeech(f.limit);
  const marginWithUnit = formatMarginValue(f.margin, f.unit, f.status);
  if (f.compare === "<=") {
    if (f.status === "fail") {
      return `${mStr} ${unitName}; limit at most ${lStr}; over by ${marginWithUnit}`;
    }
    return `${mStr} ${unitName}; limit at most ${lStr}; passes with ${marginWithUnit} margin`;
  }
  if (f.status === "fail") {
    return `${mStr} ${unitName}; needs at least ${lStr}; short by ${marginWithUnit}`;
  }
  return `${mStr} ${unitName}; needs at least ${lStr}; passes with ${marginWithUnit} margin`;
}

/** Format Before -> After morph summary for Sonner toast ("1,571 → 1,610 mm² · 5 bars → 4"). */
export function formatFixToastSummary(
  faces: {
    area_before: number;
    area_provided: number;
    n_bars_before: number;
    n_bars: number;
  }[],
): string {
  const f0 = faces[0];
  if (!f0) return "Previewing repaired joint in 3D";
  return `${formatNumber(f0.area_before)} → ${formatArea(f0.area_provided)} · ${f0.n_bars_before} ${f0.n_bars_before === 1 ? "bar" : "bars"} → ${f0.n_bars}`;
}

/** Format a report date in Indian English ("18 Nov 2026"). */
export function formatReportDate(iso?: string | null): string {
  const parsed = iso ? new Date(iso) : new Date();
  const safe = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(safe);
}

/**
 * Return one plain sentence for a finding with measured value, limit, and clause,
 * derived strictly from the engine's message and clause fields.
 */
export function formatFindingReportSentence(f: {
  rule: string;
  clause: string;
  measured: number;
  limit: number;
  compare: ">=" | "<=";
  unit: string;
  status: "fail" | "pass";
  message: string;
}): string {
  const base = f.message.trim().replace(/\.+$/, "");
  if (f.rule === "GEOM-CLASH") {
    return `${base}.`;
  }
  const clauseShort = formatClause(f.clause);
  if (base.toLowerCase().includes(clauseShort.toLowerCase())) {
    return `${base}.`;
  }
  return `${base} (${clauseShort}).`;
}

export interface ReportFindingGroup {
  representative: Finding;
  count: number;
  sentence: string;
}

interface ParsedBarId {
  member: string;
  role: "top" | "bottom" | "column";
  layer: number;
  index: string;
}

function parseReportBarId(barId: string): ParsedBarId | null {
  const beamMatch = /^([^/]+)\/([TB])(\d+)-(\d+)$/.exec(barId);
  if (beamMatch) {
    return {
      member: beamMatch[1],
      role: beamMatch[2] === "T" ? "top" : "bottom",
      layer: Number.parseInt(beamMatch[3], 10),
      index: beamMatch[4],
    };
  }
  const colMatch = /^([^/]+)\/V(\d+)$/.exec(barId);
  if (colMatch) {
    return {
      member: colMatch[1],
      role: "column",
      layer: 1,
      index: colMatch[2],
    };
  }
  return null;
}

function joinWithAnd(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function describeSingleBarId(barId: string): string {
  const p = parseReportBarId(barId);
  if (!p) return barId;
  if (p.role === "column") return `${p.member} column bar ${p.index}`;
  const layerText = p.layer > 1 ? ` layer ${p.layer}` : "";
  return `${p.member} ${p.role}${layerText} bar ${p.index}`;
}

function describeSameRoleBarGroup(barIds: string[]): string | null {
  const parsed = barIds.map(parseReportBarId);
  if (parsed.some((p) => p === null)) return null;
  const list = parsed as ParsedBarId[];
  const first = list[0];
  if (
    list.every(
      (p) => p.member === first.member && p.role === first.role && p.layer === first.layer,
    )
  ) {
    const indices = list.map((p) => p.index);
    const layerText = first.role !== "column" && first.layer > 1 ? ` layer ${first.layer}` : "";
    const noun = list.length === 1 ? "bar" : "bars";
    return `${first.member} ${first.role}${layerText} ${noun} ${joinWithAnd(indices)}`;
  }
  return null;
}

function formatGroupedSpacingSentence(group: Finding[]): string | null {
  const f0 = group[0];
  if (!f0.rule.startsWith("IS456-26.3.2") || !group.every((f) => f.bars.length === 2)) {
    return null;
  }
  const parsedPairs = group.map((f) => [
    parseReportBarId(f.bars[0]),
    parseReportBarId(f.bars[1]),
  ] as const);
  if (parsedPairs.some(([a, b]) => !a || !b)) return null;

  const firstA = parsedPairs[0][0]!;
  const sameFaceAndLayer = parsedPairs.every(
    ([a, b]) =>
      a!.member === firstA.member &&
      b!.member === firstA.member &&
      a!.role === firstA.role &&
      b!.role === firstA.role &&
      a!.layer === firstA.layer &&
      b!.layer === firstA.layer,
  );
  if (!sameFaceAndLayer) return null;

  const pairLabels = parsedPairs.map(([a, b]) => `${a!.index}-${b!.index}`);
  const layerText = firstA.role !== "column" && firstA.layer > 1 ? ` layer ${firstA.layer}` : "";
  const measuredStr = formatMeasure(f0.measured, f0.unit, {
    limit: f0.limit,
    compare: f0.compare,
    status: f0.status,
  });
  const limitStr = formatMeasure(f0.limit, f0.unit);
  return `${firstA.member} ${firstA.role}${layerText} bars ${joinWithAnd(pairLabels)} are ${measuredStr} apart; ${formatClause(f0.clause)} needs ${limitStr}.`;
}

function formatGroupedClashSentence(group: Finding[]): string | null {
  const f0 = group[0];
  if (f0.rule !== "GEOM-CLASH" || !group.every((f) => f.bars.length === 2)) {
    return null;
  }
  const firstBars = group[0].bars;
  const sharedBar = firstBars.find((bar) => group.every((f) => f.bars.includes(bar)));
  const overlapStr = formatMeasure(Math.abs(f0.measured), f0.unit || "mm");

  if (sharedBar) {
    const varying = group.map((f) => (f.bars[0] === sharedBar ? f.bars[1] : f.bars[0]));
    const varyingLabel = describeSameRoleBarGroup(varying) ?? joinWithAnd(varying.map(describeSingleBarId));
    const sharedLabel = describeSingleBarId(sharedBar);
    return `${varyingLabel} run into ${sharedLabel}: they overlap by ${overlapStr}, so one of them cannot be placed as drawn.`;
  }

  const pairs = group.map((f) => `${describeSingleBarId(f.bars[0])} with ${describeSingleBarId(f.bars[1])}`);
  return `${joinWithAnd(pairs)} overlap by ${overlapStr}, so bars cannot be placed as drawn.`;
}

/**
 * Group findings that share the exact same rule, sorted members, measured value,
 * limit, comparison direction, and unit. Findings whose numbers differ are never merged.
 */
export function groupReportFindings(findings: Finding[]): ReportFindingGroup[] {
  const buckets = new Map<string, Finding[]>();
  for (const f of findings) {
    const membersKey = [...f.members].sort().join(",");
    const key = `${f.rule}|${membersKey}|${f.measured}|${f.limit}|${f.compare}|${f.unit}`;
    const existing = buckets.get(key);
    if (existing) existing.push(f);
    else buckets.set(key, [f]);
  }

  return [...buckets.values()].map((group) => {
    const rep = group[0];
    if (group.length === 1) {
      return {
        representative: rep,
        count: 1,
        sentence: formatFindingReportSentence(rep),
      };
    }
    const groupedSentence =
      formatGroupedSpacingSentence(group) ??
      formatGroupedClashSentence(group) ??
      `${formatFindingReportSentence(rep).replace(/\.$/, "")} (${group.length} matching checks).`;
    return {
      representative: rep,
      count: group.length,
      sentence: groupedSentence,
    };
  });
}
