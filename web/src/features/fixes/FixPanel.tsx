import { toast } from "sonner";
import { StatusPill } from "../../components/StatusPill";
import { Button } from "../../components/ui/button";
import { formatFixToastSummary } from "../../lib/format";
import { useWorkspaceStore } from "../../stores/workspace";
import type { Bundle } from "../../types/bundle";
import { FixOptionCard } from "./FixOptionCard";

interface FixPanelProps {
  bundle: Bundle;
  reportKey?: string;
  onOpenReport?: (optionIndex: number) => void;
}

/** Ranked fix options panel driving Before / After morph and report choice. */
export function FixPanel({ bundle, reportKey, onOpenReport }: FixPanelProps) {
  const mode = useWorkspaceStore((s) => s.mode);
  const optionIndex = useWorkspaceStore((s) => s.optionIndex);
  const chosenOptionIndex = useWorkspaceStore((s) => s.chosenOptionIndex);
  const chosenOptionByKey = useWorkspaceStore((s) => s.chosenOptionByKey);
  const setMode = useWorkspaceStore((s) => s.setMode);
  const setOptionIndex = useWorkspaceStore((s) => s.setOptionIndex);
  const setChosenOptionIndex = useWorkspaceStore((s) => s.setChosenOptionIndex);

  const activeChosen =
    reportKey !== undefined ? (chosenOptionByKey[reportKey] ?? null) : chosenOptionIndex;

  const options = bundle.fix.options;
  const summaryPillStatus =
    bundle.fix.status === "redesign"
      ? "redesign"
      : bundle.fix.status === "no_fix"
        ? "fail"
        : "pass";

  return (
    <div className="space-y-3">
      <div className="rounded-[var(--radius-md)] border border-border bg-surface-raised p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <StatusPill status={summaryPillStatus} size="sm" />
          <div className="inline-flex items-center gap-1" role="group" aria-label="Scene comparison mode">
            <Button
              variant={mode === "before" ? "default" : "outline"}
              size="sm"
              className="h-6 px-2.5 text-xs"
              onClick={() => setMode("before")}
            >
              Before
            </Button>
            <Button
              variant={mode === "after" ? "default" : "outline"}
              size="sm"
              className="h-6 px-2.5 text-xs"
              onClick={() => {
                setMode("after");
                const opt = options[optionIndex];
                if (opt) toast.success(formatFixToastSummary(opt.faces), { id: "fix-morph", duration: 2400 });
              }}
            >
              After
            </Button>
          </div>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{bundle.fix.summary}</p>
      </div>

      {options.map((opt, idx) => (
        <FixOptionCard
          key={opt.candidate.title}
          rank={idx + 1}
          option={opt}
          column={bundle.joint.column}
          beforeScene={bundle.scene}
          afterScene={bundle.option_scenes[idx]}
          isPreviewing={mode === "after" && optionIndex === idx}
          isChosen={activeChosen === idx}
          onPreviewAfter={() => {
            setOptionIndex(idx);
            setMode("after");
            toast.success(formatFixToastSummary(opt.faces), { id: "fix-morph", duration: 2400 });
          }}
          onShowBefore={() => setMode("before")}
          onUseInReport={() => {
            setChosenOptionIndex(idx, reportKey);
            toast.success(`Option #${idx + 1} marked for report`, {
              action: onOpenReport
                ? { label: "Open report", onClick: () => onOpenReport(idx) }
                : undefined,
            });
          }}
          onOpenReport={onOpenReport ? () => onOpenReport(idx) : undefined}
        />
      ))}
    </div>
  );
}
