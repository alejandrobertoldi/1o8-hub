"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TEAM_DEPARTMENT_COLORS } from "@/lib/team/departments";
import type { OrgSeat } from "@/lib/team/org-chart";
import type { DirectoryPerson } from "@/lib/team/directory";

/** Column accent per org area (reuses the department palette). */
const AREA_COLORS: Record<string, string> = {
  leadership: "#F7BF1D",
  operations: "#A9A7B5",
  accounts: TEAM_DEPARTMENT_COLORS.account_management,
  strategy: TEAM_DEPARTMENT_COLORS.project_management,
  creative: TEAM_DEPARTMENT_COLORS.creative,
  email: TEAM_DEPARTMENT_COLORS.email,
  web: TEAM_DEPARTMENT_COLORS.web,
  paid_media: TEAM_DEPARTMENT_COLORS.paid_media,
};

type Ctx = {
  byParent: Map<string | null, OrgSeat[]>;
  editing: boolean;
  people: DirectoryPerson[];
  assign: (seat: OrgSeat, userId: string | null) => void;
  addSeat: (parentId: string | null, title: string) => void;
  removeSeat: (seat: OrgSeat) => void;
};

/**
 * 1o8 org chart drawn from org_positions (seeded from the "2026 Org Chart"
 * tab): Owner → leadership row → client-services head → one column per area.
 * Open seats are first-class. Clicking a person opens their card.
 */
export function TeamOrgChart({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);

  const { data: seats, isLoading, isError } = useQuery<OrgSeat[]>({
    queryKey: ["org-chart"],
    queryFn: async () => {
      const res = await fetch("/api/team/org-chart");
      if (!res.ok) throw new Error("Failed to load the org chart");
      return res.json();
    },
  });
  const { data: people = [] } = useQuery<DirectoryPerson[]>({
    queryKey: ["team-directory-table"],
    queryFn: async () => (await fetch("/api/team/directory")).json(),
    enabled: isAdmin,
  });

  const call = useMutation({
    mutationFn: async ({ url, method, body }: { url: string; method: string; body?: unknown }) => {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not update the org chart");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["org-chart"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const byParent = useMemo(() => {
    const m = new Map<string | null, OrgSeat[]>();
    for (const s of seats ?? []) m.set(s.parentId, [...(m.get(s.parentId) ?? []), s]);
    for (const list of m.values()) list.sort((a, b) => a.sortOrder - b.sortOrder);
    return m;
  }, [seats]);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading the org chart…</p>;
  if (isError || !seats) return <p className="text-sm text-muted-foreground">The org chart could not be loaded.</p>;
  if (!seats.length) {
    return (
      <p className="text-sm text-muted-foreground">
        The org chart is empty. Run <code className="font-mono">npm run seed:org-chart</code> to load the 2026 Org Chart.
      </p>
    );
  }

  const ctx: Ctx = {
    byParent,
    editing,
    people,
    assign: (seat, userId) => call.mutate({ url: `/api/team/org-chart/${seat.id}`, method: "PATCH", body: { userId } }),
    addSeat: (parentId, title) => call.mutate({ url: "/api/team/org-chart", method: "POST", body: { parentId, title } }),
    removeSeat: (seat) => {
      const below = (byParent.get(seat.id) ?? []).length;
      if (!window.confirm(`Remove the "${seat.title}" seat${below ? ` and the ${below} seat(s) under it` : ""}?`)) return;
      call.mutate({ url: `/api/team/org-chart/${seat.id}`, method: "DELETE" });
    },
  };

  const roots = byParent.get(null) ?? [];
  const total = seats.length;
  const open = seats.filter((s) => !s.person).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-muted-foreground">
          {total} seats · {total - open} filled · <span className="font-semibold text-foreground">{open} open</span>
        </span>
        {isAdmin && (
          <Button variant={editing ? "brand" : "outline"} size="sm" className="ml-auto" onClick={() => setEditing((e) => !e)}>
            <Pencil className="size-3.5" /> {editing ? "Done editing" : "Edit chart"}
          </Button>
        )}
      </div>

      {roots.map((root) => (
        <TopDown key={root.id} seat={root} ctx={ctx} />
      ))}
    </div>
  );
}

/** Owner → its row → (for seats with reports) a centred band → area columns. */
function TopDown({ seat, ctx }: { seat: OrgSeat; ctx: Ctx }) {
  const row = ctx.byParent.get(seat.id) ?? [];
  const withReports = row.filter((s) => (ctx.byParent.get(s.id) ?? []).length > 0);
  return (
    <div className="flex flex-col items-center">
      <SeatCard seat={seat} ctx={ctx} big />
      {row.length > 0 && <Connector />}
      <div className="flex w-full flex-wrap justify-center gap-3">
        {row.map((s) => (
          <SeatCard key={s.id} seat={s} ctx={ctx} />
        ))}
        {ctx.editing && <AddSeatButton parentId={seat.id} ctx={ctx} />}
      </div>
      {withReports.map((s) => (
        <Band key={s.id} seat={s} ctx={ctx} />
      ))}
    </div>
  );
}

/** A leadership seat's reports: each becomes a centred card whose reports are the area columns. */
function Band({ seat, ctx }: { seat: OrgSeat; ctx: Ctx }) {
  const heads = ctx.byParent.get(seat.id) ?? [];
  return (
    <>
      {heads.map((head) => {
        const areas = ctx.byParent.get(head.id) ?? [];
        return (
          <div key={head.id} className="flex w-full flex-col items-center">
            <Connector />
            <SeatCard seat={head} ctx={ctx} big />
            {areas.length > 0 && <Connector />}
            {/* Wraps instead of overflowing the page. */}
            <div className="grid w-full gap-3 [grid-template-columns:repeat(auto-fit,minmax(12.5rem,1fr))]">
              {areas.map((area) => (
                <AreaColumn key={area.id} seat={area} ctx={ctx} />
              ))}
            </div>
            {ctx.editing && (
              <div className="mt-3">
                <AddSeatButton parentId={head.id} ctx={ctx} label="Add area" />
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

function AreaColumn({ seat, ctx }: { seat: OrgSeat; ctx: Ctx }) {
  const color = AREA_COLORS[seat.area ?? ""] ?? "#94A3B8";
  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card/60 p-3" style={{ borderTopColor: color, borderTopWidth: 3 }}>
      <SeatCard seat={seat} ctx={ctx} accent={color} />
      <Reports parentId={seat.id} ctx={ctx} />
    </div>
  );
}

/** A seat's reports grouped by title ("Account Managers" ×4), nesting deeper levels. */
function Reports({ parentId, ctx }: { parentId: string; ctx: Ctx }) {
  const children = ctx.byParent.get(parentId) ?? [];
  const groups: { title: string; seats: OrgSeat[] }[] = [];
  for (const s of children) {
    const g = groups.find((x) => x.title === s.title);
    if (g) g.seats.push(s);
    else groups.push({ title: s.title, seats: [s] });
  }
  if (!groups.length && !ctx.editing) return null;
  return (
    <div className="flex flex-col gap-2 border-l border-border/60 pl-2.5">
      {groups.map((g) => (
        <div key={g.title} className="rounded-lg bg-muted/40 p-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              {g.title}
              {g.seats.length > 1 && <span className="ml-1 font-normal">· {g.seats.length}</span>}
            </span>
            {ctx.editing && (
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                aria-label={`Add a ${g.title} seat`}
                onClick={() => ctx.addSeat(parentId, g.title)}
              >
                <Plus className="size-3.5" />
              </button>
            )}
          </div>
          <div className="flex flex-col gap-1">
            {g.seats.map((s) => (
              <div key={s.id}>
                <SeatRow seat={s} ctx={ctx} />
                {(ctx.byParent.get(s.id) ?? []).length > 0 && (
                  <div className="mt-1.5">
                    <Reports parentId={s.id} ctx={ctx} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
      {ctx.editing && <AddSeatButton parentId={parentId} ctx={ctx} label="Add role" />}
    </div>
  );
}

function initials(name: string | null) {
  return (name ?? "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function SeatCard({ seat, ctx, big, accent }: { seat: OrgSeat; ctx: Ctx; big?: boolean; accent?: string }) {
  const p = seat.person;
  const body = (
    <div
      className={cn(
        "relative flex min-w-44 max-w-64 items-center gap-3 rounded-xl border px-3 py-2.5 text-left",
        p ? "bg-card" : "border-dashed bg-transparent",
        big && "min-w-64 max-w-80",
        p && !ctx.editing && "transition-colors hover:border-brand",
      )}
      style={accent && p ? { borderColor: accent } : undefined}
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold",
          p ? "bg-[#2C2B35] text-[#F7BF1D]" : "border border-dashed text-muted-foreground",
        )}
      >
        {p ? initials(p.name) : "?"}
      </span>
      <div className="min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{seat.title}</div>
        {ctx.editing ? (
          <PersonSelect seat={seat} ctx={ctx} />
        ) : (
          <div className={cn("text-sm font-semibold leading-tight", !p && "italic text-muted-foreground")}>{p ? p.name : "Open"}</div>
        )}
      </div>
      {ctx.editing && seat.parentId && (
        <button
          type="button"
          aria-label={`Remove the ${seat.title} seat`}
          onClick={() => ctx.removeSeat(seat)}
          className="absolute right-1.5 top-1.5 text-muted-foreground hover:text-red-500"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
  return p && !ctx.editing ? <Link href={`/team/${p.id}`}>{body}</Link> : body;
}

function SeatRow({ seat, ctx }: { seat: OrgSeat; ctx: Ctx }) {
  const p = seat.person;
  const row = (
    <div className={cn("group flex items-center gap-2 rounded-md px-1.5 py-1", p && !ctx.editing && "hover:bg-muted")}>
      <span
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
          p ? "bg-[#2C2B35] text-[#F7BF1D]" : "border border-dashed text-muted-foreground",
        )}
      >
        {p ? initials(p.name) : "?"}
      </span>
      {ctx.editing ? (
        <PersonSelect seat={seat} ctx={ctx} />
      ) : (
        <span className={cn("text-sm leading-tight", p ? "font-medium" : "italic text-muted-foreground")}>{p ? p.name : "Open"}</span>
      )}
      {ctx.editing && (
        <button
          type="button"
          aria-label={`Remove this ${seat.title} seat`}
          onClick={() => ctx.removeSeat(seat)}
          className="ml-auto text-muted-foreground hover:text-red-500"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
  return p && !ctx.editing ? <Link href={`/team/${p.id}`}>{row}</Link> : row;
}

function PersonSelect({ seat, ctx }: { seat: OrgSeat; ctx: Ctx }) {
  return (
    <select
      aria-label={`Person in the ${seat.title} seat`}
      value={seat.person?.id ?? ""}
      onChange={(e) => ctx.assign(seat, e.target.value || null)}
      className="h-7 max-w-44 rounded-md border border-input bg-transparent px-1.5 text-xs dark:bg-input/30"
    >
      <option value="">Open</option>
      {ctx.people.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}

function AddSeatButton({ parentId, ctx, label = "Add seat" }: { parentId: string | null; ctx: Ctx; label?: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      onClick={() => {
        const title = window.prompt("Seat title (e.g. Account Manager, Designer)")?.trim();
        if (title) ctx.addSeat(parentId, title);
      }}
    >
      <Plus className="size-3" /> {label}
    </Button>
  );
}

function Connector() {
  return <div className="h-5 w-px bg-brand" aria-hidden />;
}
