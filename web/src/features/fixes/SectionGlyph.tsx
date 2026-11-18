import type { Scene, SceneBar } from "../../types/bundle";

interface SectionGlyphProps {
  scene: Pick<Scene, "concrete" | "bars">;
  beamId?: string;
  columnId?: string;
  face?: "top" | "bottom";
  caption: string;
  faceSummary: string;
}

function isFaceBar(bar: SceneBar, face: "top" | "bottom"): boolean {
  const role = bar.role.toLowerCase();
  if (face === "top") {
    return role.includes("top") || bar.id.includes("/T");
  }
  return role.includes("bot") || bar.id.includes("/B");
}

function describeFaceLayersInWords(beamId: string, face: "top" | "bottom", bars: SceneBar[]): string {
  if (bars.length === 0) {
    return `Beam ${beamId} ${face} face cross-section: no bars`;
  }
  const byLayer = new Map<number, { count: number; dias: Set<number> }>();
  for (const bar of bars) {
    const entry = byLayer.get(bar.layer) ?? { count: 0, dias: new Set<number>() };
    entry.count += 1;
    entry.dias.add(bar.dia);
    byLayer.set(bar.layer, entry);
  }
  const parts = [...byLayer.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([layer, info]) => {
      const diaList = [...info.dias]
        .sort((a, b) => b - a)
        .map((d) => `${d} millimetres`)
        .join(" and ");
      return `layer ${layer} has ${info.count} ${info.count === 1 ? "bar" : "bars"} of ${diaList}`;
    });
  return `Beam ${beamId} ${face} face cross-section: ${parts.join(", ")}`;
}

function describeColumnBarsInWords(columnId: string, bars: SceneBar[]): string {
  if (bars.length === 0) {
    return `Column ${columnId} cross-section: no bars`;
  }
  const counts = new Map<number, number>();
  for (const bar of bars) {
    counts.set(bar.dia, (counts.get(bar.dia) ?? 0) + 1);
  }
  const parts = [...counts.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([dia, count]) => `${count} ${count === 1 ? "bar" : "bars"} of ${dia} millimetres`);
  return `Column ${columnId} cross-section: ${parts.join(", ")}`;
}

interface GlyphPlot {
  rectW: number;
  rectH: number;
  rectX: number;
  rectY: number;
  cageInset: number;
  ariaLabel: string;
  circles: Array<{
    id: string;
    cx: number;
    cy: number;
    r: number;
    dia: number;
    active: boolean;
    fail: boolean;
  }>;
}

function buildSectionPlot(
  scene: Pick<Scene, "concrete" | "bars">,
  vw: number,
  vh: number,
  { beamId, columnId, face = "top" }: Pick<SectionGlyphProps, "beamId" | "columnId" | "face">,
): GlyphPlot {
  const padX = 12;
  const padY = 10;

  if (columnId) {
    const colConc = scene.concrete.find((c) => c.id === columnId && c.kind === "column");
    const bMm = colConc ? Math.max(100, Math.abs(colConc.max[0] - colConc.min[0])) : 300;
    const dMm = colConc ? Math.max(100, Math.abs(colConc.max[1] - colConc.min[1])) : 300;
    const xMid = colConc ? (colConc.min[0] + colConc.max[0]) / 2 : 0;
    const yMax = colConc ? Math.max(colConc.min[1], colConc.max[1]) : dMm / 2;

    const scale = Math.min((vw - padX * 2) / bMm, (vh - padY * 2) / dMm);
    const rectW = bMm * scale;
    const rectH = dMm * scale;
    const rectX = (vw - rectW) / 2;
    const rectY = (vh - rectH) / 2;
    const cageInset = Math.min(rectW * 0.2, rectH * 0.2, 24 * scale);

    const colBars = scene.bars.filter((bar) => bar.member === columnId);
    return {
      rectW,
      rectH,
      rectX,
      rectY,
      cageInset,
      ariaLabel: describeColumnBarsInWords(columnId, colBars),
      circles: colBars.map((bar) => {
        const barX = (bar.p0[0] + bar.p1[0]) / 2;
        const barY = (bar.p0[1] + bar.p1[1]) / 2;
        return {
          id: bar.id,
          cx: rectX + rectW / 2 + (barX - xMid) * scale,
          cy: rectY + (yMax - barY) * scale,
          // Preserve distinct visual radii between corner and smaller face bar diameters.
          r: Math.max(1.5, (bar.dia / 2) * scale * 1.15),
          dia: bar.dia,
          active: true,
          fail: bar.status === "fail",
        };
      }),
    };
  }

  const targetBeam = beamId ?? "";
  const beamConc = scene.concrete.find((c) => c.id === targetBeam && c.kind === "beam");
  const bMm = beamConc ? Math.max(100, Math.abs(beamConc.max[1] - beamConc.min[1])) : 230;
  const dMm = beamConc ? Math.max(150, Math.abs(beamConc.max[2] - beamConc.min[2])) : 450;
  const yMid = beamConc ? (beamConc.min[1] + beamConc.max[1]) / 2 : 0;
  const zTop = beamConc ? Math.max(beamConc.min[2], beamConc.max[2]) : 0;

  const scale = Math.min((vw - padX * 2) / bMm, (vh - padY * 2) / dMm);
  const rectW = bMm * scale;
  const rectH = dMm * scale;
  const rectX = (vw - rectW) / 2;
  const rectY = (vh - rectH) / 2;
  const cageInset = Math.min(rectW * 0.2, 24 * scale);

  const beamBars = scene.bars.filter((bar) => bar.member === targetBeam);
  const faceBars = beamBars.filter((bar) => isFaceBar(bar, face));
  return {
    rectW,
    rectH,
    rectX,
    rectY,
    cageInset,
    ariaLabel: describeFaceLayersInWords(targetBeam, face, faceBars),
    circles: beamBars.map((bar) => {
      const barY = (bar.p0[1] + bar.p1[1]) / 2;
      const barZ = (bar.p0[2] + bar.p1[2]) / 2;
      return {
        id: bar.id,
        cx: rectX + rectW / 2 + (barY - yMid) * scale,
        cy: rectY + (zTop - barZ) * scale,
        r: Math.max(2.1, (bar.dia / 2) * scale),
        dia: bar.dia,
        active: isFaceBar(bar, face),
        fail: bar.status === "fail",
      };
    }),
  };
}

/**
 * Architectural SVG cross-section of a beam or column drawn to scale from scene geometry,
 * using each bar's own `dia` and describing bar groups in words for screen readers.
 */
export function SectionGlyph({
  scene,
  beamId,
  columnId,
  face = "top",
  caption,
  faceSummary,
}: SectionGlyphProps) {
  const vw = 88;
  const vh = columnId ? 88 : 132;
  const plot = buildSectionPlot(scene, vw, vh, { beamId, columnId, face });

  return (
    <div className="flex flex-col items-center gap-1 rounded-[var(--radius-sm)] border border-border bg-surface-sunken px-2 py-2 print:gap-0.5 print:py-1">
      <span className="text-xs font-medium text-muted-foreground">{caption}</span>
      <svg
        role="img"
        aria-label={plot.ariaLabel}
        viewBox={`0 0 ${vw} ${vh}`}
        className={
          columnId
            ? "h-16 w-16 overflow-visible select-none print:h-12 print:w-12"
            : "h-24 w-16 overflow-visible select-none print:h-16 print:w-12"
        }
      >
        <rect
          x={plot.rectX}
          y={plot.rectY}
          width={plot.rectW}
          height={plot.rectH}
          rx={2}
          fill="currentColor"
          fillOpacity={0.07}
          stroke="currentColor"
          strokeWidth={1.25}
          className="text-border-strong"
        />
        <rect
          x={plot.rectX + plot.cageInset}
          y={plot.rectY + plot.cageInset}
          width={Math.max(4, plot.rectW - plot.cageInset * 2)}
          height={Math.max(4, plot.rectH - plot.cageInset * 2)}
          rx={1.5}
          fill="none"
          stroke="currentColor"
          strokeWidth={0.9}
          strokeDasharray="3 2"
          className="text-muted-foreground"
        />

        {plot.circles.map((dot) => {
          const tone = dot.fail
            ? "text-fail"
            : dot.active
              ? "text-foreground"
              : "text-steel";
          return (
            <circle
              key={dot.id}
              cx={dot.cx}
              cy={dot.cy}
              r={dot.r}
              data-bar-dia={dot.dia}
              fill="currentColor"
              fillOpacity={dot.active ? 0.95 : 0.45}
              className={tone}
            />
          );
        })}
      </svg>
      <span className="font-num text-center text-xs font-medium text-foreground">{faceSummary}</span>
    </div>
  );
}
