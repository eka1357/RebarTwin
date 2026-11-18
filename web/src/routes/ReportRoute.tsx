import { Link, useParams } from "react-router";
import { Button } from "../components/ui/button";
import { projectPath } from "../lib/routes";

export function ReportRoute() {
  const { id = "c4-b12" } = useParams();

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Printable Joint Report</h1>
          <p className="text-sm text-muted-foreground">
            Advisory engineering summary for project <span className="font-num">{id}</span>.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to={projectPath(id)}>Back to project</Link>
        </Button>
      </div>

      <div className="surface-paper rounded-[var(--radius-lg)] border p-6">
        <p className="text-sm">
          Full printable report with chosen fixes and assumptions arrives in W11.
        </p>
      </div>
    </main>
  );
}
