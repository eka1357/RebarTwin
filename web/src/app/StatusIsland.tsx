import { Activity, ChevronDown } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { Link, useLocation } from "react-router";
import { StatusPill } from "../components/StatusPill";
import { getTransition, SPRING_PANEL } from "../lib/motion";
import { jointPath, projectPath, projectReviewPath } from "../lib/routes";
import { useWorkspaceStore } from "../stores/workspace";

export function StatusIsland() {
  const [expanded, setExpanded] = useState(false);
  const { pathname } = useLocation();
  const status = useWorkspaceStore((s) => s.status);
  const reduced = useReducedMotion();

  const isIitDemo = pathname === "/demo/iit" || pathname.startsWith("/demo/iit/") || pathname.startsWith("/projects/iit-demo");
  const projMatch = /^\/projects\/([^/]+)/.exec(pathname);
  const jointMatch = /^\/projects\/[^/]+\/joints\/([^/]+)/.exec(pathname);
  let activeProject = isIitDemo ? "iit-demo" : "c4-b12";
  if (projMatch?.[1]) {
    try {
      activeProject = decodeURIComponent(projMatch[1]);
    } catch {
      activeProject = projMatch[1];
    }
  }
  let activeJoint: string | null = null;
  if (jointMatch?.[1]) {
    try {
      activeJoint = decodeURIComponent(jointMatch[1]);
    } catch {
      activeJoint = jointMatch[1];
    }
  }

  const primaryHref = isIitDemo
    ? "/demo/iit"
    : activeProject === "c4-b12"
      ? "/demo"
      : activeJoint
        ? jointPath(activeProject, activeJoint)
        : projectPath(activeProject);
  const primaryLabel =
    !isIitDemo && activeProject === "c4-b12"
      ? "Open demo"
      : isIitDemo || activeJoint
        ? "Open joint"
        : "Open project";
  const reviewHref = projectReviewPath(activeProject);

  const pillStatus =
    status.failCount > 0 ? "fail" : status.toCheckCount > 0 ? "to_check" : "pass";
  const failPhrase =
    status.failCount > 0
      ? `${status.failCount} fails`
      : status.toCheckCount > 0
        ? "To check"
        : "Passes";
  const accessibleSummary = `${failPhrase}, ${status.toCheckCount} to check, zone ${status.zone}, IS 13920 ${status.is13920 ? "on" : "off"
    }`;
  const inlineSummary = `${status.toCheckCount} to check · zone ${status.zone} · IS 13920 ${status.is13920 ? "on" : "off"
    }`;
  const fullSummary = `${failPhrase} · ${inlineSummary}`;

  return (
    <div className="relative">
      <motion.button
        type="button"
        layout={!reduced}
        transition={getTransition(reduced, SPRING_PANEL)}
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={status.activity ?? accessibleSummary}
        className="inline-flex h-8 items-center gap-2 rounded-[var(--radius-md)] border border-control-border bg-surface-raised px-2.5 text-xs text-foreground hover:bg-surface cursor-pointer"
      >
        {status.activity ? (
          <Activity className="h-3.5 w-3.5 text-check" aria-hidden="true" />
        ) : (
          <span aria-hidden="true" className="inline-flex items-center">
            <StatusPill
              status={pillStatus}
              size="sm"
              count={status.failCount > 0 ? status.failCount : undefined}
            />
          </span>
        )}
        {" "}
        <span aria-hidden="true" className="font-num hidden xl:inline-flex items-center gap-1.5 text-muted-foreground">
          {status.activity ? (
            status.activity
          ) : (
            <>
              <span>{status.toCheckCount} to check</span>{" "}
              <span className="h-1 w-1 rounded-full bg-muted-foreground/60" />{" "}
              <span>zone {status.zone}</span>{" "}
              <span className="h-1 w-1 rounded-full bg-muted-foreground/60" />{" "}
              <span>IS 13920 {status.is13920 ? "on" : "off"}</span>
            </>
          )}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-[var(--dur-1)] ${expanded ? "rotate-180" : ""
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
                status={pillStatus}
                size="sm"
                count={status.failCount > 0 ? status.failCount : undefined}
              />
            </div>
            <p className="mt-1.5 font-num text-xs text-muted-foreground">{fullSummary}</p>
            <div className="mt-3 flex items-center gap-2">
              <Link
                to={primaryHref}
                onClick={() => setExpanded(false)}
                className="inline-flex h-7 items-center rounded-[var(--radius-sm)] bg-primary px-2.5 text-xs font-medium text-primary-foreground"
              >
                {primaryLabel}
              </Link>
              <Link
                to={reviewHref}
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
