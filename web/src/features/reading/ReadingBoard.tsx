import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Badge } from "../../components/ui/badge";
import { Progress } from "../../components/ui/progress";

export interface PageTileState {
  page: number;
  status: "queued" | "reading" | "done" | "error";
  needsOcr?: boolean;
  agreed?: number;
  toCheck?: number;
  unassigned?: number;
  ocrWords?: number;
  ocrRepairs?: number;
  error?: string;
}

interface ReadingBoardProps {
  pages: PageTileState[];
  totalPages: number;
  liveAnnouncement: string;
}

/**
 * Live page grid on paper surface (`surface-paper`):
 * queued, reading (1.2 s scan line under normal motion, static badge + Progress bar
 * under reduced motion), done (agreed / to check counts), error.
 */
export function ReadingBoard({ pages, totalPages, liveAnnouncement }: ReadingBoardProps) {
  const reduced = Boolean(useReducedMotion());
  const doneCount = pages.filter((p) => p.status === "done").length;
  const pct = totalPages > 0 ? Math.round((doneCount / totalPages) * 100) : 0;

  return (
    <section aria-label="Reading progress board" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-base font-semibold text-foreground">
            Reading sheets ({doneCount} of {totalPages})
          </h2>
          <p className="text-xs text-muted-foreground">
            Two channels read each sheet independently; only matching callouts become accepted fields.
          </p>
        </div>
        <span className="font-num text-xs font-medium text-foreground">{pct}%</span>
      </div>

      <Progress value={pct} aria-label={`Reading completion ${pct}%`} />

      <div aria-live="polite" className="sr-only">
        {liveAnnouncement}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {pages.map((tile) => (
          <article
            key={tile.page}
            data-theme="light"
            className="surface-paper relative overflow-hidden rounded-[var(--radius-md)] border p-3 shadow-xs"
          >
            {/* 1.2 s scan line sweep when actively reading under normal motion */}
            {tile.status === "reading" && !reduced && (
              <motion.div
                aria-hidden="true"
                initial={{ y: -8 }}
                animate={{ y: 92 }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
                className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-check"
              />
            )}

            <div className="flex items-center justify-between gap-2">
              <span className="font-num text-xs font-semibold text-foreground">
                Page {tile.page}
              </span>
              {tile.status === "queued" && (
                <Badge variant="muted">
                  <Clock className="h-3 w-3" aria-hidden="true" />
                  <span>Queued</span>
                </Badge>
              )}
              {tile.status === "reading" && (
                <Badge variant="check">Reading</Badge>
              )}
              {tile.status === "done" && (
                <Badge variant="pass">
                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                  <span>Done</span>
                </Badge>
              )}
              {tile.status === "error" && (
                <Badge variant="fail">
                  <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                  <span>Error</span>
                </Badge>
              )}
            </div>

            {tile.status === "reading" && reduced && (
              <div className="mt-2.5">
                <Progress value={55} aria-label={`Page ${tile.page} reading in progress`} />
              </div>
            )}

            {tile.status === "done" && (
              <dl className="mt-2.5 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <dt className="text-muted-foreground">Agreed</dt>
                  <dd className="font-num font-semibold text-pass">{tile.agreed ?? 0}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">To check</dt>
                  <dd
                    className={`font-num font-semibold ${
                      (tile.toCheck ?? 0) > 0 ? "text-check" : "text-foreground"
                    }`}
                  >
                    {tile.toCheck ?? 0}
                  </dd>
                </div>
                {(tile.ocrWords ?? 0) > 0 && (
                  <div className="col-span-2">
                    <dt className="text-muted-foreground">OCR layer</dt>
                    <dd className="font-num text-foreground">
                      {tile.ocrWords} words · {tile.ocrRepairs ?? 0} repaired
                    </dd>
                  </div>
                )}
              </dl>
            )}

            {tile.status === "queued" && (
              <p className="mt-2.5 text-xs text-muted-foreground">
                {tile.needsOcr ? "Waiting for OCR and channels." : "Waiting in tile queue."}
              </p>
            )}

            {tile.status === "error" && (
              <p role="alert" className="mt-2.5 text-xs text-fail">
                {tile.error ?? "Failed to read sheet."}
              </p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
