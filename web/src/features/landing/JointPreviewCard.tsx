import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { StatusPill } from "../../components/StatusPill";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";

export function JointPreviewCard() {
  const [view, setView] = useState<"before" | "after">("before");
  const isBefore = view === "before";

  // Scaled schematic of real IIT Hyderabad joint C1 (200 x 450 mm) x XB17 (200 x 450 mm)
  const colCorners = [
    { cx: 112, cy: 52 },
    { cx: 188, cy: 52 },
    { cx: 112, cy: 208 },
    { cx: 188, cy: 208 },
  ];
  const faceYs = isBefore ? [104, 156] : [116, 144];
  const colFaces = [
    { cx: 112, cy: faceYs[0] },
    { cx: 188, cy: faceYs[0] },
    { cx: 112, cy: faceYs[1] },
    { cx: 188, cy: faceYs[1] },
  ];

  const beamBars = isBefore
    ? [
        { y: 104, dia: 5, fail: true },
        { y: 121, dia: 6, fail: true },
        { y: 139, dia: 6, fail: true },
        { y: 156, dia: 5, fail: true },
      ]
    : [
        { y: 92, dia: 6, fail: false },
        { y: 168, dia: 6, fail: false },
      ];

  return (
    <section
      aria-label="Live joint geometry proof preview"
      className="min-w-0 rounded-[var(--radius-lg)] border border-border bg-surface p-4 sm:p-5 space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-num text-xs text-muted-foreground">
            IIT Hyderabad Residence · C1 × XB17 · First Floor
          </p>
          <h2 className="font-display text-base font-semibold text-foreground">
            {isBefore ? "As drawn: 9 checks fail in 3D" : "Verified fix: passes without redesign"}
          </h2>
        </div>
        <StatusPill status={isBefore ? "fail" : "pass"} count={isBefore ? 9 : undefined} size="sm" />
      </div>

      <div
        role="group"
        aria-label="Toggle before and after detailing preview"
        className="inline-flex rounded-[var(--radius-md)] border border-control-border bg-surface-sunken p-0.5"
      >
        <button
          type="button"
          aria-pressed={isBefore}
          onClick={() => setView("before")}
          className={`rounded-[var(--radius-sm)] px-3 py-1 text-xs font-medium transition-colors duration-[var(--dur-1)] cursor-pointer ${
            isBefore
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Before (as drawn)
        </button>
        <button
          type="button"
          aria-pressed={!isBefore}
          onClick={() => setView("after")}
          className={`rounded-[var(--radius-sm)] px-3 py-1 text-xs font-medium transition-colors duration-[var(--dur-1)] cursor-pointer ${
            !isBefore
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          After (Option #1)
        </button>
      </div>

      <div className="hairline-grid relative overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface-sunken p-3">
        <svg
          viewBox="0 0 300 260"
          role="img"
          aria-label={
            isBefore
              ? "Plan schematic of column C1 200 by 450 mm and crossing beam XB17 showing 7 mm bar clashes at the column face bars and 24.7 mm top bar spacing against a 25 mm minimum"
              : "Plan schematic of column C1 200 by 450 mm and crossing beam XB17 showing layer-split top bars and C1 face bars shifted to plus or minus 40 mm clear of beam bars"
          }
          className="mx-auto h-52 w-full max-w-sm"
        >
          {/* Beam concrete outline */}
          <rect
            x="20"
            y="74"
            width="260"
            height="112"
            rx="4"
            fill="var(--concrete)"
            fillOpacity="0.1"
            stroke="var(--border-strong)"
            strokeWidth="1.25"
            strokeDasharray="4 3"
          />
          {/* Column concrete outline (200 x 450 scaled) */}
          <rect
            x="92"
            y="26"
            width="116"
            height="208"
            rx="4"
            fill="var(--concrete)"
            fillOpacity="0.16"
            stroke="var(--border-strong)"
            strokeWidth="1.5"
          />
          {/* Column tie loop */}
          <rect
            x="104"
            y="42"
            width="92"
            height="176"
            rx="6"
            fill="none"
            stroke="var(--steel)"
            strokeOpacity="0.6"
            strokeWidth="1.25"
          />

          {/* Beam crossing bars */}
          {beamBars.map((bar, i) => (
            <line
              key={`beam-${i}`}
              x1="26"
              y1={bar.y}
              x2="274"
              y2={bar.y}
              stroke={bar.fail ? "var(--fail)" : "var(--pass)"}
              strokeWidth={bar.dia * 0.75}
              strokeLinecap="round"
              strokeOpacity="0.9"
            />
          ))}

          {/* Column 16 mm corner bars */}
          {colCorners.map((pt, i) => (
            <circle
              key={`corner-${i}`}
              cx={pt.cx}
              cy={pt.cy}
              r="6.5"
              fill="var(--steel)"
              stroke="var(--surface-sunken)"
              strokeWidth="1.5"
            />
          ))}

          {/* Column 12 mm face bars */}
          {colFaces.map((pt, i) => (
            <g key={`face-${i}`}>
              {isBefore && (
                <circle
                  cx={pt.cx}
                  cy={pt.cy}
                  r="12"
                  fill="none"
                  stroke="var(--fail)"
                  strokeWidth="1.5"
                  strokeDasharray="3 2"
                />
              )}
              <circle
                cx={pt.cx}
                cy={pt.cy}
                r="5.5"
                fill={isBefore ? "var(--fail)" : "var(--pass)"}
                stroke="var(--surface-sunken)"
                strokeWidth="1.5"
              />
            </g>
          ))}
        </svg>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2.5 text-xs">
          {isBefore ? (
            <>
              <Badge variant="fail" className="font-num whitespace-normal">
                7 mm overlap · Geometry (8×)
              </Badge>
              <Badge variant="fail" className="font-num whitespace-normal">
                24.7 mm · needs 25 · IS 456 cl. 26.3.2
              </Badge>
            </>
          ) : (
            <>
              <Badge variant="pass" className="font-num whitespace-normal">
                C1 face bars at y = -40, 40 mm
              </Badge>
              <Badge variant="advisory" className="font-num whitespace-normal">
                Recheck · d: 410 → 395 mm
              </Badge>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {isBefore
            ? "C1 200 × 450 mm (4-16 corners + 4-12 faces) · XB17 top 2-12 + 2-16"
            : "XB17 top 2-16 in layer 1, 2-12 in layer 2; 5 mm placing tolerance noted"}
        </span>
        <Button variant="outline" size="sm" asChild>
          <Link to="/demo/iit">
            <span>Inspect in 3D</span>
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </section>
  );
}
