import { motion } from "motion/react";
import { useId } from "react";
import { describeToleranceGauge, formatFindingValue, formatNumber } from "../../lib/format";
import { EASE } from "../../lib/motion";
import type { Finding } from "../../types/bundle";

interface ToleranceGaugeProps {
  finding: Pick<Finding, "rule" | "measured" | "limit" | "compare" | "margin" | "unit" | "status">;
}

function clampLabelX(cx: number, halfW: number): number {
  return Math.min(Math.max(cx, 6 + halfW), 314 - halfW);
}

/**
 * Architectural tolerance scale showing measured diamond relative to code limit tick,
 * with measured value placed under its diamond, "needs <limit>" / "max <limit>" under
 * the limit tick (automatically staggered vertically when labels would collide), and a
 * plain sentence aria-label.
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
    limitLabel = "needs 0";
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
    const limitNum = formatNumber(finding.limit, {
      maximumFractionDigits: Number.isInteger(finding.limit) ? 0 : 1,
    });
    limitLabel = `${finding.compare === "<=" ? "max" : "needs"} ${limitNum}`;
  }

  const toneClass = finding.status === "fail" ? "text-fail" : "text-pass";
  const labelText = describeToleranceGauge(finding);
  const measuredShort = formatFindingValue(finding);

  const measHalfW = Math.max(22, measuredShort.length * 3.8 + 4);
  const limHalfW = Math.max(24, limitLabel.length * 3.8 + 4);
  const measTextX = clampLabelX(markerX, measHalfW);
  const limTextX = clampLabelX(limitX, limHalfW);

  const collides = !(
    measTextX + measHalfW + 10 <= limTextX - limHalfW ||
    limTextX + limHalfW + 10 <= measTextX - measHalfW
  );

  const measuredY = 34;
  const limitY = collides ? 50 : 34;
  const viewHeight = collides ? 58 : 42;
  const stemClearOfMeasured = Math.abs(limitX - measTextX) > measHalfW + 6;

  return (
    <div className="mt-2 print:mt-0.5">
      <svg
        role="img"
        aria-label={labelText}
        viewBox={`0 0 320 ${viewHeight}`}
        className={`${collides ? "h-14 print:h-11" : "h-10 print:h-8"} w-full overflow-visible select-none`}
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
          aria-hidden="true"
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
          aria-hidden="true"
        />

        {/* Limit tick + optional staggered guide */}
        <line
          x1={limitX}
          y1={5}
          x2={limitX}
          y2={21}
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-foreground"
          aria-hidden="true"
        />
        {collides && stemClearOfMeasured && (
          <line
            x1={limitX}
            y1={21}
            x2={limTextX}
            y2={39}
            stroke="currentColor"
            strokeWidth="1"
            strokeDasharray="2 2"
            strokeOpacity="0.45"
            className="text-muted-foreground"
            aria-hidden="true"
          />
        )}

        {/* Measured diamond marker settling in 160 ms */}
        <motion.g
          initial={false}
          animate={{ x: markerX, y: 13 }}
          transition={{ duration: 0.16, ease: EASE.standard }}
          className={toneClass}
          aria-hidden="true"
        >
          <polygon points="0,-6 6,0 0,6 -6,0" fill="currentColor" />
        </motion.g>

        {/* Measured label anchored under the diamond */}
        <text
          x={measTextX}
          y={measuredY}
          textAnchor="middle"
          data-gauge-role="measured"
          data-marker-x={Math.round(markerX)}
          aria-hidden="true"
          className={`font-num text-xs font-medium ${finding.status === "fail" ? "fill-fail" : "fill-pass"}`}
        >
          {measuredShort}
        </text>

        {/* Limit label anchored under the limit tick */}
        <text
          x={limTextX}
          y={limitY}
          textAnchor="middle"
          data-gauge-role="limit"
          data-limit-x={Math.round(limitX)}
          aria-hidden="true"
          className="fill-muted-foreground font-num text-xs"
        >
          {limitLabel}
        </text>
      </svg>
    </div>
  );
}
