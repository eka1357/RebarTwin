import { BookOpen } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { formatClause } from "../../lib/format";
import type { RuleMeta } from "../../types/bundle";

interface ClauseChipProps {
  clause: string;
  ruleId: string;
  meta?: RuleMeta;
}

/** Focusable BIS clause badge opening a popover with rule title, verification status, and basis. */
export function ClauseChip({ clause, ruleId, meta }: ClauseChipProps) {
  const label = formatClause(clause);
  const basisText = meta?.basis ?? "Engineering geometry and code check.";
  const notInOriginalBis =
    basisText.toLowerCase().includes("not yet read in the bis original") ||
    basisText.toLowerCase().includes("not verified");

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-[var(--radius-xs)] border border-control-border/70 bg-surface px-1.5 py-0.5 font-num text-xs text-muted-foreground transition-colors duration-[var(--dur-1)] hover:border-border-strong hover:text-foreground cursor-pointer"
          aria-label={`Clause basis: ${label}`}
        >
          <BookOpen className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span>{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="space-y-2 text-xs">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-num font-semibold text-foreground">{meta?.clause ?? clause}</p>
            <p className="mt-0.5 font-medium text-foreground">{meta?.title ?? ruleId}</p>
          </div>
          <Badge variant={notInOriginalBis ? "advisory" : "pass"}>
            {notInOriginalBis ? "Needs BIS check" : "Verified"}
          </Badge>
        </div>
        <p className="leading-relaxed text-muted-foreground">{basisText}</p>
      </PopoverContent>
    </Popover>
  );
}
