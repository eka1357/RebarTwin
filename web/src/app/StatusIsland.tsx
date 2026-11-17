import { Activity, ChevronDown } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { Link } from "react-router";
import { StatusPill } from "../components/StatusPill";
import { getTransition, SPRING_PANEL } from "../lib/motion";
import { useWorkspaceStore } from "../stores/workspace";

export function StatusIsland() {
  const [expanded, setExpanded] = useState(false);
  const status = useWorkspaceStore((s) => s.status);
  const reduced = useReducedMotion();

  const summary = `${status.failCount} fail · ${status.toCheckCount} to check · zone ${status.zone} · IS 13920 ${
    status.is13920 ? "on" : "off"
  }`;
  const inlineSummary = `${status.toCheckCount} to check · zone ${status.zone} · IS 13920 ${
    status.is13920 ? "on" : "off"
  }`;

  return (
    <div className="relative">
      <motion.button
        type="button"
        layout={!reduced}
        transition={getTransition(reduced, SPRING_PANEL)}
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="inline-flex h-8 items-center gap-2 rounded-[var(--radius-md)] border border-control-border bg-surface-raised px-2.5 text-xs text-foreground hover:bg-surface cursor-pointer"
      >
        <span className="sr-only">Joint status: </span>
        {status.activity ? (
          <Activity className="h-3.5 w-3.5 text-check" aria-hidden="true" />
        ) : (
          <StatusPill
            status={status.failCount > 0 ? "fail" : "pass"}
            size="sm"
            count={status.failCount > 0 ? status.failCount : undefined}
          />
        )}
        <span className="font-num hidden xl:inline text-muted-foreground">
          {status.activity ?? inlineSummary}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-[var(--dur-1)] ${
            expanded ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        />
      </motion.button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={reduced ? { opacity: 1 } : { opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.98 }}
            transition={getTransition(reduced, SPRING_PANEL)}
            className="absolute right-0 top-10 z-50 w-72 rounded-[var(--radius-lg)] border border-border-strong bg-surface-raised p-3.5 shadow-[var(--shadow-overlay)]"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-display text-sm font-semibold">{status.jointLabel}</span>
              <StatusPill
                status={status.failCount > 0 ? "fail" : "pass"}
                size="sm"
                count={status.failCount > 0 ? status.failCount : undefined}
              />
            </div>
            <p className="mt-1.5 font-num text-xs text-muted-foreground">{summary}</p>
            <div className="mt-3 flex items-center gap-2">
              <Link
                to="/demo"
                onClick={() => setExpanded(false)}
                className="inline-flex h-7 items-center rounded-[var(--radius-sm)] bg-primary px-2.5 text-xs font-medium text-primary-foreground"
              >
                Open demo
              </Link>
              <Link
                to="/projects/c4-b12/review"
                onClick={() => setExpanded(false)}
                className="inline-flex h-7 items-center rounded-[var(--radius-sm)] border border-control-border px-2.5 text-xs font-medium text-foreground hover:bg-surface"
              >
                To check ({status.toCheckCount})
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
