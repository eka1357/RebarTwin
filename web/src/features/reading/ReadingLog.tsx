import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { EASE } from "../../lib/motion";

export interface ReadingLogEntry {
  id: string;
  timestamp: string;
  kind: "info" | "done" | "joint" | "error";
  message: string;
}

interface ReadingLogProps {
  entries: ReadingLogEntry[];
}

/**
 * Step list matching Manus/agent replay style: newest at the bottom,
 * auto-follows unless the user scrolled up manually.
 */
export function ReadingLog({ entries }: ReadingLogProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pinnedRef = useRef(true);
  const reduced = Boolean(useReducedMotion());

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 28;
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (el && pinnedRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [entries.length]);

  return (
    <section aria-label="Reading event log" className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold text-foreground">Reading log</h2>
        <span className="font-num text-xs text-muted-foreground">{entries.length} events</span>
      </div>

      <div
        ref={scrollRef}
        role="log"
        aria-label="Reading steps"
        aria-live="off"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        onScroll={handleScroll}
        className="max-h-56 overflow-y-auto rounded-[var(--radius-md)] border border-border bg-surface-sunken p-2.5 space-y-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {entries.length === 0 ? (
          <p className="text-xs text-muted-foreground">Waiting for sheet events.</p>
        ) : (
          entries.map((entry) => (
            <motion.div
              key={entry.id}
              initial={reduced ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduced ? { duration: 0 } : { duration: 0.16, ease: EASE.standard }}
              className="flex items-start gap-2 rounded-[var(--radius-xs)] border border-border/60 bg-surface px-2.5 py-1.5 text-xs"
            >
              <span className="font-num shrink-0 text-muted-foreground">{entry.timestamp}</span>
              <span
                className={
                  entry.kind === "error"
                    ? "font-medium text-fail"
                    : entry.kind === "joint"
                      ? "font-medium text-pass"
                      : "text-foreground"
                }
              >
                {entry.message}
              </span>
            </motion.div>
          ))
        )}
      </div>
    </section>
  );
}
