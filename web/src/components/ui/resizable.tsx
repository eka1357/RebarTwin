import * as React from "react";
import { Group, Panel, Separator as PanelSeparator } from "react-resizable-panels";
import { GripVertical } from "lucide-react";
import { cn } from "../../lib/utils";

export function ResizablePanelGroup({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof Group>) {
  return <Group className={cn("flex h-full min-h-0 w-full", className)} {...props} />;
}

export const ResizablePanel = Panel;

export function ResizableHandle({
  withHandle = true,
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof PanelSeparator> & { withHandle?: boolean }) {
  return (
    <PanelSeparator
      className={cn(
        "relative flex w-1.5 items-center justify-center bg-border transition-colors duration-[var(--dur-1)] hover:bg-border-strong focus-visible:bg-ring",
        className,
      )}
      {...props}
    >
      {withHandle && (
        <div className="z-10 flex h-6 w-3 items-center justify-center rounded-[var(--radius-xs)] border border-control-border bg-surface-raised text-muted-foreground">
          <GripVertical className="h-3 w-3" aria-hidden="true" />
        </div>
      )}
    </PanelSeparator>
  );
}
