import * as React from "react";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import { DURATION_MS } from "../../lib/motion";
import { cn } from "../../lib/utils";

export function TooltipProvider({
  delayDuration = DURATION_MS.tooltipDelay,
  skipDelayDuration = DURATION_MS.tooltipSkipDelay,
  ...props
}: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      delayDuration={delayDuration}
      skipDelayDuration={skipDelayDuration}
      {...props}
    />
  );
}

export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export const TooltipContent = React.forwardRef<
  React.ComponentRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 overflow-hidden rounded-[var(--radius-sm)] border border-border-strong bg-surface-raised px-2.5 py-1.5 text-xs text-foreground shadow-[var(--shadow-overlay)]",
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;
