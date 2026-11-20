import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";
import { StatusPill } from "../components/StatusPill";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/ui/skeleton";
import { ToCheckCard } from "../features/review/ToCheckCard";
import {
  getProject,
  getToCheck,
  resolveToCheckItem,
  type ToCheckItem,
} from "../lib/api";
import { isBlockingItem, sortToCheckQueue } from "../lib/calloutGrammar";
import { formatNumber } from "../lib/format";
import { jointPath, projectPath } from "../lib/routes";
import { useWorkspaceStore } from "../stores/workspace";

const PAGE_SIZE = 12;

export function ReviewRoute() {
  const { id = "c4-b12" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const jointFilter = searchParams.get("joint");
  const queryClient = useQueryClient();
  const setStatus = useWorkspaceStore((s) => s.setStatus);

  const [activeIndex, setActiveIndex] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);
  const [announcement, setAnnouncement] = useState("");
  const cardRefs = useRef<Map<string, HTMLElement | null>>(new Map());

  const isOfflineDemo = id === "c4-b12" || id === "iit-demo";
  const {
    data: rawItems,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["to-check", id],
    queryFn: () => getToCheck(id),
    enabled: !isOfflineDemo,
    retry: false,
  });

  const { data: project } = useQuery({
    queryKey: ["project", id],
    queryFn: () => getProject(id),
    enabled: !isOfflineDemo,
    retry: false,
  });

  const allItems = useMemo(() => (rawItems ? sortToCheckQueue(rawItems) : []), [rawItems]);
  const items = useMemo(() => {
    if (!jointFilter) return allItems;
    const matchedJoint = project?.joints.find((j) => j.id === jointFilter);
    const blockingIds = new Set(matchedJoint?.blocking_item_ids ?? []);
    const filtered = allItems.filter(
      (t) => t.project_level || t.joint === jointFilter || blockingIds.has(t.id),
    );
    return filtered.length > 0 ? filtered : allItems;
  }, [allItems, jointFilter, project]);
  const unresolvedCount = useMemo(
    () => items.filter((t) => !t.resolution).length,
    [items],
  );
  const blockingUnresolvedCount = useMemo(
    () => items.filter((t) => !t.resolution && isBlockingItem(t)).length,
    [items],
  );
  const nonBlockingUnresolvedCount = Math.max(0, unresolvedCount - blockingUnresolvedCount);
  const projectBlockersCount = useMemo(
    () => items.filter((t) => !t.resolution && t.project_level).length,
    [items],
  );

  const safeIndex = Math.min(Math.max(0, activeIndex), Math.max(0, items.length - 1));
  const activeItem = items[safeIndex] ?? null;

  useEffect(() => {
    if (!rawItems) return;
    setStatus({ toCheckCount: blockingUnresolvedCount, activity: null });
  }, [rawItems, blockingUnresolvedCount, setStatus]);

  const focusNextUnresolved = useCallback(
    (list: ToCheckItem[], afterIdx: number) => {
      for (let offset = 1; offset <= list.length; offset++) {
        const candidateIdx = (afterIdx + offset) % list.length;
        if (!list[candidateIdx]?.resolution) {
          setActiveIndex(candidateIdx);
          return;
        }
      }
    },
    [],
  );

  const mutation = useMutation({
    mutationFn: ({ itemId, value }: { itemId: string; value: string }) =>
      resolveToCheckItem(id, itemId, value),
    onSuccess: (res, vars) => {
      setEditingId(null);
      void queryClient.invalidateQueries({ queryKey: ["to-check", id] });
      void queryClient.invalidateQueries({ queryKey: ["project", id] });
      const msg =
        res.checked_joints.length > 0
          ? `Confirmed ${res.resolved_value}. Checked ${res.checked_joints.join(", ")}.`
          : `Confirmed ${res.resolved_value}. ${res.remaining_to_check} remaining.`;
      toast.success(msg);
      setAnnouncement(msg);
      const idx = items.findIndex((t) => t.id === vars.itemId);
      if (idx >= 0) focusNextUnresolved(items, idx);
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : "Could not save resolution.";
      toast.error(msg);
      setAnnouncement(msg);
    },
  });

  const moveFocus = useCallback(
    (delta: number) => {
      if (items.length === 0) return;
      setEditingId(null);
      const next = Math.min(Math.max(0, safeIndex + delta), items.length - 1);
      setActiveIndex(next);
      const nextItem = items[next];
      if (nextItem) {
        cardRefs.current.get(nextItem.id)?.scrollIntoView?.({ block: "nearest" });
      }
    },
    [items, safeIndex],
  );

  const skipActive = useCallback(() => {
    if (!activeItem || items.length <= 1) return;
    setEditingId(null);
    focusNextUnresolved(items, safeIndex);
    setAnnouncement(`Skipped ${activeItem.member ?? activeItem.field}.`);
  }, [activeItem, items, safeIndex, focusNextUnresolved]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) {
        return;
      }
      if (!activeItem) return;

      if (e.key === "j" || e.key === "J" || e.key === "ArrowDown") {
        e.preventDefault();
        moveFocus(1);
      } else if (e.key === "k" || e.key === "K" || e.key === "ArrowUp") {
        e.preventDefault();
        moveFocus(-1);
      } else if ((e.key === "e" || e.key === "E") && !mutation.isPending && activeItem.reason !== "unsupported") {
        e.preventDefault();
        setEditingId((prev) => (prev === activeItem.id ? null : activeItem.id));
      } else if ((e.key === "s" || e.key === "S") && !mutation.isPending) {
        e.preventDefault();
        skipActive();
      } else if (e.key === "1" && activeItem.gemini?.value && !mutation.isPending && activeItem.reason !== "unsupported") {
        e.preventDefault();
        mutation.mutate({ itemId: activeItem.id, value: activeItem.gemini.value });
      } else if (e.key === "2" && activeItem.parser?.value && !mutation.isPending && activeItem.reason !== "unsupported") {
        e.preventDefault();
        mutation.mutate({ itemId: activeItem.id, value: activeItem.parser.value });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeItem, moveFocus, skipActive, mutation]);

  // Offline demo fallback for /projects/c4-b12/review or /projects/iit-demo/review
  if (!rawItems && !isLoading && (id === "c4-b12" || id === "iit-demo")) {
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold">To Check Queue</h1>
            <p className="text-sm text-muted-foreground">
              Disagreements between Gemini and the parser wait here for engineer confirmation.
            </p>
          </div>
          <StatusPill status="pass" count={0} />
        </div>
        <div data-theme="light" className="surface-paper rounded-[var(--radius-lg)] border p-6">
          <p className="text-sm text-foreground">
            Project <span className="font-num">{id}</span> has no unresolved items right now.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="default" size="sm" asChild>
              <Link to={id === "iit-demo" ? "/demo/iit" : "/demo"}>Open 3D joint</Link>
            </Button>
            <Button variant="paper" size="sm" asChild>
              <Link to={projectPath(id)}>Back to project</Link>
            </Button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">To Check Queue</h1>
          <p className="text-sm text-muted-foreground">
            {nonBlockingUnresolvedCount > 0 && !jointFilter
              ? `${formatNumber(blockingUnresolvedCount)} ${blockingUnresolvedCount === 1 ? "blocks a joint" : "block joints"} · ${formatNumber(nonBlockingUnresolvedCount)} ${nonBlockingUnresolvedCount === 1 ? "other reading" : "other readings"}, none blocking. Blocking items appear first. `
              : "Items that block joints appear first because they unlock checking. "}
            Shortcuts: 1 Gemini, 2 Parser, E edit, S skip, J/K move.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill
            status={blockingUnresolvedCount > 0 ? "to_check" : "pass"}
            count={blockingUnresolvedCount}
          />
          <Button variant="outline" size="sm" asChild>
            <Link to={projectPath(id)}>Project</Link>
          </Button>
        </div>
      </div>

      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-44 w-full" />
        </div>
      ) : error ? (
        <div className="rounded-[var(--radius-lg)] border border-fail/40 bg-fail-surface p-4 text-sm text-fail">
          {error instanceof Error ? error.message : "Could not load To check queue."}
        </div>
      ) : (
        <>
          {jointFilter && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-border bg-surface-raised px-3.5 py-2 text-xs">
              <span className="text-foreground">
                Showing items blocking joint <span className="font-num font-semibold">{jointFilter}</span>
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-xs"
                onClick={() => {
                  const next = new URLSearchParams(searchParams);
                  next.delete("joint");
                  setSearchParams(next, { replace: true });
                }}
              >
                Show all items ({allItems.length})
              </Button>
            </div>
          )}

          {projectBlockersCount > 0 && (
            <div className="rounded-[var(--radius-md)] border border-check/40 bg-check-surface px-3.5 py-2.5 text-xs text-check">
              {projectBlockersCount} project-level item(s) (zone, exposure, or general notes) block
              every joint until confirmed.
            </div>
          )}

          {unresolvedCount === 0 && items.length >= 0 && (
            <div className="rounded-[var(--radius-lg)] border border-pass/40 bg-pass-surface p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-pass">
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Every item resolved. Ready joints are unlocked and checked.</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {project?.joints
                  .filter((j) => j.bundle_ready)
                  .map((j) => (
                    <Button key={j.id} size="sm" asChild>
                      <Link to={jointPath(id, j.id)}>
                        <span>Inspect {j.id}</span>
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </Link>
                    </Button>
                  ))}
                <Button variant="outline" size="sm" asChild>
                  <Link to={projectPath(id)}>Open project overview</Link>
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {items.slice(0, visibleLimit).map((item, idx) => (
              <ToCheckCard
                key={item.id}
                ref={(el) => {
                  cardRefs.current.set(item.id, el);
                }}
                projectId={id}
                item={item}
                active={idx === safeIndex}
                editing={editingId === item.id}
                busy={mutation.isPending}
                onFocusCard={() => setActiveIndex(idx)}
                onToggleEdit={(next) => {
                  setActiveIndex(idx);
                  setEditingId(next ? item.id : null);
                }}
                onResolve={(value) => mutation.mutate({ itemId: item.id, value })}
                onSkip={() => {
                  setActiveIndex(idx);
                  focusNextUnresolved(items, idx);
                }}
              />
            ))}
            {items.length > visibleLimit && (
              <div className="flex items-center justify-between rounded-[var(--radius-md)] border border-border bg-surface px-4 py-3 text-xs">
                <span className="text-muted-foreground">
                  Showing {visibleLimit} of {items.length} items (joint-blocking items appear first).
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setVisibleLimit((prev) => prev + PAGE_SIZE)}
                >
                  Show {Math.min(PAGE_SIZE, items.length - visibleLimit)} more
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </main>
  );
}
