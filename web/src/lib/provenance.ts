import { resolveBundlePageImageUrl } from "./routes";
import type { Bundle, ProvenanceEntry } from "../types/bundle";

export interface NormalizedProvenanceEntry {
  id: string;
  path: string;
  member: string | null;
  field: string;
  layer: number | string | null;
  level: string | null;
  building: string | null;
  inverted: boolean;
  page: number | null;
  box_2d: [number, number, number, number] | null;
  text: string | null;
  geminiText: string;
  parserText: string;
  status: string;
  ocrRaw: string | null;
  pageImageUrl: string | null;
  isColumn: boolean;
}

/**
 * Normalize bundle provenance (list or map) into structured rows with
 * bundle-relative page image URLs and column detection.
 */
export function normalizeProvenanceEntries(
  bundle: Bundle,
  bundleUrl?: string,
): NormalizedProvenanceEntry[] {
  const rawProv = bundle.provenance;
  const rawList: ProvenanceEntry[] = Array.isArray(rawProv)
    ? rawProv
    : rawProv
      ? Object.values(rawProv)
      : [];

  return rawList.map((e, i) => {
    const path = e.path ?? e.field ?? `entry-${i}`;
    const member = e.member ?? null;
    const isColumn = member === bundle.joint.column.id || path.startsWith("column.");
    const fieldLabel = e.field ?? path;
    const fallbackPage = e.page ? bundle.pages?.[String(e.page)] : undefined;
    const pageImageUrl = resolveBundlePageImageUrl(e.page_image ?? fallbackPage ?? null, bundleUrl);

    return {
      id: `${path}-${i}`,
      path,
      member,
      field: fieldLabel,
      layer: e.layer ?? null,
      level: e.level ?? null,
      building: e.building ?? null,
      inverted: Boolean(e.inverted),
      page: e.page ?? null,
      box_2d: e.box_2d ?? null,
      text: e.text ?? null,
      geminiText: e.gemini ?? e.text ?? "",
      parserText: e.parser ?? e.text ?? "",
      status: e.status ?? "agreed",
      ocrRaw: e.ocr_raw ?? null,
      pageImageUrl,
      isColumn,
    };
  });
}

/** Collect sorted unique page numbers referenced by non-default provenance entries. */
export function getProvenanceSheetPages(entries: NormalizedProvenanceEntry[]): number[] {
  const pages = new Set<number>();
  for (const entry of entries) {
    if (entry.status !== "default" && entry.page !== null && entry.page > 0) {
      pages.add(entry.page);
    }
  }
  return [...pages].sort((a, b) => a - b);
}
