import { Link } from "react-router";
import { Button } from "../components/ui/button";

export function LandingRoute() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center gap-6 px-4 py-12 sm:px-6">
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
        IS 456 and IS 13920 Joint Detailing Verification
      </p>
      <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
        Gemini reads and proposes. Geometry decides.
      </h1>
      <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
        RebarTwin reads Indian structural drawing PDFs, rebuilds the steel at each beam-column joint
        in 3D, proves which detailing rules fail, and ranks fixes checked against every clause.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link to="/demo">Try the example</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to="/projects/c4-b12/upload">Upload drawings</Link>
        </Button>
        <Button variant="ghost" asChild>
          <Link to="/styleguide">View styleguide</Link>
        </Button>
      </div>
    </main>
  );
}
