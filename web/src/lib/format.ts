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
  return `${formatNumber(Math.round(mm2))}${NBSP}mm²`;
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
