import * as React from "react";
import { Toggle as TogglePrimitive } from "radix-ui";
import { cn } from "../../lib/utils";

export const Toggle = React.forwardRef<
  React.ComponentRef<typeof TogglePrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof TogglePrimitive.Root>
>(({ className, ...props }, ref) => (
  <TogglePrimitive.Root
    ref={ref}
    className={cn(
      "inline-flex min-h-7 min-w-7 items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-control-border bg-surface px-2.5 py-1 text-xs font-medium text-muted-foreground transition-[background-color,color,border-color] duration-[var(--dur-1)] hover:text-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground cursor-pointer",
      className,
    )}
    {...props}
  />
));
Toggle.displayName = TogglePrimitive.Root.displayName;
