import { FileText, Sparkles, Upload } from "lucide-react";
import { useId, useRef, useState } from "react";
import { Link } from "react-router";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";

const MAX_PDF_BYTES = 100 * 1024 * 1024;

function validatePagesSpec(spec: string): string | null {
  const trimmed = spec.trim();
  if (!trimmed) return null;
  let partCount = 0;
  for (const rawPart of trimmed.split(",")) {
    const part = rawPart.trim();
    if (!part) continue;
    partCount += 1;
    const single = /^(\d+)$/.exec(part);
    if (single) {
      if (Number.parseInt(single[1], 10) >= 1) continue;
      return "Enter page numbers or ranges, for example 7,10-12.";
    }
    const range = /^(\d+)\s*-\s*(\d+)$/.exec(part);
    if (range) {
      const start = Number.parseInt(range[1], 10);
      const end = Number.parseInt(range[2], 10);
      if (start >= 1 && start <= end) continue;
    }
    return "Enter page numbers or ranges, for example 7,10-12.";
  }
  return partCount > 0 ? null : "Enter page numbers or ranges, for example 7,10-12.";
}

interface DropZoneProps {
  disabled?: boolean;
  pagesSpec: string;
  onPagesSpecChange: (val: string) => void;
  onSelectPdf: (file: File) => void;
  onPasteJoint?: (rawJson: string) => Promise<void>;
  errorText?: string | null;
}

/**
 * Centered PDF upload zone modeled on Manus's calm entry layout:
 * drag-and-drop surface, labelled page filter, and starter chips.
 */
export function DropZone({
  disabled = false,
  pagesSpec,
  onPagesSpecChange,
  onSelectPdf,
  onPasteJoint,
  errorText,
}: DropZoneProps) {
  const [dragging, setDragging] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pagesInputId = useId();
  const errorId = useId();
  const pasteAreaId = useId();
  const pasteErrId = useId();

  const pagesError = validatePagesSpec(pagesSpec);
  const displayedError = pagesError ?? clientError ?? errorText;
  const uploadDisabled = disabled || Boolean(pagesError);

  const pickFile = (file: File | undefined | null) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setClientError("Only PDF drawing sets (.pdf) are accepted.");
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setClientError("Drawing PDF exceeds the 100 MB upload limit.");
      return;
    }
    const specErr = validatePagesSpec(pagesSpec);
    if (specErr) {
      setClientError(specErr);
      return;
    }
    setClientError(null);
    onSelectPdf(file);
  };

  const handlePasteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onPasteJoint) return;
    setPasteError(null);
    try {
      JSON.parse(pasteText);
    } catch {
      setPasteError("Invalid JSON. Paste a valid RebarTwin Joint JSON object.");
      return;
    }
    setPasting(true);
    try {
      await onPasteJoint(pasteText);
      setPasteOpen(false);
    } catch (err) {
      setPasteError(err instanceof Error ? err.message : "Could not check pasted joint JSON.");
    } finally {
      setPasting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <div
        className={`rounded-[var(--radius-lg)] border-2 border-dashed p-6 sm:p-8 text-center transition-colors duration-[var(--dur-1)] ${dragging
          ? "border-ring bg-surface-raised"
          : "border-control-border bg-surface hover:border-border-strong"
          }`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!uploadDisabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (uploadDisabled) return;
          pickFile(e.dataTransfer.files[0]);
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="sr-only"
          aria-label="Choose structural PDF file"
          disabled={uploadDisabled}
          onChange={(e) => {
            pickFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />

        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] border border-border bg-surface-raised">
          <Upload className="h-5 w-5 text-foreground" aria-hidden="true" />
        </div>

        <h2 className="mt-4 font-display text-lg font-semibold text-foreground">
          Drop a structural drawing PDF
        </h2>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          Each sheet is rendered to PNG, read in parallel by Gemini and the text parser, and checked
          for agreement before building 3D joints.
        </p>

        <div className="mt-4 flex flex-wrap items-end justify-center gap-3">
          <div className="text-left">
            <label
              htmlFor={pagesInputId}
              className="block text-xs font-medium text-muted-foreground"
            >
              Pages (optional)
            </label>
            <input
              id={pagesInputId}
              type="text"
              value={pagesSpec}
              onChange={(e) => {
                setClientError(null);
                onPagesSpecChange(e.target.value);
              }}
              placeholder="All sheets, or e.g. 7,10-12"
              disabled={disabled}
              aria-invalid={Boolean(pagesError)}
              aria-describedby={displayedError ? errorId : undefined}
              className="mt-1 h-9 w-56 rounded-[var(--radius-sm)] border border-control-border bg-surface-sunken px-2.5 font-num text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <Button
            type="button"
            disabled={uploadDisabled}
            onClick={() => fileInputRef.current?.click()}
            className="h-9"
          >
            <FileText className="h-4 w-4" aria-hidden="true" />
            <span>Upload a drawing set</span>
          </Button>
        </div>

        {displayedError && (
          <p id={errorId} role="alert" className="mt-3 text-xs font-medium text-fail">
            {displayedError}
          </p>
        )}
      </div>

      {/* Starter chips */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link to="/demo">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Try the example joint</span>
            <Badge variant="muted" className="ml-1">
              Offline
            </Badge>
          </Link>
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploadDisabled}
          onClick={() => fileInputRef.current?.click()}
        >
          <span>Select PDF from computer</span>
        </Button>

        {onPasteJoint && (
          <Button type="button" variant="outline" size="sm" onClick={() => setPasteOpen(true)}>
            <span>Paste a joint</span>
          </Button>
        )}
      </div>

      <Dialog open={pasteOpen} onOpenChange={setPasteOpen}>
        <DialogContent className="w-[min(94vw,36rem)]">
          <DialogHeader>
            <DialogTitle>Paste a joint JSON</DialogTitle>
            <DialogDescription>
              Check a standalone RebarTwin Joint JSON payload directly against IS 456 and IS 13920.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handlePasteSubmit} className="mt-2 space-y-3">
            <div>
              <label htmlFor={pasteAreaId} className="block text-xs font-medium text-foreground">
                Joint JSON
              </label>
              <textarea
                id={pasteAreaId}
                rows={8}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                aria-describedby={pasteError ? pasteErrId : undefined}
                placeholder='{"id": "C4xB12", ...}'
                className="mt-1 w-full rounded-[var(--radius-sm)] border border-control-border bg-surface-sunken p-2.5 font-num text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              {pasteError && (
                <p id={pasteErrId} role="alert" className="mt-1.5 text-xs text-fail">
                  {pasteError}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setPasteOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={pasting || !pasteText.trim()}>
                {pasting ? "Checking..." : "Check joint"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
