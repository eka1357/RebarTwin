import { Expand, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import {
  normalizeProvenanceEntries,
  type NormalizedProvenanceEntry,
} from "../../lib/provenance";
import type { Bundle } from "../../types/bundle";

interface SourceCropProps {
  bundle: Bundle;
  focusMember: string | null;
  bundleUrl?: string;
}

function StatusAgreementBadge({ status }: { status: string }) {
  if (status === "agreed") {
    return <Badge variant="pass">Agreed</Badge>;
  }
  if (status === "geometry") {
    return <Badge variant="muted">Geometry</Badge>;
  }
  if (status === "resolved") {
    return <Badge variant="check">Resolved</Badge>;
  }
  if (status === "default") {
    return <Badge variant="muted">Default</Badge>;
  }
  return <Badge variant="muted">{status}</Badge>;
}

/**
 * Evidence viewer on warm paper tokens (`surface-paper`).
 * Uses real `bundle.provenance` page crops when populated, or a concise
 * explanation when inspecting the pitch-deck worked example without provenance.
 */
export function SourceCrop({ bundle, focusMember, bundleUrl }: SourceCropProps) {
  const entries: NormalizedProvenanceEntry[] = useMemo(
    () => normalizeProvenanceEntries(bundle, bundleUrl),
    [bundle, bundleUrl],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(2);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [sheetOpen, setSheetOpen] = useState(false);
  const scrollWrapRef = useRef<HTMLDivElement | null>(null);

  const drawnEntries = useMemo(() => entries.filter((e) => e.status !== "default"), [entries]);
  const defaultEntries = useMemo(() => entries.filter((e) => e.status === "default"), [entries]);

  const active = useMemo(() => {
    if (drawnEntries.length === 0) return entries[0] ?? null;
    if (selectedId) {
      const explicit = drawnEntries.find((e) => e.id === selectedId);
      if (explicit) return explicit;
    }
    if (focusMember) {
      const match = drawnEntries.find(
        (e) => e.member && e.member.toLowerCase() === focusMember.toLowerCase(),
      );
      if (match) return match;
    }
    return drawnEntries[0] ?? entries[0] ?? null;
  }, [drawnEntries, entries, focusMember, selectedId]);

  useEffect(() => {
    const el = scrollWrapRef.current;
    if (!el || !active?.box_2d) return;
    const [ymin, xmin, ymax, xmax] = active.box_2d;
    const cx = (xmin + xmax) / 2000;
    const cy = (ymin + ymax) / 2000;
    const scrollToBox = () => {
      el.scrollLeft = Math.max(0, el.scrollWidth * cx - el.clientWidth / 2 - pan.x);
      el.scrollTop = Math.max(0, el.scrollHeight * cy - el.clientHeight / 2 - pan.y);
    };
    const id = requestAnimationFrame(scrollToBox);
    return () => cancelAnimationFrame(id);
  }, [active, zoom, pan]);

  if (entries.length === 0) {
    return (
      <div
        data-theme="light"
        className="surface-paper rounded-[var(--radius-lg)] border p-4 shadow-xs"
      >
        <p className="text-xs leading-relaxed text-foreground">
          This worked example was typed in from the pitch deck. Read a drawing to trace each value
          to its sheet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {drawnEntries.length > 1 && (
        <div className="flex flex-wrap gap-1" role="group" aria-label="Provenance values">
          {drawnEntries.map((item) => {
            const isCurrent = active?.id === item.id;
            const head = item.member ?? item.path;
            const label =
              head === item.field || head.endsWith(`.${item.field}`)
                ? head
                : `${head} ${item.field}`;
            const title = `${label}${item.layer !== null && item.layer !== 1 ? ` L${item.layer}` : ""}`;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setSelectedId(item.id);
                  setPan({ x: 0, y: 0 });
                }}
                aria-pressed={isCurrent}
                className={`rounded-[var(--radius-xs)] border px-2 py-0.5 font-num text-xs cursor-pointer transition-colors duration-[var(--dur-1)] ${
                  isCurrent
                    ? "border-ring bg-primary text-primary-foreground"
                    : "border-border bg-surface-raised text-muted-foreground hover:text-foreground"
                }`}
              >
                {title}
              </button>
            );
          })}
        </div>
      )}

      {active && active.status !== "default" && (
        <div
          data-theme="light"
          className="surface-paper rounded-[var(--radius-lg)] border p-3.5 shadow-xs"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="space-y-0.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="font-num text-xs font-semibold text-foreground">
                  {active.member ?? active.path} · {active.field}
                  {active.layer !== null ? ` · Layer ${active.layer}` : ""}
                </p>
                {active.isColumn && active.level && (
                  <Badge variant="muted" className="font-num">
                    Storey: {active.level}
                  </Badge>
                )}
              </div>
              <p className="font-num text-xs text-muted-foreground">
                {active.page !== null ? `Page ${active.page}` : "Drawing"}
                {active.box_2d ? ` · box [${active.box_2d.join(", ")}]` : ""}
              </p>
            </div>
            <StatusAgreementBadge status={active.status} />
          </div>

          {active.pageImageUrl && (
            <div
              ref={scrollWrapRef}
              role="region"
              aria-label={`Drawing sheet excerpt for ${active.member ?? active.path}`}
              // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
              tabIndex={0}
              className="relative mt-3 h-52 overflow-auto rounded-[var(--radius-md)] border border-paper-border bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="relative" style={{ width: `${zoom * 100}%` }}>
                <img
                  src={active.pageImageUrl}
                  alt={`Drawing sheet page ${active.page ?? ""} for ${active.member ?? active.path}: ${active.text ?? active.geminiText}`}
                  onLoad={() => {
                    const el = scrollWrapRef.current;
                    if (!el || !active.box_2d) return;
                    const [ymin, xmin, ymax, xmax] = active.box_2d;
                    el.scrollLeft = Math.max(0, el.scrollWidth * ((xmin + xmax) / 2000) - el.clientWidth / 2);
                    el.scrollTop = Math.max(0, el.scrollHeight * ((ymin + ymax) / 2000) - el.clientHeight / 2);
                  }}
                  className="block h-auto w-full select-none"
                />
                {active.box_2d && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute border-2 border-fail bg-fail/10"
                    style={{
                      top: `${active.box_2d[0] / 10}%`,
                      left: `${active.box_2d[1] / 10}%`,
                      height: `${Math.max(1.5, (active.box_2d[2] - active.box_2d[0]) / 10)}%`,
                      width: `${Math.max(1.5, (active.box_2d[3] - active.box_2d[1]) / 10)}%`,
                    }}
                  />
                )}
              </div>
            </div>
          )}

          {active.pageImageUrl && (
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2"
                  aria-label="Zoom out crop"
                  onClick={() => setZoom((z) => Math.max(1, Number((z - 0.5).toFixed(1))))}
                >
                  <ZoomOut className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
                <span className="font-num w-9 text-center text-xs text-foreground">{zoom}×</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2"
                  aria-label="Zoom in crop"
                  onClick={() => setZoom((z) => Math.min(4, Number((z + 0.5).toFixed(1))))}
                >
                  <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2"
                  aria-label="Pan left"
                  onClick={() => setPan((p) => ({ ...p, x: p.x + 24 }))}
                >
                  ←
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2"
                  aria-label="Pan right"
                  onClick={() => setPan((p) => ({ ...p, x: p.x - 24 }))}
                >
                  →
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  aria-label="Reset crop view"
                  onClick={() => {
                    setZoom(2);
                    setPan({ x: 0, y: 0 });
                  }}
                >
                  <RotateCcw className="h-3 w-3" aria-hidden="true" />
                </Button>
              </div>

              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setSheetOpen(true)}>
                <Expand className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Open full sheet</span>
              </Button>
            </div>
          )}

          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-paper-border pt-2.5 text-xs">
            <div className="rounded-[var(--radius-sm)] border border-paper-border bg-surface-raised p-2">
              <Badge variant="muted">Gemini</Badge>
              <p className="mt-1 font-num font-medium text-foreground">
                {active.geminiText || active.text || "Not read"}
              </p>
            </div>
            <div className="rounded-[var(--radius-sm)] border border-paper-border bg-surface-raised p-2">
              <Badge variant="muted">Parser</Badge>
              <p className="mt-1 font-num font-medium text-foreground">
                {active.parserText || active.text || "Not read"}
              </p>
              {active.ocrRaw && (
                <p className="mt-1 font-num text-xs text-muted-foreground">
                  OCR read &apos;{active.ocrRaw}&apos;
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {defaultEntries.length > 0 && (
        <div
          data-theme="light"
          className="surface-paper rounded-[var(--radius-lg)] border p-3.5 shadow-xs space-y-2"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-foreground">Assumed, not on the drawing</p>
            <Badge variant="muted">{defaultEntries.length} default</Badge>
          </div>
          <ul className="space-y-1.5 text-xs">
            {defaultEntries.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-paper-border bg-surface-raised px-2.5 py-1.5"
              >
                <span className="font-num text-muted-foreground">{d.path}</span>
                <span className="font-num font-medium text-foreground">{d.parserText}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {active?.pageImageUrl && (
        <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
          <DialogContent className="w-[min(94vw,56rem)]">
            <DialogHeader>
              <DialogTitle>
                {active.member ?? active.path} · {active.field}
              </DialogTitle>
              <DialogDescription>
                Page {active.page} full sheet
                {active.box_2d ? ` with bounding box [${active.box_2d.join(", ")}]` : ""}.
              </DialogDescription>
            </DialogHeader>
            <div
              data-theme="light"
              role="region"
              aria-label={`Full sheet page ${active.page ?? ""}`}
              // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
              tabIndex={0}
              className="surface-paper mt-2 max-h-[70vh] overflow-auto rounded-[var(--radius-md)] border p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="relative w-full">
                <img
                  src={active.pageImageUrl}
                  alt={`Full sheet page ${active.page ?? ""} for ${active.member ?? active.path}`}
                  className="block h-auto w-full"
                />
                {active.box_2d && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute border-2 border-fail bg-fail/10"
                    style={{
                      top: `${active.box_2d[0] / 10}%`,
                      left: `${active.box_2d[1] / 10}%`,
                      height: `${Math.max(1.5, (active.box_2d[2] - active.box_2d[0]) / 10)}%`,
                      width: `${Math.max(1.5, (active.box_2d[3] - active.box_2d[1]) / 10)}%`,
                    }}
                  />
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
