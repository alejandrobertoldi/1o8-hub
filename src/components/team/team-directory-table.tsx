"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { TEAM_DEPARTMENTS, TEAM_DEPARTMENT_COLORS, TEAM_DEPARTMENT_LABELS, type TeamDepartment } from "@/lib/team/departments";
import type { DirectoryPerson } from "@/lib/team/directory";

const DAYS = [
  ["mon", "M"],
  ["tue", "T"],
  ["wed", "W"],
  ["thu", "T"],
  ["fri", "F"],
  ["sat", "S"],
  ["sun", "S"],
] as const;

const EMPLOYMENT_TYPES = ["Full Time Employee", "Independent Contractor", "Owner", "CEO"];

export function TeamDirectoryTable({ isAdmin, viewerId }: { isAdmin: boolean; viewerId: string | null }) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [dept, setDept] = useState<string>("all");
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<DirectoryPerson | null>(null);

  const { data, isLoading, isError } = useQuery<DirectoryPerson[]>({
    queryKey: ["team-directory-table"],
    queryFn: async () => {
      const res = await fetch("/api/team/directory");
      if (!res.ok) throw new Error("Failed to load the team directory");
      return res.json();
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["team-directory-table"] });
    qc.invalidateQueries({ queryKey: ["team-directory"] });
    qc.invalidateQueries({ queryKey: ["team-members"] });
  };

  const remove = useMutation({
    mutationFn: async (p: DirectoryPerson) => {
      const res = await fetch(`/api/team/directory/${p.id}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Could not remove");
    },
    onSuccess: (_d, p) => {
      toast.success(`${p.name} was removed from the team`);
      setRemoving(null);
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not remove"),
  });

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data ?? []).filter((p) => {
      if (dept !== "all" && !p.departments.includes(dept)) return false;
      if (!needle) return true;
      return [p.name, p.email, p.location, ...p.jobTitles]
        .filter(Boolean)
        .some((s) => s!.toLowerCase().includes(needle));
    });
  }, [data, q, dept]);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading the team…</p>;
  if (isError || !data) return <p className="text-sm text-muted-foreground">The team directory could not be loaded.</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search people, titles, locations or accounts…"
            className="w-80 pl-8"
            aria-label="Search the team"
          />
        </div>
        <select
          value={dept}
          onChange={(e) => setDept(e.target.value)}
          aria-label="Filter by department"
          className="h-9 rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30"
        >
          <option value="all">All departments</option>
          {TEAM_DEPARTMENTS.map((d) => (
            <option key={d} value={d}>
              {TEAM_DEPARTMENT_LABELS[d]}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">
          {rows.length} of {data.length} people
        </span>
        {isAdmin && (
          <Button variant="brand" size="sm" className="ml-auto" onClick={() => setAdding(true)}>
            <Plus className="size-4" /> Add person
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2.5">Person</th>
              <th className="px-3 py-2.5">Department</th>
              <th className="px-3 py-2.5">Type</th>
              <th className="px-3 py-2.5">Location</th>
              <th className="px-3 py-2.5">Hours (local · Chicago)</th>
              <th className="px-3 py-2.5">Days</th>
              <th className="px-3 py-2.5">Phone</th>
              {isAdmin && <th className="px-3 py-2.5" aria-label="Actions" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr
                key={p.id}
                onClick={() => router.push(`/team/${p.id}`)}
                className="cursor-pointer border-b border-border/50 align-top last:border-0 hover:bg-muted/30"
              >
                <td className="px-4 py-2.5">
                  <Link href={`/team/${p.id}`} onClick={(e) => e.stopPropagation()} className="font-semibold hover:underline">
                    {p.name}
                  </Link>
                  <div className="text-xs text-muted-foreground">{p.jobTitles.join(", ") || "—"}</div>
                  {p.company && <div className="text-[11px] text-muted-foreground/80">{p.company}</div>}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {p.departments.length ? (
                      p.departments.map((d) => (
                        <span
                          key={d}
                          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium"
                        >
                          <span className="size-1.5 rounded-full" style={{ background: TEAM_DEPARTMENT_COLORS[d as TeamDepartment] }} />
                          {TEAM_DEPARTMENT_LABELS[d as TeamDepartment] ?? d}
                          {p.leadsDepartments.includes(d) && <span className="font-bold text-brand">· Lead</span>}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">Leadership</span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-xs">{p.employmentType ?? "—"}</td>
                <td className="px-3 py-2.5 text-xs">
                  <div>{p.location ?? "—"}</div>
                  <div className="text-muted-foreground">{p.timeZone}</div>
                </td>
                <td className="px-3 py-2.5 text-xs tabular-nums whitespace-nowrap">
                  {p.workStartLocal ? (
                    <>
                      <div>
                        {p.workStartLocal} – {p.workEndLocal}
                      </div>
                      {p.workStartChicago && (
                        <div className="text-muted-foreground">
                          {p.workStartChicago} – {p.workEndChicago} CHI
                        </div>
                      )}
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex gap-0.5" aria-label={`Works ${p.workDays.join(", ") || "no days set"}`}>
                    {DAYS.map(([k, l]) => (
                      <span
                        key={k}
                        className={cn(
                          "flex size-5 items-center justify-center rounded text-[10px] font-bold",
                          p.workDays.includes(k) ? "bg-brand text-brand-foreground" : "bg-muted text-muted-foreground/50",
                        )}
                      >
                        {l}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap">{p.phone ?? "—"}</td>
                {isAdmin && (
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      {/* Edit = the same person card the org chart opens. */}
                      <Button variant="ghost" size="icon-sm" aria-label={`Edit ${p.name}`} asChild>
                        <Link href={`/team/${p.id}`}>
                          <Pencil className="size-4" />
                        </Link>
                      </Button>
                      {p.id !== viewerId && (
                        <Button variant="ghost" size="icon-sm" aria-label={`Remove ${p.name}`} onClick={() => setRemoving(p)}>
                          <UserMinus className="size-4" />
                        </Button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={isAdmin ? 8 : 7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  Nobody matches this search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {adding && (
        <PersonDialog
          onClose={() => setAdding(false)}
          onSaved={(id) => {
            setAdding(false);
            refresh();
            router.push(`/team/${id}`);
          }}
        />
      )}

      <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.name} from the team?</AlertDialogTitle>
            <AlertDialogDescription>
              They disappear from the directory, org chart and team pickers. Their account, logged hours and history are kept,
              and adding them again restores them. Client assignments in the AAC table are not changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={remove.isPending} onClick={() => removing && remove.mutate(removing)}>
              {remove.isPending ? "Removing…" : "Remove from team"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Add / edit dialog (admins) ─────────────────────────────────────────

// Add only: editing happens on the person's card (/team/[userId]).
function PersonDialog({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => void }) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    title: "",
    departments: [] as string[],
    phone: "",
    company: "1o8 Agency",
    expertise: "",
    employmentType: "",
    location: "",
    timeZone: "",
    workDays: ["mon", "tue", "wed", "thu", "fri"] as string[],
    workStartLocal: "",
    workEndLocal: "",
    workStartChicago: "",
    workEndChicago: "",
  });
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const toggle = (k: "departments" | "workDays", v: string) =>
    set(k, form[k].includes(v) ? form[k].filter((x) => x !== v) : [...form[k], v]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/team/directory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Could not save");
      toast.success(`${form.name} was added to the team`);
      onSaved(body.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  const field = (label: string, k: keyof typeof form, placeholder?: string) => (
    <label className="grid gap-1">
      <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</span>
      <Input value={form[k] as string} placeholder={placeholder} onChange={(e) => set(k, e.target.value as never)} />
    </label>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add a person to the team</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {field("Full name", "name")}
          {field("Work email", "email", "name.lastname@1o8.agency")}
          {field("Title", "title", "Account Manager")}
          {field("Phone", "phone")}
          {field("Company", "company")}
          {field("Expertise", "expertise", "Account Management")}
          <label className="grid gap-1">
            <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Type</span>
            <select
              value={form.employmentType}
              onChange={(e) => set("employmentType", e.target.value)}
              className="h-9 rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30"
            >
              <option value="">—</option>
              {[...new Set([...EMPLOYMENT_TYPES, ...(form.employmentType ? [form.employmentType] : [])])].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          {field("Location", "location", "Puebla, MX")}
          {field("Time zone", "timeZone", "CST (UTC-6)")}
          <div />
          {field("Local start", "workStartLocal", "09:00 AM")}
          {field("Local end", "workEndLocal", "05:00 PM")}
          {field("Chicago start", "workStartChicago", "09:00 AM")}
          {field("Chicago end", "workEndChicago", "05:00 PM")}
        </div>
        <div className="grid gap-1">
          <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Departments</span>
          <div className="flex flex-wrap gap-1.5">
            {TEAM_DEPARTMENTS.map((d) => (
              <Chip key={d} on={form.departments.includes(d)} onClick={() => toggle("departments", d)}>
                {TEAM_DEPARTMENT_LABELS[d]}
              </Chip>
            ))}
          </div>
        </div>
        <div className="grid gap-1">
          <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Work days</span>
          <div className="flex gap-1.5">
            {DAYS.map(([k], i) => (
              <Chip key={k} on={form.workDays.includes(k)} onClick={() => toggle("workDays", k)}>
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i]}
              </Chip>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="brand" disabled={saving || !form.name.trim() || !form.email.trim()} onClick={save}>
            {saving ? "Saving…" : "Add to team"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors",
        on ? "border-brand bg-brand text-brand-foreground" : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
