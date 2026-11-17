import { useRef, useState, type ChangeEvent } from "react";
import { StatusPill } from "../../components/StatusPill";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { ScrollArea } from "../../components/ui/scroll-area";
import type { IfcBarMetadata } from "../../lib/ifcLoader";
import type { Finding } from "../../types/bundle";

interface OpenIfcDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultIfcUrl?: string;
  findings: Finding[];
}

export function OpenIfcDialog({ open, onOpenChange, defaultIfcUrl, findings }: OpenIfcDialogProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bars, setBars] = useState<IfcBarMetadata[] | null>(null);
  const [sourceName, setSourceName] = useState<string>("");

  const parseBuffer = async (buffer: ArrayBuffer, label: string) => {
    setLoading(true);
    setError(null);
    try {
      const { loadIfcModel, disposeLoadedIfcModel } = await import("../../lib/ifcLoader");
      const loaded = await loadIfcModel(buffer, findings, true);
      const unique = new Map<number, IfcBarMetadata>();
      for (const { meta } of loaded.barsByKey.values()) {
        unique.set(meta.expressID, meta);
      }
      setBars(Array.from(unique.values()));
      setSourceName(label);
      disposeLoadedIfcModel(loaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleLoadUrl = async (url: string, label: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Could not fetch ${url} (${res.status}).`);
      await parseBuffer(await res.arrayBuffer(), label);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await parseBuffer(await file.arrayBuffer(), file.name);
    e.target.value = "";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(94vw,40rem)]">
        <DialogHeader>
          <DialogTitle>Open IFC (web-ifc)</DialogTitle>
          <DialogDescription>
            Lazy-loads web-ifc on demand to inspect IFC4 reinforcing bars and GlobalIds.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 flex flex-wrap gap-2">
          {defaultIfcUrl && (
            <Button
              size="sm"
              variant="secondary"
              disabled={loading}
              onClick={() => void handleLoadUrl(defaultIfcUrl, "joint.ifc")}
            >
              Inspect demo joint.ifc
            </Button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".ifc"
            className="hidden"
            onChange={(e) => void handleFileChange(e)}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={loading}
            onClick={() => inputRef.current?.click()}
          >
            Choose .ifc file
          </Button>
        </div>

        {loading && <p className="mt-4 text-xs text-muted-foreground">Parsing IFC via web-ifc…</p>}
        {error && (
          <p className="mt-4 rounded-[var(--radius-sm)] border border-fail/40 bg-fail-surface p-2.5 text-xs text-fail">
            {error}
          </p>
        )}

        {bars && !loading && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Source: <span className="font-num text-foreground">{sourceName}</span>
              </span>
              <span className="font-num">
                {bars.length} IFC reinforcing elements ·{" "}
                {bars.filter((b) => b.status === "FAIL").length} failing
              </span>
            </div>
            <ScrollArea className="h-56 rounded-[var(--radius-md)] border border-border bg-surface-sunken p-2">
              <div className="space-y-1.5">
                {bars.map((b) => (
                  <div
                    key={b.expressID}
                    className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-border bg-surface px-2.5 py-1.5 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-num font-medium text-foreground">{b.tag || b.name}</div>
                      <div className="font-num truncate text-muted-foreground">
                        GlobalId {b.globalId} · {b.predefinedType}
                      </div>
                    </div>
                    <StatusPill status={b.status === "FAIL" ? "fail" : "pass"} size="sm" />
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
