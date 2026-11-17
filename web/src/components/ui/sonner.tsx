import { Toaster as SonnerToaster, type ToasterProps } from "sonner";

export function Toaster(props: ToasterProps) {
  return (
    <SonnerToaster
      duration={3500}
      toastOptions={{
        classNames: {
          toast:
            "rounded-[var(--radius-lg)] border border-border-strong bg-surface-raised text-foreground shadow-[var(--shadow-overlay)] font-sans text-sm",
          description: "text-xs text-muted-foreground",
          actionButton: "bg-primary text-primary-foreground rounded-[var(--radius-sm)] text-xs",
          cancelButton: "bg-surface text-foreground border border-control-border text-xs",
        },
      }}
      {...props}
    />
  );
}
