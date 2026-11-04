"use client";

import Link from "next/link";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Circle, Loader2, MinusCircle, ArrowUpRight, FileText } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { isEditorOrAbove } from "@/lib/roles";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { checkField, formatGoogleAdsId, type ChecklistItem, type ClientChecklist } from "@/lib/onboarding/checklist";

export const checklistKey = (code: string) => ["client-checklist", code] as const;

/**
 * Onboarding = the client profile is complete. "Fill" opens a small popup:
 * plain fields are filled right there, the rest link to where they live in the
 * profile; hand-checked items (accesses, welcome email) are marked done there,
 * and anything can be set to N/A for this client.
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

  // Writes one AAC field: a profile value, or the item's `Onboarding: <key>` mark.
  const save = useMutation({
    mutationFn: async ({ field, value }: { item: string; field: string; value: string }) => {
      const res = await fetch(`/api/clients/${encodeURIComponent(clientIdCode)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field, value }),
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

      <ContractBar contract={data.contract} />

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
                    busy={save.isPending && save.variables?.item === item.key}
                    onMark={(value) => save.mutateAsync({ item: item.key, field: checkField(item.key), value })}
                    onFill={(field, value) => save.mutateAsync({ item: item.key, field, value })}
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
  onFill,
}: {
  item: ChecklistItem;
  href: string;
  canEdit: boolean;
  busy: boolean;
  onMark: (value: "done" | "na" | "") => Promise<void>;
  onFill: (field: string, value: string) => Promise<void>;
}) {
  const Icon = item.state === "done" ? CheckCircle2 : item.state === "na" ? MinusCircle : Circle;
  return (
    <li className="flex items-center gap-2 px-4 py-2 text-sm">
      <Icon className={cn("size-4 shrink-0", item.state === "done" ? "text-emerald-500" : "text-muted-foreground/60")} />
      <span className={cn("min-w-0 flex-1 truncate", item.state === "na" && "text-muted-foreground line-through", item.state === "done" && "text-foreground/70")}>
        {item.label}
      </span>
      {item.service && <span className="shrink-0 rounded-full border px-1.5 text-[10px] text-muted-foreground">{item.service}</span>}
      {busy && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
      {canEdit && item.state === "missing" && <FillPopover item={item} href={href} onMark={onMark} onFill={onFill} />}
      {canEdit && item.state === "na" && (
        <button type="button" disabled={busy} onClick={() => onMark("")} className="shrink-0 text-[11px] text-muted-foreground hover:text-foreground">
          Undo N/A
        </button>
      )}
      {canEdit && item.manual && item.state === "done" && (
        <button type="button" disabled={busy} onClick={() => onMark("")} className="shrink-0 text-[11px] text-muted-foreground hover:text-foreground">
          Undo
        </button>
      )}
      {!canEdit && item.state === "missing" && !item.manual && (
        <Link href={href} className="inline-flex shrink-0 items-center gap-0.5 text-xs text-brand hover:underline">
          Open <ArrowUpRight className="size-3" />
        </Link>
      )}
    </li>
  );
}

/** The "Fill" popup: fill a plain field here, mark a hand-checked item done, open the profile, or set N/A. */
function FillPopover({
  item,
  href,
  onMark,
  onFill,
}: {
  item: ChecklistItem;
  href: string;
  onMark: (value: "done" | "na" | "") => Promise<void>;
  onFill: (field: string, value: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setSaving(true);
    try {
      await fn();
      setOpen(false);
      setValue("");
    } catch {
      // The mutation already shows a toast; keep the popup open to retry.
    } finally {
      setSaving(false);
    }
  };
  const field = item.field;
  const submit = () =>
    field && value.trim() && run(() => onFill(field.key, field.key === "GoogleAdsCustomerId" ? formatGoogleAdsId(value) : value.trim()));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="shrink-0 text-xs font-medium text-brand hover:underline">
          {item.manual ? "Check" : "Fill"}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3 p-3">
        <p className="text-sm font-semibold">{item.label}</p>
        {item.reference && (
          <a href={item.reference.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs text-brand hover:underline">
            <FileText className="size-3.5" /> Check the {item.reference.label} <ArrowUpRight className="size-3" />
          </a>
        )}
        {field && (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <Input
              autoFocus
              type={field.type}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={field.key === "GoogleAdsCustomerId" ? "123-456-7890" : field.type === "url" ? "https://…" : ""}
              className="h-8"
            />
            <Button type="submit" size="sm" variant="brand" disabled={saving || !value.trim()}>
              Save
            </Button>
          </form>
        )}
        {item.manual && (
          <Button size="sm" variant="brand" className="w-full" disabled={saving} onClick={() => run(() => onMark("done"))}>
            Mark as done
          </Button>
        )}
        <div className="flex items-center justify-between gap-2 border-t pt-2 text-xs">
          {!item.manual && !href.endsWith("/onboarding") ? (
            <Link href={href} className="inline-flex items-center gap-0.5 text-brand hover:underline">
              {field ? "Open in profile" : "Fill it in the profile"} <ArrowUpRight className="size-3" />
            </Link>
          ) : (
            <span />
          )}
          <button type="button" disabled={saving} onClick={() => run(() => onMark("na"))} className="text-muted-foreground hover:text-foreground">
            Not applicable
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** The signed SOW / quote and its term, so the team can read the scope from onboarding (as in the AAC sheet). */
function ContractBar({ contract }: { contract: ClientChecklist["contract"] }) {
  const term = contract.term || contract.lastDay;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border bg-card px-5 py-3 text-sm">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">SOW / Quote</span>
      {contract.sowUrl ? (
        <a href={contract.sowUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-medium text-brand hover:underline">
          <FileText className="size-4" />
          {contract.sow || "Open document"}
          <ArrowUpRight className="size-3.5" />
        </a>
      ) : (
        <span className="text-muted-foreground">No document linked yet (add the link on the AAC sheet&apos;s SOW cell or in Contract &amp; services)</span>
      )}
      {term && <span className="min-w-0 truncate text-xs text-muted-foreground" title={term}>{term}</span>}
      {contract.lastDay && contract.term && <span className="shrink-0 text-xs text-muted-foreground">· ends {contract.lastDay}</span>}
    </div>
  );
}
