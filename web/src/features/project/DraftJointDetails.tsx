import type { DraftAcceptedValue, ProjectJointSummary } from "../../lib/api";

function formatDraftValues(entries: DraftAcceptedValue[] | null | undefined): string | null {
  if (!entries || entries.length === 0) return null;
  const seen: string[] = [];
  for (const e of entries) {
    if (e.value && !seen.includes(e.value)) {
      seen.push(e.value);
    }
  }
  return seen.length > 0 ? seen.join(", ") : null;
}

function DraftField({
  label,
  entries,
}: {
  label: string;
  entries: DraftAcceptedValue[] | null | undefined;
}) {
  const val = formatDraftValues(entries);
  return (
    <div className="flex flex-wrap items-baseline gap-1">
      <dt className="text-muted-foreground">{label}:</dt>
      <dd className={val ? "font-num font-medium text-foreground" : "text-muted-foreground"}>
        {val ?? "not on the drawing yet"}
      </dd>
    </div>
  );
}

/** Renders accepted values and explicit "not on the drawing yet" placeholders for an incomplete draft joint. */
export function DraftJointDetails({ joint }: { joint: ProjectJointSummary }) {
  const col = joint.column ?? {};
  const beams = joint.beams ?? [];

  return (
    <div className="space-y-2 rounded-[var(--radius-sm)] border border-border bg-surface-sunken p-2.5 text-xs">
      <div className="space-y-1">
        <p className="font-num font-medium text-foreground">Column {col.id ?? "not on the drawing yet"}</p>
        <dl className="flex flex-wrap gap-x-4 gap-y-1">
          <DraftField label="Section" entries={col.section} />
          <DraftField label="Main" entries={col.main} />
          <DraftField label="Ties" entries={col.ties} />
          <DraftField label="Cover" entries={col.cover} />
        </dl>
      </div>

      {beams.map((beam) => (
        <div key={beam.id} className="space-y-1 border-t border-border/60 pt-1.5">
          <p className="font-num font-medium text-foreground">
            Beam {beam.id}
            {beam.direction ? ` (along ${beam.direction.toUpperCase()})` : ""}
          </p>
          <dl className="flex flex-wrap gap-x-4 gap-y-1">
            <DraftField label="Section" entries={beam.section} />
            <DraftField label="Top" entries={beam.top} />
            <DraftField label="Bottom" entries={beam.bottom} />
            <DraftField label="Stirrups" entries={beam.stirrups} />
            <DraftField label="Cover" entries={beam.cover} />
            <DraftField label="Frames into" entries={beam.frames_into} />
          </dl>
          {beam.top_extra_unplaced && (
            <p className="text-check">Top extra support is not on the drawing yet.</p>
          )}
        </div>
      ))}
    </div>
  );
}
