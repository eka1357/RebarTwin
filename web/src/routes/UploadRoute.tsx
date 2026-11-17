import { Link, useParams } from "react-router";
import { Button } from "../components/ui/button";

export function UploadRoute() {
  const { id = "c4-b12" } = useParams();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-4 p-4 sm:p-6">
      <h1 className="font-display text-2xl font-semibold">Upload Structural Drawings</h1>
      <p className="text-sm text-muted-foreground">
        Drop a structural PDF set for project <span className="font-num">{id}</span>, or open the
        worked example offline.
      </p>
      <div className="rounded-[var(--radius-lg)] border border-dashed border-control-border bg-surface p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Reader upload and live page progress board connect here in W8.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link to="/demo">Try the example joint</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to={`/projects/${id}`}>Back to project</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
