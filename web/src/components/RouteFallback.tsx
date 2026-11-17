import { Skeleton } from "./ui/skeleton";

export function RouteFallback() {
  return (
    <main className="flex flex-1 p-6">
      <h1 className="sr-only">Loading route</h1>
      <Skeleton className="h-48 w-full" />
    </main>
  );
}
