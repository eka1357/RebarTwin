import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-[var(--radius-xs)] border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "bg-surface-raised text-foreground border-border-strong",
        muted: "bg-surface-sunken text-muted-foreground border-border",
        fail: "bg-fail-surface text-fail border-fail/40",
        pass: "bg-pass-surface text-pass border-pass/40",
        check: "bg-check-surface text-check border-check/40",
        advisory: "bg-advisory-surface text-advisory border-advisory/40",
        paper: "bg-paper text-paper-foreground border-paper-border",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
