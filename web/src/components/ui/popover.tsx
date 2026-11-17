import * as React from "react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { cn } from "../../lib/utils";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;

export const PopoverContent = React.forwardRef<
  React.ComponentRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "start", sideOffset = 6, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        "z-50 w-72 origin-[var(--radix-popover-content-transform-origin)] rounded-[var(--radius-lg)] border border-border-strong bg-surface-raised p-3.5 text-sm text-foreground shadow-[var(--shadow-overlay)] transition-[opacity,transform] duration-[var(--dur-2)] ease-[var(--ease-standard)]",
        className,
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;
