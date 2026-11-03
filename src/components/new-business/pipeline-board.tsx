"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Clock, ExternalLink, Plus, Trash2, User } from "lucide-react";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { BetaPill } from "@/components/ui/beta-pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import {
  CLOSED_STAGES,
  DEAL_TYPES,
  OPEN_STAGES,
  SERVICES,
  SOURCES,
  STAGES,
  pipelineTotals,
  stageLabel,
  stageProbability,
  type OpportunityView,
  type StageId,
} from "@/lib/new-business";
import { cn } from "@/lib/utils";

type Owner = { id: string; name: string };
type Data = { opportunities: OpportunityView[]; owners: Owner[] };

type Form = {
  prospectName: string;
  website: string;
  contactName: string;
  contactEmail: string;
  ownerId: string;
  source: string;
  services: string[];
  dealType: string;
  value: string;
  stage: string;
  nextStep: string;
  nextStepDate: string;
  asanaUrl: string;
  notes: string;
  lostReason: string;
};

const EMPTY: Form = {
  prospectName: "",
  website: "",
  contactName: "",
  contactEmail: "",
  ownerId: "",
  source: "",
  services: [],
  dealType: "retainer",
  value: "",
  stage: "contact",
  nextStep: "",
  nextStepDate: "",
  asanaUrl: "",
  notes: "",
  lostReason: "",
};

const toForm = (o: OpportunityView): Form => ({
  prospectName: o.prospectName,
  website: o.website ?? "",
  contactName: o.contactName ?? "",
  contactEmail: o.contactEmail ?? "",
  ownerId: o.ownerId ?? "",
  source: o.source ?? "",
  services: o.services,
  dealType: o.dealType,
  value: o.value == null ? "" : String(o.value),
  stage: o.stage,
  nextStep: o.nextStep ?? "",
  nextStepDate: o.nextStepDate ?? "",
  asanaUrl: o.asanaUrl ?? "",
  notes: o.notes ?? "",
  lostReason: o.lostReason ?? "",
});

const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const dealValue = (o: Pick<OpportunityView, "value" | "dealType">) => (o.value == null ? "No value yet" : o.dealType === "retainer" ? `${money(o.value)}/mo` : money(o.value));
const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
const today = () => new Date().toISOString().slice(0, 10);
const hrefOf = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);

export function PipelineBoard() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<Data>({
    queryKey: ["new-business"],
    queryFn: async () => {
      const res = await fetch("/api/new-business");
      if (!res.ok) throw new Error("Could not load the pipeline");
      return res.json();
    },
  });
  const opps = data?.opportunities ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: ["new-business"] });

  const [editing, setEditing] = useState<OpportunityView | "new" | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [deleting, setDeleting] = useState<OpportunityView | null>(null);
  const [closedTab, setClosedTab] = useState<StageId>("won");

  const save = useMutation({
    mutationFn: async () => {
      const body = { ...form, value: form.value === "" ? null : Number(form.value), lostReason: form.stage === "lost" ? form.lostReason : null };
      const res = await fetch(editing === "new" ? "/api/new-business" : `/api/new-business/${(editing as OpportunityView).id}`, {
        method: editing === "new" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not save");
    },
    onSuccess: () => {
      toast.success(editing === "new" ? "Opportunity added" : "Opportunity saved");
      setEditing(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const move = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: StageId }) => {
      const res = await fetch(`/api/new-business/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage }) });
      if (!res.ok) throw new Error("Could not move it");
    },
    onSuccess: (_d, v) => {
      toast.success(`Moved to ${stageLabel(v.stage)}`);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/new-business/${id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not delete");
    },
    onSuccess: () => {
      toast.success("Opportunity deleted");
      setDeleting(null);
      setEditing(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const open = (o: OpportunityView | "new") => {
    setForm(o === "new" ? EMPTY : toForm(o));
    setEditing(o);
  };
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const toggleService = (s: string) =>
    setForm((f) => ({ ...f, services: f.services.includes(s) ? f.services.filter((x) => x !== s) : [...f.services, s] }));

  const totals = pipelineTotals(opps);
  const hoursTotal = opps.reduce((a, o) => a + o.hours, 0);
  const won = opps.filter((o) => o.stage === "won");
  const closed = opps.filter((o) => o.stage === closedTab);
  const select = "h-9 w-full rounded-md border border-field-border bg-field-bg px-2 text-sm text-field-text shadow-xs";

  return (
    <div className="space-y-6">
      <PageMetaSlot>
        <h1 className="flex items-center gap-3 text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none" aria-label="New Business">
          <span>
            <span className="font-bold text-sidebar-foreground">New</span>
            <span className="font-normal text-brand">Business</span>
          </span>
          <BetaPill className="text-[10px]" />
        </h1>
      </PageMetaSlot>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Every prospect and pitch, from first contact to the quote. Each one gets a project number (1O87…) that the whole team can log hours to
          under the 1O8 client, so the time invested in new business is tracked per pitch.
        </p>
        <Button variant="brand" className="self-start rounded-full" onClick={() => open("new")}>
          <Plus className="size-4" /> Add opportunity
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Open retainers" value={`${money(totals.retainer.total)}/mo`} sub={`${totals.retainer.count} open · weighted ${money(totals.retainer.weighted)}/mo`} />
        <Tile label="Open projects" value={money(totals.project.total)} sub={`${totals.project.count} open · weighted ${money(totals.project.weighted)}`} />
        <Tile label="Hours invested" value={`${hoursTotal.toLocaleString("en-US", { maximumFractionDigits: 2 })} h`} sub="Logged to pitch numbers, all time" />
        <Tile label="Won" value={String(won.length)} sub={`of ${opps.filter((o) => o.stage === "won" || o.stage === "lost").length} closed`} />
      </div>

      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-5">
          {OPEN_STAGES.map((s) => (
            <Skeleton key={s.id} className="h-64 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 pb-2">
          <div className="grid min-w-[1000px] grid-cols-5 gap-3">
            {OPEN_STAGES.map((s, i) => {
              const cards = opps.filter((o) => o.stage === s.id).sort((a, b) => a.stageChangedAt.localeCompare(b.stageChangedAt));
              return (
                <section key={s.id} className="flex flex-col rounded-xl border bg-muted/30 p-2">
                  <header className="flex items-baseline justify-between px-1.5 pb-2 pt-1">
                    <h2 className="text-xs font-bold uppercase tracking-wider">{s.label}</h2>
                    <span className="text-[11px] text-muted-foreground">
                      {cards.length} · {Math.round(s.probability * 100)}%
                    </span>
                  </header>
                  <div className="flex flex-1 flex-col gap-2">
                    {cards.length === 0 && <p className="px-1.5 py-4 text-center text-xs text-muted-foreground">Nothing here</p>}
                    {cards.map((o) => (
                      <Card
                        key={o.id}
                        o={o}
                        onOpen={() => open(o)}
                        onBack={i > 0 ? () => move.mutate({ id: o.id, stage: OPEN_STAGES[i - 1].id }) : undefined}
                        onNext={i < OPEN_STAGES.length - 1 ? () => move.mutate({ id: o.id, stage: OPEN_STAGES[i + 1].id }) : undefined}
                        busy={move.isPending}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}

      <section className="rounded-xl border bg-card">
        <div className="flex flex-wrap gap-1 border-b p-2">
          {CLOSED_STAGES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setClosedTab(s.id)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold",
                closedTab === s.id ? "bg-brand text-brand-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {s.label} ({opps.filter((o) => o.stage === s.id).length})
            </button>
          ))}
        </div>
        {closed.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No {stageLabel(closedTab).toLowerCase()} opportunities yet.</p>
        ) : (
          <ul className="divide-y">
            {closed.map((o) => (
              <li key={o.id}>
                <button type="button" onClick={() => open(o)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-left text-sm hover:bg-muted/50">
                  <span className="font-semibold">{o.prospectName}</span>
                  <span className="font-mono text-xs text-muted-foreground">{o.projectNumber}</span>
                  <span className="text-muted-foreground">{dealValue(o)}</span>
                  <span className="text-muted-foreground">{o.hours} h</span>
                  {o.stage === "lost" && o.lostReason && <span className="text-muted-foreground">Reason: {o.lostReason}</span>}
                  <span className="ml-auto text-xs text-muted-foreground">{new Date(o.closedAt ?? o.stageChangedAt).toLocaleDateString("en-US")}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Add opportunity" : form.prospectName || "Opportunity"}</DialogTitle>
            <DialogDescription>
              {editing && editing !== "new"
                ? `Hours project number ${editing.projectNumber} (client 1O8) · ${editing.hours} h logged by ${editing.people} ${editing.people === 1 ? "person" : "people"}`
                : "It gets a project number for Hours as soon as it is saved."}
            </DialogDescription>
          </DialogHeader>
          <form
            id="nb-form"
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="nb-name">Prospect</Label>
              <Input id="nb-name" required value={form.prospectName} onChange={set("prospectName")} placeholder="Indeck Energy" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="nb-web">Website</Label>
              <Input id="nb-web" value={form.website} onChange={set("website")} placeholder="indeckenergy.com" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="nb-stage">Stage</Label>
              <select id="nb-stage" value={form.stage} onChange={set("stage")} className={select}>
                {STAGES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                    {stageProbability(s.id) > 0 && stageProbability(s.id) < 1 ? ` (${Math.round(stageProbability(s.id) * 100)}%)` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="nb-owner">Owner</Label>
              <select id="nb-owner" value={form.ownerId} onChange={set("ownerId")} className={select}>
                <option value="">Nobody yet</option>
                {data?.owners.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
            {form.stage === "lost" && (
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="nb-lost">Why was it lost?</Label>
                <Input id="nb-lost" value={form.lostReason} onChange={set("lostReason")} placeholder="Budget, went with another agency, timing…" />
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="nb-type">Deal type</Label>
              <select id="nb-type" value={form.dealType} onChange={set("dealType")} className={select}>
                {DEAL_TYPES.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="nb-value">{form.dealType === "retainer" ? "Monthly fee (USD)" : "Project total (USD)"}</Label>
              <Input id="nb-value" type="number" min={0} step={100} value={form.value} onChange={set("value")} className="tabular-nums" />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <span className="text-sm font-medium">Services of interest</span>
              <div className="flex flex-wrap gap-1.5">
                {SERVICES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleService(s)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs",
                      form.services.includes(s) ? "border-brand bg-brand/15 font-semibold" : "text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="nb-contact">Main contact</Label>
              <Input id="nb-contact" value={form.contactName} onChange={set("contactName")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="nb-email">Contact email</Label>
              <Input id="nb-email" type="email" value={form.contactEmail} onChange={set("contactEmail")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="nb-source">Source</Label>
              <select id="nb-source" value={form.source} onChange={set("source")} className={select}>
                <option value="">Unknown</option>
                {SOURCES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="nb-asana">Asana task (optional)</Label>
              <Input id="nb-asana" value={form.asanaUrl} onChange={set("asanaUrl")} placeholder="https://app.asana.com/…" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="nb-next">Next step</Label>
              <Input id="nb-next" value={form.nextStep} onChange={set("nextStep")} placeholder="Send the pitch deck" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="nb-next-date">Next step date</Label>
              <Input id="nb-next-date" type="date" value={form.nextStepDate} onChange={set("nextStepDate")} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="nb-notes">Notes</Label>
              <Textarea id="nb-notes" rows={3} value={form.notes} onChange={set("notes")} />
            </div>
          </form>
          <DialogFooter className="gap-2 sm:justify-between">
            {editing && editing !== "new" ? (
              <Button variant="ghost" className="text-destructive" onClick={() => setDeleting(editing)}>
                <Trash2 className="size-4" /> Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button variant="brand" type="submit" form="nb-form" disabled={save.isPending}>
                {save.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        title="Delete opportunity"
        description={
          <>
            Only for an entry added by mistake: <strong>{deleting?.prospectName}</strong> and its stage history go away. If hours are already
            logged to it, mark it Lost or On hold instead.
          </>
        }
        pending={remove.isPending}
      />
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function Card({ o, onOpen, onBack, onNext, busy }: { o: OpportunityView; onOpen: () => void; onBack?: () => void; onNext?: () => void; busy: boolean }) {
  const overdue = !!o.nextStepDate && o.nextStepDate < today();
  return (
    <article className="rounded-lg border bg-card p-3 shadow-xs">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold leading-tight">{o.prospectName}</h3>
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{o.projectNumber}</span>
        </div>
        <p className="mt-1 text-sm tabular-nums">
          {dealValue(o)}
          <span className="ml-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">{o.dealType === "retainer" ? "Retainer" : "Project"}</span>
        </p>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <User className="size-3" /> {o.ownerName ?? "No owner"}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3" /> {o.hours} h
          </span>
          <span>{daysSince(o.stageChangedAt)}d in stage</span>
        </div>
        {o.nextStep && (
          <p className={cn("mt-2 text-xs", overdue ? "font-semibold text-red-500" : "text-muted-foreground")}>
            Next: {o.nextStep}
            {o.nextStepDate ? ` · ${o.nextStepDate}` : ""}
          </p>
        )}
      </button>
      <div className="mt-2 flex items-center justify-between border-t pt-2">
        <button type="button" aria-label="Previous stage" disabled={!onBack || busy} onClick={onBack} className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:invisible">
          <ChevronLeft className="size-4" />
        </button>
        {o.website ? (
          <a href={hrefOf(o.website)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-brand hover:underline">
            Website <ExternalLink className="size-3" />
          </a>
        ) : (
          <span />
        )}
        <button type="button" aria-label="Next stage" disabled={!onNext || busy} onClick={onNext} className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:invisible">
          <ChevronRight className="size-4" />
        </button>
      </div>
    </article>
  );
}
