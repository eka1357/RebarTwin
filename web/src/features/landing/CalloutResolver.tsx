// Inspired by React Bits deciphering text pattern (docs/UI_RESEARCH.md), restyled to
// DESIGN_SYSTEM.md tokens with reduced-motion static rendering and screen-reader safety.
import { useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { Badge } from "../../components/ui/badge";

interface CalloutSample {
  raw: string;
  resolved: string;
  member: string;
  sheet: string;
  status: "Agreed" | "Geometry";
}

const SAMPLES: CalloutSample[] = [
  {
    raw: "4016 + 04012",
    resolved: "4-16 corners + 4-12 faces",
    member: "C1 main",
    sheet: "Page 7",
    status: "Agreed",
  },
  {
    raw: "2O12 + 2O16",
    resolved: "2-12 + 2-16 top",
    member: "XB17 top",
    sheet: "Page 17",
    status: "Agreed",
  },
  {
    raw: "200x450",
    resolved: "200 × 450 mm",
    member: "XB17 section",
    sheet: "Page 15",
    status: "Agreed",
  },
];

const GLYPHS = "0123456789Ø×+-";

export function CalloutResolver() {
  const reduced = Boolean(useReducedMotion());
  const [sampleIndex, setSampleIndex] = useState(0);
  const [displayText, setDisplayText] = useState(SAMPLES[0].resolved);

  const sample = SAMPLES[sampleIndex];

  useEffect(() => {
    if (reduced) return;

    const target = sample.resolved;
    let step = 0;

    const tickTimer = window.setInterval(() => {
      step += 1;
      const revealed = Math.max(0, step - 3);
      if (revealed >= target.length) {
        setDisplayText(target);
        window.clearInterval(tickTimer);
        return;
      }
      const next = target
        .split("")
        .map((ch, idx) => {
          if (idx < revealed || ch === " ") return ch;
          return GLYPHS[(idx * 7 + step * 3) % GLYPHS.length];
        })
        .join("");
      setDisplayText(next);
    }, 36);

    const cycleTimer = window.setTimeout(() => {
      setSampleIndex((prev) => (prev + 1) % SAMPLES.length);
    }, 3800);

    return () => {
      window.clearInterval(tickTimer);
      window.clearTimeout(cycleTimer);
    };
  }, [reduced, sample]);

  const shownText = reduced ? sample.resolved : displayText;

  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="font-num uppercase tracking-[0.06em]">Dual-channel reading sample</span>
        <div className="flex items-center gap-1.5">
          <Badge variant="muted" className="font-num">
            {sample.member} · {sample.sheet}
          </Badge>
          <Badge variant="pass">{sample.status}</Badge>
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2 font-num text-sm">
        <span className="rounded-[var(--radius-xs)] border border-paper-border bg-paper px-2 py-0.5 text-paper-foreground">
          {sample.raw}
        </span>
        <span aria-hidden="true" className="text-muted-foreground">
          →
        </span>
        <span className="sr-only">
          Resolved reading for {sample.member} on {sample.sheet}: {sample.resolved}
        </span>
        <span aria-hidden="true" className="font-semibold text-foreground">
          {shownText}
        </span>
      </div>
    </div>
  );
}
