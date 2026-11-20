import { ArrowRight, Box, CheckCircle2, FileText, Layers, ShieldCheck } from "lucide-react";
import { Link } from "react-router";
import { StatusPill } from "../../components/StatusPill";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";

const PIPELINE_STEPS = [
  {
    step: "01",
    title: "Visual reading where parsers fail",
    summary:
      "Indian A1 CAD PDFs break rule-only parsers with irregular schedules, SHX strokes, and local abbreviations. Multimodal Gemini 3.8 Flash reads every table cell and callout with box_2d coordinates, while a deterministic parser cross-checks every value and pauses disagreements in To check.",
    meta: "Provenance: page, box_2d, text, channel",
  },
  {
    step: "02",
    title: "3D geometric verification",
    summary:
      "RebarTwin builds every bar in millimetres (Z up): corner and face column bars, layered beam bars, ties, and stirrups. Formal 3D geometry checks IS 456, IS 13920, and bar-to-bar clashes to the millimetre.",
    meta: "Formal 3D verifier · Zero model arithmetic",
  },
  {
    step: "03",
    title: "Gemini proposals, checked in 3D",
    summary:
      "Gemini 4 Argon proposes targeted rebar arrangements, and our formal geometry solver verifies every candidate against all applicable code rules before export as IFC 4, BCF 2.1, or A4 PDF.",
    meta: "Advisory: the engineer of record decides",
  },
];

const MODEL_ROLES = [
  {
    component: "Gemini 3.8 Flash",
    role: "Visual sheet reading",
    detail:
      "Reads messy A1 schedule tables, Indian abbreviations, and beam elevation callouts with box_2d coordinates that rule-only parsers miss (read_v2).",
  },
  {
    component: "Cloud Vision OCR",
    role: "Vector SHX recovery",
    detail: "Recovers text drawn as CAD line strokes and repairs Ø misreads on rasterized sheets.",
  },
  {
    component: "Gemini 4 Argon",
    role: "Cross-sheet linking & fix proposals",
    detail:
      "Connects framing plans, elevations, and schedules across sheets into 3D joints (link_v5) and proposes targeted bar re-arrangements (propose_v1).",
  },
  {
    component: "Formal 3D Verifier",
    role: "Deterministic geometry checks",
    detail:
      "Verifies every clear gap, cover, clash overlap, steel area, effective depth, pass, and fail in exact millimetre geometry.",
  },
];

export function LandingSections({ demoOnly }: { demoOnly: boolean }) {
  return (
    <div className="space-y-12 pb-12">
      {/* Problem & Evidence */}
      <section aria-labelledby="problem-heading" className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-5 lg:col-span-2 space-y-3">
          <p className="font-num text-xs uppercase tracking-[0.06em] text-muted-foreground">
            Why 2D schedules miss clashes
          </p>
          <h2 id="problem-heading" className="font-display text-xl font-semibold sm:text-2xl">
            Flat schedules separate column and beam bars that occupy the same concrete core.
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            In Indian RCC construction, column schedules, beam layouts, and beam elevations live on
            separate A1 sheets. Spacing and 3D bar intersections are rarely checked before steel
            tying, so clashes surface on site when crews bend or omit bars in the seismic joint
            core (IIT Kanpur and BMTPC, Earthquake Tip 20).
          </p>
        </div>

        <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-5 flex flex-col justify-between gap-4">
          <div className="space-y-2">
            <p className="font-num text-xs uppercase tracking-[0.06em] text-muted-foreground">
              Why Gemini + formal geometry
            </p>
            <div className="flex items-baseline gap-3 font-num">
              <span className="text-3xl font-bold text-foreground">91%</span>
              <span className="text-xs text-muted-foreground">single checks met</span>
            </div>
            <div className="flex items-baseline gap-3 font-num">
              <span className="text-3xl font-bold text-fail">41%</span>
              <span className="text-xs text-muted-foreground">passed every safety rule</span>
            </div>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Messy 2D Indian CAD PDFs break traditional parsers. Multimodal Gemini unlocks reading,
            linking, and fix proposals, while Google&apos;s Physical-Engineering&apos;s Last Exam
            (Nov 2026) shows why pairing Gemini with a formal 3D geometry verifier closes the safety
            gap.
          </p>
        </div>
      </section>

      {/* Three-step proof */}
      <section aria-labelledby="how-heading" className="space-y-4">
        <div className="space-y-1">
          <p className="font-num text-xs uppercase tracking-[0.06em] text-muted-foreground">
            Deterministic workflow
          </p>
          <h2 id="how-heading" className="font-display text-xl font-semibold sm:text-2xl">
            Proof, not opinion, in three stages
          </h2>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {PIPELINE_STEPS.map((item) => (
            <article
              key={item.step}
              className="rounded-[var(--radius-lg)] border border-border bg-surface p-5 flex flex-col justify-between gap-4"
            >
              <div className="space-y-2">
                <span className="font-num text-xs font-semibold text-muted-foreground">
                  Step {item.step}
                </span>
                <h3 className="font-display text-base font-semibold text-foreground">
                  {item.title}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{item.summary}</p>
              </div>
              <p className="border-t border-border pt-3 font-num text-xs text-muted-foreground">
                {item.meta}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* Two live walkthroughs */}
      <section aria-labelledby="walkthroughs-heading" className="space-y-4">
        <div className="space-y-1">
          <p className="font-num text-xs uppercase tracking-[0.06em] text-muted-foreground">
            Interactive proof
          </p>
          <h2 id="walkthroughs-heading" className="font-display text-xl font-semibold sm:text-2xl">
            Inspect a real A1 CAD joint or step through the 3-minute tour
          </h2>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-[var(--radius-lg)] border border-border bg-surface p-5 flex flex-col justify-between gap-4">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge variant="muted" className="font-num">
                  Real A1 structural PDF
                </Badge>
                <StatusPill status="fail" count={9} size="sm" />
              </div>
              <h3 className="font-display text-lg font-semibold text-foreground">
                IIT Hyderabad Director Residence · C1 × XB17
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Read across 6 CAD sheets (pages 7, 15, 16, 17, 18, 21) with mixed column steel
                (4-16 corners + 4-12 faces). Proves 8 bar clashes (7 mm overlap) and 1 spacing fail
                (24.7 mm against 25 mm), then resolves without resizing the column by placing the
                12 mm face bars at y = -40, 40 mm.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" asChild>
                <Link to="/demo/iit">
                  <Box className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Open IIT 3D joint</span>
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to="/demo/iit/report">
                  <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Pre-pour report</span>
                </Link>
              </Button>
            </div>
          </article>

          <article className="rounded-[var(--radius-lg)] border border-border bg-surface p-5 flex flex-col justify-between gap-4">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge variant="muted" className="font-num">
                  5-beat offline tour
                </Badge>
                <StatusPill status="fail" count={6} size="sm" />
              </div>
              <h3 className="font-display text-lg font-semibold text-foreground">
                Worked Example · C4 × B12 (Zone II and Zone III)
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Step through spacing failures (16 mm against 25 mm, IS 456 cl. 26.3.2), 18 mm bar
                clashes, animated Before/After morph (2-25 over 2-20, 1,610 mm²), Workings replay of
                every rejected candidate, and Zone III IS 13920 cl. 7.1.1 (300 mm against 400 mm).
              </p>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="outline" asChild>
                <Link to="/demo">
                  <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Start guided tour</span>
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to="/projects/c4-b12/report">
                  <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Zone II report</span>
                </Link>
              </Button>
            </div>
          </article>
        </div>
      </section>

      {/* Scope and buyers */}
      <section aria-labelledby="scope-buyers-heading" className="space-y-4">
        <div className="space-y-1">
          <p className="font-num text-xs uppercase tracking-[0.06em] text-muted-foreground">
            Adoption and wedge
          </p>
          <h2 id="scope-buyers-heading" className="font-display text-xl font-semibold sm:text-2xl">
            Who buys RebarTwin first and what Phase 1 checks
          </h2>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-[var(--radius-lg)] border border-border bg-surface p-5 space-y-2">
            <h3 className="font-display text-base font-semibold text-foreground">
              Who uses RebarTwin first
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Structural proof-checking and PMC QA-QC teams (paid to catch detailing defects before
              GFC approval with drawing-crop citations and BCF issues), turnkey Design-Build EPC
              contractors preventing site rebar rework and slab pour delays, and mid-to-large design
              consultancies running a pre-issue GFC gate.
            </p>
          </article>

          <article className="rounded-[var(--radius-lg)] border border-border bg-surface p-5 space-y-2">
            <h3 className="font-display text-base font-semibold text-foreground">
              Current scope (Phase 1)
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Checks interior beam-column joints across 8 core congestion, cover, 3D bar-clash,
              and seismic depth rules (IS 456:2000 and IS 13920:2016). Exterior and corner
              anchorage (IS 13920 cl. 6.2.5), lap splices, and confining ties follow on the same
              3D cage.
            </p>
          </article>
        </div>
      </section>

      {/* Google AI architecture */}
      <section aria-labelledby="ai-heading" className="space-y-4">
        <div className="space-y-1">
          <p className="font-num text-xs uppercase tracking-[0.06em] text-muted-foreground">
            Architecture boundary
          </p>
          <h2 id="ai-heading" className="font-display text-xl font-semibold sm:text-2xl">
            Each Google AI model has one bounded job
          </h2>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {MODEL_ROLES.map((m) => (
            <div
              key={m.component}
              className="rounded-[var(--radius-lg)] border border-border bg-surface p-4 space-y-1.5"
            >
              <p className="font-display text-sm font-semibold text-foreground">{m.component}</p>
              <p className="font-num text-xs text-muted-foreground">{m.role}</p>
              <p className="text-xs leading-relaxed text-muted-foreground">{m.detail}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Exports & Advisory close */}
      <section
        aria-labelledby="advisory-heading"
        className="rounded-[var(--radius-lg)] border border-border bg-surface p-5 sm:p-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="space-y-1.5 max-w-2xl">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-pass" aria-hidden="true" />
            <span>IS 456:2000 · IS 13920:2016 · IFC 4 · BCF 2.1 · A4 Pre-pour PDF</span>
          </div>
          <h2 id="advisory-heading" className="font-display text-lg font-semibold text-foreground">
            Advisory verification. The engineer of record decides.
          </h2>
          <p className="text-sm text-muted-foreground">
            Every finding links to its source crop and code clause. Effective depth drops and column
            redesigns are flagged explicitly before export.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 shrink-0">
          <Button asChild>
            <Link to="/demo/iit">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              <span>Open IIT joint</span>
            </Link>
          </Button>
          {!demoOnly && (
            <Button variant="outline" asChild>
              <Link to="/projects/c4-b12/upload">
                <span>Upload drawings</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
