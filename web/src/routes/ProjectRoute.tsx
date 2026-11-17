import { Link, useParams } from "react-router";
import { StatusPill } from "../components/StatusPill";
import { Button } from "../components/ui/button";

export function ProjectRoute() {
  const { id = "c4-b12" } = useParams();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-num text-xs text-muted-foreground">Project · {id}</p>
          <h1 className="font-display text-2xl font-semibold">Joints Overview</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to={`/projects/${id}/upload`}>Upload PDF</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to={`/projects/${id}/review`}>To check</Link>
          </Button>
          <Button size="sm" asChild>
            <Link to={`/projects/${id}/report`}>Report</Link>
          </Button>
        </div>
      </div>

      <section className="rounded-[var(--radius-lg)] border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold">C4 × B12</h2>
            <p className="font-num text-xs text-muted-foreground">
              C4 300 × 300 · B12 230 × 450 · Zone II
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill status="fail" count={6} />
            <Button variant="secondary" size="sm" asChild>
              <Link to={`/projects/${id}/joints/C4xB12`}>Inspect joint</Link>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
