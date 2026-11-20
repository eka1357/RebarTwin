import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Compass, Upload } from "lucide-react";
import { Link } from "react-router";
import { Button } from "../components/ui/button";
import { CalloutResolver } from "../features/landing/CalloutResolver";
import { JointPreviewCard } from "../features/landing/JointPreviewCard";
import { LandingSections } from "../features/landing/LandingSections";
import { getHealth } from "../lib/api";

export function LandingRoute() {
  const healthQuery = useQuery({
    queryKey: ["api-health"],
    queryFn: getHealth,
    retry: false,
    staleTime: 60_000,
  });
  const demoOnly = Boolean(healthQuery.data?.demo_only);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-12 px-4 py-8 sm:px-6 sm:py-12">
      <section className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <div className="space-y-3">
            <p className="font-num text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
              IS 456:2000 · IS 13920:2016 · 3D Joint Detailing Verification
            </p>
            <h1 className="font-display text-3xl font-bold tracking-tight sm:text-5xl">
              Gemini reads and proposes. Geometry decides.
            </h1>
            <p className="max-w-xl text-base leading-relaxed text-muted-foreground">
              RebarTwin reads Indian structural drawing PDFs, rebuilds the steel at each beam-column
              joint in 3D, proves which detailing clauses fail, and ranks fixes checked against
              every rule before steel is tied on site.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link to="/demo/iit">
                <span>Inspect IIT Hyderabad joint</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/demo">
                <Compass className="h-4 w-4" aria-hidden="true" />
                <span>Try the example</span>
              </Link>
            </Button>
            {!demoOnly && (
              <Button variant="outline" asChild>
                <Link to="/projects/c4-b12/upload">
                  <Upload className="h-4 w-4" aria-hidden="true" />
                  <span>Upload drawings</span>
                </Link>
              </Button>
            )}
            {import.meta.env.DEV && (
              <Button variant="ghost" asChild>
                <Link to="/styleguide">View styleguide</Link>
              </Button>
            )}
          </div>

          {demoOnly && (
            <p className="text-xs text-muted-foreground">
              Public demo mode is active. Live PDF uploads are locked here; both interactive 3D
              walkthroughs and printable pre-pour reports run directly in your browser.
            </p>
          )}

          <CalloutResolver />
        </div>

        <JointPreviewCard />
      </section>

      <LandingSections demoOnly={demoOnly} />
    </main>
  );
}
