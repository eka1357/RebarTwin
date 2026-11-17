import { Link, useParams } from "react-router";
import { StatusPill } from "../components/StatusPill";
import { Button } from "../components/ui/button";

export function ReviewRoute() {
  const { id = "c4-b12" } = useParams();

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">To Check Queue</h1>
          <p className="text-sm text-muted-foreground">
            Disagreements between Gemini and the parser wait here for engineer confirmation.
          </p>
        </div>
        <StatusPill status="pass" count={0} />
      </div>
      <div className="surface-paper rounded-[var(--radius-lg)] border p-6">
        <p className="text-sm">
          Project <span className="font-num">{id}</span> has no unresolved items right now.
        </p>
        <Button variant="paper" size="sm" className="mt-4" asChild>
          <Link to={`/projects/${id}`}>Back to project</Link>
        </Button>
      </div>
    </main>
  );
}
