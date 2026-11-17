import { useEffect, useRef, useState } from "react";
import type { BarMetadata, ProvenanceEntry } from "../types";

interface ProvenanceCropProps {
  bar: BarMetadata;
  provenance?: Record<string, ProvenanceEntry> | ProvenanceEntry[];
  pages?: Record<string, string>;
  notes: string[];
}

function findMatchingProvenance(
  bar: BarMetadata,
  provenance?: Record<string, ProvenanceEntry> | ProvenanceEntry[],
): ProvenanceEntry[] {
  if (!provenance) return [];
  const entries: ProvenanceEntry[] = Array.isArray(provenance)
    ? provenance
    : Object.entries(provenance).map(([field, val]) => ({ ...val, field: val.field ?? field }));

  const memberLower = bar.member.toLowerCase();
  const roleLower = bar.role.toLowerCase();
  return entries.filter((e) => {
    const f = e.field.toLowerCase();
    if (!f.includes(memberLower)) return false;
    if (roleLower === "top" || roleLower === "bottom") {
      return f.includes(roleLower) || (!f.includes("bottom") && !f.includes("top"));
    }
    return true;
  });
}

function CropCanvas({ entry, imageSrc }: { entry: ProvenanceEntry; imageSrc: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      setError(null);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const [ymin, xmin, ymax, xmax] = entry.box_2d;
      const pad = 35; // 3.5% margin around normalized 0..1000 box
      const x0 = Math.max(0, ((xmin - pad) / 1000) * img.naturalWidth);
      const y0 = Math.max(0, ((ymin - pad) / 1000) * img.naturalHeight);
      const x1 = Math.min(img.naturalWidth, ((xmax + pad) / 1000) * img.naturalWidth);
      const y1 = Math.min(img.naturalHeight, ((ymax + pad) / 1000) * img.naturalHeight);
      const sw = Math.max(1, x1 - x0);
      const sh = Math.max(1, y1 - y0);

      const maxW = 360;
      const scale = Math.min(2, maxW / sw);
      canvas.width = Math.round(sw * scale);
      canvas.height = Math.round(sh * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, x0, y0, sw, sh, 0, 0, canvas.width, canvas.height);

      // Highlight exact box_2d inside the padded crop
      const bx = ((xmin / 1000) * img.naturalWidth - x0) * scale;
      const by = ((ymin / 1000) * img.naturalHeight - y0) * scale;
      const bw = ((xmax - xmin) / 1000) * img.naturalWidth * scale;
      const bh = ((ymax - ymin) / 1000) * img.naturalHeight * scale;
      ctx.strokeStyle = "#ffb74d";
      ctx.lineWidth = 2;
      ctx.strokeRect(bx, by, bw, bh);
    };
    img.onerror = () => {
      if (!cancelled) setError("Page image could not be loaded.");
    };
    img.src = imageSrc;
    return () => {
      cancelled = true;
    };
  }, [entry, imageSrc]);

  if (error) return <div className="muted-note">{error}</div>;
  return <canvas ref={canvasRef} className="provenance-canvas" />;
}

export function ProvenanceCrop({ bar, provenance, pages, notes }: ProvenanceCropProps) {
  const matches = findMatchingProvenance(bar, provenance);

  if (matches.length === 0) {
    return (
      <div className="provenance-empty">
        <div className="provenance-title">Drawing Provenance</div>
        <p className="muted-note">
          No PDF drawing crop attached for <code>{bar.member}</code> (this joint was loaded from a
          JSON spec). When PDF drawings are processed by the reader, the source page cropped to{" "}
          <code>box_2d</code> will render here.
        </p>
        {notes.length > 0 && (
          <ul className="notes-list">
            {notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="provenance-box">
      <div className="provenance-title">Drawing Provenance</div>
      {matches.map((entry, idx) => {
        const imageSrc = entry.page_image ?? pages?.[String(entry.page)];
        return (
          <div key={`${entry.field}-${idx}`} className="provenance-item">
            <div className="provenance-meta">
              <span>Page {entry.page}</span>
              <span>Field: {entry.field}</span>
              <span>Channel: {entry.channel}</span>
            </div>
            <div className="provenance-text">“{entry.text}”</div>
            {imageSrc ? (
              <CropCanvas entry={entry} imageSrc={imageSrc} />
            ) : (
              <div className="muted-note">
                box_2d: [{entry.box_2d.join(", ")}] (page image not attached)
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
