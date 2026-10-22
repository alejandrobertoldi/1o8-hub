"use client";

interface ExportInfo {
  export_count: number;
  last_exported_at: string;
  last_url: string | null;
}

interface ExportHistoryProps {
  exportInfo: ExportInfo | null;
}

function relativeDate(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US");
}

export function ExportBadge({ exportInfo }: ExportHistoryProps) {
  if (!exportInfo || exportInfo.export_count === 0) {
    return (
      <span className="rounded-md px-1.5 py-0.5 text-[8px] font-bold bg-stone-100 text-stone-500 dark:bg-zinc-800 dark:text-zinc-500"
        aria-label="Never exported"
      >
        Never exported
      </span>
    );
  }

  return (
    <span
      className="rounded-md px-1.5 py-0.5 text-[8px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
      aria-label={`Last exported ${relativeDate(exportInfo.last_exported_at)}, ${exportInfo.export_count} total exports`}
    >
      Exported &#10003; {relativeDate(exportInfo.last_exported_at)}
    </span>
  );
}

export function ExportHistory({ exportInfo }: ExportHistoryProps) {
  if (!exportInfo || exportInfo.export_count === 0) {
    return (
      <p className="text-[10px] text-muted-foreground/50 italic">Never exported</p>
    );
  }

  return (
    <div className="space-y-1">
      <p className="text-[10px] text-foreground">
        <span className="font-bold">{exportInfo.export_count}</span> export{exportInfo.export_count !== 1 ? "s" : ""}
        {" "}&middot; Last: {relativeDate(exportInfo.last_exported_at)}
      </p>
      {exportInfo.last_url && (
        <a
          href={exportInfo.last_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-brand hover:text-brand-hover underline"
        >
          Open latest export &#8599;
        </a>
      )}
    </div>
  );
}
