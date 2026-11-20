import { forwardRef, useImperativeHandle, useRef } from "react";
import {
  resolveCalloutLayout,
  type CalloutInput,
  type IndexedFinding,
} from "../../lib/calloutLayout";
import { formatCalloutValue, formatClause } from "../../lib/format";
import type { LabelMode } from "../../stores/workspace";
import type { Finding } from "../../types/bundle";
import type { SceneController } from "./SceneController";

export interface ViewportCalloutsHandle {
  updatePositions: (ctrl: SceneController, size: { width: number; height: number }) => void;
}

interface ViewportCalloutsProps {
  visibleFindings: IndexedFinding[];
  mirroredFindings: IndexedFinding[];
  overflowCount: number;
  labelMode: LabelMode;
  selectedFindingIndex: number | null;
  onSelectFinding: (f: Finding, index: number) => void;
  onOpenOverflow: () => void;
}

export const ViewportCallouts = forwardRef<ViewportCalloutsHandle, ViewportCalloutsProps>(
  function ViewportCallouts(
    {
      visibleFindings,
      mirroredFindings,
      overflowCount,
      labelMode,
      selectedFindingIndex,
      onSelectFinding,
      onOpenOverflow,
    },
    ref,
  ) {
    const buttonRefs = useRef<Map<number, HTMLButtonElement | null>>(new Map());
    const lineRefs = useRef<Map<number, SVGLineElement | null>>(new Map());
    const dotRefs = useRef<Map<number, SVGCircleElement | null>>(new Map());

    useImperativeHandle(ref, () => ({
      updatePositions: (ctrl, size) => {
        const inputs: CalloutInput[] = [];
        for (const { f, index } of visibleFindings) {
          const btn = buttonRefs.current.get(index);
          const line = lineRefs.current.get(index);
          const dot = dotRefs.current.get(index);
          if (!f.at) continue;
          const pos = ctrl.projectWorld(f.at);
          if (!pos.visible) {
            if (btn) btn.style.display = "none";
            if (line) line.style.display = "none";
            if (dot) dot.style.display = "none";
            continue;
          }
          if (btn) {
            inputs.push({
              id: index,
              ax: pos.x,
              ay: pos.y,
              width: btn.offsetWidth || 220,
              height: btn.offsetHeight || 26,
            });
          }
        }

        const placed = resolveCalloutLayout(inputs, size);
        for (const p of placed) {
          const btn = buttonRefs.current.get(p.id);
          const line = lineRefs.current.get(p.id);
          const dot = dotRefs.current.get(p.id);
          if (btn) {
            btn.style.display = "";
            btn.style.transform = `translate3d(${p.lx}px, ${p.ly}px, 0)`;
          }
          if (dot) {
            dot.style.display = "";
            dot.setAttribute("cx", String(Math.round(p.ax * 10) / 10));
            dot.setAttribute("cy", String(Math.round(p.ay * 10) / 10));
          }
          if (line) {
            const dist = Math.hypot(p.ex - p.ax, p.ey - p.ay);
            if (dist < 4) {
              line.style.display = "none";
            } else {
              line.style.display = "";
              line.setAttribute("x1", String(Math.round(p.ax * 10) / 10));
              line.setAttribute("y1", String(Math.round(p.ay * 10) / 10));
              line.setAttribute("x2", String(p.ex));
              line.setAttribute("y2", String(p.ey));
            }
          }
        }
      },
    }), [visibleFindings]);

    return (
      <>
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          aria-hidden="true"
        >
          {visibleFindings.map(({ f, index }) => {
            const active = selectedFindingIndex === index;
            const toneClass = active
              ? "text-ring"
              : f.status === "fail"
                ? "text-fail"
                : "text-pass";
            return (
              <g key={`leader-${f.rule}-${index}`} className={toneClass}>
                <line
                  ref={(el) => {
                    lineRefs.current.set(index, el);
                  }}
                  stroke="currentColor"
                  strokeOpacity={active ? 0.95 : 0.65}
                  strokeWidth={active ? 1.75 : 1.25}
                  style={{ display: "none" }}
                />
                <circle
                  ref={(el) => {
                    dotRefs.current.set(index, el);
                  }}
                  r={active ? 3.5 : 2.5}
                  fill="currentColor"
                  style={{ display: "none" }}
                />
              </g>
            );
          })}
        </svg>

        <div className="pointer-events-none absolute inset-0">
          {visibleFindings.map(({ f, index }) => {
            const active = selectedFindingIndex === index;
            return (
              <button
                key={`${f.rule}-${index}`}
                type="button"
                data-callout-index={index}
                ref={(el) => {
                  buttonRefs.current.set(index, el);
                }}
                onClick={() => onSelectFinding(f, index)}
                className={`pointer-events-auto absolute top-0 left-0 inline-flex items-center gap-1.5 rounded-[var(--radius-xs)] border px-1.5 py-0.5 font-num text-xs font-medium whitespace-nowrap shadow-[var(--shadow-overlay)] cursor-pointer ${
                  active
                    ? "border-ring bg-primary text-primary-foreground"
                    : f.status === "fail"
                      ? "border-fail/60 bg-surface-raised/95 text-fail hover:border-fail"
                      : "border-pass/60 bg-surface-raised/95 text-pass hover:border-pass"
                }`}
                title={f.message}
              >
                <span>{formatCalloutValue(f)}</span>{" "}
                <span className={active ? "text-primary-foreground" : "text-muted-foreground"}>
                  · {formatClause(f.clause)}
                </span>
              </button>
            );
          })}

          {overflowCount > 0 && labelMode !== "hidden" && (
            <button
              type="button"
              onClick={onOpenOverflow}
              className="pointer-events-auto absolute right-3 bottom-3 rounded-[var(--radius-md)] border border-control-border bg-surface-raised/95 px-2.5 py-1 font-num text-xs font-medium text-foreground shadow-[var(--shadow-overlay)] hover:bg-surface cursor-pointer"
            >
              +{overflowCount} more
            </button>
          )}
        </div>

        {/* Mirrored accessible summary of 3D callouts */}
        <ul aria-label="Callout findings" className="sr-only">
          {mirroredFindings.map(({ f, index }) => (
            <li key={`sr-${f.rule}-${index}`}>
              {formatCalloutValue(f)} ({formatClause(f.clause)}): {f.message}
            </li>
          ))}
        </ul>
      </>
    );
  },
);
