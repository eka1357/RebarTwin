import {
  describeToleranceGauge,
  formatClause,
  formatMeasure,
  formatNumber,
  formatOverlap,
  NBSP,
} from "./format";
import type { Finding } from "../types/bundle";

export function describeBarFull(bar: {
  id: string;
  member: string;
  role: string;
  layer: number;
  index: number;
  dia: number;
}): string {
  const diaText = `${formatNumber(bar.dia)} millimetres`;
  if (bar.role === "column") {
    return `${bar.member} column bar ${bar.index}, ${diaText}`;
  }
  const layerPart = bar.layer > 0 ? `, layer ${bar.layer}` : "";
  const faceWord = bar.role === "top" ? "Top" : bar.role === "bottom" ? "Bottom" : bar.role;
  return `${bar.member} ${faceWord} bar ${bar.index}${layerPart}, ${diaText}`;
}

export function describeGaugeSentence(f: {
  rule: string;
  measured: number;
  limit: number;
  compare: ">=" | "<=";
  margin: number;
  unit: string;
  status: "fail" | "pass";
}): string {
  return describeToleranceGauge(f);
}

/**
 * Concise spoken accessible name for a FindingCard trigger, e.g.:
 * "Fails: B12 top bars 1 and 2 are 16 mm apart, need 25 mm, IS 456 clause 26.3.2"
 */
export function describeFindingCardLabel(f: Pick<
  Finding,
  "rule" | "clause" | "status" | "measured" | "limit" | "compare" | "unit" | "message"
>): string {
  const statusWord = f.status === "fail" ? "Fails" : "Passes";
  const clauseSpoken = formatClause(f.clause).replace(/\bcl\.\s*/gi, "clause ");
  const subject = f.message.split(";")[0]?.split(":")[0]?.trim() || f.message;

  if (f.rule === "GEOM-CLASH" && f.measured < 0) {
    const overlap = formatOverlap(f.measured).replace(NBSP, " ");
    return `${statusWord}: ${subject}, ${overlap}, ${clauseSpoken}`;
  }

  const limitStr = formatMeasure(f.limit, f.unit).replace(NBSP, " ");
  const limitPhrase = f.compare === "<=" ? `max ${limitStr}` : `need ${limitStr}`;
  return `${statusWord}: ${subject}, ${limitPhrase}, ${clauseSpoken}`;
}
