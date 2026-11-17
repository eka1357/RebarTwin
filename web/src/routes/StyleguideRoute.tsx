import { StatusPill } from "../components/StatusPill";
import {
  formatArea,
  formatBarMark,
  formatClause,
  formatMeasure,
  formatOverlap,
  formatPercentDelta,
} from "../lib/format";
import { StyleguidePrimitives } from "./StyleguidePrimitives";

const TOKEN_SWATCHES = [
  { name: "background", cls: "bg-background text-foreground" },
  { name: "surface", cls: "bg-surface text-foreground" },
  { name: "surface-raised", cls: "bg-surface-raised text-foreground" },
  { name: "surface-sunken", cls: "bg-surface-sunken text-foreground" },
  { name: "paper", cls: "bg-paper text-paper-foreground border-paper-border" },
  { name: "fail-surface", cls: "bg-fail-surface text-fail" },
  { name: "pass-surface", cls: "bg-pass-surface text-pass" },
  { name: "check-surface", cls: "bg-check-surface text-check" },
  { name: "advisory-surface", cls: "bg-advisory-surface text-advisory" },
];

export function StyleguideRoute() {
  return (
    <main className="mx-auto w-full max-w-6xl space-y-8 p-4 sm:p-6">
      <section className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
          The drawing, measured
        </p>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Tokens, Type, Status and Primitives
        </h1>
        <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
          Graphite workspace surfaces paired with warm paper evidence cards, tabular mono numerals,
          and one orange signal reserved strictly for failing checks.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">Color Tokens</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
          {TOKEN_SWATCHES.map((s) => (
            <div
              key={s.name}
              className={`rounded-[var(--radius-md)] border border-border p-3 ${s.cls}`}
            >
              <div className="font-num text-xs font-medium">{s.name}</div>
              <div className="mt-1 text-xs">Aa 16 mm</div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">Status Pills &amp; Paper Evidence</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-4">
            <div className="mb-3 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
              StatusPill (icon + word, never colour alone)
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status="fail" count={6} />
              <StatusPill status="pass" count={14} />
              <StatusPill status="to_check" count={1} />
              <StatusPill status="recheck" />
              <StatusPill status="redesign" />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusPill status="fail" size="sm" />
              <StatusPill status="pass" size="sm" />
              <StatusPill status="to_check" size="sm" />
            </div>
          </div>

          <div className="surface-paper rounded-[var(--radius-lg)] border p-4">
            <div className="text-xs font-medium uppercase tracking-[0.08em]">
              Paper Evidence Surface
            </div>
            <p className="mt-2 font-num text-sm font-medium">
              {formatClause("IS 456:2000 cl. 26.3.2")} · {formatBarMark("B12/T1-3", 20)}
            </p>
            <p className="mt-1 text-sm">
              Measured{" "}
              <span className="font-num font-medium">
                {formatMeasure(24.6, "mm", { limit: 25, compare: ">=", status: "fail" })}
              </span>{" "}
              against <span className="font-num">{formatMeasure(25, "mm")}</span> ·{" "}
              <span className="font-num">{formatOverlap(-18)}</span> ·{" "}
              <span className="font-num">{formatArea(1610)}</span> (
              <span className="font-num">{formatPercentDelta(2.5)}</span>)
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">Radix / shadcn Primitives</h2>
        <StyleguidePrimitives />
      </section>
    </main>
  );
}
