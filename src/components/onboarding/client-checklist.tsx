"use client";

import Link from "next/link";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Circle, Loader2, MinusCircle, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { isEditorOrAbove } from "@/lib/roles";
import { checkField, type ChecklistItem, type ClientChecklist } from "@/lib/onboarding/checklist";

export const checklistKey = (code: string) => ["client-checklist", code] as const;

/**
 * Onboarding = the client profile is complete. Each item links to where it's
 * filled in; hand-checked items (accesses, welcome email) get a checkbox, and
 * anything can be set to N/A for this client.
 */
export function ClientChecklistPanel({ clientIdCode }: { clientIdCode: string }) {
  const qc = useQueryClient();
  const { data: session } = useSession();
  const canEdit = isEditorOrAbove(session?.user?.role);
  const [hideDone, setHideDone] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery<ClientChecklist>({
    queryKey: checklistKey(clientIdCode),
    queryFn: async () => {
      const res = await fetch(`/api/clients/${encodeURIComponent(clientIdCode)}/checklist`);
      if (!res.ok) throw new Error("Could not load the checklist");
      return res.json();
    },
  });

  const mark = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: "done" | "na" | "" }) => {
      const res = await fetch(`/api/clients/${encodeURIComponent(clientIdCode)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field: checkField(key), value }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Could not save");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: checklistKey(clientIdCode) });
      qc.invalidateQueries({ queryKey: ["onboarding-checklists"] });
      qc.invalidateQueries({ queryKey: ["client-detail", clientIdCode] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save"),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="rounded-xl border p-5 text-sm text-red-500">
        Couldn&apos;t load the profile checklist.{" "}
        <button type="button" className="font-semibold underline" onClick={() => refetch()}>
          Try again
        </button>
      </div>
    );
  }

  const allDone = data.total > 0 && data.done === data.total;
  const base = `/clients/${encodeURIComponent(clientIdCode)}`;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-card px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Client profile</span>
            <span className={cn("text-xs font-bold tabular-nums", allDone && "text-emerald-500")}>
              {data.done}/{data.total} · {data.percentage}%
            </span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-muted">
            <div className={cn("h-full rounded-full transition-all", allDone ? "bg-emerald-500" : "bg-brand")} style={{ width: `${data.percentage}%` }} />
          </div>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />
          Only what&apos;s missing
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.sections.map((sec) => {
          const items = hideDone ? sec.items.filter((i) => i.state === "missing") : sec.items;
          if (!items.length) return null;
          const complete = sec.total > 0 && sec.done === sec.total;
          return (
            <div key={sec.key} className="rounded-xl border bg-card">
              <div className="flex items-center justify-between border-b px-4 py-2.5">
                <h3 className="text-sm font-semibold">{sec.label}</h3>
                <span className={cn("text-[11px] font-bold tabular-nums", complete ? "text-emerald-500" : "text-muted-foreground")}>
                  {sec.done}/{sec.total}
                </span>
              </div>
              <ul className="divide-y divide-border/40">
                {items.map((item) => (
                  <ChecklistRow
                    key={item.key}
                    item={item}
                    href={`${base}${item.href}`}
                    canEdit={canEdit}
                    busy={mark.isPending && mark.variables?.key === item.key}
                    onMark={(value) => mark.mutate({ key: item.key, value })}
                  />
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ChecklistRow({
  item,
  href,
  canEdit,
  busy,
  onMark,
}: {
  item: ChecklistItem;
  href: string;
  canEdit: boolean;
  busy: boolean;
  onMark: (value: "done" | "na" | "") => void;
}) {
  const Icon = item.state === "done" ? CheckCircle2 : item.state === "na" ? MinusCircle : Circle;
  const onThisPage = href.endsWith("/onboarding");
  return (
    <li className="group flex items-center gap-2 px-4 py-2 text-sm">
      {item.manual && canEdit && item.state !== "na" ? (
        <button
          type="button"
          disabled={busy}
          aria-label={item.state === "done" ? `Unmark ${item.label}` : `Mark ${item.label} done`}
          onClick={() => onMark(item.state === "done" ? "" : "done")}
          className="shrink-0"
        >
          <Icon className={cn("size-4", item.state === "done" ? "text-emerald-500" : "text-muted-foreground hover:text-brand")} />
        </button>
      ) : (
        <Icon className={cn("size-4 shrink-0", item.state === "done" ? "text-emerald-500" : "text-muted-foreground/60")} />
      )}
      <span className={cn("min-w-0 flex-1 truncate", item.state === "na" && "text-muted-foreground line-through", item.state === "done" && "text-foreground/70")}>
        {item.label}
      </span>
      {item.service && <span className="shrink-0 rounded-full border px-1.5 text-[10px] text-muted-foreground">{item.service}</span>}
      {busy && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
      {item.state === "missing" && !item.manual && !onThisPage && (
        <Link href={href} className="inline-flex shrink-0 items-center gap-0.5 text-xs text-brand hover:underline">
          Fill <ArrowUpRight className="size-3" />
        </Link>
      )}
      {canEdit && item.state !== "done" && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onMark(item.state === "na" ? "" : "na")}
          className="shrink-0 text-[11px] text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus:opacity-100 group-hover:opacity-100"
        >
          {item.state === "na" ? "Undo N/A" : "N/A"}
        </button>
      )}
    </li>
  );
}
