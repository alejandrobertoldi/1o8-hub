"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Settings2, RotateCcw, ArrowRight } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { CONFIGURABLE_SECTIONS, DEFAULT_CLIENT_SECTIONS } from "@/lib/permissions";

// Sections relevant to the client portal. Excludes admin-only ids
// (activity, import, publish, export, clients, calendar, sync).
const CLIENT_VISIBLE_IDS = new Set<string>([
  "timeline",
  "sales",
  "sales-overview",
  "sales-inventory",
  "sales-forecast",
  "sales-monitor",
  "products",
  "reviews",
  "seo",
  "design",
  "brandstory",
  "aplus",
  "listing-images",
  "storefront",
  "files",
  "reports",
  "reports-overview",
  "reports-period-comparative",
  "reports-inventory",
  "reports-order-geography",
  "reports-share-of-voice",
  "reports-subscribe-save",
  "reports-advertising-audit",
  "finances",
  "finance-reports",
  "portal-activity",
]);

const CLIENT_SECTIONS = CONFIGURABLE_SECTIONS.filter((s) => CLIENT_VISIBLE_IDS.has(s.id));

type SheetClient = {
  clientIdCode: string;
  clientName: string;
  count: number;
  userCount: number;
  allowedSections: string[];
};

export function ClientSectionsSheet({
  client,
  open,
  onOpenChange,
}: {
  client: SheetClient | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<string[]>(client?.allowedSections ?? []);

  // Reset local draft when a different client is opened
  // (cheap; runs only on open transitions)
  useMemo(() => {
    setDraft(client?.allowedSections ?? []);
  }, [client?.clientIdCode, client?.allowedSections]);

  const dirty =
    !!client &&
    (draft.length !== client.allowedSections.length ||
      draft.some((s) => !client.allowedSections.includes(s)));

  const mutation = useMutation({
    mutationFn: async (payload: { code: string; allowedSections: string[] }) => {
      const res = await fetch(`/api/clients/${payload.code}/sections`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowedSections: payload.allowedSections }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save");
      }
      return res.json();
    },
    onSuccess: (updated: { clientIdCode: string; allowedSections: string[] }) => {
      // Trust the row the write returned. invalidate + refetch re-read the 60s
      // process cache in /api/clients, which could still hold the pre-write array
      // and snapped the eye icon straight back to its old state.
      qc.setQueryData(["portal-clients"], (prev: unknown) =>
        Array.isArray(prev)
          ? (prev as Array<{ clientIdCode: string; allowedSections: string[] }>).map((c) =>
              c.clientIdCode === updated.clientIdCode
                ? { ...c, allowedSections: updated.allowedSections }
                : c,
            )
          : prev,
      );
      toast.success("Section visibility updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!client) return null;

  function toggle(id: string) {
    setDraft((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  }

  async function handleSaveAndPreview() {
    await mutation.mutateAsync({ code: client!.clientIdCode, allowedSections: draft });
    onOpenChange(false);
    router.push(`/portal?client=${client!.clientIdCode}`);
  }

  // Group by department for scannability
  const groups = new Map<string, typeof CLIENT_SECTIONS>();
  for (const s of CLIENT_SECTIONS) {
    const key = s.dept ?? s.id; // standalone uses its own id as group key
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-[480px] flex flex-col">
        <SheetHeader>
          <SheetTitle className="font-[family-name:var(--font-outfit)] tracking-tight">
            {client.clientName}
          </SheetTitle>
          <SheetDescription>
            {client.clientIdCode} ·{" "}
            {client.userCount > 0
              ? `${client.userCount} user${client.userCount === 1 ? "" : "s"} assigned`
              : "0 users assigned — visibility will apply when users are added"}
            {client.count > 0 ? ` · ${client.count} product${client.count === 1 ? "" : "s"}` : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="flex items-center gap-2 mt-4 mb-2">
          <Settings2 className="size-4 text-portal-accent" />
          <h3 className="text-sm font-semibold">Section Visibility</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Toggle which portal sections this client can see.
        </p>

        <div className="flex-1 overflow-y-auto space-y-3">
          {Array.from(groups.entries()).map(([groupKey, items]) => (
            <div
              key={groupKey}
              className="rounded-md border border-border/60 bg-card p-3"
            >
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
                {groupKey === items[0].id
                  ? items[0].label
                  : groupKey.charAt(0).toUpperCase() + groupKey.slice(1)}
              </div>
              <div className="space-y-1.5">
                {items.map((s) => (
                  <label
                    key={s.id}
                    className="flex items-center gap-2 cursor-pointer text-sm"
                  >
                    <Checkbox
                      checked={draft.includes(s.id)}
                      onCheckedChange={() => toggle(s.id)}
                    />
                    <span>{s.label}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 pt-4 border-t mt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDraft(DEFAULT_CLIENT_SECTIONS.slice())}
            disabled={mutation.isPending}
            className="gap-1.5"
          >
            <RotateCcw className="size-3.5" />
            Reset to defaults
          </Button>
          <Button
            size="sm"
            onClick={handleSaveAndPreview}
            disabled={!dirty || mutation.isPending}
            className="gap-1.5"
          >
            Save & preview
            <ArrowRight className="size-3.5" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
