import type { Scene, SceneBar } from "../../types/bundle";

interface SectionGlyphProps {
  scene: Pick<Scene, "concrete" | "bars">;
  beamId: string;
  face: "top" | "bottom";
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

/**
 * Architectural SVG cross-section of a beam drawn to scale from scene geometry,
 * highlighting the active face bars and reading all layers in words.
 */
export function SectionGlyph({ scene, beamId, face, caption, faceSummary }: SectionGlyphProps) {
  const beamConc = scene.concrete.find((c) => c.id === beamId && c.kind === "beam");
  const bMm = beamConc ? Math.max(100, Math.abs(beamConc.max[1] - beamConc.min[1])) : 230;
  const dMm = beamConc ? Math.max(150, Math.abs(beamConc.max[2] - beamConc.min[2])) : 450;
  const yMid = beamConc ? (beamConc.min[1] + beamConc.max[1]) / 2 : 0;
  const zTop = beamConc ? Math.max(beamConc.min[2], beamConc.max[2]) : 0;

  const beamBars = scene.bars.filter((bar) => bar.member === beamId);
  const faceBars = beamBars.filter((bar) => isFaceBar(bar, face));

  const vw = 88;
  const vh = 132;
  const padX = 12;
  const padY = 10;
  const scale = Math.min((vw - padX * 2) / bMm, (vh - padY * 2) / dMm);
  const rectW = bMm * scale;
  const rectH = dMm * scale;
  const rectX = (vw - rectW) / 2;
  const rectY = (vh - rectH) / 2;
  const cageInset = Math.min(rectW * 0.2, 24 * scale);

  const ariaLabel = describeFaceLayersInWords(beamId, face, faceBars);

  return (
    <div className="flex flex-col items-center gap-1 rounded-[var(--radius-sm)] border border-border bg-surface-sunken px-2 py-2 print:gap-0.5 print:py-1">
      <span className="text-xs font-medium text-muted-foreground">{caption}</span>
      <svg
        role="img"
        aria-label={ariaLabel}
        viewBox={`0 0 ${vw} ${vh}`}
        className="h-24 w-16 overflow-visible select-none print:h-16 print:w-12"
      >
        <rect
          x={rectX}
          y={rectY}
          width={rectW}
          height={rectH}
          rx={2}
          fill="currentColor"
          fillOpacity={0.07}
          stroke="currentColor"
          strokeWidth={1.25}
          className="text-border-strong"
        />
        <rect
          x={rectX + cageInset}
          y={rectY + cageInset}
          width={Math.max(4, rectW - cageInset * 2)}
          height={Math.max(4, rectH - cageInset * 2)}
          rx={1.5}
          fill="none"
          stroke="currentColor"
          strokeWidth={0.9}
          strokeDasharray="3 2"
          className="text-muted-foreground"
        />

        {beamBars.map((bar) => {
          const barY = (bar.p0[1] + bar.p1[1]) / 2;
          const barZ = (bar.p0[2] + bar.p1[2]) / 2;
          const cx = rectX + rectW / 2 + (barY - yMid) * scale;
          const cy = rectY + (zTop - barZ) * scale;
          const r = Math.max(2.1, (bar.dia / 2) * scale);
          const onActiveFace = isFaceBar(bar, face);
          const tone =
            bar.status === "fail"
              ? "text-fail"
              : onActiveFace
                ? "text-foreground"
                : "text-steel";
          return (
            <circle
              key={bar.id}
              cx={cx}
              cy={cy}
              r={r}
              fill="currentColor"
              fillOpacity={onActiveFace ? 0.95 : 0.45}
              className={tone}
            />
          );
        })}
      </svg>
      <span className="font-num text-xs font-medium text-foreground">{faceSummary}</span>
    </div>
  );
}
