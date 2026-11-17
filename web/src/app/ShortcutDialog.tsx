import { useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { useWorkspaceStore } from "../stores/workspace";

const SHORTCUTS = [
  { keys: "Ctrl / Cmd + K", desc: "Open command palette" },
  { keys: "?", desc: "Open keyboard shortcuts" },
  { keys: "Arrow keys", desc: "Orbit 3D joint camera" },
  { keys: "+ / -", desc: "Zoom in or out" },
  { keys: "F", desc: "Frame selected bar or finding" },
  { keys: "0", desc: "Reset camera to Iso view" },
  { keys: "Space", desc: "Play or pause Workings replay / tour" },
  { keys: "Escape", desc: "Clear selection or close dialog" },
];

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export function ShortcutDialog() {
  const open = useWorkspaceStore((s) => s.shortcutsOpen);
  const setOpen = useWorkspaceStore((s) => s.setShortcutsOpen);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setOpen(!useWorkspaceStore.getState().shortcutsOpen);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setOpen]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription>
            Every screen and 3D control in RebarTwin is reachable by keyboard.
          </DialogDescription>
        </DialogHeader>
        <dl className="mt-4 divide-y divide-border">
          {SHORTCUTS.map((s) => (
            <div key={s.keys} className="flex items-center justify-between gap-4 py-2 text-sm">
              <dt className="text-muted-foreground">{s.desc}</dt>
              <dd className="font-num rounded-[var(--radius-xs)] border border-control-border bg-surface-sunken px-2 py-0.5 text-xs font-medium text-foreground">
                {s.keys}
              </dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
