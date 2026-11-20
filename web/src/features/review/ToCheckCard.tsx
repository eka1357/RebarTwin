import { AlertTriangle, Check, Edit3, SkipForward } from "lucide-react";
import { forwardRef, useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router";
import { StatusPill } from "../../components/StatusPill";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { pageCropUrl, type ToCheckItem } from "../../lib/api";
import { describeFieldMeta, validateCalloutGrammar } from "../../lib/calloutGrammar";
import { jointPath } from "../../lib/routes";

interface ToCheckCardProps {
  projectId: string;
  item: ToCheckItem;
  active: boolean;
  editing: boolean;
  busy?: boolean;
  onFocusCard: () => void;
  onToggleEdit: (next: boolean) => void;
  onResolve: (value: string) => void;
  onSkip: () => void;
}

/**
 * Resolution card for a reader disagreement, ambiguity, or missing general note:
 * drawing crop on warm paper tokens, Gemini & Parser radio choices (keys 1 / 2),
 * grammar-validated manual input (E), and Skip (S).
 */
export const ToCheckCard = forwardRef<HTMLElement, ToCheckCardProps>(function ToCheckCard(
  {
    projectId,
    item,
    active,
    editing,
    busy = false,
    onFocusCard,
    onToggleEdit,
    onResolve,
    onSkip,
  },
  ref,
) {
  const initialDraft = item.resolution?.value ?? item.parser?.value ?? item.gemini?.value ?? "";
  const [draft, setDraft] = useState(initialDraft);
  const [errorText, setErrorText] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const inputId = useId();
  const errorId = useId();

  useEffect(() => {
    setDraft(item.resolution?.value ?? item.parser?.value ?? item.gemini?.value ?? "");
    setErrorText(null);
  }, [item.id, item.resolution?.value, item.parser?.value, item.gemini?.value]);

  useEffect(() => {
    if (editing) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [editing]);

  const meta = describeFieldMeta(item.field);
  const isResolved = Boolean(item.resolution);
  const isUnsupported = item.reason === "unsupported";
  const canEdit = !busy && !isUnsupported;
  const hasGemini = Boolean(item.gemini?.value);
  const hasParser = Boolean(item.parser?.value);
  const hasCrop = item.page > 0;
  const cropSrc = hasCrop ? pageCropUrl(projectId, item.page, item.box_2d) : null;

  const submitDraft = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    const res = validateCalloutGrammar(item.field, draft);
    if (!res.valid || !res.normalized) {
      setErrorText(res.error ?? "Invalid value.");
      return;
    }
    setErrorText(null);
    onResolve(res.normalized);
  };

  return (
    <article
      ref={ref}
      data-theme="light"
      onFocusCapture={onFocusCard}
      className={`surface-paper rounded-[var(--radius-lg)] border p-4 shadow-xs transition-colors duration-[var(--dur-1)] ${
        active ? "border-2 border-ring" : "border-paper-border"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {item.project_level && (
              <Badge variant="check">
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                <span>Blocks all joints</span>
              </Badge>
            )}
            <Badge variant="muted" className="font-num">
              {item.reason}
            </Badge>
            <h2 className="font-display text-sm font-semibold text-foreground">
              {item.member
                ? `${item.member}${item.building ? ` (${item.building})` : ""} · ${item.field}`
                : item.field}
            </h2>
            {item.building && (
              <Badge variant="muted" className="font-num">
                {item.building}
              </Badge>
            )}
            {item.layer > 1 && (
              <Badge variant="muted" className="font-num">
                Layer {item.layer}
              </Badge>
            )}
            {item.level && (
              <Badge variant="muted" className="font-num">
                {item.level}
              </Badge>
            )}
          </div>

          <p className="font-num text-xs text-muted-foreground">
            {item.joint ? (
              <>
                Joint{" "}
                <Link
                  to={jointPath(projectId, item.joint)}
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  {item.joint}
                </Link>
              </>
            ) : item.project_level ? (
              "Applies project-wide"
            ) : item.blocks_joint === false ? (
              "Other reading · does not block a joint"
            ) : (
              "Unlinked member item"
            )}
            {item.page > 0 ? ` · Page ${item.page}` : ""}
            {item.box_2d ? ` · box [${item.box_2d.join(", ")}]` : ""}
          </p>
        </div>

        <StatusPill status={isResolved ? "pass" : "to_check"} size="sm" />
      </div>

      <p className="mt-2 text-xs leading-relaxed text-foreground">{item.detail}</p>

      {cropSrc && (
        <div className="mt-3 overflow-hidden rounded-[var(--radius-md)] border border-paper-border bg-paper p-2">
          <img
            src={cropSrc}
            loading="lazy"
            alt={`Drawing crop for ${item.member ?? item.field} on page ${item.page}`}
            className="mx-auto max-h-40 w-auto object-contain"
          />
        </div>
      )}

      {/* Side-by-side Gemini and Parser choices as an accessible radio group */}
      <div
        role="radiogroup"
        aria-label={`Readings for ${item.member ?? ""} ${item.field}`}
        className="mt-3 grid gap-2 sm:grid-cols-2"
      >
        <button
          type="button"
          role="radio"
          aria-checked={item.resolution?.value === item.gemini?.value && hasGemini}
          disabled={!hasGemini || !canEdit}
          onClick={() => item.gemini?.value && canEdit && onResolve(item.gemini.value)}
          className={`flex flex-col items-start gap-1 rounded-[var(--radius-md)] border p-3 text-left transition-colors duration-[var(--dur-1)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
            item.resolution?.value === item.gemini?.value && hasGemini
              ? "border-2 border-pass bg-pass-surface"
              : "border-paper-border bg-surface-raised hover:border-border-strong"
          }`}
        >
          <div className="flex w-full items-center justify-between gap-2">
            <Badge variant="muted">Gemini</Badge>
            <span className="font-num text-xs text-muted-foreground">Key 1</span>
          </div>
          <span className="font-num text-sm font-semibold text-foreground">
            {item.gemini?.value ?? "No reading"}
          </span>
        </button>

        <button
          type="button"
          role="radio"
          aria-checked={item.resolution?.value === item.parser?.value && hasParser}
          disabled={!hasParser || !canEdit}
          onClick={() => item.parser?.value && canEdit && onResolve(item.parser.value)}
          className={`flex flex-col items-start gap-1 rounded-[var(--radius-md)] border p-3 text-left transition-colors duration-[var(--dur-1)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
            item.resolution?.value === item.parser?.value && hasParser
              ? "border-2 border-pass bg-pass-surface"
              : "border-paper-border bg-surface-raised hover:border-border-strong"
          }`}
        >
          <div className="flex w-full items-center justify-between gap-2">
            <Badge variant="muted">Parser</Badge>
            <span className="font-num text-xs text-muted-foreground">Key 2</span>
          </div>
          <span className="font-num text-sm font-semibold text-foreground">
            {item.parser?.value ?? "No reading"}
          </span>
        </button>
      </div>

      {/* Quick chips for missing project-wide settings (zone / exposure) */}
      {meta.quickOptions && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {meta.quickOptions.map((opt) => (
            <Button
              key={opt.value}
              type="button"
              variant={item.resolution?.value === opt.value ? "default" : "outline"}
              size="sm"
              disabled={!canEdit}
              onClick={() => canEdit && onResolve(opt.value)}
              className="h-7 text-xs"
            >
              {opt.label}
            </Button>
          ))}
        </div>
      )}

      {/* Manual edit form (toggled with E or button) */}
      {editing && canEdit && (
        <form onSubmit={submitDraft} className="mt-3 space-y-2 border-t border-paper-border pt-3">
          <label htmlFor={inputId} className="block text-xs font-medium text-foreground">
            Confirmed value ({item.field})
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id={inputId}
              ref={inputRef}
              type="text"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                if (errorText) setErrorText(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  onToggleEdit(false);
                }
              }}
              placeholder={meta.placeholder}
              aria-invalid={Boolean(errorText)}
              aria-describedby={errorText ? errorId : undefined}
              className="h-9 min-w-48 flex-1 rounded-[var(--radius-sm)] border border-paper-border bg-surface-raised px-2.5 font-num text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button type="submit" size="sm" disabled={busy}>
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Confirm</span>
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => onToggleEdit(false)}>
              Cancel
            </Button>
          </div>
          {errorText && (
            <p id={errorId} role="alert" className="text-xs font-medium text-fail">
              {errorText}
            </p>
          )}
        </form>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-paper-border pt-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            disabled={!canEdit}
            onClick={() => onToggleEdit(!editing)}
          >
            <Edit3 className="h-3 w-3" aria-hidden="true" />
            <span>Type value (E)</span>
          </Button>
          {isUnsupported && (
            <span className="text-xs text-muted-foreground">
              Not modelled yet; cannot be cleared in To check.
            </span>
          )}
          {!isResolved && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              disabled={busy}
              onClick={onSkip}
            >
              <SkipForward className="h-3 w-3" aria-hidden="true" />
              <span>Skip (S)</span>
            </Button>
          )}
        </div>

        {item.resolution && (
          <span className="font-num text-xs font-medium text-pass">
            Confirmed: {item.resolution.value}
          </span>
        )}
      </div>
    </article>
  );
});
