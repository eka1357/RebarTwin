import { useEffect } from "react";
import { useNavigate } from "react-router";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../components/ui/command";
import {
  jointPath,
  projectPath,
  projectReportPath,
  projectReviewPath,
  projectUploadPath,
} from "../lib/routes";
import { useWorkspaceStore } from "../stores/workspace";

const ROUTE_ITEMS = [
  { label: "Landing", path: "/", shortcut: "" },
  { label: "Worked Example Demo (C4 × B12)", path: "/demo", shortcut: "" },
  { label: "IIT Real Joint Offline (C1 × XB17)", path: "/demo/iit", shortcut: "" },
  { label: "Project Overview", path: projectPath("c4-b12"), shortcut: "" },
  { label: "Upload Drawings", path: projectUploadPath("c4-b12"), shortcut: "" },
  { label: "To Check Queue", path: projectReviewPath("c4-b12"), shortcut: "" },
  { label: "Joint Workspace (C4xB12)", path: jointPath("c4-b12", "C4xB12"), shortcut: "" },
  { label: "Printable Report", path: projectReportPath("c4-b12"), shortcut: "" },
  ...(import.meta.env.DEV
    ? [{ label: "Design System Styleguide", path: "/styleguide", shortcut: "" }]
    : []),
];

export function CommandPalette() {
  const open = useWorkspaceStore((s) => s.commandOpen);
  const setOpen = useWorkspaceStore((s) => s.setCommandOpen);
  const toggleTheme = useWorkspaceStore((s) => s.toggleTheme);
  const theme = useWorkspaceStore((s) => s.theme);
  const setShortcutsOpen = useWorkspaceStore((s) => s.setShortcutsOpen);
  const setMode = useWorkspaceStore((s) => s.setMode);
  const mode = useWorkspaceStore((s) => s.mode);
  const navigate = useNavigate();

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
          {ROUTE_ITEMS.map((item) => (
            <CommandItem key={item.path} onSelect={() => go(item.path)}>
              <span>{item.label}</span>
              <span className="font-num text-xs text-muted-foreground">{item.path}</span>
            </CommandItem>
          ))}
        </CommandGroup>
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
