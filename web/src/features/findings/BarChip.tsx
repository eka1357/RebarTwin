import { AlertTriangle } from "lucide-react";
import { describeBarFull } from "../../lib/a11y";
import { formatBarMark } from "../../lib/format";
import type { SceneBar } from "../../types/bundle";

interface BarChipProps {
  bar: SceneBar;
  active?: boolean;
  onSelect: () => void;
  onHover: (hovering: boolean) => void;
}

/** Interactive bar pill with status indicator, short mark (T1-3 ⌀20), and full SR name. */
export function BarChip({ bar, active = false, onSelect, onHover }: BarChipProps) {
  const isFail = bar.status === "fail";
  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-[var(--radius-xs)] border px-2 py-0.5 font-num text-xs font-medium transition-colors duration-[var(--dur-1)] cursor-pointer ${
        active
          ? "border-ring bg-primary text-primary-foreground"
          : isFail
            ? "border-fail/40 bg-fail-surface text-fail hover:border-fail"
            : "border-border bg-surface text-foreground hover:border-control-border"
      }`}
    >
      <span className="sr-only">{describeBarFull(bar)}</span>
      {isFail ? (
        <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
      ) : (
        <span className="h-2 w-2 shrink-0 rounded-full bg-steel" aria-hidden="true" />
      )}
      <span aria-hidden="true">{formatBarMark(bar.id, bar.dia)}</span>
    </button>
  );
}
