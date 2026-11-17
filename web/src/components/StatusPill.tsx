import { AlertTriangle, CheckCircle2, HelpCircle, Maximize2, RotateCcw } from "lucide-react";
import { cn } from "../lib/utils";

export type StatusKind = "fail" | "pass" | "to_check" | "recheck" | "redesign";

const CONFIG: Record<StatusKind, { label: string; classes: string; Icon: typeof AlertTriangle }> = {
  fail: {
    label: "Fails",
    classes: "bg-fail-surface text-fail border-fail/40",
    Icon: AlertTriangle,
  },
  pass: {
    label: "Passes",
    classes: "bg-pass-surface text-pass border-pass/40",
    Icon: CheckCircle2,
  },
  to_check: {
    label: "To check",
    classes: "bg-check-surface text-check border-check/40",
    Icon: HelpCircle,
  },
  recheck: {
    label: "Recheck",
    classes: "bg-advisory-surface text-advisory border-advisory/40",
    Icon: RotateCcw,
  },
  redesign: {
    label: "Redesign",
    classes: "bg-advisory-surface text-advisory border-advisory/40",
    Icon: Maximize2,
  },
};

export function StatusPill({
  status,
  size = "md",
  count,
  className,
}: {
  status: StatusKind;
  size?: "sm" | "md";
  count?: number;
  className?: string;
}) {
  const { label, classes, Icon } = CONFIG[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[var(--radius-xs)] border font-medium whitespace-nowrap",
        size === "sm" ? "h-5 px-1.5 text-xs" : "h-6 px-2 text-xs",
        classes,
        className,
      )}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span>{count !== undefined ? `${count} ${label}` : label}</span>
    </span>
  );
}
