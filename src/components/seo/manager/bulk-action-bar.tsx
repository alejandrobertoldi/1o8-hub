"use client";

import { useState } from "react";

interface BulkActionBarProps {
  selectedCount: number;
  onApprove: () => Promise<void>;
  onExport: () => Promise<void>;
  onReassign: (userId: string) => Promise<void>;
  onClear: () => void;
  team: Array<{ id: string; name: string | null; email: string }>;
}

export function BulkActionBar({
  selectedCount,
  onApprove,
  onExport,
  onReassign,
  onClear,
  team,
}: BulkActionBarProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [showReassign, setShowReassign] = useState(false);
  const [exportProgress, setExportProgress] = useState<string | null>(null);

  if (selectedCount === 0) return null;

  async function handleAction(action: string, fn: () => Promise<void>) {
    setLoading(action);
    try {
      await fn();
    } catch {
      // Error handled by parent
    }
    setLoading(null);
    setExportProgress(null);
  }

  return (
    <div
      role="toolbar"
      aria-label={`Bulk actions for ${selectedCount} selected projects`}
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-stone-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-900 pb-[env(safe-area-inset-bottom)]"
    >
      <div className="flex items-center justify-between px-6 py-3 max-w-screen-xl mx-auto">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-foreground">
            {selectedCount} selected
          </span>
          <button
            onClick={onClear}
            className="text-[10px] text-muted-foreground hover:text-foreground underline"
          >
            Clear
          </button>
        </div>

        <div className="flex items-center gap-2">
          {exportProgress && (
            <span className="text-[10px] text-muted-foreground mr-2">{exportProgress}</span>
          )}

          <button
            onClick={() => handleAction("approve", onApprove)}
            disabled={!!loading}
            className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 transition-colors dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400"
          >
            {loading === "approve" ? "Approving…" : "Approve"}
          </button>

          <button
            onClick={() => handleAction("export", onExport)}
            disabled={!!loading}
            className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-xs font-bold text-foreground hover:bg-stone-50 disabled:opacity-50 transition-colors dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
          >
            {loading === "export" ? "Exporting…" : "Export All"}
          </button>

          <div className="relative">
            <button
              onClick={() => setShowReassign(!showReassign)}
              disabled={!!loading}
              className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-xs font-bold text-foreground hover:bg-stone-50 disabled:opacity-50 transition-colors dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            >
              Reassign
            </button>
            {showReassign && (
              <div className="absolute bottom-full right-0 mb-2 w-52 rounded-lg border border-stone-200 bg-white shadow-xl py-1 max-h-48 overflow-y-auto dark:border-zinc-700 dark:bg-zinc-900">
                {team.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      setShowReassign(false);
                      handleAction("reassign", () => onReassign(m.id));
                    }}
                    className="w-full px-3 py-2 text-xs text-left text-foreground hover:bg-stone-50 dark:hover:bg-zinc-800"
                  >
                    {m.name || m.email}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={onClear}
            className="rounded-lg border border-stone-300 px-3 py-2 text-xs text-muted-foreground hover:bg-stone-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            title="Cancel selection"
          >
            &#10005;
          </button>
        </div>
      </div>
    </div>
  );
}
