import { formatMeasure, formatOverlap } from "./format";

export function describeBarFull(bar: {
  id: string;
  member: string;
  role: string;
  layer: number;
  index: number;
  dia: number;
}): string {
  const diaText = `${Math.round(bar.dia)} millimetres`;
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
  unit: string;
  status: "fail" | "pass";
}): string {
  const unitWord =
    f.unit === "mm" ? "millimetres" : f.unit === "mm²" ? "square millimetres" : f.unit;
  if (f.rule === "GEOM-CLASH" && f.measured < 0) {
    return `${formatOverlap(f.measured)}; needs no overlap`;
  }
  const measuredText = formatMeasure(f.measured, unitWord, {
    limit: f.limit,
    compare: f.compare,
    status: f.status,
  });
  const limitText = formatMeasure(f.limit, unitWord);
  if (f.compare === ">=") {
    if (f.measured < f.limit) {
      const diff = formatMeasure(f.limit - f.measured, unitWord, {
        limit: 0,
        compare: "<=",
        status: "fail",
      });
      return `${measuredText}; needs at least ${limitText}; short by ${diff}`;
    }
    return `${measuredText}; needs at least ${limitText}; passes`;
  }
  if (f.measured > f.limit) {
    const diff = formatMeasure(f.measured - f.limit, unitWord, {
      limit: 0,
      compare: "<=",
      status: "fail",
    });
    return `${measuredText}; needs at most ${limitText}; over by ${diff}`;
  }
  return `${measuredText}; needs at most ${limitText}; passes`;
}
