import { Compass } from "lucide-react";
import { Link, useLocation } from "react-router";
import { Button } from "../components/ui/button";

export function NotFoundRoute() {
  const { pathname } = useLocation();

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-4 p-6">
      <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-6 space-y-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Compass className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span className="font-num text-xs uppercase tracking-[0.06em]">404 · Not found</span>
        </div>
        <div className="space-y-1.5">
          <h1 className="font-display text-xl font-semibold text-foreground">
            Page not found
          </h1>
          <p className="text-sm text-muted-foreground">
            No route matches <span className="font-num text-foreground">{pathname}</span>. Open one
            of the checked joints or return to the project overview.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" asChild>
            <Link to="/demo/iit">Open IIT 3D joint</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/demo">Worked example</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/">Landing</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
