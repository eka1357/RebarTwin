import { Link, useParams } from "react-router";
import { StatusPill } from "../components/StatusPill";
import { Button } from "../components/ui/button";

export function JointRoute() {
  const { id = "c4-b12", jointId = "C4xB12" } = useParams();

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-4">
        <div>
          <p className="font-num text-xs text-muted-foreground">
            Project {id} · Joint {jointId}
          </p>
          <h1 className="font-display text-2xl font-semibold">Joint Workspace: {jointId}</h1>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill status="fail" count={6} />
          <Button variant="outline" size="sm" asChild>
            <Link to={`/projects/${id}`}>Project</Link>
          </Button>
        </div>
      </div>

      <div className="grid flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_25rem]">
        <section
          aria-label="3D joint viewport"
          className="hairline-grid flex min-h-80 items-center justify-center rounded-[var(--radius-lg)] border border-border bg-surface-sunken p-6 text-center"
        >
          <p className="text-sm text-muted-foreground">
            3D SceneController renders joint {jointId} here in W3.
          </p>
        </section>
        <aside
          id="inspector"
          aria-label="Joint inspector"
          className="rounded-[var(--radius-lg)] border border-border bg-surface p-4"
        >
          <h2 className="font-display text-base font-semibold">Inspector</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Selected bars, findings, fixes, and workings appear here.
          </p>
        </aside>
      </div>
    </main>
  );
}
