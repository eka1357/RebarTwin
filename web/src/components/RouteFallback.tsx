import { Skeleton } from "./ui/skeleton";

export function RouteFallback() {
  return (
    <main role="status" aria-live="polite" className="flex flex-1 flex-col gap-3 p-6">
      <p className="font-num text-xs text-muted-foreground">Loading route...</p>
      <Skeleton className="h-48 w-full" />
    </main>
  );
}
