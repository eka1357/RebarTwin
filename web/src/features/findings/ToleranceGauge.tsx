import { motion } from "motion/react";
import { useId } from "react";
import { describeToleranceGauge, formatFindingValue, formatNumber } from "../../lib/format";
import { EASE } from "../../lib/motion";
import type { Finding } from "../../types/bundle";

interface ToleranceGaugeProps {
  finding: Pick<Finding, "rule" | "measured" | "limit" | "compare" | "unit" | "status">;
}

/**
 * Architectural tolerance scale showing measured diamond relative to code limit tick,
 * with a hatched wrong-side zone and a plain sentence aria-label.
 */
export function ToleranceGauge({ finding }: ToleranceGaugeProps) {
  const uid = useId().replace(/:/g, "");
  const hatchId = `gauge-hatch-${uid}`;
  const isClash = finding.rule === "GEOM-CLASH" && finding.measured < 0;

  const leftX = 16;
  const rightX = 304;
  const width = rightX - leftX;

  let limitX: number;
  let markerX: number;
  let hatchStartX: number;
  let hatchWidth: number;
  let limitLabel: string;

  if (isClash) {
    limitX = leftX + Math.round(width * 0.38);
    const span = Math.max(Math.abs(finding.measured) * 1.35, 25);
    const frac = Math.min(1, Math.abs(finding.measured) / span);
    markerX = limitX - frac * (limitX - (leftX + 6));
    hatchStartX = leftX;
    hatchWidth = limitX - leftX;
    limitLabel = "0";
  } else {
    const domainMin = 0;
    const domainMax = Math.max(finding.limit * 1.65, finding.measured * 1.15, finding.limit + 10, 1);
    const ratioLimit = (finding.limit - domainMin) / (domainMax - domainMin);
    const ratioMeas = Math.min(1, Math.max(0, (finding.measured - domainMin) / (domainMax - domainMin)));
    limitX = leftX + ratioLimit * width;
    markerX = leftX + ratioMeas * width;

    if (finding.compare === "<=") {
      hatchStartX = limitX;
      hatchWidth = rightX - limitX;
    } else {
      hatchStartX = leftX;
      hatchWidth = limitX - leftX;
    }
    limitLabel = formatNumber(finding.limit, {
      maximumFractionDigits: Number.isInteger(finding.limit) ? 0 : 1,
    });
  }

  const toneClass = finding.status === "fail" ? "text-fail" : "text-pass";
  const labelText = describeToleranceGauge(finding);
  const measuredShort = formatFindingValue(finding);

  return (
    <div className="mt-2">
      <svg
        role="img"
        aria-label={labelText}
        viewBox="0 0 320 42"
        className="h-10 w-full overflow-visible select-none"
      >
        <defs>
          <pattern
            id={hatchId}
            width="6"
            height="6"
            patternTransform="rotate(45 0 0)"
            patternUnits="userSpaceOnUse"
          >
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeOpacity="0.32"
              className="text-fail"
            />
          </pattern>
        </defs>

        {/* Hatched wrong side of limit */}
        <rect
          x={hatchStartX}
          y={8}
          width={Math.max(0, hatchWidth)}
          height={10}
          rx={1}
          fill={`url(#${hatchId})`}
        />

        {/* Hairline full track */}
        <line
          x1={leftX}
          y1={13}
          x2={rightX}
          y2={13}
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-border-strong"
        />

        {/* Limit tick */}
        <line
          x1={limitX}
          y1={5}
          x2={limitX}
          y2={21}
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-foreground"
        />
        <text
          x={limitX}
          y={36}
          textAnchor="middle"
          className="fill-muted-foreground font-num text-xs"
        >
          {limitLabel}
        </text>

        {/* Measured diamond marker settling in 160 ms */}
        <motion.g
          initial={false}
          animate={{ x: markerX, y: 13 }}
          transition={{ duration: 0.16, ease: EASE.standard }}
          className={toneClass}
        >
          <polygon points="0,-6 6,0 0,6 -6,0" fill="currentColor" />
        </motion.g>

        {/* Right-aligned measured readout on baseline */}
        <text
          x={rightX}
          y={36}
          textAnchor="end"
          className={`font-num text-xs font-medium ${finding.status === "fail" ? "fill-fail" : "fill-pass"}`}
        >
          {measuredShort}
        </text>
      </svg>
    </div>
  );
}
