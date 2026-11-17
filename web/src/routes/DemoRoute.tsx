import { Link } from "react-router";
import { StatusPill } from "../components/StatusPill";
import { Button } from "../components/ui/button";

export function DemoRoute() {
  return (
    <main className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Worked Example: C4 × B12</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Zone II and Zone III joint checks with verified fixes and Workings replay.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill status="fail" count={6} />
          <Button variant="outline" size="sm" asChild>
            <Link to="/projects/c4-b12/report">Report</Link>
          </Button>
        </div>
      </div>

      <div className="grid flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_25rem]">
        <section
          aria-label="3D viewport region"
          className="hairline-grid flex min-h-80 items-center justify-center rounded-[var(--radius-lg)] border border-border bg-surface-sunken p-6 text-center"
        >
          <div className="max-w-md space-y-2">
            <h2 className="font-display text-lg font-semibold">3D Scene Container</h2>
            <p className="text-sm text-muted-foreground">
              SceneController mounts the 17-bar C4 × B12 cage from bundle.scene in W3.
            </p>
          </div>
        </section>

        <aside
          id="inspector"
          aria-label="Joint inspector"
          className="rounded-[var(--radius-lg)] border border-border bg-surface p-4"
        >
          <h2 className="font-display text-base font-semibold">Inspector</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Findings, Fix options, Source crops, and Workings replay attach here in W4 to W7.
          </p>
        </aside>
      </div>
    </main>
  );
}
