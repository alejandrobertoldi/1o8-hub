"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, ExternalLink, Loader2, Mail, MapPin, Pencil, Plus, Trash2, User } from "lucide-react";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { READINESS_DEPARTMENTS } from "@/lib/readiness/match";
import { PROVIDER_KINDS, type ProviderWithWork } from "@/lib/service-providers";
import { cn } from "@/lib/utils";

type Form = {
  name: string;
  kind: string;
  contactName: string;
  department: string;
  services: string;
  emails: string;
  website: string;
  location: string;
  timeZone: string;
  status: string;
  notes: string;
};

const EMPTY: Form = {
  name: "",
  kind: "agency",
  contactName: "",
  department: "",
  services: "",
  emails: "",
  website: "",
  location: "",
  timeZone: "",
  status: "active",
  notes: "",
};

const toForm = (p: ProviderWithWork): Form => ({
  name: p.name,
  kind: p.kind,
  contactName: p.contactName ?? "",
  department: p.department ?? "",
  services: p.services ?? "",
  emails: p.emails.join(", "),
  website: p.website ?? "",
  location: p.location ?? "",
  timeZone: p.timeZone ?? "",
  status: p.status,
  notes: p.notes ?? "",
});

const toBody = (f: Form) => ({
  ...f,
  department: f.department || null,
  emails: f.emails
    .split(/[\s,;]+/)
    .map((e) => e.trim())
    .filter(Boolean),
});

/**
 * Admin → Service providers: agencies and freelancers 1o8 contracts (WODO,
 * Althea…). They aren't employees, so they stay out of the team directory
 * and org chart, but their Asana work counts on the Readiness board.
 */
export function ServiceProviders() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<ProviderWithWork | "new" | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [deleting, setDeleting] = useState<ProviderWithWork | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const { data: providers, isLoading } = useQuery<ProviderWithWork[]>({
    queryKey: ["service-providers"],
    queryFn: async () => {
      const res = await fetch("/api/admin/service-providers");
      if (!res.ok) throw new Error("Could not load service providers");
      return res.json();
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["service-providers"] });
    qc.invalidateQueries({ queryKey: ["readiness"] });
    qc.invalidateQueries({ queryKey: ["readiness-assignees"] });
  };

  const save = useMutation({
    mutationFn: async () => {
      const isNew = editing === "new";
      const res = await fetch(isNew ? "/api/admin/service-providers" : `/api/admin/service-providers/${(editing as ProviderWithWork).id}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toBody(form)),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not save");
    },
    onSuccess: () => {
      toast.success(editing === "new" ? "Provider added" : "Provider saved");
      setEditing(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/service-providers/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not delete");
    },
    onSuccess: () => {
      toast.success("Provider deleted");
      setDeleting(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const open = (p: ProviderWithWork | "new") => {
    setForm(p === "new" ? EMPTY : toForm(p));
    setEditing(p);
  };
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const list = (providers ?? []).filter((p) => showInactive || p.status === "active");
  const inactiveCount = (providers ?? []).filter((p) => p.status !== "active").length;
  const select = "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30";

  return (
    <div className="space-y-6">
      <PageMetaSlot>
        <h1 className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none" aria-label="Service Providers">
          <span className="font-bold text-sidebar-foreground">Service</span>
          <span className="font-normal text-brand">Providers</span>
        </h1>
      </PageMetaSlot>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-xl text-sm text-muted-foreground">
          Agencies and freelancers 1o8 contracts. They aren&apos;t employees: they stay out of the team directory and org chart, but their Asana tasks count on the{" "}
          <Link href="/team/readiness" className="text-brand hover:underline">
            Readiness board
          </Link>
          , tagged as providers. Asana tasks are matched by the emails listed here.
        </p>
        <div className="flex items-center gap-3 self-start">
          {inactiveCount > 0 && (
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
              Show inactive ({inactiveCount})
            </label>
          )}
          <Button variant="brand" className="rounded-full" onClick={() => open("new")}>
            <Plus className="size-4" /> Add provider
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground">No service providers yet.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((p) => (
            <article key={p.id} className={cn("flex flex-col rounded-xl border bg-card p-4", p.status !== "active" && "opacity-60")}>
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand/15 text-brand">
                  {p.kind === "agency" ? <Building2 className="size-5" /> : <User className="size-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate font-bold">{p.name}</h2>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="rounded-full border px-1.5 py-px font-semibold uppercase tracking-wide text-muted-foreground">{p.kind}</span>
                    {p.department && <span className="rounded-full border border-brand/40 px-1.5 py-px font-semibold text-brand">{p.department}</span>}
                    {p.status !== "active" && <span className="rounded-full bg-muted px-1.5 py-px font-semibold text-muted-foreground">Inactive</span>}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="size-8" aria-label={`Edit ${p.name}`} onClick={() => open(p)}>
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-red-500" aria-label={`Delete ${p.name}`} onClick={() => setDeleting(p)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>

              {p.services && <p className="mt-3 text-sm">{p.services}</p>}
              <dl className="mt-3 space-y-1 text-xs text-muted-foreground">
                {p.contactName && (
                  <div className="flex items-center gap-1.5">
                    <User className="size-3" /> {p.contactName}
                  </div>
                )}
                {p.emails.map((e) => (
                  <div key={e} className="flex items-center gap-1.5">
                    <Mail className="size-3" /> {e}
                  </div>
                ))}
                {(p.location || p.timeZone) && (
                  <div className="flex items-center gap-1.5">
                    <MapPin className="size-3" /> {[p.location, p.timeZone].filter(Boolean).join(" · ")}
                  </div>
                )}
                {p.website && (
                  <a href={p.website} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-brand hover:underline">
                    <ExternalLink className="size-3" /> {p.website.replace(/^https?:\/\//, "")}
                  </a>
                )}
              </dl>
              {p.notes && <p className="mt-3 whitespace-pre-line border-t pt-3 text-xs text-muted-foreground">{p.notes}</p>}

              <div className="mt-auto border-t pt-3 text-xs">
                {p.assignees.length ? (
                  <span>
                    <b className="tabular-nums">{p.open}</b> open Asana tasks · linked as {p.assignees.map((a) => a.assigneeName ?? a.assigneeKey).join(", ")}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Not linked to an Asana assignee yet</span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Add service provider" : `Edit ${form.name || "provider"}`}</DialogTitle>
            <DialogDescription>Contracted agency or freelancer. Not an employee.</DialogDescription>
          </DialogHeader>
          <form
            id="provider-form"
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="sp-name">Name</Label>
              <Input id="sp-name" required value={form.name} onChange={set("name")} placeholder="WODO" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sp-kind">Type</Label>
              <select id="sp-kind" value={form.kind} onChange={set("kind")} className={select}>
                {PROVIDER_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k === "agency" ? "Agency" : "Freelancer"}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="sp-dept">Department (Readiness)</Label>
              <select id="sp-dept" value={form.department} onChange={set("department")} className={select}>
                <option value="">None</option>
                {READINESS_DEPARTMENTS.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="sp-services">Services</Label>
              <Input id="sp-services" value={form.services} onChange={set("services")} placeholder="Web development, Shopify builds…" />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="sp-emails">Emails (incl. their Asana login)</Label>
              <Input id="sp-emails" value={form.emails} onChange={set("emails")} placeholder="projects@agency.com, name@1o8.agency" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sp-contact">Main contact</Label>
              <Input id="sp-contact" value={form.contactName} onChange={set("contactName")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sp-website">Website</Label>
              <Input id="sp-website" value={form.website} onChange={set("website")} placeholder="https://" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sp-location">Location</Label>
              <Input id="sp-location" value={form.location} onChange={set("location")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sp-tz">Time zone</Label>
              <Input id="sp-tz" value={form.timeZone} onChange={set("timeZone")} placeholder="America/Mexico_City" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sp-status">Status</Label>
              <select id="sp-status" value={form.status} onChange={set("status")} className={select}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="sp-notes">Notes</Label>
              <Textarea id="sp-notes" rows={3} value={form.notes} onChange={set("notes")} placeholder="Scope, rates, contract dates…" />
            </div>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button variant="brand" type="submit" form="provider-form" disabled={save.isPending}>
              {save.isPending && <Loader2 className="size-4 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        title={`Delete ${deleting?.name ?? "provider"}?`}
        description="Their Asana tasks stay on the Readiness board, unlinked. To keep them linked, set the provider to Inactive instead."
        pending={remove.isPending}
      />
    </div>
  );
}
