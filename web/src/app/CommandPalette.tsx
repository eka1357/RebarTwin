import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../components/ui/command";
import type { ProjectDetail } from "../lib/api";
import { formatCalloutValue, formatClause } from "../lib/format";
import {
  jointPath,
  projectPath,
  projectReportPath,
  projectReviewPath,
  projectUploadPath,
} from "../lib/routes";
import { useWorkspaceStore } from "../stores/workspace";
import type { Bundle } from "../types/bundle";

export function CommandPalette() {
  const open = useWorkspaceStore((s) => s.commandOpen);
  const setOpen = useWorkspaceStore((s) => s.setCommandOpen);
  const toggleTheme = useWorkspaceStore((s) => s.toggleTheme);
  const theme = useWorkspaceStore((s) => s.theme);
  const setShortcutsOpen = useWorkspaceStore((s) => s.setShortcutsOpen);
  const setMode = useWorkspaceStore((s) => s.setMode);
  const mode = useWorkspaceStore((s) => s.mode);
  const selectFinding = useWorkspaceStore((s) => s.selectFinding);
  const selectBar = useWorkspaceStore((s) => s.selectBar);
  const setOptionIndex = useWorkspaceStore((s) => s.setOptionIndex);
  const setInspectorTab = useWorkspaceStore((s) => s.setInspectorTab);
  const triggerFrame = useWorkspaceStore((s) => s.triggerFrame);

  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const queryClient = useQueryClient();

  const isIitRoute =
    pathname === "/demo/iit" ||
    pathname.startsWith("/demo/iit/") ||
    pathname.startsWith("/projects/iit-demo");
  const projMatch = /^\/projects\/([^/]+)/.exec(pathname);
  const jointMatch = /^\/projects\/[^/]+\/joints\/([^/]+)/.exec(pathname);

  let activeProject = isIitRoute ? "iit-demo" : "c4-b12";
  if (projMatch?.[1]) {
    try {
      activeProject = decodeURIComponent(projMatch[1]);
    } catch {
      activeProject = projMatch[1];
    }
  }
  let activeJointId: string | null = null;
  if (jointMatch?.[1]) {
    try {
      activeJointId = decodeURIComponent(jointMatch[1]);
    } catch {
      activeJointId = jointMatch[1];
    }
  }

  const searchParams = useMemo(() => new URLSearchParams(search), [search]);
  const demoZone3 =
    pathname === "/demo" &&
    (searchParams.get("zone") === "3" || searchParams.get("variant") === "zone3");
  const queryJointId = searchParams.get("joint");

  // Look up active project and active bundle from TanStack Query cache when palette opens
  const activeProjectData = useMemo(() => {
    if (!open) return null;
    if (activeProject === "iit-demo") {
      return queryClient.getQueryData<ProjectDetail>(["offline-iit-project"]) ?? null;
    }
    return queryClient.getQueryData<ProjectDetail>(["project", activeProject]) ?? null;
  }, [activeProject, open, queryClient]);

  const firstReadyJointId = activeProjectData?.joints.find((j) => j.bundle_ready)?.id ?? null;
  const effectiveJointId = activeJointId ?? queryJointId ?? firstReadyJointId;

  const activeBundle = useMemo<Bundle | null>(() => {
    if (!open) return null;
    if (pathname === "/demo/iit" || activeProject === "iit-demo") {
      return (
        queryClient.getQueryData<Bundle>(["joint-bundle", "iit-demo", "C1xXB17@FIRST@L1+M+M1-28"]) ??
        queryClient.getQueryData<Bundle>(["demo-bundle", "iit"]) ??
        null
      );
    }
    if (pathname === "/demo") {
      return (
        queryClient.getQueryData<Bundle>(["demo-bundle", demoZone3 ? "zone3" : "zone2"]) ?? null
      );
    }
    if (effectiveJointId) {
      return queryClient.getQueryData<Bundle>(["joint-bundle", activeProject, effectiveJointId]) ?? null;
    }
    return null;
  }, [activeProject, demoZone3, effectiveJointId, open, pathname, queryClient]);

  const isWorkspaceRoute =
    pathname === "/demo" || pathname === "/demo/iit" || pathname.includes("/joints/");
  const activeJointUrl =
    pathname === "/demo"
      ? demoZone3
        ? "/demo?zone=3"
        : "/demo"
      : activeProject === "iit-demo"
        ? "/demo/iit"
        : effectiveJointId
          ? jointPath(activeProject, effectiveJointId)
          : null;

  const routeItems = useMemo(() => {
    const firstReady = activeProjectData?.joints.find((j) => j.bundle_ready)?.id;
    const jointTarget =
      activeProject === "iit-demo"
        ? "/demo/iit"
        : activeProject === "c4-b12"
          ? jointPath("c4-b12", "C4xB12")
          : effectiveJointId
            ? jointPath(activeProject, effectiveJointId)
            : firstReady
              ? jointPath(activeProject, firstReady)
              : projectPath(activeProject);
    const reportTarget =
      activeProject === "iit-demo"
        ? "/demo/iit/report"
        : projectReportPath(activeProject, {
            joint: effectiveJointId ?? firstReady ?? undefined,
            variant: activeProject === "c4-b12" && demoZone3 ? "zone3" : undefined,
          });

    return [
      { label: "Landing", path: "/" },
      { label: "Worked Example Demo (C4 × B12)", path: "/demo" },
      { label: "IIT Real Joint Offline (C1 × XB17)", path: "/demo/iit" },
      { label: `Project Overview (${activeProject})`, path: projectPath(activeProject) },
      { label: "Upload Drawings", path: projectUploadPath(activeProject) },
      { label: `To Check Queue (${activeProject})`, path: projectReviewPath(activeProject) },
      { label: `Joint Workspace (${effectiveJointId ?? "C4xB12"})`, path: jointTarget },
      { label: "Printable Report", path: reportTarget },
      ...(import.meta.env.DEV
        ? [{ label: "Design System Styleguide", path: "/styleguide" }]
        : []),
    ];
  }, [activeProject, activeProjectData, demoZone3, effectiveJointId]);

  const failingFindings = useMemo(() => {
    if (!activeBundle) return [];
    return activeBundle.report.findings
      .map((f, index) => ({ f, index }))
      .filter(({ f }) => f.status === "fail")
      .slice(0, 12);
  }, [activeBundle]);

  const fixOptions = useMemo(() => {
    if (!activeBundle) return [];
    return activeBundle.fix.options.slice(0, 5);
  }, [activeBundle]);

  const readyJoints = useMemo(() => {
    if (!activeProjectData) return [];
    return activeProjectData.joints.filter((j) => j.bundle_ready).slice(0, 10);
  }, [activeProjectData]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!useWorkspaceStore.getState().commandOpen);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setOpen]);

  const go = (path: string) => {
    setOpen(false);
    void navigate(path);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="RebarTwin command palette">
      <CommandInput placeholder="Jump to route, joint, finding, or action..." />
      <CommandList>
        <CommandEmpty>No matching commands.</CommandEmpty>
        <CommandGroup heading="Routes">
          {routeItems.map((item) => (
            <CommandItem key={`${item.label}-${item.path}`} onSelect={() => go(item.path)}>
              <span>{item.label}</span>
              <span className="font-num text-xs text-muted-foreground">{item.path}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        {readyJoints.length > 0 && (
          <CommandGroup heading="Checked Joints">
            {readyJoints.map((j) => (
              <CommandItem
                key={j.id}
                value={`${j.id} ${j.column.id} ${j.beams.map((b) => b.id).join(" ")}`}
                onSelect={() =>
                  go(activeProject === "iit-demo" ? "/demo/iit" : jointPath(activeProject, j.id))
                }
              >
                <span>{j.id}</span>
                <span className="font-num text-xs text-fail">{j.fail_count} fails</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {failingFindings.length > 0 && (
          <CommandGroup heading="Failing Findings in Current Joint">
            {failingFindings.map(({ f, index }) => (
              <CommandItem
                key={`finding-${index}`}
                value={`${formatClause(f.clause)} ${f.bars.join(" ")} ${formatCalloutValue(f)} ${f.message}`}
                onSelect={() => {
                  if (isWorkspaceRoute) {
                    selectFinding(index);
                    selectBar(f.bars[0] ?? null);
                    setInspectorTab("findings");
                    triggerFrame();
                    setOpen(false);
                  } else if (activeJointUrl) {
                    const sep = activeJointUrl.includes("?") ? "&" : "?";
                    go(`${activeJointUrl}${sep}f=${index}`);
                  }
                }}
              >
                <span>
                  {formatClause(f.clause)} · {f.bars.join(", ") || f.members.join(", ")}
                </span>
                <span className="font-num text-xs text-fail">{formatCalloutValue(f)}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {fixOptions.length > 0 && (
          <CommandGroup heading="Verified Fix Options">
            {fixOptions.map((opt, idx) => (
              <CommandItem
                key={`opt-${idx}`}
                value={`Option ${idx + 1} ${opt.candidate.title} ${opt.column ?? ""}`}
                onSelect={() => {
                  if (isWorkspaceRoute) {
                    setOptionIndex(idx);
                    setMode("after");
                    setInspectorTab("fix");
                    setOpen(false);
                  } else if (activeJointUrl) {
                    const sep = activeJointUrl.includes("?") ? "&" : "?";
                    go(`${activeJointUrl}${sep}o=${idx}`);
                  }
                }}
              >
                <span>
                  Option #{idx + 1}: {opt.candidate.title}
                </span>
                <span className="font-num text-xs text-pass">Preview After</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandGroup heading="Actions">
          <CommandItem
            onSelect={() => {
              toggleTheme();
              setOpen(false);
            }}
          >
            <span>Switch to {theme === "dark" ? "light" : "dark"} theme</span>
            <span className="font-num text-xs text-muted-foreground">Theme</span>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              setMode(mode === "before" ? "after" : "before");
              setOpen(false);
            }}
          >
            <span>Toggle Before / After view</span>
            <span className="font-num text-xs text-muted-foreground">{mode}</span>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              setOpen(false);
              setShortcutsOpen(true);
            }}
          >
            <span>Keyboard shortcuts</span>
            <span className="font-num text-xs text-muted-foreground">?</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
