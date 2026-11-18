import { ArrowRight, CheckCircle2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { StatusPill } from "../components/StatusPill";
import { Button } from "../components/ui/button";
import { DropZone } from "../features/reading/DropZone";
import { ReadingBoard, type PageTileState } from "../features/reading/ReadingBoard";
import { ReadingLog, type ReadingLogEntry } from "../features/reading/ReadingLog";
import {
  checkJointJson,
  createProject,
  projectEventsUrl,
  uploadDrawing,
} from "../lib/api";
import { projectPath, projectReviewPath } from "../lib/routes";
import { useWorkspaceStore } from "../stores/workspace";
import type { Bundle } from "../types/bundle";

function nowStamp(): string {
  return new Date().toLocaleTimeString("en-IN", { hour12: false });
}

export function UploadRoute() {
  const { id: routeProjectId } = useParams();
  const navigate = useNavigate();
  const setStatus = useWorkspaceStore((s) => s.setStatus);

  const [activeProjectId, setActiveProjectId] = useState<string>(routeProjectId || "live-drawing");
  const [pagesSpec, setPagesSpec] = useState("");
  const [phase, setPhase] = useState<"idle" | "uploading" | "reading" | "done" | "error">("idle");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [tiles, setTiles] = useState<PageTileState[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [logs, setLogs] = useState<ReadingLogEntry[]>([]);
  const [liveAnnouncement, setLiveAnnouncement] = useState("");
  const [summary, setSummary] = useState<{
    pages: number;
    joints: number;
    ready: string[];
    to_check: number;
  } | null>(null);
  const [pastedBundle, setPastedBundle] = useState<Bundle | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  const appendLog = (kind: ReadingLogEntry["kind"], message: string) => {
    setLogs((prev) => [
      ...prev,
      { id: `${prev.length}-${Date.now()}`, timestamp: nowStamp(), kind, message },
    ]);
  };

  const handleSelectPdf = async (file: File) => {
    setErrorText(null);
    setSummary(null);
    setPastedBundle(null);
    setTiles([]);
    setLogs([]);
    setPhase("uploading");

    try {
      const targetId =
        routeProjectId && routeProjectId !== "c4-b12"
          ? routeProjectId
          : `${file.name.replace(/\.pdf$/i, "").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 32)}-${Date.now().toString(36).slice(-4)}`;

      await createProject({ id: targetId, name: file.name.replace(/\.pdf$/i, "") });
      setActiveProjectId(targetId);

      appendLog("info", `Uploading ${file.name} to project ${targetId}.`);
      setStatus({ activity: `Reading ${file.name}` });

      await uploadDrawing(targetId, file, { pages: pagesSpec || undefined });
      setPhase("reading");

      eventSourceRef.current?.close();
      const es = new EventSource(projectEventsUrl(targetId));
      eventSourceRef.current = es;

      es.addEventListener("page_started", (ev) => {
        const data = JSON.parse(ev.data) as {
          page: number;
          total: number;
          pages?: number[];
          needs_ocr?: boolean;
        };
        setTotalPages(data.total);
        setTiles((prev) => {
          const map = new Map(prev.map((t) => [t.page, t]));
          const expectedPages = Array.isArray(data.pages)
            ? data.pages
            : data.page <= data.total
              ? Array.from({ length: data.total }, (_, i) => i + 1)
              : [data.page];
          for (const n of expectedPages) {
            if (!map.has(n)) map.set(n, { page: n, status: "queued" });
          }
          map.set(data.page, { page: data.page, status: "reading", needsOcr: data.needs_ocr });
          return [...map.values()].sort((a, b) => a.page - b.page);
        });
        setStatus({ activity: `Reading page ${data.page} of ${data.total}` });
        setLiveAnnouncement(`Reading page ${data.page} of ${data.total}.`);
        appendLog("info", `Page ${data.page} of ${data.total}: reading channels started.`);
      });

      es.addEventListener("page_read", (ev) => {
        const data = JSON.parse(ev.data) as {
          page: number;
          total: number;
          agreed: number;
          to_check: number;
          unassigned: number;
          ocr?: number;
          ocr_repairs?: number;
        };
        setTiles((prev) => {
          const next = prev.map((t) =>
            t.page === data.page
              ? {
                  ...t,
                  status: "done" as const,
                  agreed: data.agreed,
                  toCheck: data.to_check,
                  unassigned: data.unassigned,
                  ocrWords: data.ocr,
                  ocrRepairs: data.ocr_repairs,
                }
              : t,
          );
          return next;
        });
        const msg = `Page ${data.page}: ${data.agreed} agreed, ${data.to_check} to check.`;
        setLiveAnnouncement(msg);
        appendLog("done", msg);
      });

      es.addEventListener("joint_ready", (ev) => {
        const data = JSON.parse(ev.data) as { joint: string; fail_count: number; status: string };
        const msg = `Joint ${data.joint} checked (${data.fail_count} fails).`;
        setLiveAnnouncement(msg);
        appendLog("joint", msg);
      });

      es.addEventListener("done", (ev) => {
        const data = JSON.parse(ev.data) as {
          pages: number;
          joints: number;
          ready: string[];
          to_check: number;
        };
        setSummary(data);
        setPhase("done");
        setStatus({
          activity: null,
          toCheckCount: data.to_check,
        });
        const msg = `Finished ${data.pages} page(s): ${data.joints} joint(s) linked, ${data.to_check} To check.`;
        setLiveAnnouncement(msg);
        appendLog("done", msg);
        es.close();
        if (targetId !== routeProjectId) {
          void navigate(projectPath(targetId), { replace: false });
        }
      });

      es.addEventListener("error", (ev) => {
        let msg = "Drawing read stopped because the reader reported an error.";
        if ("data" in ev && typeof ev.data === "string" && ev.data) {
          try {
            const parsed = JSON.parse(ev.data) as { message?: string };
            if (parsed.message) msg = parsed.message;
          } catch {
            // use fallback
          }
        }
        setErrorText(msg);
        setPhase("error");
        setStatus({ activity: null });
        appendLog("error", msg);
        es.close();
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed.";
      setErrorText(msg);
      setPhase("error");
      setStatus({ activity: null });
      appendLog("error", msg);
    }
  };

  const handlePasteJoint = async (rawJson: string) => {
    const parsed = JSON.parse(rawJson) as unknown;
    const bundle = await checkJointJson(parsed);
    setPastedBundle(bundle);
  };

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Upload Structural Drawings</h1>
          <p className="text-sm text-muted-foreground">
            Upload a drawing PDF to run dual-channel reading, inspect To check items, and verify
            joints in 3D.
          </p>
        </div>
        {routeProjectId && (
          <Button variant="outline" size="sm" asChild>
            <Link to={projectPath(activeProjectId)}>Project overview</Link>
          </Button>
        )}
      </div>

      <DropZone
        disabled={phase === "uploading" || phase === "reading"}
        pagesSpec={pagesSpec}
        onPagesSpecChange={setPagesSpec}
        onSelectPdf={handleSelectPdf}
        onPasteJoint={handlePasteJoint}
        errorText={errorText}
      />

      {pastedBundle && (
        <section className="rounded-[var(--radius-lg)] border border-border bg-surface p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-base font-semibold">{pastedBundle.joint.id}</h2>
            <StatusPill
              status={
                pastedBundle.report.findings.some((f) => f.status === "fail") ? "fail" : "pass"
              }
              count={pastedBundle.report.findings.filter((f) => f.status === "fail").length}
            />
          </div>
          <p className="text-xs text-muted-foreground">{pastedBundle.fix.summary}</p>
        </section>
      )}

      {(tiles.length > 0 || logs.length > 0) && (
        <div className="space-y-5 rounded-[var(--radius-lg)] border border-border bg-surface p-4 sm:p-5">
          {tiles.length > 0 && (
            <ReadingBoard
              pages={tiles}
              totalPages={Math.max(totalPages, tiles.length)}
              liveAnnouncement={liveAnnouncement}
            />
          )}
          <ReadingLog entries={logs} />

          {phase === "done" && summary && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
              <div className="flex items-center gap-2 text-xs text-foreground">
                <CheckCircle2 className="h-4 w-4 text-pass" aria-hidden="true" />
                <span>
                  {summary.joints} joint(s) linked · {summary.ready.length} checked ·{" "}
                  {summary.to_check} item(s) to check
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {summary.to_check > 0 && (
                  <Button size="sm" asChild>
                    <Link to={projectReviewPath(activeProjectId)}>
                      <span>Review To check ({summary.to_check})</span>
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  </Button>
                )}
                <Button variant="outline" size="sm" asChild>
                  <Link to={projectPath(activeProjectId)}>Open project</Link>
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
