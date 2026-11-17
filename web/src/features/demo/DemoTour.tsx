import { ArrowLeft, ArrowRight, Compass, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import type { DemoVariant } from "../../lib/demoData";
import { formatFixToastSummary } from "../../lib/format";
import { EASE, getTransition } from "../../lib/motion";
import { useWorkspaceStore } from "../../stores/workspace";
import type { Bundle } from "../../types/bundle";

interface TourStepSpec {
  id: string;
  label: string;
  title: string;
  summary: string;
  durationHint: string;
}

const PITCH_DECK_SOURCE_SUMMARY =
  "This worked example was typed in from the pitch deck. Read a drawing to trace each value to its sheet.";

const PROVENANCE_SOURCE_SUMMARY =
  "Every value traces back to its normalized box on the drawing sheet with paired Gemini and parser readings.";

const DEMO_TOUR_STEPS: TourStepSpec[] = [
  {
    id: "finding",
    label: "1. Finding",
    title: "Six checks fail",
    summary:
      "B12's top bars are 16 mm apart where IS 456 needs 25 mm, and two column bars run 18 mm into B12's middle top bar.",
    durationHint: "0:30",
  },
  {
    id: "source",
    label: "2. Source",
    title: "Where each value came from",
    summary: PITCH_DECK_SOURCE_SUMMARY,
    durationHint: "1:00",
  },
  {
    id: "fix",
    label: "3. Fix",
    title: "A fix that passes every rule",
    summary:
      "two 25s over two 20s give 1,610 mm², 2.5% more steel than the drawn 5-20. It costs 21 mm of effective depth, so the designer rechecks the beam.",
    durationHint: "1:35",
  },
  {
    id: "workings",
    label: "4. Replay",
    title: "Every attempt, shown",
    summary: "34 arrangements tried; each failed one names the clause that rejected it.",
    durationHint: "2:10",
  },
  {
    id: "zone3",
    label: "5. Zone III",
    title: "Zone III changes the answer",
    summary:
      "IS 13920 wants the column at least 20 beam-bar diameters deep (400 mm); C4 is 300. No bar change passes; the smallest redesign is B12 top 4-16 over 4-16 with C4 at 325 × 300.",
    durationHint: "2:50",
  },
];

interface DemoTourProps {
  open: boolean;
  onClose: () => void;
  variant: DemoVariant;
  onVariantChange: (v: DemoVariant) => void;
  bundle?: Bundle;
}

/**
 * Five-beat presenter guided tour (Finding -> Source -> Fix -> Replay -> Zone III)
 * fitting under 3 minutes, supporting Space to advance and reduced motion.
 */
export function DemoTour({ open, onClose, variant, onVariantChange, bundle }: DemoTourProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const reduced = Boolean(useReducedMotion());
  const nextBtnRef = useRef<HTMLButtonElement | null>(null);
  const appliedVariantForStepRef = useRef<string | null>(null);

  const selectFinding = useWorkspaceStore((s) => s.selectFinding);
  const selectBar = useWorkspaceStore((s) => s.selectBar);
  const setInspectorTab = useWorkspaceStore((s) => s.setInspectorTab);
  const setSourceFocusMember = useWorkspaceStore((s) => s.setSourceFocusMember);
  const setOptionIndex = useWorkspaceStore((s) => s.setOptionIndex);
  const setMode = useWorkspaceStore((s) => s.setMode);
  const setCameraPreset = useWorkspaceStore((s) => s.setCameraPreset);
  const setReplay = useWorkspaceStore((s) => s.setReplay);
  const triggerFrame = useWorkspaceStore((s) => s.triggerFrame);
  const clearSelection = useWorkspaceStore((s) => s.clearSelection);

  const applyStep = useCallback(
    (idx: number) => {
      const step = DEMO_TOUR_STEPS[idx];
      if (!step) return;
      appliedVariantForStepRef.current = `${step.id}:${variant}`;

      if (step.id === "finding") {
        toast.dismiss("fix-morph");
        if (variant !== "zone2") onVariantChange("zone2");
        setMode("before");
        setReplay({ replayPlaying: false });
        setInspectorTab("findings");
        setCameraPreset("iso");
        const clashIdx = bundle?.report.findings.findIndex((f) => f.rule === "GEOM-CLASH") ?? 4;
        const finding = bundle?.report.findings[clashIdx];
        selectFinding(finding ? clashIdx : null);
        selectBar(finding?.bars[0] ?? "B12/T1-3");
        triggerFrame();
      } else if (step.id === "source") {
        toast.dismiss("fix-morph");
        if (variant !== "zone2") onVariantChange("zone2");
        setMode("before");
        setReplay({ replayPlaying: false });
        clearSelection();
        setSourceFocusMember("B12");
        setInspectorTab("source");
      } else if (step.id === "fix") {
        if (variant !== "zone2") onVariantChange("zone2");
        setReplay({ replayPlaying: false });
        clearSelection();
        setInspectorTab("fix");
        setOptionIndex(0);
        setMode("after");
        const opt0 = bundle?.fix.options[0];
        if (opt0) toast.success(formatFixToastSummary(opt0.faces), { id: "fix-morph", duration: 2400 });
      } else if (step.id === "workings") {
        toast.dismiss("fix-morph");
        if (variant !== "zone2") onVariantChange("zone2");
        setMode("before");
        clearSelection();
        setReplay({ replayPlaying: false, replayIndex: 0 });
        setInspectorTab("workings");
      } else if (step.id === "zone3") {
        toast.dismiss("fix-morph");
        setReplay({ replayPlaying: false });
        setMode("before");
        clearSelection();
        if (variant !== "zone3") {
          onVariantChange("zone3");
        }
        setInspectorTab("fix");
      }
    },
    [
      bundle,
      clearSelection,
      onVariantChange,
      selectBar,
      selectFinding,
      setCameraPreset,
      setInspectorTab,
      setMode,
      setOptionIndex,
      setReplay,
      setSourceFocusMember,
      triggerFrame,
      variant,
    ],
  );

  // Sync step state whenever opened, step changes, or target zone bundle finishes switching
  useEffect(() => {
    if (!open) return;
    applyStep(stepIndex);
    // Focus Next button on tour open so repeated Space advances smoothly
    const id = requestAnimationFrame(() => nextBtnRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open, stepIndex, applyStep]);

  const goStep = useCallback(
    (next: number) => {
      if (next >= DEMO_TOUR_STEPS.length) {
        setStepIndex(0);
        onClose();
        return;
      }
      setStepIndex(Math.max(0, next));
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const role = target?.getAttribute("role");
      const interactive =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        tag === "BUTTON" ||
        tag === "A" ||
        target?.isContentEditable ||
        role === "slider" ||
        role === "tab" ||
        role === "radio";

      if (e.key === "Escape") {
        e.preventDefault();
        setStepIndex(0);
        onClose();
        return;
      }
      if (e.key === " " && !interactive) {
        e.preventDefault();
        goStep(stepIndex + 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, stepIndex, goStep, onClose]);

  if (!open) return null;

  const current = DEMO_TOUR_STEPS[stepIndex] ?? DEMO_TOUR_STEPS[0];
  const hasProvenance = Array.isArray(bundle?.provenance)
    ? bundle.provenance.length > 0
    : Boolean(bundle?.provenance && Object.keys(bundle.provenance).length > 0);
  const currentSummary =
    current.id === "source"
      ? hasProvenance
        ? PROVENANCE_SOURCE_SUMMARY
        : PITCH_DECK_SOURCE_SUMMARY
      : current.summary;
  const isLast = stepIndex === DEMO_TOUR_STEPS.length - 1;

  return (
    <motion.section
      aria-label="Guided demo tour"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={getTransition(reduced, { duration: 0.2, ease: EASE.standard })}
      className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-border-strong bg-surface-raised px-4 py-2.5 shadow-[var(--shadow-overlay)]"
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="muted" className="font-num">
            <Compass className="h-3 w-3" aria-hidden="true" />
            <span>
              Step {stepIndex + 1} / {DEMO_TOUR_STEPS.length}
            </span>
          </Badge>
          <span className="font-num text-xs text-muted-foreground">{current.durationHint} / 3:00</span>
          <h2 className="font-display text-sm font-semibold text-foreground">{current.title}</h2>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">{currentSummary}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="hidden sm:flex items-center gap-1" role="group" aria-label="Tour steps">
          {DEMO_TOUR_STEPS.map((s, idx) => (
            <button
              key={s.id}
              type="button"
              onClick={() => goStep(idx)}
              aria-current={idx === stepIndex ? "step" : undefined}
              className={`rounded-[var(--radius-xs)] border px-2 py-1 font-num text-xs cursor-pointer ${
                idx === stepIndex
                  ? "border-ring bg-primary text-primary-foreground"
                  : "border-border bg-surface text-muted-foreground hover:text-foreground"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <Button
          variant="outline"
          size="sm"
          disabled={stepIndex === 0}
          onClick={() => goStep(stepIndex - 1)}
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Back</span>
        </Button>

        <Button ref={nextBtnRef} variant="default" size="sm" onClick={() => goStep(stepIndex + 1)}>
          <span>{isLast ? "Finish (Space)" : "Next (Space)"}</span>
          {!isLast && <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          aria-label="Close guided tour"
          onClick={() => {
            setStepIndex(0);
            onClose();
          }}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      <div aria-live="polite" className="sr-only">
        Tour step {stepIndex + 1} of {DEMO_TOUR_STEPS.length}: {current.title}. {currentSummary}
      </div>
    </motion.section>
  );
}
