"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { ArrowLeft, ArrowUp, ArrowDown, Save } from "lucide-react";
import { toast } from "sonner";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { LoadingPlaceholder } from "@/components/ui/loading-placeholder";
import { Button } from "@/components/ui/button";
import { isEditorOrAbove } from "@/lib/roles";
import { asClientList, type ReportClient } from "@/components/reports/v2/use-report-controls";
import { type HolidayDealsLayout } from "@/lib/holiday-deals/layout";

async function fetchClients(): Promise<ReportClient[]> {
  const res = await fetch("/api/clients?lite=1&status=Active");
  if (!res.ok) throw new Error("Failed to load clients");
  return asClientList(await res.json());
}

async function fetchLayout(): Promise<HolidayDealsLayout> {
  const res = await fetch("/api/holiday-deals/config");
  if (!res.ok) throw new Error("Failed to load layout");
  return res.json();
}

export default function HolidayDealsConfigPage() {
  const { data: session, status } = useSession();
  const canEdit = isEditorOrAbove(session?.user?.role);

  if (status === "loading") return null;
  if (!canEdit) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        Only editors and admins can configure the holiday deals sheet.
      </div>
    );
  }
  return <ConfigEditor />;
}

function ConfigEditor() {
  const queryClient = useQueryClient();
  const clientsQuery = useQuery({ queryKey: ["clients-lite-active"], queryFn: fetchClients });
  const layoutQuery = useQuery({ queryKey: ["holiday-deals-layout"], queryFn: fetchLayout });

  if (clientsQuery.isLoading || layoutQuery.isLoading) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <LoadingPlaceholder />
      </div>
    );
  }
  if (clientsQuery.error || layoutQuery.error || !clientsQuery.data || !layoutQuery.data) {
    return <p className="p-8 text-sm text-brand-red">Could not load the sheet configuration.</p>;
  }
  return (
    <LayoutForm
      key={JSON.stringify(layoutQuery.data)}
      clients={clientsQuery.data}
      initial={layoutQuery.data}
      onSaved={(layout) => queryClient.setQueryData(["holiday-deals-layout"], layout)}
    />
  );
}

function LayoutForm({
  clients,
  initial,
  onSaved,
}: {
  clients: ReportClient[];
  initial: HolidayDealsLayout;
  onSaved: (layout: HolidayDealsLayout) => void;
}) {
  const nameByCode = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of clients) map[c.clientIdCode] = c.clientName || c.clientIdCode;
    return map;
  }, [clients]);

  const [ordered, setOrdered] = useState<string[]>(() => {
    const known = new Set(clients.map((c) => c.clientIdCode));
    const persisted = initial.ordered.filter((id) => known.has(id));
    const rest = clients.map((c) => c.clientIdCode).filter((id) => !persisted.includes(id));
    return [...persisted, ...rest];
  });
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(initial.hidden));
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const move = (idx: number, dir: -1 | 1) => {
    const nextIdx = idx + dir;
    if (nextIdx < 0 || nextIdx >= ordered.length) return;
    const next = ordered.slice();
    [next[idx], next[nextIdx]] = [next[nextIdx], next[idx]];
    setOrdered(next);
  };

  const toggleHidden = (id: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/holiday-deals/config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ordered, hidden: Array.from(hidden) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Save failed (${res.status})`);
      setSavedAt(new Date());
      onSaved(body as HolidayDealsLayout);
      toast.success("Sheet layout saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const shown = ordered.length - hidden.size;

  return (
    <div className="-mt-6 lg:-mt-8">
      <PageMetaSlot>
        <div className="flex items-center justify-between gap-4 w-full">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/holiday-deals"
              className="p-1 rounded-md text-foreground/60 hover:text-foreground hover:bg-foreground/5 transition-colors"
              title="Back to holiday deals"
            >
              <ArrowLeft size={16} />
            </Link>
            <h1 className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none">
              <span className="font-bold text-sidebar-foreground">HolidayDeals</span>
              <span className="font-normal text-brand">Config</span>
            </h1>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {savedAt && (
              <span className="text-xs text-foreground/50">Saved {savedAt.toLocaleTimeString()}</span>
            )}
            <Button variant="brand" size="sm" onClick={onSave} disabled={saving}>
              <Save className="size-3.5" />
              {saving ? "Saving" : "Save"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setHidden(new Set())}>
              Show all
            </Button>
            <Button variant="outline" size="sm" onClick={() => setHidden(new Set(ordered))}>
              Hide all
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setOrdered((prev) =>
                  prev.slice().sort((a, b) => (nameByCode[a] || a).localeCompare(nameByCode[b] || b)),
                )
              }
            >
              Sort A to Z
            </Button>
          </div>
        </div>
      </PageMetaSlot>

      <div className="max-w-3xl mx-auto p-6 space-y-3">
        <p className="text-sm text-muted-foreground">
          Untick a client to drop its line from the holiday deals sheet. Order here is the
          order on the sheet. {shown} of {ordered.length} active clients shown.
        </p>
        <ul className="rounded-[18px] border border-stone-200 bg-card divide-y divide-border dark:border-zinc-800">
          {ordered.map((id, idx) => {
            const isHidden = hidden.has(id);
            return (
              <li
                key={id}
                className={`flex items-center gap-3 px-3 py-2 ${isHidden ? "opacity-50" : ""}`}
              >
                <span className="w-8 text-right font-mono text-xs tabular-nums text-foreground/40">
                  {idx + 1}
                </span>
                <input
                  type="checkbox"
                  checked={!isHidden}
                  onChange={() => toggleHidden(id)}
                  aria-label={`Show ${nameByCode[id] || id}`}
                  className="size-4 accent-brand"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{nameByCode[id] || id}</div>
                  <div className="truncate font-mono text-[10px] text-foreground/40">{id}</div>
                </div>
                <button
                  type="button"
                  onClick={() => move(idx, -1)}
                  disabled={idx === 0}
                  className="rounded-md p-1 text-foreground/60 hover:bg-foreground/5 hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
                  aria-label="Move up"
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => move(idx, 1)}
                  disabled={idx === ordered.length - 1}
                  className="rounded-md p-1 text-foreground/60 hover:bg-foreground/5 hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
                  aria-label="Move down"
                >
                  <ArrowDown size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
