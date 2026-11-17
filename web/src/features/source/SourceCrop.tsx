import { Expand, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { useMemo, useState } from "react";
import { StatusPill } from "../../components/StatusPill";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import type { Bundle, ProvenanceEntry } from "../../types/bundle";

interface SourceCropProps {
  bundle: Bundle;
  focusMember: string | null;
}

interface SheetEvidenceItem {
  id: string;
  member: string;
  label: string;
  page: number;
  box_2d: [number, number, number, number];
  geminiText: string;
  parserText: string;
  agreed: boolean;
  pageImage?: string;
}

/**
 * Evidence viewer on warm paper tokens (`surface-paper`).
 * Uses `bundle.provenance` when populated by R5, or a structural schedule excerpt placeholder.
 */
export function SourceCrop({ bundle, focusMember }: SourceCropProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [sheetOpen, setSheetOpen] = useState(false);

  const items = useMemo<SheetEvidenceItem[]>(() => {
    const rawProv = bundle.provenance;
    const entries: ProvenanceEntry[] = Array.isArray(rawProv)
      ? rawProv
      : rawProv
        ? Object.values(rawProv)
        : [];

    if (entries.length > 0) {
      return entries.map((e, i) => ({
        id: `${e.field}-${i}`,
        member: e.field.split(".")[0] ?? bundle.joint.id,
        label: e.field,
        page: e.page,
        box_2d: e.box_2d,
        geminiText: e.gemini ?? e.text,
        parserText: e.parser ?? e.text,
        agreed: e.status !== "to_check",
        pageImage: e.page_image,
      }));
    }

    const col = bundle.joint.column;
    const beam = bundle.joint.beams[0];
    const colBox: [number, number, number, number] = [210, 140, 410, 480];
    const beamBox: [number, number, number, number] = [440, 140, 740, 560];
    return [
      {
        id: `${beam?.id ?? "B12"}-top`,
        member: beam?.id ?? "B12",
        label: `${beam?.id ?? "B12"} Schedule callout (top steel)`,
        page: 1,
        box_2d: beamBox,
        geminiText: beam?.top.map((l) => l.bars).join(" / ") || "5-20",
        parserText: beam?.top.map((l) => l.bars).join(" / ") || "5-20",
        agreed: true,
      },
      {
        id: `${col.id}-size`,
        member: col.id,
        label: `${col.id} Column schedule`,
        page: 1,
        box_2d: colBox,
        geminiText: `${col.b}×${col.h}, ${col.n_bars}-${col.bar_dia}, cover ${col.cover} mm`,
        parserText: `${col.b}×${col.h}, ${col.n_bars}-${col.bar_dia}, cover ${col.cover} mm`,
        agreed: true,
      },
    ];
  }, [bundle]);

  const active =
    items.find((it) => focusMember && it.member.toLowerCase() === focusMember.toLowerCase()) ??
    items[0];
  const isPlaceholder = !bundle.provenance;

  return (
    <div className="space-y-3">
      <div
        data-theme="light"
        className="surface-paper rounded-[var(--radius-lg)] border p-3.5 shadow-xs"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-num text-xs font-semibold text-foreground">{active.label}</p>
            <p className="text-xs text-muted-foreground">
              Page {active.page} · box [{active.box_2d.join(", ")}]
              {isPlaceholder ? " · Placeholder crop (before R5 PDF reader)" : ""}
            </p>
          </div>
          <StatusPill status={active.agreed ? "pass" : "to_check"} size="sm" />
        </div>

        <div className="relative mt-3 h-48 overflow-hidden rounded-[var(--radius-md)] border border-paper-border bg-paper">
          <div
            className="h-full w-full transition-transform duration-[var(--dur-2)] ease-[var(--ease-standard)]"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "center center",
            }}
          >
            {active.pageImage ? (
              <img
                src={active.pageImage}
                alt={`Drawing crop for ${active.label}: ${active.geminiText}`}
                className="h-full w-full object-contain"
              />
            ) : (
              <ScheduleMockSvg bundle={bundle} box={active.box_2d} altValue={active.geminiText} />
            )}
          </div>
        </div>

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
              onClick={() => setZoom((z) => Math.min(2.5, Number((z + 0.5).toFixed(1))))}
            >
              <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2"
              aria-label="Pan left"
              onClick={() => setPan((p) => ({ ...p, x: p.x + 18 }))}
            >
              ←
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2"
              aria-label="Pan right"
              onClick={() => setPan((p) => ({ ...p, x: p.x - 18 }))}
            >
              →
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              aria-label="Reset crop view"
              onClick={() => {
                setZoom(1);
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

        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-paper-border pt-2.5 text-xs">
          <div className="rounded-[var(--radius-sm)] border border-paper-border bg-surface-raised p-2">
            <Badge variant="muted">Gemini</Badge>
            <p className="mt-1 font-num font-medium text-foreground">{active.geminiText}</p>
          </div>
          <div className="rounded-[var(--radius-sm)] border border-paper-border bg-surface-raised p-2">
            <Badge variant="muted">Parser</Badge>
            <p className="mt-1 font-num font-medium text-foreground">{active.parserText}</p>
          </div>
        </div>
      </div>

      <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
        <DialogContent className="w-[min(94vw,44rem)]">
          <DialogHeader>
            <DialogTitle>{active.label}</DialogTitle>
            <DialogDescription>
              Page {active.page} excerpt showing normalized bounding box [{active.box_2d.join(", ")}]
              and paired Gemini / Parser readings.
            </DialogDescription>
          </DialogHeader>
          <div
            data-theme="light"
            className="surface-paper mt-2 h-80 overflow-hidden rounded-[var(--radius-md)] border p-2"
          >
            {active.pageImage ? (
              <img
                src={active.pageImage}
                alt={`Full sheet excerpt for ${active.label}: ${active.geminiText}`}
                className="h-full w-full object-contain"
              />
            ) : (
              <ScheduleMockSvg bundle={bundle} box={active.box_2d} altValue={active.geminiText} />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ScheduleMockSvg({
  bundle,
  box,
  altValue,
}: {
  bundle: Bundle;
  box: [number, number, number, number];
  altValue: string;
}) {
  const [yMin, xMin, yMax, xMax] = box;
  const rx = (xMin / 1000) * 440;
  const ry = (yMin / 1000) * 240;
  const rw = Math.max(56, ((xMax - xMin) / 1000) * 440);
  const rh = Math.max(36, ((yMax - yMin) / 1000) * 240);
  const tick = 8;
  const beam = bundle.joint.beams[0];
  const col = bundle.joint.column;

  return (
    <svg
      role="img"
      aria-label={`Structural drawing schedule sheet excerpt reading ${altValue}`}
      viewBox="0 0 440 240"
      className="h-full w-full select-none"
    >
      {/* Engineering title block & grid hairlines */}
      <rect x="10" y="10" width="420" height="220" fill="none" stroke="currentColor" strokeOpacity="0.25" className="text-border-strong" />
      <text x="22" y="34" className="fill-foreground font-num text-xs font-semibold">
        STRUCTURAL SCHEDULE · {bundle.joint.id} (ZONE {bundle.report.seismic_zone})
      </text>
      <line x1="22" y1="44" x2="418" y2="44" stroke="currentColor" strokeOpacity="0.3" className="text-border-strong" />

      <text x="26" y="72" className="fill-muted-foreground font-num text-xs">
        COL {col.id}: {col.b}×{col.h} mm · {col.n_bars}-⌀{col.bar_dia} · TIES ⌀{col.tie_dia}
      </text>
      <text x="26" y="96" className="fill-muted-foreground font-num text-xs">
        COVER: {col.cover} mm ({col.cover_to})
      </text>

      {beam && (
        <>
          <text x="26" y="132" className="fill-muted-foreground font-num text-xs">
            BEAM {beam.id}: {beam.b}×{beam.D} mm · TOP {beam.top.map((l) => l.bars).join(" / ")}
          </text>
          <text x="26" y="156" className="fill-muted-foreground font-num text-xs">
            BOT {beam.bottom.map((l) => l.bars).join(" / ")} · STIRRUP ⌀{beam.stirrup_dia}
          </text>
        </>
      )}

      {/* Orange crop box with CAD corner ticks */}
      <rect
        x={rx}
        y={ry}
        width={rw}
        height={rh}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="4 3"
        className="text-fail"
      />
      <path
        d={`M${rx},${ry + tick} V${ry} H${rx + tick} M${rx + rw - tick},${ry} H${rx + rw} V${ry + tick} M${rx},${ry + rh - tick} V${ry + rh} H${rx + tick} M${rx + rw - tick},${ry + rh} H${rx + rw} V${ry + rh - tick}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        className="text-fail"
      />
    </svg>
  );
}
