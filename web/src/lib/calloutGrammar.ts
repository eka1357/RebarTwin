import type { ToCheckItem } from "./api";

export interface GrammarValidationResult {
  valid: boolean;
  normalized?: string;
  error?: string;
  placeholder: string;
  quickOptions?: Array<{ label: string; value: string }>;
}

const SINGLE_BAR_GROUP =
  /^\s*(\d+)\s*(?:nos?\.?)?\s*[-x×#@]?\s*(\d+(?:\.\d+)?)\s*(?:mm|φ|Φ|ø|#|T|Y)?\s*$/i;
const SECTION_RE = /^\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(?:mm)?\s*$/i;
const LINK_RE =
  /^\s*(?:(\d+)\s*L\s*[-–]\s*)?(?:Ø|Φ|ø|φ|#)?\s*(\d+(?:\.\d+)?)\s*(?:mm|φ|Φ|ø)?(?:\s*@\s*(\d+(?:\.\d+)?)\s*(?:c\/c|mm)?)?\s*$/i;
const COVER_RE = /^\s*(\d+(?:\.\d+)?)\s*(?:mm)?\s*$/i;

const USED_FIELDS = new Set([
  "section",
  "top",
  "top_extra",
  "bottom",
  "bottom_extra",
  "main",
  "links",
  "cover",
  "seismic_zone",
  "exposure",
  "frames_into",
]);

export function isProjectLevelItem(item: ToCheckItem): boolean {
  if (typeof item.project_level === "boolean") return item.project_level;
  return (
    item.joint === null &&
    USED_FIELDS.has(item.field) &&
    (item.member === "ALL" ||
      item.member === "ALL_BEAMS" ||
      item.member === "ALL_COLUMNS" ||
      item.field === "seismic_zone" ||
      item.field === "exposure")
  );
}

export function sortToCheckQueue(items: ToCheckItem[]): ToCheckItem[] {
  return [...items]
    .map((item, idx) => ({ item, idx, proj: isProjectLevelItem(item) }))
    .sort((a, b) => {
      const aRes = a.item.resolution ? 1 : 0;
      const bRes = b.item.resolution ? 1 : 0;
      if (aRes !== bRes) return aRes - bRes;
      if (a.proj !== b.proj) return a.proj ? -1 : 1;
      return a.idx - b.idx;
    })
    .map((x) => ({ ...x.item, project_level: x.proj }));
}

function fieldLeaf(field: string): string {
  const parts = field.split(".");
  return parts[parts.length - 1] ?? field;
}

export function describeFieldMeta(
  field: string,
): Pick<GrammarValidationResult, "placeholder" | "quickOptions"> {
  const leaf = fieldLeaf(field);
  if (leaf === "seismic_zone") {
    return {
      placeholder: "II, III, IV, or V",
      quickOptions: [
        { label: "Zone II (IS 13920 off)", value: "II" },
        { label: "Zone III", value: "III" },
        { label: "Zone IV", value: "IV" },
        { label: "Zone V", value: "V" },
      ],
    };
  }
  if (leaf === "exposure") {
    return {
      placeholder: "mild, moderate, severe, very_severe, extreme",
      quickOptions: [
        { label: "Mild", value: "mild" },
        { label: "Moderate", value: "moderate" },
        { label: "Severe", value: "severe" },
        { label: "Very severe", value: "very_severe" },
        { label: "Extreme", value: "extreme" },
      ],
    };
  }
  if (leaf === "section") return { placeholder: "e.g. 230x450 or 300x300" };
  if (leaf === "main") return { placeholder: "e.g. 8-16 or 4-16 + 4-12" };
  if (leaf === "top" || leaf === "top_extra" || leaf === "bottom" || leaf === "bottom_extra") {
    return { placeholder: "e.g. 5-20 or 2-25 + 1-20" };
  }
  if (leaf === "links" || leaf === "ties" || leaf === "stirrups") {
    return { placeholder: "e.g. 2L-8@100 or 8@150" };
  }
  if (leaf === "cover") return { placeholder: "e.g. 25 or 40" };
  return { placeholder: "Enter confirmed value" };
}

export function validateCalloutGrammar(field: string, raw: string): GrammarValidationResult {
  const meta = describeFieldMeta(field);
  const val = raw.trim();
  if (!val) {
    return { valid: false, error: "Enter a value or select one of the choices.", ...meta };
  }

  const leaf = fieldLeaf(field);

  if (leaf === "seismic_zone") {
    const cleaned = val.toUpperCase().replace(/^ZONE\s+/i, "");
    const alias: Record<string, string> = { "2": "II", "3": "III", "4": "IV", "5": "V" };
    const norm = alias[cleaned] ?? cleaned;
    if (!["II", "III", "IV", "V"].includes(norm)) {
      return { valid: false, error: "Enter seismic zone II, III, IV, or V.", ...meta };
    }
    return { valid: true, normalized: norm, ...meta };
  }

  if (leaf === "exposure") {
    const norm = val.toLowerCase().replace(/[\s-]+/g, "_");
    if (!["mild", "moderate", "severe", "very_severe", "extreme"].includes(norm)) {
      return {
        valid: false,
        error: "Use mild, moderate, severe, very_severe, or extreme.",
        ...meta,
      };
    }
    return { valid: true, normalized: norm, ...meta };
  }

  if (
    leaf === "top" ||
    leaf === "top_extra" ||
    leaf === "bottom" ||
    leaf === "bottom_extra" ||
    leaf === "main"
  ) {
    const groups: Array<{ count: number; dia: number }> = [];
    for (const part of val.split("+")) {
      const m = part.match(SINGLE_BAR_GROUP);
      if (!m) {
        return {
          valid: false,
          error: 'Expected Indian bar notation like "5-20" or "2-25 + 1-20".',
          ...meta,
        };
      }
      const count = Number(m[1]);
      const dia = Number(m[2]);
      if (!Number.isInteger(count) || count < 1 || dia < 6 || dia > 50) {
        return {
          valid: false,
          error: "Bar count must be at least 1 and diameter between 6 and 50 mm.",
          ...meta,
        };
      }
      groups.push({ count, dia });
    }
    if (leaf === "main") {
      const total = groups.reduce((acc, g) => acc + g.count, 0);
      const dias = new Set(groups.map((g) => g.dia));
      const mixedCornersFaces =
        groups.length === 2 &&
        groups[0]?.count === 4 &&
        total > 4 &&
        total % 2 === 0;
      const singleDia = dias.size === 1 && total >= 4 && total % 2 === 0;
      if (!singleDia && !mixedCornersFaces) {
        return {
          valid: false,
          error:
            "Column main steel needs an even total >= 4 of one diameter (e.g. 8-16) or 4 corner + even face bars (e.g. 4-16 + 4-12).",
          ...meta,
        };
      }
    }
    return {
      valid: true,
      normalized: groups.map((g) => `${g.count}-${g.dia}`).join(" + "),
      ...meta,
    };
  }

  if (leaf === "section") {
    const m = val.match(SECTION_RE);
    if (!m) {
      return { valid: false, error: 'Expected "width x depth" in mm (e.g. 230x450).', ...meta };
    }
    const b = Number(m[1]);
    const h = Number(m[2]);
    if (b <= 0 || h <= 0) {
      return { valid: false, error: "Section dimensions must be positive.", ...meta };
    }
    return { valid: true, normalized: `${b}x${h}`, ...meta };
  }

  if (leaf === "links" || leaf === "ties" || leaf === "stirrups") {
    const m = val.match(LINK_RE);
    if (!m || Number(m[2]) < 6 || Number(m[2]) > 20) {
      return {
        valid: false,
        error: 'Expected stirrup/tie callout like "2L-8@100" or "8@150".',
        ...meta,
      };
    }
    const legs = m[1] ? `${m[1]}L-` : "";
    const spacing = m[3] ? `@${m[3]}` : "";
    return { valid: true, normalized: `${legs}${m[2]}${spacing}`, ...meta };
  }

  if (leaf === "cover") {
    const m = val.match(COVER_RE);
    if (!m || Number(m[1]) <= 0 || Number(m[1]) > 150) {
      return { valid: false, error: "Expected nominal cover in mm (1 to 150).", ...meta };
    }
    return { valid: true, normalized: String(Number(m[1])), ...meta };
  }

  return { valid: true, normalized: val, ...meta };
}
