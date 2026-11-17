import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-md)] text-sm font-medium transition-[background-color,border-color,color,transform] duration-[var(--dur-1)] ease-[var(--ease-standard)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:opacity-90",
        secondary:
          "bg-surface-raised text-foreground border border-control-border hover:bg-surface",
        outline:
          "bg-transparent text-foreground border border-control-border hover:bg-surface-raised",
        ghost: "bg-transparent text-foreground hover:bg-surface-raised",
        paper: "bg-paper text-paper-foreground border border-paper-border hover:opacity-95",
      },
      size: {
        sm: "h-7 min-w-7 px-2.5 text-xs",
        md: "h-9 min-w-9 px-3.5 text-sm",
        lg: "h-10 min-w-10 px-4 text-sm",
        icon: "h-8 w-8 min-h-6 min-w-6 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type = "button", ...props }, ref) => {
    const Comp = asChild ? Slot.Root : "button";
    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : type}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
