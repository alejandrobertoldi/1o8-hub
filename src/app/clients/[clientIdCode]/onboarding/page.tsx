"use client";
/* eslint-disable react-doctor/rerender-memo-with-default-value */
/* eslint-disable react-doctor/nextjs-no-a-element */
/* eslint-disable jsx-a11y/no-autofocus */
/* eslint-disable react-doctor/no-derived-state-effect */
/* eslint-disable react-doctor/prefer-useReducer */
/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable jsx-a11y/label-has-associated-control */
/* eslint-disable react-doctor/nextjs-missing-metadata */
/* eslint-disable react-doctor/js-set-map-lookups */
/* eslint-disable react-doctor/js-flatmap-filter */
/* eslint-disable react-doctor/async-await-in-loop */
/* eslint-disable react-doctor/no-array-index-as-key */

import { hasAdminPowers } from "@/lib/roles";
/* eslint-disable react-doctor/nextjs-no-img-element */
/* eslint-disable react-doctor/rendering-hydration-mismatch-time */

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import Link from "next/link";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Loader2,
  AlertCircle,
  Play,
  Pencil,
  UserCircle2,
  X,
  Calendar,
  MessageSquare,
  Users,
  Send,
  ExternalLink,
  Copy,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DatePicker } from "@/components/ui/date-picker";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { NewClientDialog, type ClientEditData } from "@/components/clients/new-client-dialog";
import { ClrAttributeImport } from "@/components/onboarding/clr-attribute-import";
import { AlrLinkAndMerge } from "@/components/onboarding/alr-link-and-merge";
import { ClientMark } from "@/components/onboarding/client-mark";
import { DEFAULT_CLIENT_SECTIONS } from "@/lib/permissions";
import { isStepSatisfied, OPTIONAL_STEP_KEYS, PARENT_GROUP_LABELS } from "@/lib/onboarding/steps";

// ── Types ──────────────────────────────────────────────────────────

interface TeamMember {
  id: string;
  name: string | null;
  email: string;
  asanaEmail?: string | null;
  image: string | null;
  role?: string;
}

interface OnboardingStep {
  key: string;
  label: string;
  description: string;
  order: number;
  parent: string | null;
  status: "pending" | "in_progress" | "completed" | "failed";
  completedAt: string | null;
  completedBy: string | null;
  metadata: Record<string, unknown> | null;
  assignee: TeamMember | null;
}

interface OnboardingResponse {
  clientIdCode: string;
  steps: OnboardingStep[];
  groups: Record<string, {
    label: string;
    order: number;
    isMultiStep: boolean;
    status: "pending" | "in_progress" | "completed";
  }>;
}

// ── Status styling ─────────────────────────────────────────────────

const STATUS_CONFIG = {
  pending: {
    icon: Circle,
    label: "Pending",
    className: "text-muted-foreground",
    badgeClassName: "bg-stone-200 text-stone-700 dark:bg-muted dark:text-muted-foreground",
  },
  in_progress: {
    icon: Loader2,
    label: "In Progress",
    className: "text-[var(--brand-yellow)]",
    badgeClassName: "bg-amber-100 text-amber-800 dark:bg-yellow-500/10 dark:text-yellow-400",
  },
  completed: {
    icon: CheckCircle2,
    label: "Completed",
    className: "text-[var(--brand-green)]",
    badgeClassName: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  },
  failed: {
    icon: AlertCircle,
    label: "Failed",
    className: "text-[var(--brand-red)]",
    badgeClassName: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  },
} as const;

// Client lifecycle status color — mirrors the Edit Client dialog / client-detail
// (Active = emerald, Prospect = brand gold, Inactive = red).
function clientStatusClass(status?: string | null): string {
  const s = (status ?? "").toLowerCase();
  if (s === "active") return "text-emerald-500";
  if (s === "prospect") return "text-brand";
  if (s === "inactive") return "text-red-500";
  return "text-muted-foreground";
}

// Onboarding template chip color (distinct from the status colors above).
function clientTypeChipClass(type?: string | null): string {
  const t = (type ?? "").toUpperCase();
  if (t === "AIA") return "bg-brand/15 text-orange-800 border border-brand/30 dark:text-brand";
  if (t === "NTA") return "bg-purple-50 text-purple-700 border border-purple-300 dark:bg-[var(--brand-nta)]/15 dark:text-[var(--brand-nta)] dark:border-[var(--brand-nta)]/30";
  return "bg-stone-200 text-stone-700 dark:bg-muted dark:text-muted-foreground";
}

// ── Step action map ────────────────────────────────────────────────

function useStepAction(clientIdCode: string, stepKey: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: Record<string, unknown> | undefined = undefined) => {
      const url = `/api/clients/${encodeURIComponent(clientIdCode)}/onboarding/${stepKey}`;
      const res = await fetch(url, {
        method: "POST",
        ...(body
          ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
          : {}),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(data.error || `Step failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["onboarding", clientIdCode],
      });
      queryClient.invalidateQueries({
        queryKey: ["client-detail", clientIdCode],
      });
      if (stepKey === "setup_asana") {
        queryClient.invalidateQueries({ queryKey: ["asana-task", clientIdCode] });
      } else {
        queryClient.invalidateQueries({ queryKey: ["asana-task", clientIdCode, stepKey] });
      }
    },
  });
}

// ── Portal Access Setup (integrated into contacts card) ───────────

const HUB_STEPS = ["hub_add_user", "hub_assign_role", "hub_assign_client"] as const;
const HUB_LABELS: Record<string, string> = {
  hub_add_user: "Add Account(s)",
  hub_assign_role: "Assign Role",
  hub_assign_client: "Assign Project",
};

function PortalAccessSetup({
  clientIdCode,
  contacts,
  allSteps,
}: {
  clientIdCode: string;
  contacts: { name: string; email: string }[];
  allSteps: OnboardingStep[];
}) {
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);

  const allEmails = contacts.map((c) => c.email);

  // Check status of hub steps
  const hubSteps = HUB_STEPS.map((key) => {
    const step = allSteps.find((s) => s.key === key);
    const doneList: string[] =
      step?.metadata && typeof step.metadata === "object" && "doneEmails" in step.metadata
        ? (step.metadata.doneEmails as string[]) ?? []
        : [];
    return { key, step, doneList, allDone: allEmails.every((e) => doneList.includes(e)) };
  });

  const allComplete = hubSteps.every((h) => h.allDone || h.step?.status === "completed");

  async function runAll() {
    setRunning(true);
    try {
      // Fetch existing users to find IDs and current client assignments
      const usersRes = await fetch("/api/admin/users");
      const allUsers: { id: string; email: string; clientIdCode: string | null }[] = usersRes.ok ? await usersRes.json() : [];
      const usersByEmail = new Map(allUsers.map((u) => [u.email.toLowerCase(), { id: u.id, clientIdCode: u.clientIdCode }]));

      for (const contact of contacts) {
        const email = contact.email.toLowerCase();
        let existing = usersByEmail.get(email);

        // 1. Create user if doesn't exist
        if (!existing) {
          const createRes = await fetch("/api/admin/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: contact.email, name: contact.name, role: "client" }),
          });
          if (createRes.ok) {
            const created = await createRes.json();
            existing = { id: created.id, clientIdCode: null };
          }
        }

        // 2. Assign client role + append this client (preserve existing) + default portal sections
        if (existing) {
          const currentCodes = existing.clientIdCode
            ? existing.clientIdCode.split(",").map((s) => s.trim()).filter(Boolean)
            : [];
          if (!currentCodes.includes(clientIdCode)) {
            currentCodes.push(clientIdCode);
          }
          await fetch("/api/admin/users", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: existing.id, role: "client", clientIdCode: currentCodes.join(","), allowedSections: DEFAULT_CLIENT_SECTIONS }),
          });
        }
      }

      // Mark all 3 hub onboarding steps as done
      for (const key of HUB_STEPS) {
        await fetch(`/api/clients/${encodeURIComponent(clientIdCode)}/onboarding/${key}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ doneEmails: allEmails }),
        });
      }
      qc.invalidateQueries({ queryKey: ["onboarding", clientIdCode] });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mt-3 pt-3 border-t border-dashed">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold">Portal Access</p>
          <div className="flex items-center gap-3 mt-1">
            {hubSteps.map((h) => (
              <span
                key={h.key}
                className={`text-[10px] ${h.allDone || h.step?.status === "completed" ? "text-[var(--brand-green)]" : "text-muted-foreground"}`}
              >
                {h.allDone || h.step?.status === "completed" ? "✓" : "○"} {HUB_LABELS[h.key]}
              </span>
            ))}
          </div>
        </div>
        {!allComplete && (
          <Button
            size="sm"
            onClick={runAll}
            disabled={running}
            className="gap-1.5"
          >
            {running ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Setting up…
              </>
            ) : (
              <>
                <Play className="size-3.5" />
                Setup All
              </>
            )}
          </Button>
        )}
        {allComplete && (
          <span className="text-[10px] text-[var(--brand-green)] font-semibold">All set</span>
        )}
      </div>
    </div>
  );
}

// ── Client Users Card (combined: contacts + hub steps) ────────────

/**
 * Deliberately excludes `owner` and `super_admin`. This is a role ASSIGNMENT
 * picker, not a privilege gate: adding them here would let anyone who can open
 * this page grant those roles, bypassing the canAssignRole() ladder in
 * @/lib/roles (owner is assignable only by an owner). Leave as-is.
 */
const ALL_ONBOARDING_ROLES = ["pending", "viewer", "editor", "admin", "client", "prospect"] as const;

type HubUserRecord = { id: string; email: string; name: string | null; role: string; clientIdCode: string | null };

function HubUserRow({
  contact,
  user,
  clients,
  onSetup,
  running,
}: {
  contact: { name: string; email: string };
  user: HubUserRecord | null;
  clients: { clientIdCode: string; clientName: string }[];
  onSetup: (contact: { name: string; email: string }) => void;
  running: boolean;
}) {
  const qc = useQueryClient();
  const [clientOpen, setClientOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });

  const updateMutation = useMutation({
    mutationFn: async (updates: { role?: string; clientIdCode?: string | null }) => {
      if (!user) return;
      const res = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, ...updates }),
      });
      if (!res.ok) throw new Error("Failed to update user");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  const codes = (user?.clientIdCode ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  function toggleClient(code: string) {
    if (!user) return;
    const next = codes.includes(code) ? codes.filter((c) => c !== code) : [...codes, code];
    updateMutation.mutate({ clientIdCode: next.length > 0 ? next.join(",") : null });
  }

  return (
    <tr className="border-t border-border/40">
      <td className="px-3 py-2 text-xs font-medium">
        {contact.name || <span className="text-muted-foreground">—</span>}
      </td>
      <td className="px-3 py-2 text-xs text-muted-foreground">{contact.email}</td>
      <td className="px-3 py-2">
        {user ? (
          <select
            value={user.role}
            disabled={updateMutation.isPending}
            onChange={(e) => updateMutation.mutate({ role: e.target.value })}
            className="h-7 rounded border border-border bg-background px-1.5 text-xs focus:border-[var(--brand)] focus:outline-none disabled:opacity-50 cursor-pointer"
          >
            {ALL_ONBOARDING_ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        ) : (
          <span className="text-[10px] text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-3 py-2">
        {user ? (
          <div className="relative">
            <button
              type="button"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setDropdownPos({ top: rect.bottom + 4, left: rect.left });
                setClientOpen((o) => !o);
              }}
              className="flex h-7 max-w-[160px] items-center gap-1 rounded border border-border bg-background px-1.5 text-xs hover:bg-muted/50 transition-colors"
            >
              <span className={`truncate ${codes.length === 0 ? "text-muted-foreground" : ""}`}>
                {codes.length === 0
                  ? "Assign client(s)…"
                  : codes.length === 1
                  ? (clients.find((c) => c.clientIdCode === codes[0])?.clientName || codes[0])
                  : `${codes.length} clients`}
              </span>
              <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
            </button>
            {clientOpen && createPortal(
              <>
                <div className="fixed inset-0 z-[998]" onClick={() => setClientOpen(false)} />
                <div
                  className="fixed z-[999] w-56 rounded-md border border-border bg-background shadow-lg max-h-48 overflow-y-auto"
                  style={{ top: dropdownPos.top, left: dropdownPos.left }}
                >
                  {clients.map((c) => {
                    const sel = codes.includes(c.clientIdCode);
                    return (
                      <button
                        key={c.clientIdCode}
                        type="button"
                        onClick={() => toggleClient(c.clientIdCode)}
                        className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-xs hover:bg-muted/50 transition-colors ${sel ? "bg-muted/30" : ""}`}
                      >
                        <Checkbox checked={sel} className="size-3.5 pointer-events-none" tabIndex={-1} />
                        <span className="truncate">{c.clientName || c.clientIdCode}</span>
                        <span className="ml-auto text-[10px] text-muted-foreground">{c.clientIdCode}</span>
                      </button>
                    );
                  })}
                </div>
              </>,
              document.body
            )}
            {codes.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {codes.map((code) => (
                  <Badge key={code} variant="outline" className="text-[10px] gap-0.5 py-0 px-1.5 bg-purple-50 text-purple-700 border-purple-300 dark:bg-purple-500/10 dark:text-purple-400 dark:border-purple-500/25">
                    {clients.find((c) => c.clientIdCode === code)?.clientName || code}
                    <button type="button" onClick={() => toggleClient(code)} className="hover:text-destructive">
                      <X className="size-2.5" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        ) : (
          <span className="text-[10px] text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-3 py-2">
        {!user ? (
          <button
            onClick={() => onSetup(contact)}
            disabled={running}
            className="flex items-center gap-1 text-[10px] text-amber-500 hover:text-amber-600 disabled:opacity-50 whitespace-nowrap"
          >
            {running ? <Loader2 className="size-3 animate-spin" /> : "+ Add to Hub"}
          </button>
        ) : updateMutation.isPending ? (
          <Loader2 className="size-3 animate-spin text-muted-foreground" />
        ) : null}
      </td>
    </tr>
  );
}

const CLIENT_USERS_STEPS = ["add_contact_emails", "hub_add_user", "hub_assign_role", "hub_assign_client"] as const;

interface ContactRowData { name: string; email: string; role: string; clientCodes: string[] }

function EditableContactRow({
  row, index, clients, onChange, onRemove, canRemove,
}: {
  row: ContactRowData;
  index: number;
  clients: { clientIdCode: string; clientName: string }[];
  onChange: (i: number, u: Partial<ContactRowData>) => void;
  onRemove: (i: number) => void;
  canRemove: boolean;
}) {
  const [clientOpen, setClientOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });

  function toggleClient(code: string) {
    const next = row.clientCodes.includes(code)
      ? row.clientCodes.filter((c) => c !== code)
      : [...row.clientCodes, code];
    onChange(index, { clientCodes: next });
  }

  return (
    <tr className="border-t border-border/40 first:border-t-0">
      <td className="px-2.5 py-2">
        <input type="text" value={row.name} onChange={(e) => onChange(index, { name: e.target.value })} placeholder="Name"
          className="h-7 w-full rounded border border-border bg-background px-2 text-xs focus:border-[var(--brand)] focus:outline-none" />
      </td>
      <td className="px-2.5 py-2">
        <input type="email" value={row.email} onChange={(e) => onChange(index, { email: e.target.value })} placeholder="email@example.com"
          className="h-7 w-full rounded border border-border bg-background px-2 text-xs focus:border-[var(--brand)] focus:outline-none" />
      </td>
      <td className="px-2.5 py-2">
        <select value={row.role} onChange={(e) => onChange(index, { role: e.target.value })}
          className="h-7 w-full rounded border border-border bg-background px-1.5 text-xs focus:border-[var(--brand)] focus:outline-none cursor-pointer">
          {ALL_ONBOARDING_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </td>
      <td className="px-2.5 py-2">
        <div className="relative">
          <button type="button"
            onClick={(e) => { const rect = e.currentTarget.getBoundingClientRect(); setDropdownPos({ top: rect.bottom + 4, left: rect.left }); setClientOpen((o) => !o); }}
            className="flex h-7 w-full items-center gap-1 rounded border border-border bg-background px-1.5 text-xs hover:bg-muted/50 transition-colors">
            <span className={`flex-1 truncate text-left ${row.clientCodes.length === 0 ? "text-muted-foreground" : ""}`}>
              {row.clientCodes.length === 0 ? "Assign client(s)…"
                : row.clientCodes.length === 1 ? (clients.find((c) => c.clientIdCode === row.clientCodes[0])?.clientName || row.clientCodes[0])
                : `${row.clientCodes.length} clients`}
            </span>
            <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
          </button>
          {clientOpen && createPortal(
            <>
              <div className="fixed inset-0 z-[998]" onClick={() => setClientOpen(false)} />
              <div className="fixed z-[999] w-52 rounded-md border border-border bg-background shadow-lg max-h-48 overflow-y-auto"
                style={{ top: dropdownPos.top, left: dropdownPos.left }}>
                {clients.map((c) => {
                  const sel = row.clientCodes.includes(c.clientIdCode);
                  return (
                    <button key={c.clientIdCode} type="button" onClick={() => toggleClient(c.clientIdCode)}
                      className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-xs hover:bg-muted/50 transition-colors ${sel ? "bg-muted/30" : ""}`}>
                      <Checkbox checked={sel} className="size-3.5 pointer-events-none" tabIndex={-1} />
                      <span className="truncate">{c.clientName || c.clientIdCode}</span>
                      <span className="ml-auto text-[10px] text-muted-foreground">{c.clientIdCode}</span>
                    </button>
                  );
                })}
              </div>
            </>,
            document.body
          )}
          {row.clientCodes.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {row.clientCodes.map((code) => (
                <Badge key={code} variant="outline" className="text-[10px] gap-0.5 py-0 px-1.5 bg-purple-50 text-purple-700 border-purple-300 dark:bg-purple-500/10 dark:text-purple-400 dark:border-purple-500/25">
                  {clients.find((c) => c.clientIdCode === code)?.clientName || code}
                  <button type="button" onClick={() => toggleClient(code)} className="hover:text-destructive"><X className="size-2.5" /></button>
                </Badge>
              ))}
            </div>
          )}
        </div>
      </td>
      <td className="px-2 py-2">
        {canRemove && (
          <button type="button" onClick={() => onRemove(index)} className="text-muted-foreground hover:text-foreground">
            <X className="size-3.5" />
          </button>
        )}
      </td>
    </tr>
  );
}

function ClientUsersCard({
  clientIdCode,
  allSteps,
}: {
  clientIdCode: string;
  allSteps: OnboardingStep[];
}) {
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const [editing, setEditing] = useState(false);

  const contactStep = allSteps.find((s) => s.key === "add_contact_emails");
  const existingContacts: { name: string; email: string }[] =
    contactStep?.metadata && typeof contactStep.metadata === "object" && "contacts" in contactStep.metadata
      ? (contactStep.metadata.contacts as { name: string; email: string }[]) ?? []
      : [];

  const { data: hubUsers } = useQuery<HubUserRecord[]>({
    queryKey: ["admin-users"],
    queryFn: async () => { const res = await fetch("/api/admin/users"); if (!res.ok) return []; return res.json(); },
    staleTime: 30_000,
  });
  const { data: clientsList } = useQuery<{ clientIdCode: string; clientName: string }[]>({
    queryKey: ["clients-list"],
    queryFn: async () => { const res = await fetch("/api/clients/list"); if (!res.ok) return []; return res.json(); },
  });

  const allSubSteps = CLIENT_USERS_STEPS.map((key) => ({ key, step: allSteps.find((s) => s.key === key) }));
  const doneCount = allSubSteps.filter((s) => s.step?.status === "completed").length;
  const allDone = doneCount === allSubSteps.length;

  const [rows, setRows] = useState<ContactRowData[]>([
    { name: "", email: "", role: "client", clientCodes: [clientIdCode] },
  ]);

  useEffect(() => {
    if (existingContacts.length > 0) {
      setRows(existingContacts.map((c) => {
        const user = hubUsers?.find((u) => u.email.toLowerCase() === c.email.toLowerCase());
        const codes = user?.clientIdCode?.split(",").map((s) => s.trim()).filter(Boolean);
        return { name: c.name || "", email: c.email, role: user?.role ?? "client", clientCodes: codes && codes.length > 0 ? codes : [clientIdCode] };
      }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(existingContacts), JSON.stringify(hubUsers?.map((u) => ({ id: u.id, role: u.role, clientIdCode: u.clientIdCode })))]);

  function updateRow(i: number, updates: Partial<ContactRowData>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...updates } : r)));
  }

  async function handleAddToHub() {
    const valid = rows.filter((r) => r.email.trim());
    if (valid.length === 0) return;
    setRunning(true);
    try {
      await fetch(`/api/clients/${encodeURIComponent(clientIdCode)}/onboarding/add_contact_emails`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts: valid.map((r) => ({ name: r.name, email: r.email })) }),
      });
      const usersRes = await fetch("/api/admin/users");
      const allUsers: HubUserRecord[] = usersRes.ok ? await usersRes.json() : [];
      const byEmail = new Map(allUsers.map((u) => [u.email.toLowerCase(), u]));
      for (const row of valid) {
        let user = byEmail.get(row.email.toLowerCase()) ?? null;
        if (!user) {
          const res = await fetch("/api/admin/users", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: row.email, name: row.name, role: row.role }),
          });
          if (res.ok) user = await res.json();
        }
        if (user) {
          await fetch("/api/admin/users", {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: user.id, role: row.role, clientIdCode: row.clientCodes.join(",") || null, allowedSections: DEFAULT_CLIENT_SECTIONS }),
          });
        }
      }
      const doneEmails = valid.map((r) => r.email);
      for (const key of ["hub_add_user", "hub_assign_role", "hub_assign_client"] as const) {
        await fetch(`/api/clients/${encodeURIComponent(clientIdCode)}/onboarding/${key}`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ doneEmails }),
        });
      }
      qc.invalidateQueries({ queryKey: ["onboarding", clientIdCode] });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      setEditing(false);
    } finally {
      setRunning(false);
    }
  }

  const showForm = !allDone || editing;

  return (
    <div className="rounded-xl border bg-card text-card-foreground">
      <div className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Client Users</h3>
            <span className={`text-[10px] font-bold ${allDone ? "text-[var(--brand-green)]" : "text-muted-foreground"}`}>
              {doneCount}/{allSubSteps.length}
            </span>
          </div>
          {allDone && !editing && <span className="text-[10px] text-[var(--brand-green)] font-semibold">All set</span>}
        </div>

        <div className="rounded-md border border-border/50 overflow-visible">
          <table className="w-full">
            <thead>
              <tr className="bg-muted/30">
                <th className="px-2.5 py-1.5 text-left text-[10px] font-semibold text-muted-foreground">Name</th>
                <th className="px-2.5 py-1.5 text-left text-[10px] font-semibold text-muted-foreground">Email</th>
                <th className="px-2.5 py-1.5 text-left text-[10px] font-semibold text-muted-foreground">Role</th>
                <th className="px-2.5 py-1.5 text-left text-[10px] font-semibold text-muted-foreground">Client(s)</th>
                {showForm && <th className="w-6" />}
              </tr>
            </thead>
            <tbody>
              {showForm ? (
                rows.map((row, i) => (
                  <EditableContactRow key={i} row={row} index={i} clients={clientsList ?? []}
                    onChange={updateRow} onRemove={(idx) => setRows((p) => p.filter((_, j) => j !== idx))} canRemove={rows.length > 1} />
                ))
              ) : (
                rows.map((row, i) => (
                  <tr key={i} className="border-t border-border/40 first:border-t-0">
                    <td className="px-2.5 py-2 text-xs font-medium">{row.name || <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-2.5 py-2 text-xs text-muted-foreground">{row.email}</td>
                    <td className="px-2.5 py-2">
                      <Badge variant="outline" className="text-[10px] bg-purple-50 text-purple-700 border-purple-300 dark:bg-purple-500/10 dark:text-purple-400 dark:border-purple-500/25">{row.role}</Badge>
                    </td>
                    <td className="px-2.5 py-2">
                      <div className="flex flex-wrap gap-1">
                        {row.clientCodes.length > 0
                          ? row.clientCodes.map((code) => (
                              <Badge key={code} variant="outline" className="text-[10px] py-0 px-1.5">
                                {clientsList?.find((c) => c.clientIdCode === code)?.clientName || code}
                              </Badge>
                            ))
                          : <span className="text-[10px] text-muted-foreground">—</span>}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {showForm && (
          <div className="flex items-center justify-between">
            <button type="button" disabled={rows.length >= 5}
              onClick={() => setRows((prev) => [...prev, { name: "", email: "", role: "client", clientCodes: [clientIdCode] }])}
              className="text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-40">
              + Add contact
            </button>
            <div className="flex items-center gap-2">
              {editing && (
                <button type="button" onClick={() => setEditing(false)} className="text-[10px] text-muted-foreground hover:text-foreground">Cancel</button>
              )}
              <Button size="sm" onClick={handleAddToHub} disabled={running || !rows.some((r) => r.email.trim())} className="gap-1.5">
                {running ? <><Loader2 className="size-3.5 animate-spin" /> Adding…</> : "Add to Hub"}
              </Button>
            </div>
          </div>
        )}

        {allDone && !editing && contactStep?.completedAt && (
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground">
              Completed{" "}
              {new Date(contactStep.completedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              {contactStep.completedBy && contactStep.completedBy !== "auto" ? ` by ${contactStep.completedBy}` : ""}
            </p>
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)} className="h-6 text-[10px] text-muted-foreground">Edit</Button>
          </div>
        )}
      </div>
    </div>
  );
}

function SubtaskRow({
  stepKey,
  allSteps,
  clientIdCode,
  useManualComplete,
  children,
}: {
  stepKey: string;
  allSteps: OnboardingStep[];
  clientIdCode: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useManualComplete: (key: string) => any;
  children?: React.ReactNode;
}) {
  const step = allSteps.find((s) => s.key === stepKey);
  const manualMutation = useManualComplete(stepKey);
  if (!step) return null;

  const config = STATUS_CONFIG[step.status];
  const StatusIcon = config.icon;

  return (
    <div>
      <div className="flex items-center gap-3">
        <div className={`${config.className}`}>
          <StatusIcon className={`size-4 ${step.status === "in_progress" ? "animate-spin" : ""}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold">{step.label}</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${config.badgeClassName}`}>
              {config.label}
            </span>
          </div>
        </div>
        <div className="shrink-0">
          {(step.status === "pending" || step.status === "failed") && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => manualMutation.mutate(undefined)}
              disabled={manualMutation.isPending}
              className="gap-1.5 text-muted-foreground h-7 text-[10px]"
            >
              {manualMutation.isPending ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <><CheckCircle2 className="size-3" /> Mark Complete</>
              )}
            </Button>
          )}
          {step.status === "completed" && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => manualMutation.mutate(undefined)}
              disabled={manualMutation.isPending}
              className="gap-1 text-muted-foreground h-7 text-[10px]"
            >
              {manualMutation.isPending ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                "Edit"
              )}
            </Button>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

// ── Assignee Picker ────────────────────────────────────────────────

const ROLE_BADGE: Record<string, { label: string; className: string }> = {
  admin: { label: "Admin", className: "bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400" },
  editor: { label: "Editor", className: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400" },
  viewer: { label: "Viewer", className: "bg-stone-200 text-stone-700 dark:bg-muted dark:text-muted-foreground" },
  client: { label: "Client", className: "bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-400" },
  pending: { label: "Pending", className: "bg-stone-200 text-stone-700 dark:bg-muted dark:text-muted-foreground" },
};

function AssigneePicker({
  assignee,
  clientIdCode,
  stepKey,
  teamMembers,
}: {
  assignee: TeamMember | null;
  clientIdCode: string;
  stepKey: string;
  teamMembers: TeamMember[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const mutation = useMutation({
    mutationFn: async (assigneeId: string | null) => {
      const url = `/api/clients/${encodeURIComponent(clientIdCode)}/onboarding/${stepKey}`;
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigneeId }),
      });
      if (!res.ok) throw new Error("Failed to update assignee");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["onboarding", clientIdCode] });
      setOpen(false);
    },
  });

  // Filter to admin/editor only
  const eligible = teamMembers.filter((m) => hasAdminPowers(m.role) || m.role === "editor");

  return (
    <div className="relative" ref={ref}>
      {/* Current assignee display */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-md px-1.5 py-1 -ml-1.5 hover:bg-muted/50 transition-colors group"
      >
        {assignee ? (
          <>
            {assignee.image ? (
              <img src={assignee.image} alt="" className="size-5 rounded-full" />
            ) : (
              <UserCircle2 className="size-5 text-muted-foreground" />
            )}
            <span className="text-[11px] font-medium">{assignee.name ?? assignee.email}</span>
            {assignee.role && ROLE_BADGE[assignee.role] && (
              <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${ROLE_BADGE[assignee.role].className}`}>
                {ROLE_BADGE[assignee.role].label}
              </span>
            )}
          </>
        ) : (
          <>
            <UserCircle2 className="size-4 text-muted-foreground/50" />
            <span className="text-[10px] text-muted-foreground/50 group-hover:text-muted-foreground">Assign</span>
          </>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 w-56 rounded-lg border bg-popover shadow-lg py-1 max-h-64 overflow-y-auto">
          {assignee && (
            <button
              onClick={() => mutation.mutate(null)}
              disabled={mutation.isPending}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-muted/50 text-xs text-muted-foreground"
            >
              <X className="size-3.5" />
              Remove assignee
            </button>
          )}
          {eligible.map((m) => (
            <button
              key={m.id}
              onClick={() => mutation.mutate(m.id)}
              disabled={mutation.isPending}
              className={`flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-muted/50 ${
                assignee?.id === m.id ? "bg-muted/30" : ""
              }`}
            >
              {m.image ? (
                <img src={m.image} alt="" className="size-5 rounded-full" />
              ) : (
                <UserCircle2 className="size-5 text-muted-foreground" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">{m.name ?? m.email}</div>
                {m.name && <div className="text-[10px] text-muted-foreground truncate">{m.email}</div>}
              </div>
              {m.role && ROLE_BADGE[m.role] && (
                <span className={`text-[9px] font-bold px-1 py-0.5 rounded shrink-0 ${ROLE_BADGE[m.role].className}`}>
                  {ROLE_BADGE[m.role].label}
                </span>
              )}
            </button>
          ))}
          {eligible.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">No team members found</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Asana step keys (steps that map to an Asana task) ─────────────

const ASANA_STEP_KEYS = new Set([
  "create_client", "assign_team", "add_contact_emails", "drive_folders", "setup_timeline",
  "send_onboarding_email", "hub_add_user", "hub_assign_role", "hub_assign_client",
  "setup_asana", "amazon_access_request", "amazon_access_team",
  "amazon_import_catalog", "amazon_import_attributes",
  "iw_get_merchant_id", "iw_request_subscriptions", "intentwise_id_provided", "iw_enabled", "iw_confirm_enabled",
  "iw_amc_request", "intentwise_amc_id_provided", "iw_amc_enabled", "iw_amc_confirm_enabled",
  "feedbackwhiz",
]);

// ── Asana Panel ───────────────────────────────────────────────────

interface AsanaUser { gid: string; name: string; email?: string }
interface AsanaComment { gid: string; text: string; created_at: string; created_by: AsanaUser }
interface AsanaTaskDetails {
  gid: string; name: string; assignee: AsanaUser | null;
  start_on: string | null; due_on: string | null;
  followers: AsanaUser[]; permalink_url: string;
}

function AsanaPanel({ clientIdCode, stepKey, teamMembers, siblingStepKeys = [] }: { clientIdCode: string; stepKey: string; teamMembers: TeamMember[]; siblingStepKeys?: string[] }) {
  const qc = useQueryClient();
  const [commentText, setCommentText] = useState("");
  const [collabEmail, setCollabEmail] = useState("");
  const [showCollabInput, setShowCollabInput] = useState(false);
  const [linkTaskInput, setLinkTaskInput] = useState("");
  const [linkTaskError, setLinkTaskError] = useState<string | null>(null);

  const asanaUrl = `/api/clients/${encodeURIComponent(clientIdCode)}/onboarding/${stepKey}/asana`;

  const { data, isLoading } = useQuery<{
    linked: boolean; taskGid?: string;
    task: AsanaTaskDetails | null; comments: AsanaComment[];
  }>({
    queryKey: ["asana-task", clientIdCode, stepKey],
    queryFn: async () => {
      const res = await fetch(asanaUrl);
      if (!res.ok) return { linked: false, task: null, comments: [] };
      return res.json();
    },
    staleTime: 30_000,
  });

  const siblingUrls = siblingStepKeys.map(
    (sk) => `/api/clients/${encodeURIComponent(clientIdCode)}/onboarding/${sk}/asana`
  );

  const patchMutation = useMutation({
    mutationFn: async (fields: Record<string, unknown>) => {
      const body = JSON.stringify(fields);
      const headers = { "Content-Type": "application/json" };
      const [main] = await Promise.all([
        fetch(asanaUrl, { method: "PATCH", headers, body }).then(async (r) => { if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || "Failed to update"); } return r.json(); }),
        ...siblingUrls.map((url) => fetch(url, { method: "PATCH", headers, body }).catch(() => null)),
      ]);
      return main;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["asana-task", clientIdCode, stepKey] }),
  });

  const postMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const bodyStr = JSON.stringify(body);
      const headers = { "Content-Type": "application/json" };
      const [main] = await Promise.all([
        fetch(asanaUrl, { method: "POST", headers, body: bodyStr }).then((r) => { if (!r.ok) throw new Error("Failed"); return r.json(); }),
        ...siblingUrls.map((url) => fetch(url, { method: "POST", headers, body: bodyStr }).catch(() => null)),
      ]);
      return main;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["asana-task", clientIdCode, stepKey] });
      setCommentText("");
      setCollabEmail("");
      setShowCollabInput(false);
    },
  });

  if (isLoading) {
    return (
      <div className="rounded-xl border border-dashed bg-card/30 p-4 flex items-center justify-center min-h-[80px]">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data?.linked || !data.task) {
    const submitLink = async () => {
      const value = linkTaskInput.trim();
      if (!value) return;
      setLinkTaskError(null);
      try {
        const res = await fetch(asanaUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "link_task", taskGid: value }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || `Failed (${res.status})`);
        }
        setLinkTaskInput("");
        qc.invalidateQueries({ queryKey: ["asana-task", clientIdCode, stepKey] });
      } catch (err) {
        setLinkTaskError(err instanceof Error ? err.message : "Failed to link task");
      }
    };
    return (
      <div className="rounded-xl border border-dashed bg-card/30 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <img src="/Asana-Logo.png" alt="Asana" className="h-3 opacity-50" />
          <span className="text-[10px] text-muted-foreground/70">No Asana task linked</span>
        </div>
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={linkTaskInput}
            onChange={(e) => setLinkTaskInput(e.target.value)}
            placeholder="Paste Asana task URL or GID"
            onKeyDown={(e) => { if (e.key === "Enter") submitLink(); }}
            className="h-7 flex-1 min-w-0 rounded-md border border-border bg-background px-2 text-[11px] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
          />
          <Button size="sm" variant="outline" onClick={submitLink} disabled={!linkTaskInput.trim()} className="h-7 px-2 text-[11px]">
            Link
          </Button>
        </div>
        {linkTaskError && <p className="text-[10px] text-[var(--brand-red)]">{linkTaskError}</p>}
      </div>
    );
  }

  const task = data.task;
  const comments = data.comments ?? [];

  // Asana reports the assignee as whichever address ITS org holds, which after the
  // rebrand may be the person's other row (a @pinwheel.agency address in the 1o8
  // org, a @marketfoundry.agency one in the MF org). Match the member on either of
  // their addresses so the option below stays selected either way.
  const assignedMember = task.assignee?.email
    ? teamMembers.find(
        (m) => m.email === task.assignee?.email || m.asanaEmail === task.assignee?.email
      )
    : undefined;

  return (
    <div className="rounded-xl border bg-card text-card-foreground p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <img src="/Asana-Logo.png" alt="Asana" className="h-4 opacity-70" />
        <a
          href={task.permalink_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[10px] text-[var(--brand)] hover:underline"
        >
          Open <ExternalLink className="size-3" />
        </a>
      </div>

      {/* Assignee */}
      <div className="space-y-1">
        <label className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
          <UserCircle2 className="size-3" /> Assignee
        </label>
        <select
          value={assignedMember ? assignedMember.asanaEmail || assignedMember.email : task.assignee?.email ?? ""}
          onChange={(e) => patchMutation.mutate({ assignee: e.target.value || null })}
          disabled={patchMutation.isPending}
          className="h-7 w-full rounded-md border border-border bg-background px-2 pr-6 text-[11px] focus:outline-none focus:ring-1 focus:ring-[var(--brand)] cursor-pointer"
        >
          <option value="">Unassigned</option>
          {teamMembers.filter((m) => hasAdminPowers(m.role) || m.role === "editor").sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email)).map((m) => (
            <option key={m.id} value={m.asanaEmail || m.email}>{m.name ?? m.email}</option>
          ))}
        </select>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
            <Calendar className="size-3" /> Start
          </label>
          <DatePicker
            value={task.start_on ?? ""}
            onChange={(v) => patchMutation.mutate({ start_on: v || null })}
            disabled={patchMutation.isPending}
            className="h-7 w-full text-[11px]"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
            <Calendar className="size-3" /> Due
          </label>
          <DatePicker
            value={task.due_on ?? ""}
            onChange={(v) => patchMutation.mutate({ due_on: v || null })}
            disabled={patchMutation.isPending}
            className="h-7 w-full text-[11px]"
          />
        </div>
      </div>

      {/* Collaborators */}
      <div className="space-y-1.5">
        <label className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
          <Users className="size-3" /> Collaborators
        </label>
        <div className="flex flex-wrap gap-1">
          {task.followers.map((f) => (
            <span
              key={f.gid}
              className="inline-flex items-center gap-1 text-[10px] bg-muted/50 rounded-full px-2 py-0.5 group"
            >
              {f.name}
              <button
                onClick={() => postMutation.mutate({ action: "remove_collaborator", identifier: f.gid })}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                title="Remove"
              >
                <X className="size-2.5 text-muted-foreground hover:text-foreground" />
              </button>
            </span>
          ))}
          {!showCollabInput ? (
            <button
              onClick={() => setShowCollabInput(true)}
              className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground px-1"
            >
              + Add
            </button>
          ) : (
            <div className="flex items-center gap-1 w-full mt-1">
              <input
                type="email"
                value={collabEmail}
                onChange={(e) => setCollabEmail(e.target.value)}
                placeholder="email@example.com"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && collabEmail.trim()) {
                    postMutation.mutate({ action: "add_collaborator", email: collabEmail.trim() });
                  }
                  if (e.key === "Escape") { setShowCollabInput(false); setCollabEmail(""); }
                }}
                className="h-6 flex-1 rounded border bg-background px-2 text-[10px] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
                autoFocus
              />
              <Button
                size="sm"
                className="h-6 px-2 text-[10px]"
                onClick={() => {
                  if (collabEmail.trim()) postMutation.mutate({ action: "add_collaborator", email: collabEmail.trim() });
                }}
                disabled={postMutation.isPending || !collabEmail.trim()}
              >
                {postMutation.isPending ? <Loader2 className="size-3 animate-spin" /> : "Add"}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Comments */}
      <div className="space-y-1.5">
        <label className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
          <MessageSquare className="size-3" /> Comments {comments.length > 0 && `(${comments.length})`}
        </label>
        {comments.length > 0 && (
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {comments.map((c) => (
              <div key={c.gid} className="text-[10px] border-l-2 border-muted pl-2">
                <span className="font-medium">{c.created_by?.name ?? "Unknown"}</span>
                <span className="text-muted-foreground ml-1">
                  {new Date(c.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
                <p className="text-foreground/80 mt-0.5 whitespace-pre-wrap">{c.text}</p>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Add a comment…"
            onKeyDown={(e) => {
              if (e.key === "Enter" && commentText.trim()) {
                postMutation.mutate({ action: "add_comment", text: commentText.trim() });
              }
            }}
            className="h-7 flex-1 rounded-md border bg-background px-2 text-[11px] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
          />
          <Button
            size="sm"
            className="h-7 px-2"
            onClick={() => {
              if (commentText.trim()) postMutation.mutate({ action: "add_comment", text: commentText.trim() });
            }}
            disabled={postMutation.isPending || !commentText.trim()}
          >
            {postMutation.isPending ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />}
          </Button>
        </div>
      </div>

      {/* Errors */}
      {(patchMutation.error || postMutation.error) && (
        <p className="text-[10px] text-[var(--brand-red)]">
          {(patchMutation.error ?? postMutation.error)?.message}
        </p>
      )}
    </div>
  );
}

// ── Step Card ──────────────────────────────────────────────────────

function StepCard({
  step,
  clientIdCode,
  clientName,
  onEdit,
  allSteps,
  teamMembers,
}: {
  step: OnboardingStep;
  clientIdCode: string;
  clientName?: string;
  onEdit?: () => void;
  allSteps: OnboardingStep[];
  teamMembers: TeamMember[];
}) {
  const mutation = useStepAction(clientIdCode, step.key);
  const queryClient = useQueryClient();
  const manualCompleteMutation = useMutation({
    mutationFn: async () => {
      const url = `/api/clients/${encodeURIComponent(clientIdCode)}/onboarding/${step.key}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manualComplete: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(data.error || `Failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding", clientIdCode] });
    },
  });
  const [showLinkProject, setShowLinkProject] = useState(false);
  const [linkProjectInput, setLinkProjectInput] = useState("");
  const linkProjectMutation = useMutation({
    mutationFn: async (input: string) => {
      const res = await fetch(`/api/clients/${encodeURIComponent(clientIdCode)}/onboarding/${step.key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkExistingProjectGid: input }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(data.error || `Failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => {
      setShowLinkProject(false);
      setLinkProjectInput("");
      queryClient.invalidateQueries({ queryKey: ["onboarding", clientIdCode] });
      queryClient.invalidateQueries({ queryKey: ["asana-task", clientIdCode] });
    },
  });
  // Create Client card shows the live creation details (mirrors the Edit dialog).
  // Reuses the page-level ["client-detail"] cache; only fetches for create_client.
  const { data: createClientDetail } = useQuery<{
    client: { clientIdCode: string; clientName: string; clientStatus: string; clientType: "AIA" | "NTA" | null };
  }>({
    queryKey: ["client-detail", clientIdCode],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${encodeURIComponent(clientIdCode)}`);
      if (!res.ok) throw new Error("Failed to load client");
      return res.json();
    },
    enabled: step.key === "create_client",
  });
  const config = STATUS_CONFIG[step.status];
  const StatusIcon = config.icon;
  const isManualStep = step.key === "create_client";
  const isEmailStep = step.key === "send_onboarding_email";
  const isContactEmailStep = step.key === "add_contact_emails";
  const isStartingDayStep = step.key === "setup_timeline";
  const isIntentwiseId = step.key === "intentwise_id_provided" || step.key === "intentwise_amc_id_provided";
  const isMerchantIdStep = step.key === "iw_get_merchant_id";
  const hasCustomInput = isEmailStep || isContactEmailStep || isStartingDayStep || isIntentwiseId || isMerchantIdStep;
  const existingIntentwiseId =
    step.metadata && typeof step.metadata === "object" && "intentwiseId" in step.metadata
      ? String(step.metadata.intentwiseId ?? "")
      : "";
  const existingIntentwiseName =
    step.metadata && typeof step.metadata === "object" && "intentwiseName" in step.metadata
      ? String(step.metadata.intentwiseName ?? "")
      : "";
  const existingMerchantId =
    step.metadata && typeof step.metadata === "object" && "merchantId" in step.metadata
      ? String(step.metadata.merchantId ?? "")
      : "";
  const existingSentTo =
    step.metadata && typeof step.metadata === "object" && "sentTo" in step.metadata
      ? String(step.metadata.sentTo ?? "")
      : "";
  const existingContacts: { name: string; email: string }[] =
    step.metadata && typeof step.metadata === "object" && "contacts" in step.metadata
      ? (step.metadata.contacts as { name: string; email: string }[]) ?? []
      : [];
  const existingStartDate =
    step.metadata && typeof step.metadata === "object" && "startDate" in step.metadata
      ? String(step.metadata.startDate ?? "")
      : "";
  // Pull first contact email from the add_contact_emails step for pre-fill
  const contactsStep = allSteps.find((s) => s.key === "add_contact_emails");
  const savedContacts: { name: string; email: string }[] =
    contactsStep?.metadata && typeof contactsStep.metadata === "object" && "contacts" in contactsStep.metadata
      ? (contactsStep.metadata.contacts as { name: string; email: string }[]) ?? []
      : [];
  const defaultEmail = existingSentTo || savedContacts[0]?.email || "";

  const [intentwiseIdInput, setIntentwiseIdInput] = useState(existingIntentwiseId);
  const [intentwiseNameInput, setIntentwiseNameInput] = useState(existingIntentwiseName);
  const [merchantIdInput, setMerchantIdInput] = useState(existingMerchantId);
  // Mirror external AAC edits (e.g. from the client-detail Intentwise card) into
  // the local inputs so the two views stay in sync.
  useEffect(() => {
    setIntentwiseIdInput(existingIntentwiseId);
  }, [existingIntentwiseId]);
  useEffect(() => {
    setIntentwiseNameInput(existingIntentwiseName);
  }, [existingIntentwiseName]);
  useEffect(() => {
    setMerchantIdInput(existingMerchantId);
  }, [existingMerchantId]);
  const [emailInput, setEmailInput] = useState(defaultEmail);
  const [contacts, setContacts] = useState<{ name: string; email: string }[]>(
    existingContacts.length > 0 ? existingContacts : [{ name: "", email: "" }]
  );
  const [startDateInput, setStartDateInput] = useState(existingStartDate);
  // Email step: multi-recipient + preview
  const [selectedEmails, setSelectedEmails] = useState<string[]>(() =>
    savedContacts.map((c) => c.email).filter(Boolean)
  );
  const [showEmailPreview, setShowEmailPreview] = useState(false);
  const [emailCopied, setEmailCopied] = useState(false);
  useEffect(() => {
    setSelectedEmails(savedContacts.map((c) => c.email).filter(Boolean));
  }, [savedContacts.map((c) => c.email).join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  // Build preview HTML client-side (portal URL known; drive/asana links added server-side)
  const asanaUrl = (() => {
    const s = allSteps.find((st) => st.key === "setup_asana");
    return s?.metadata && typeof s.metadata === "object" && "projectUrl" in s.metadata ? String(s.metadata.projectUrl) : undefined;
  })();
  const emailPreviewHtml = isEmailStep ? `
    <html><head><style>body{margin:0;background:#111;font-family:-apple-system,sans-serif;font-size:13px;color:#e0e0e0;line-height:1.6}
    h2{color:#F8BF1D;font-size:14px;margin:18px 0 8px}a{color:#F8BF1D}ul{padding-left:18px;margin:6px 0}li{margin-bottom:4px}
    .wrap{max-width:560px;margin:0 auto;padding:16px}.header{background:#565454;padding:14px 18px;border-radius:8px 8px 0 0}
    .body{background:#1a1a1a;padding:18px;border-radius:0 0 8px 8px}</style></head><body>
    <div class="wrap"><div class="header"><span style="font-size:18px;color:#F8BF1D;font-weight:600">Welcome to 1o8</span></div>
    <div class="body">
      <p>Hi ${clientName || clientIdCode},</p>
      <p>We are beyond excited to have you on board and can't wait to begin this incredible journey together.</p>
      <h2>1. Strategic Optimizations</h2>
      <ul><li><strong>Full SEO Optimization</strong> — titles, bullet points, descriptions</li>
      <li><strong>Complete Design Overhaul</strong> — Storefront, Brand Story, A+ Content</li>
      <li><strong>PPC Setup &amp; Optimization</strong> — full-funnel strategy</li>
      <li><strong>Reporting and Communication</strong> — monthly reports + bi-weekly meetings</li></ul>
      <h2>2. The 1o8 Portal</h2>
      <p>Timeline, Sales, Products, SEO, Design, Reports, Finance — all in one place.</p>
      <p>→ <a href="https://www.marketfoundryhub.com/portal">Access your 1o8 Portal</a></p>
      ${asanaUrl ? `<p>→ <a href="${asanaUrl}">View your project timeline in Asana</a></p>` : ""}
      <h2>3. Onboarding Requirements</h2>
      <ul><li>Product images, videos, and brand logos</li>
      <li>Login credentials for relevant tools and brand guidelines</li>
      <li><strong>Brand Registry Access</strong></li></ul>
      <p>Please add these materials to your <em>Client Resources</em> folder (link included in email) or share them directly.</p>
      <hr style="border:none;border-top:1px solid #333;margin:16px 0"/>
      <p style="margin-top:12px">Best regards,<br/>Jake, Aqib and Team</p>
    </div></div></body></html>
  ` : "";

  const canRun =
    !isManualStep &&
    !hasCustomInput &&
    (step.status === "pending" || step.status === "failed");

  const isSubstep = !!step.parent;

  return (
    <div className="rounded-xl border bg-card text-card-foreground overflow-hidden">
      <div className="flex items-start gap-4 p-5">
        {/* Status icon */}
        <div className={`mt-0.5 ${config.className}`}>
          <StatusIcon
            className={`size-5 ${step.status === "in_progress" ? "animate-spin" : ""}`}
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold">{step.label}</h3>
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${config.badgeClassName}`}
            >
              {config.label}
            </span>
          </div>
          {isManualStep ? (
            <dl className="mt-1.5 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-muted-foreground">Client ID Code</dt>
              <dd className="font-mono text-foreground/90">{clientIdCode}</dd>

              <dt className="text-muted-foreground">Name</dt>
              <dd className="text-foreground/90 truncate">
                {createClientDetail?.client.clientName || clientName || <span className="text-muted-foreground">—</span>}
              </dd>

              <dt className="text-muted-foreground">Status</dt>
              <dd>
                {createClientDetail?.client.clientStatus ? (
                  <span className={`font-medium ${clientStatusClass(createClientDetail.client.clientStatus)}`}>
                    {createClientDetail.client.clientStatus}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </dd>

              <dt className="text-muted-foreground">Template</dt>
              <dd>
                {createClientDetail?.client.clientType ? (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${clientTypeChipClass(createClientDetail.client.clientType)}`}>
                    {createClientDetail.client.clientType}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </dd>
            </dl>
          ) : (
            <p className="text-xs text-muted-foreground">{step.description}</p>
          )}

          {/* Drive folders: shortcut to folder structure config admin page */}
          {step.key === "drive_folders" && (
            <a
              href="/admin/drive-folder-config"
              className="inline-flex items-center gap-1 mt-1.5 text-[11px] text-brand hover:underline"
              title="Configure the Drive folder tree"
            >
              ✎ Edit folder structure
            </a>
          )}

          {/* Contact checklist for hub steps */}
          {(step.key === "hub_add_user" || step.key === "hub_assign_role" || step.key === "hub_assign_client") &&
            savedContacts.length > 0 && (
              <div className="mt-2 space-y-1">
                {savedContacts.map((c, i) => {
                  const doneList: string[] =
                    step.metadata && typeof step.metadata === "object" && "doneEmails" in step.metadata
                      ? (step.metadata.doneEmails as string[]) ?? []
                      : [];
                  const checked = doneList.includes(c.email);
                  return (
                    <label key={i} className="flex items-center gap-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const next = checked
                            ? doneList.filter((e) => e !== c.email)
                            : [...doneList, c.email];
                          mutation.mutate({ doneEmails: next });
                        }}
                        disabled={mutation.isPending}
                        className="size-3.5 rounded border-muted-foreground accent-[var(--brand)]"
                      />
                      <span className={`text-xs ${checked ? "line-through text-muted-foreground" : "text-foreground/80"}`}>
                        {c.name ? `${c.name} — ` : ""}{c.email}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

          {/* Contact name+email pairs */}
          {isContactEmailStep && (
            <div className="mt-2 space-y-2">
              {contacts.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={c.name}
                    onChange={(e) => {
                      const next = [...contacts];
                      next[i] = { ...next[i], name: e.target.value };
                      setContacts(next);
                    }}
                    placeholder="Contact name"
                    disabled={mutation.isPending}
                    className="h-8 rounded-md border bg-background px-2.5 text-xs flex-1 min-w-0 focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
                  />
                  <input
                    type="email"
                    value={c.email}
                    onChange={(e) => {
                      const next = [...contacts];
                      next[i] = { ...next[i], email: e.target.value };
                      setContacts(next);
                    }}
                    placeholder="email@example.com"
                    disabled={mutation.isPending}
                    className="h-8 rounded-md border bg-background px-2.5 text-xs flex-[1.5] min-w-0 focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
                  />
                  {contacts.length > 1 && (
                    <button
                      onClick={() => setContacts(contacts.filter((_, j) => j !== i))}
                      className="text-muted-foreground hover:text-foreground text-xs px-1"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              <div className="flex items-center gap-2">
                {contacts.length < 5 && (
                  <button
                    onClick={() => setContacts(prev => [...prev, { name: "", email: "" }])}
                    className="text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    + Add contact
                  </button>
                )}
                <Button
                  size="sm"
                  onClick={() => mutation.mutate({ contacts: contacts.filter((c) => c.email.trim()) })}
                  disabled={mutation.isPending || !contacts.some((c) => c.email.trim())}
                  className="gap-1.5 h-8 ml-auto"
                >
                  {mutation.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : existingContacts.length > 0 ? (
                    "Update"
                  ) : (
                    "Save"
                  )}
                </Button>
              </div>

              {/* Portal access is now handled by ClientUsersCard */}
            </div>
          )}

          {/* Starting day date picker */}
          {isStartingDayStep && (
            <div className="flex items-center gap-2 mt-2">
              <DatePicker
                value={startDateInput}
                onChange={setStartDateInput}
                disabled={mutation.isPending}
                className="h-8"
              />
              <Button
                size="sm"
                onClick={() => mutation.mutate({ startDate: startDateInput })}
                disabled={mutation.isPending || !startDateInput}
                className="gap-1.5 h-8"
              >
                {mutation.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : existingStartDate ? (
                  "Update"
                ) : (
                  "Set"
                )}
              </Button>
            </div>
          )}

          {/* Email step — recipient checkboxes + preview + send */}
          {isEmailStep && (
            <div className="mt-3 space-y-3">
              {/* Contact checkboxes */}
              {savedContacts.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Recipients</p>
                  {savedContacts.map((c) => (
                    <label key={c.email} className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={selectedEmails.includes(c.email)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedEmails((p) => [...p, c.email]);
                          else setSelectedEmails((p) => p.filter((x) => x !== c.email));
                        }}
                        disabled={mutation.isPending}
                        className="accent-[var(--brand)] size-3.5"
                      />
                      <span className="text-xs">
                        {c.name ? <><span className="font-medium">{c.name}</span> <span className="text-muted-foreground">&lt;{c.email}&gt;</span></> : c.email}
                      </span>
                    </label>
                  ))}
                </div>
              )}
              {/* Preview toggle */}
              <button
                type="button"
                onClick={() => setShowEmailPreview((p) => !p)}
                className="text-xs text-[var(--brand)] hover:underline"
              >
                {showEmailPreview ? "Hide email preview ↑" : "Preview email ↓"}
              </button>
              {showEmailPreview && (
                <div className="rounded-lg border overflow-hidden">
                  <iframe
                    srcDoc={emailPreviewHtml}
                    className="w-full h-72"
                    sandbox="allow-same-origin"
                    title="Email preview"
                  />
                </div>
              )}
              {/* Send row */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-[10px] text-muted-foreground">
                  {selectedEmails.length} recipient{selectedEmails.length !== 1 ? "s" : ""}
                  {selectedEmails.length > 0 && ` — ${selectedEmails.join(", ")}`}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 h-8"
                    title="Copy email content"
                    onClick={() => {
                      const div = document.createElement("div");
                      div.innerHTML = emailPreviewHtml;
                      navigator.clipboard.writeText(div.innerText || div.textContent || "").then(() => {
                        setEmailCopied(true);
                        setTimeout(() => setEmailCopied(false), 2000);
                      });
                    }}
                  >
                    {emailCopied ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
                    {emailCopied ? "Copied" : "Copy"}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => mutation.mutate({ emails: selectedEmails })}
                    disabled={mutation.isPending || selectedEmails.length === 0}
                    className="gap-1.5 h-8"
                  >
                    {mutation.isPending ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : step.status === "completed" ? (
                      "Re-send"
                    ) : (
                      "Send"
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Merchant ID input */}
          {isMerchantIdStep && (
            <div className="mt-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={merchantIdInput}
                  onChange={(e) => setMerchantIdInput(e.target.value)}
                  placeholder="Enter Merchant ID — e.g. A1B2C3D4E5F6G7"
                  disabled={mutation.isPending}
                  className="h-8 rounded-md border bg-background px-2.5 text-xs flex-1 min-w-0 focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
                />
                <Button
                  size="sm"
                  onClick={() => mutation.mutate({ merchantId: merchantIdInput })}
                  disabled={mutation.isPending || !merchantIdInput.trim()}
                  className="gap-1.5 h-8"
                >
                  {mutation.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : existingMerchantId ? (
                    "Update"
                  ) : (
                    "Save"
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Intentwise Name + ID inputs (synced to AAC) */}
          {isIntentwiseId && (
            <div className="space-y-2 mt-2">
              <input
                type="text"
                value={intentwiseNameInput}
                onChange={(e) => setIntentwiseNameInput(e.target.value)}
                placeholder={
                  step.key === "intentwise_amc_id_provided"
                    ? "Intentwise Name (AMC) — e.g. Hot_Shot_SC_US_AMC"
                    : "Intentwise Name — e.g. Hot_Shot_SC_US"
                }
                disabled={mutation.isPending}
                className="h-8 w-full rounded-md border bg-background px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
              />
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={intentwiseIdInput}
                  onChange={(e) => setIntentwiseIdInput(e.target.value)}
                  placeholder="Enter Intentwise ID…"
                  disabled={mutation.isPending}
                  className="h-8 rounded-md border bg-background px-2.5 text-xs flex-1 min-w-0 focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
                />
                <Button
                  size="sm"
                  onClick={() =>
                    mutation.mutate({
                      intentwiseId: intentwiseIdInput,
                      intentwiseName: intentwiseNameInput,
                    })
                  }
                  disabled={mutation.isPending || !intentwiseIdInput.trim()}
                  className="gap-1.5 h-8"
                >
                  {mutation.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : existingIntentwiseId ? (
                    "Update"
                  ) : (
                    "Save"
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Completed info — skip for auto-completed steps */}
          {step.status === "completed" && step.completedAt && !isManualStep && (
            <>
              <p className="text-[10px] text-muted-foreground mt-2">
                Completed{" "}
                {new Date(step.completedAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {step.completedBy && step.completedBy !== "auto" ? ` by ${step.completedBy}` : ""}
                {step.metadata &&
                typeof step.metadata === "object" &&
                "foldersCreated" in step.metadata
                  ? ` — ${step.metadata.foldersCreated} folders created`
                  : ""}
                {step.metadata &&
                typeof step.metadata === "object" &&
                "tasksCreated" in step.metadata
                  ? ` — ${step.metadata.tasksCreated} tasks created`
                  : ""}
                {step.metadata &&
                typeof step.metadata === "object" &&
                "sentTo" in step.metadata
                  ? ` — sent to ${step.metadata.sentTo}`
                  : ""}
                {step.metadata &&
                typeof step.metadata === "object" &&
                "contacts" in step.metadata &&
                Array.isArray(step.metadata.contacts)
                  ? ` — ${(step.metadata.contacts as { email: string }[]).map((c) => c.email).join(", ")}`
                  : ""}
                {step.metadata &&
                typeof step.metadata === "object" &&
                "startDate" in step.metadata
                  ? ` — ${step.metadata.startDate}`
                  : ""}
              </p>
              {step.metadata &&
                typeof step.metadata === "object" &&
                "projectUrl" in step.metadata && (
                  <a
                    href={String(step.metadata.projectUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] text-[var(--brand)] hover:underline mt-1"
                  >
                    Open in Asana &rarr;
                  </a>
                )}
              {step.metadata &&
                typeof step.metadata === "object" &&
                "driveFolderUrl" in step.metadata &&
                step.metadata.driveFolderUrl && (
                  <a
                    href={String(step.metadata.driveFolderUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] text-[var(--brand)] hover:underline mt-1"
                  >
                    Open in Drive &rarr;
                  </a>
                )}
            </>
          )}

          {/* setup_asana: always show project ID + link form, regardless of status */}
          {step.key === "setup_asana" && (() => {
            const meta = step.metadata && typeof step.metadata === "object" ? (step.metadata as Record<string, unknown>) : null;
            const gid = meta && typeof meta.projectGid === "string" ? meta.projectGid : null;
            const url = meta && typeof meta.projectUrl === "string" ? meta.projectUrl : null;
            return (
              <div className="mt-2 space-y-1.5">
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="text-muted-foreground">Project ID:</span>
                  {gid ? (
                    <code className="font-mono text-foreground/80">{gid}</code>
                  ) : (
                    <code className="font-mono text-[var(--brand-red)]">not linked</code>
                  )}
                  {url && (
                    <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[var(--brand)] hover:underline">
                      Open in Asana &rarr;
                    </a>
                  )}
                </div>
                {!showLinkProject ? (
                  <button
                    onClick={() => setShowLinkProject(true)}
                    className="text-[10px] text-muted-foreground hover:text-foreground hover:underline"
                  >
                    {gid ? "Replace linked project →" : "Link an existing Asana project →"}
                  </button>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={linkProjectInput}
                        onChange={(e) => setLinkProjectInput(e.target.value)}
                        placeholder="Paste Asana project URL or GID"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && linkProjectInput.trim()) linkProjectMutation.mutate(linkProjectInput.trim());
                          if (e.key === "Escape") { setShowLinkProject(false); setLinkProjectInput(""); }
                        }}
                        disabled={linkProjectMutation.isPending}
                        className="h-7 flex-1 min-w-0 rounded-md border border-border bg-background px-2 text-[11px] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
                      />
                      <Button size="sm" variant="outline" onClick={() => linkProjectMutation.mutate(linkProjectInput.trim())} disabled={linkProjectMutation.isPending || !linkProjectInput.trim()} className="h-7 px-2 text-[11px]">
                        {linkProjectMutation.isPending ? <Loader2 className="size-3 animate-spin" /> : "Link"}
                      </Button>
                      <button
                        onClick={() => { setShowLinkProject(false); setLinkProjectInput(""); }}
                        className="text-muted-foreground hover:text-foreground text-[11px] px-1"
                      >
                        Cancel
                      </button>
                    </div>
                    {linkProjectMutation.error && (
                      <p className="text-[10px] text-[var(--brand-red)]">{linkProjectMutation.error.message}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Error info */}
          {step.status === "failed" && step.metadata && "error" in step.metadata && (
            <p className="text-[10px] text-[var(--brand-red)] mt-2">
              Error: {String(step.metadata.error)}
            </p>
          )}

          {/* Mutation error */}
          {mutation.error && (
            <p className="text-[10px] text-[var(--brand-red)] mt-2">
              {mutation.error.message}
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex-shrink-0 flex items-center gap-2">
          {canRun && (
            <Button
              size="sm"
              onClick={() => mutation.mutate(undefined)}
              disabled={mutation.isPending}
              className="gap-1.5"
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Running…
                </>
              ) : step.status === "failed" ? (
                <>
                  <Play className="size-3.5" />
                  Retry
                </>
              ) : (
                <>
                  <Play className="size-3.5" />
                  Run
                </>
              )}
            </Button>
          )}
          {/* Mark Complete for any pending/failed step (works for already-onboarded clients) */}
          {(step.status === "pending" || step.status === "failed") && !isManualStep && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => manualCompleteMutation.mutate()}
              disabled={manualCompleteMutation.isPending}
              className="gap-1.5 text-muted-foreground"
            >
              {manualCompleteMutation.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <>
                  <CheckCircle2 className="size-3.5" />
                  Mark Complete
                </>
              )}
            </Button>
          )}
          {step.status === "completed" && isManualStep && onEdit && (
            <Button
              size="sm"
              variant="outline"
              onClick={onEdit}
              className="gap-1.5 text-muted-foreground"
            >
              <Pencil className="size-3" />
              Edit
            </Button>
          )}
          {step.status === "completed" && !isManualStep && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => manualCompleteMutation.mutate()}
              disabled={manualCompleteMutation.isPending}
              className="gap-1.5 text-muted-foreground"
            >
              {manualCompleteMutation.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                "Edit"
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Parent labels ─────────────────────────────────────────────────

const PARENT_LABELS: Record<string, string> = {
  create_client: "1. Create Client",
  assign_team: "2. Assign Team",
  setup_asana: "3. Setup Asana Project",
  setup_timeline: "4. Setup Starting Day & Timeline",
  client_users: "5. Add Client Users",
  drive_folders: "6. Create Drive Folders",
  send_onboarding_email: "7. Send Onboarding Email",
  amazon_access: "8. Amazon Access",
  intentwise: "9. Setup Intentwise",
  intentwise_amc: "10. Setup Intentwise AMC",
  feedbackwhiz_group: "11. Setup FeedbackWhiz",
};

// ── Assign Team Inline ───────────────────────────────────────────

const TEAM_ROLE_KEYS = [
  { key: "ExecutiveStrategist_MF", label: "Executive Strategist" },
  { key: "AccountManager_MF", label: "Account Manager" },
  { key: "ProjectManager_MF", label: "Project Manager" },
  { key: "SEOManager_MF", label: "SEO Manager" },
  { key: "PPCManager_MF", label: "PPC Manager" },
  { key: "DesignManager_MF", label: "Design Manager" },
  { key: "CatalogManager_MF", label: "Catalog Manager" },
];

function AssignTeamInline({
  step,
  clientIdCode,
  teamMembers,
}: {
  step: OnboardingStep;
  clientIdCode: string;
  teamMembers: TeamMember[];
}) {
  const config = STATUS_CONFIG[step.status];
  const Icon = config.icon;
  const qc = useQueryClient();

  // Load current rawData for this client
  const { data: clientData } = useQuery<{ rawData: Record<string, string> }>({
    queryKey: ["client-detail", clientIdCode],
    queryFn: () => fetch(`/api/clients/${clientIdCode}`).then((r) => r.json()),
    staleTime: 30_000,
  });
  const rawData = clientData?.rawData ?? {};

  // Only admin/editor users for team selection
  const eligible = teamMembers.filter((u) => hasAdminPowers(u.role) || u.role === "editor");

  const saveMutation = useMutation({
    mutationFn: async ({ field, value }: { field: string; value: string }) => {
      const res = await fetch(`/api/clients/${clientIdCode}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field, value }),
      });
      if (!res.ok) throw new Error("Save failed");
      return res.json();
    },
    onMutate: async ({ field, value }) => {
      await qc.cancelQueries({ queryKey: ["client-detail", clientIdCode] });
      const prev = qc.getQueryData(["client-detail", clientIdCode]);
      qc.setQueryData(["client-detail", clientIdCode], (old: Record<string, unknown> | undefined) => {
        if (!old) return old;
        return { ...old, rawData: { ...(old.rawData as Record<string, string>), [field]: value } };
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["client-detail", clientIdCode], ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["client-detail", clientIdCode] });
      qc.invalidateQueries({ queryKey: ["onboarding", clientIdCode] });
    },
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/clients/${clientIdCode}/onboarding/${step.key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manualComplete: true }),
      });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["onboarding", clientIdCode] });
    },
  });

  const allAssigned = TEAM_ROLE_KEYS.slice(0, 2).every((r) => String(rawData[r.key] ?? "").trim());

  // Auto-complete when required roles are filled
  useEffect(() => {
    if (allAssigned && step.status !== "completed") {
      completeMutation.mutate();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allAssigned]);

  return (
    <>
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 ${config.className}`}>
          <Icon className="size-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-sm font-semibold">{step.label}</h3>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${config.badgeClassName}`}>
              {config.label}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {TEAM_ROLE_KEYS.map((role) => (
              <div key={role.key} className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground w-[130px] shrink-0 truncate">{role.label}</span>
                <Select
                  value={String(rawData[role.key] ?? "").trim() || "__none__"}
                  onValueChange={(v) => saveMutation.mutate({ field: role.key, value: v === "__none__" ? "" : v })}
                >
                  <SelectTrigger className="h-7 text-xs border-border/40 px-2 flex-1 min-w-0">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__"><span className="text-muted-foreground">None</span></SelectItem>
                    {eligible.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")).map((m) => (
                      <SelectItem key={m.id} value={m.name ?? m.email}>{m.name ?? m.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </div>
        <div className="shrink-0">
          {step.status !== "completed" && allAssigned && (
            <Button size="sm" onClick={() => completeMutation.mutate()} disabled={completeMutation.isPending} className="gap-1.5">
              {completeMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
              Done
            </Button>
          )}
          {step.status === "completed" && (
            <Button size="sm" variant="outline" onClick={() => completeMutation.mutate()} disabled={completeMutation.isPending} className="text-muted-foreground">
              {completeMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <><Pencil className="size-3" /> Edit</>}
            </Button>
          )}
        </div>
      </div>
      <div className="border-t border-dashed" />
    </>
  );
}

// ── Combined Setup Card (Create Client + Assign Team + Setup Asana) ──

function CombinedSetupCard({
  createStep,
  assignTeamStep,
  asanaStep,
  clientIdCode,
  onEditClient,
  allSteps,
  teamMembers,
}: {
  createStep: OnboardingStep;
  assignTeamStep?: OnboardingStep;
  asanaStep: OnboardingStep;
  clientIdCode: string;
  onEditClient: () => void;
  allSteps: OnboardingStep[];
  teamMembers: TeamMember[];
}) {
  const asanaMutation = useStepAction(clientIdCode, asanaStep.key);
  const qc = useQueryClient();
  const asanaManualComplete = useMutation({
    mutationFn: async () => {
      const url = `/api/clients/${encodeURIComponent(clientIdCode)}/onboarding/${asanaStep.key}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manualComplete: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(data.error || `Failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["onboarding", clientIdCode] });
    },
  });
  const [showLinkProject, setShowLinkProject] = useState(false);
  const [linkProjectInput, setLinkProjectInput] = useState("");
  const linkProjectMutation = useMutation({
    mutationFn: async (input: string) => {
      const res = await fetch(`/api/clients/${encodeURIComponent(clientIdCode)}/onboarding/${asanaStep.key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkExistingProjectGid: input }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(data.error || `Failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => {
      setShowLinkProject(false);
      setLinkProjectInput("");
      qc.invalidateQueries({ queryKey: ["onboarding", clientIdCode] });
      qc.invalidateQueries({ queryKey: ["asana-task", clientIdCode] });
    },
  });
  const createConfig = STATUS_CONFIG[createStep.status];
  const asanaConfig = STATUS_CONFIG[asanaStep.status];
  const CreateIcon = createConfig.icon;
  const AsanaIcon = asanaConfig.icon;

  return (
    <div className="rounded-xl border bg-card text-card-foreground overflow-hidden">
      <div className="p-5 space-y-4">
        {/* Subtask 1: Create Client */}
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 ${createConfig.className}`}>
            <CreateIcon className="size-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <h3 className="text-sm font-semibold">{createStep.label}</h3>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${createConfig.badgeClassName}`}>
                {createConfig.label}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{createStep.description}</p>
          </div>
          {createStep.status === "completed" && (
            <Button size="sm" variant="outline" onClick={onEditClient} className="gap-1.5 text-muted-foreground shrink-0">
              <Pencil className="size-3" /> Edit
            </Button>
          )}
        </div>

        <div className="border-t border-dashed" />

        {/* Subtask 2: Assign Team */}
        {assignTeamStep && (
          <AssignTeamInline step={assignTeamStep} clientIdCode={clientIdCode} teamMembers={teamMembers} />
        )}

        {/* Subtask 3: Setup Asana */}
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 ${asanaConfig.className}`}>
            <AsanaIcon className={`size-5 ${asanaStep.status === "in_progress" ? "animate-spin" : ""}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <h3 className="text-sm font-semibold">{asanaStep.label}</h3>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${asanaConfig.badgeClassName}`}>
                {asanaConfig.label}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{asanaStep.description}</p>
            {asanaStep.status === "completed" && asanaStep.completedAt && (
              <p className="text-[10px] text-muted-foreground mt-1">
                Completed{" "}
                {new Date(asanaStep.completedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                {asanaStep.completedBy && asanaStep.completedBy !== "auto" ? ` by ${asanaStep.completedBy}` : ""}
                {asanaStep.metadata && typeof asanaStep.metadata === "object" && "tasksCreated" in asanaStep.metadata ? ` — ${asanaStep.metadata.tasksCreated} tasks created` : ""}
              </p>
            )}
            {(() => {
              const meta = asanaStep.metadata && typeof asanaStep.metadata === "object" ? (asanaStep.metadata as Record<string, unknown>) : null;
              const gid = meta && typeof meta.projectGid === "string" ? meta.projectGid : null;
              const url = meta && typeof meta.projectUrl === "string" ? meta.projectUrl : null;
              return (
                <div className="flex items-center gap-2 mt-1 text-[10px]">
                  <span className="text-muted-foreground">Project ID:</span>
                  {gid ? (
                    <code className="font-mono text-foreground/80">{gid}</code>
                  ) : (
                    <code className="font-mono text-[var(--brand-red)]">not linked</code>
                  )}
                  {url && (
                    <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[var(--brand)] hover:underline">
                      Open in Asana &rarr;
                    </a>
                  )}
                </div>
              );
            })()}
            {asanaStep.status === "failed" && asanaStep.metadata && "error" in asanaStep.metadata && (
              <p className="text-[10px] text-[var(--brand-red)] mt-1">Error: {String(asanaStep.metadata.error)}</p>
            )}
            {asanaMutation.error && (
              <p className="text-[10px] text-[var(--brand-red)] mt-1">{asanaMutation.error.message}</p>
            )}
          </div>
          <div className="shrink-0 flex items-center gap-2">
            {(asanaStep.status === "pending" || asanaStep.status === "failed") && (
              <>
                <Button size="sm" onClick={() => asanaMutation.mutate(undefined)} disabled={asanaMutation.isPending} className="gap-1.5">
                  {asanaMutation.isPending ? <><Loader2 className="size-3.5 animate-spin" /> Running…</> : <><Play className="size-3.5" /> Run</>}
                </Button>
                <Button size="sm" variant="outline" onClick={() => asanaManualComplete.mutate()} disabled={asanaManualComplete.isPending} className="gap-1.5 text-muted-foreground">
                  {asanaManualComplete.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <><CheckCircle2 className="size-3.5" /> Mark Complete</>}
                </Button>
              </>
            )}
            {asanaStep.status === "completed" && (
              <Button size="sm" variant="outline" onClick={() => asanaManualComplete.mutate()} disabled={asanaManualComplete.isPending} className="gap-1.5 text-muted-foreground">
                {asanaManualComplete.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <><Pencil className="size-3" /> Edit</>}
              </Button>
            )}
          </div>
        </div>

        {/* Link existing Asana project — always available (also lets admin replace a wrong link) */}
        {true && (
          <div className="pl-8">
            {!showLinkProject ? (
              <button
                onClick={() => setShowLinkProject(true)}
                className="text-[10px] text-muted-foreground hover:text-foreground hover:underline"
              >
                Or link an existing Asana project →
              </button>
            ) : (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={linkProjectInput}
                    onChange={(e) => setLinkProjectInput(e.target.value)}
                    placeholder="Paste Asana project URL or GID"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && linkProjectInput.trim()) linkProjectMutation.mutate(linkProjectInput.trim());
                      if (e.key === "Escape") { setShowLinkProject(false); setLinkProjectInput(""); }
                    }}
                    disabled={linkProjectMutation.isPending}
                    className="h-7 flex-1 min-w-0 rounded-md border border-border bg-background px-2 text-[11px] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
                  />
                  <Button size="sm" variant="outline" onClick={() => linkProjectMutation.mutate(linkProjectInput.trim())} disabled={linkProjectMutation.isPending || !linkProjectInput.trim()} className="h-7 px-2 text-[11px]">
                    {linkProjectMutation.isPending ? <Loader2 className="size-3 animate-spin" /> : "Link"}
                  </Button>
                  <button
                    onClick={() => { setShowLinkProject(false); setLinkProjectInput(""); }}
                    className="text-muted-foreground hover:text-foreground text-[11px] px-1"
                  >
                    Cancel
                  </button>
                </div>
                {linkProjectMutation.error && (
                  <p className="text-[10px] text-[var(--brand-red)]">{linkProjectMutation.error.message}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Subtask 4: Set Starting Day */}
        {asanaStep.status === "completed" && (() => {
          const sdStep = allSteps.find((s: OnboardingStep) => s.key === "setup_timeline");
          return sdStep ? <StartingDayInline step={sdStep} clientIdCode={clientIdCode} /> : null;
        })()}

        {/* Subtask 5: Initialize Timeline (after Asana setup) */}
        {asanaStep.status === "completed" && <InitTimelineInline clientIdCode={clientIdCode} />}
      </div>
    </div>
  );
}

function StartingDayInline({ step, clientIdCode }: { step: OnboardingStep; clientIdCode: string }) {
  const config = STATUS_CONFIG[step.status];
  const Icon = config.icon;
  const qc = useQueryClient();
  const startDate = step.metadata && typeof step.metadata === "object" && "startDate" in step.metadata
    ? String(step.metadata.startDate) : "";

  const saveMutation = useMutation({
    mutationFn: async (date: string) => {
      const res = await fetch(`/api/clients/${clientIdCode}/gantt`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboardingDate: date || null }),
      });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["onboarding", clientIdCode] });
      qc.invalidateQueries({ queryKey: ["client-detail", clientIdCode] });
      toast.success("Starting day saved");
    },
  });

  return (
    <>
      <div className="border-t border-dashed" />
      <div className="flex items-center gap-3">
        <div className={`mt-0.5 ${config.className}`}>
          <Icon className="size-5" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold">{step.label}</h3>
          <p className="text-xs text-muted-foreground">{step.description}</p>
        </div>
        <DatePicker
          value={startDate}
          onChange={(v) => saveMutation.mutate(v)}
          className="h-7"
        />
      </div>
    </>
  );
}

function InitTimelineInline({ clientIdCode }: { clientIdCode: string }) {
  const qc = useQueryClient();
  const { data: ganttData } = useQuery<{ tasks?: unknown[]; initialized?: boolean }>({
    queryKey: ["gantt-check", clientIdCode],
    queryFn: () => fetch(`/api/clients/${clientIdCode}/gantt`).then((r) => r.json()),
    staleTime: 30_000,
  });
  const hasTimeline = ganttData?.tasks && Array.isArray(ganttData.tasks) && ganttData.tasks.length > 0;

  const [templateType, setTemplateType] = useState<"NTA" | "AIA">("NTA");
  const initMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/clients/${clientIdCode}/gantt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateType }),
      });
      if (!res.ok) throw new Error("Failed to initialize timeline");
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["gantt-check", clientIdCode] });
      toast.success(`Timeline initialized — ${data.tasks?.length ?? 0} tasks created`);
    },
    onError: (err) => toast.error(err.message),
  });

  if (hasTimeline) {
    return (
      <>
        <div className="border-t border-dashed" />
        <div className="flex items-center gap-3">
          <div className="mt-0.5 text-[var(--brand-green)]">
            <CheckCircle2 className="size-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold">Timeline Initialized</h3>
            <p className="text-xs text-muted-foreground">{(ganttData?.tasks as unknown[])?.length} tasks in timeline</p>
          </div>
          <Button size="sm" variant="outline" asChild className="gap-1.5 text-muted-foreground">
            <Link href={`/clients/${clientIdCode}/timeline`}>View Timeline</Link>
          </Button>
          <Button size="sm" variant="outline" onClick={() => initMutation.mutate()} disabled={initMutation.isPending} className="gap-1.5 text-muted-foreground">
            {initMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <><Pencil className="size-3" /> Edit</>}
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="border-t border-dashed" />
      <div className="flex items-center gap-3">
        <div className="mt-0.5 text-muted-foreground">
          <Circle className="size-5" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold">Initialize Timeline</h3>
          <p className="text-xs text-muted-foreground">Create Gantt timeline from template</p>
        </div>
        <Select value={templateType} onValueChange={(v) => setTemplateType(v as "NTA" | "AIA")}>
          <SelectTrigger className="h-7 w-20 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="NTA">NTA</SelectItem>
            <SelectItem value="AIA">AIA</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" onClick={() => initMutation.mutate()} disabled={initMutation.isPending} className="gap-1.5">
          {initMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
          Initialize
        </Button>
      </div>
    </>
  );
}

// ── Collapsible Section ───────────────────────────────────────────

// ── NTA: Generate Listings Sheet (step 8.4) ────────────────────────

interface TemplateRequestSummary {
  id: string;
  clientIdCode: string;
  productType: string;
  scope: string;
  levels: string[];
  status: string;
  sheetUrl: string | null;
  createdAt: string;
  createdBy: string | null;
  finalizedAt: string | null;
  finalizedBy: string | null;
}

interface FinalizeResponse {
  ok: boolean;
  written?: number;
  inserted?: Array<{ sku: string; productType: string }>;
  rejected?: unknown[];
  postProcessingWarning?: string | null;
}

function GenerateListingSheetCard({
  step,
  clientIdCode,
  step82Complete,
  teamMembers,
}: {
  step: OnboardingStep;
  clientIdCode: string;
  step82Complete: boolean;
  teamMembers: TeamMember[];
}) {
  const qc = useQueryClient();

  const { data: latestNtaSheet } = useQuery<TemplateRequestSummary | null>({
    queryKey: ["latest-nta-sheet", clientIdCode],
    queryFn: async () => {
      const params = new URLSearchParams({
        clientIdCode,
        scope: "new",
        levelsAny: "Essential",
        limit: "1",
      });
      const res = await fetch(`/api/attributes/template-requests/list?${params}`);
      if (!res.ok) return null;
      const json = (await res.json()) as { requests?: TemplateRequestSummary[] };
      return json.requests?.[0] ?? null;
    },
    enabled: !!clientIdCode,
    refetchInterval: 5000,
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/attributes/template-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientIdCode,
          productType: "all",
          scope: "new",
          levels: ["Required", "Conditionally Required", "Essential"],
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      toast.success("Listings sheet generated");
      qc.invalidateQueries({ queryKey: ["latest-nta-sheet", clientIdCode] });
      qc.invalidateQueries({ queryKey: ["onboarding", clientIdCode] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Failed to generate sheet");
    },
  });

  const finalizeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/attributes/template-requests/${id}/finalize`, {
        method: "PATCH",
      });
      if (!res.ok) throw new Error(await res.text());
      return (await res.json()) as FinalizeResponse;
    },
    onSuccess: (data) => {
      const insertedCount = data.inserted?.length ?? 0;
      const writtenCount = data.written ?? 0;
      toast.success(
        `Imported ${insertedCount} new listing${insertedCount === 1 ? "" : "s"}, updated ${writtenCount} field${writtenCount === 1 ? "" : "s"}`
      );
      if (data.postProcessingWarning) {
        toast.warning(`Sheet protection: ${data.postProcessingWarning}`);
      }
      qc.invalidateQueries({ queryKey: ["latest-nta-sheet", clientIdCode] });
      qc.invalidateQueries({ queryKey: ["onboarding", clientIdCode] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Failed to finalize sheet");
    },
  });

  const stepDone = step.status === "completed";

  return (
    <div className="grid grid-cols-[7fr_3fr] gap-3 items-stretch">
      <div className="rounded-xl border bg-card text-card-foreground p-5 space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">{step.label}</h3>
          <span
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
              stepDone
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                : "bg-stone-200 text-stone-700 dark:bg-muted dark:text-muted-foreground"
            }`}
          >
            {stepDone ? "Completed" : "NTA"}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{step.description}</p>

        {!step82Complete && !latestNtaSheet ? (
          <p className="text-xs text-[var(--brand-yellow)]">
            Complete step 8.2 (import Amazon attributes) first.
          </p>
        ) : latestNtaSheet ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {latestNtaSheet.sheetUrl ? (
                <a
                  href={latestNtaSheet.sheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  Open Sheet <ExternalLink className="size-3" />
                </a>
              ) : (
                <span className="text-sm text-muted-foreground">No sheet URL</span>
              )}
              <Badge variant="secondary" className="capitalize">
                {latestNtaSheet.status.replace(/_/g, " ")}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {latestNtaSheet.sheetUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (latestNtaSheet.sheetUrl) {
                      navigator.clipboard.writeText(latestNtaSheet.sheetUrl);
                      toast.success("Link copied");
                    }
                  }}
                >
                  Copy link
                </Button>
              )}
              <Button
                size="sm"
                onClick={() => finalizeMutation.mutate(latestNtaSheet.id)}
                disabled={
                  latestNtaSheet.status !== "in_progress" || finalizeMutation.isPending
                }
              >
                {finalizeMutation.isPending ? (
                  <>
                    <Loader2 className="size-3 animate-spin" /> Importing…
                  </>
                ) : (
                  "Mark Imported"
                )}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            size="sm"
            onClick={() => generateMutation.mutate()}
            disabled={!step82Complete || generateMutation.isPending}
          >
            {generateMutation.isPending ? (
              <>
                <Loader2 className="size-3 animate-spin" /> Generating…
              </>
            ) : (
              "Generate Listings Sheet"
            )}
          </Button>
        )}
      </div>
      <AsanaPanel clientIdCode={clientIdCode} stepKey={step.key} teamMembers={teamMembers} />
    </div>
  );
}

function CollapsibleGroup({
  parentKey,
  steps,
  clientIdCode,
  clientName,
  onEditClient,
  allSteps,
  teamMembers,
  clientType,
}: {
  parentKey: string;
  steps: OnboardingStep[];
  clientIdCode: string;
  clientName?: string;
  onEditClient: () => void;
  allSteps: OnboardingStep[];
  teamMembers: TeamMember[];
  clientType: "AIA" | "NTA" | null;
}) {
  const requiredSteps = steps.filter((s) => !OPTIONAL_STEP_KEYS.has(s.key));
  const doneCount = requiredSteps.filter((s) => s.status === "completed").length;
  const allDone = doneCount === requiredSteps.length;
  const [open, setOpen] = useState(!allDone);
  const qc = useQueryClient();
  const onImportSuccess = () => {
    qc.invalidateQueries({ queryKey: ["onboarding", clientIdCode] });
  };
  return (
    <div className="flex gap-0 mt-3">
      {/* Left accent bar */}
      <div className={`w-1 shrink-0 rounded-l-lg ${allDone ? "bg-[var(--brand-green)]" : "bg-brand"}`} />
      <div className="flex-1 rounded-r-lg border border-l-0 border-border/50 bg-card/50 p-4 space-y-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {PARENT_LABELS[parentKey] ?? parentKey.replace(/_/g, " ")}
          </span>
          <span className={`text-[10px] font-bold ${allDone ? "text-[var(--brand-green)]" : "text-muted-foreground"}`}>
            {doneCount}/{requiredSteps.length}
          </span>
        </div>
        {(() => {
          const clientUsersKeys = new Set(CLIENT_USERS_STEPS as readonly string[]);
          const hasClientUsersSteps = steps.some((s) => clientUsersKeys.has(s.key));
          const assignTeamStep = steps.find((s) => s.key === "assign_team");

          // Special rendering for assign_team group
          if (assignTeamStep && steps.length === 1) {
            return (
              <div className="grid grid-cols-[7fr_3fr] gap-3 items-stretch">
                <div className="rounded-xl border bg-card text-card-foreground overflow-hidden">
                  <div className="p-5">
                    <AssignTeamInline step={assignTeamStep} clientIdCode={clientIdCode} teamMembers={teamMembers} />
                  </div>
                </div>
                <AsanaPanel clientIdCode={clientIdCode} stepKey="assign_team" teamMembers={teamMembers} />
              </div>
            );
          }

          // Special rendering for client_users group
          if (hasClientUsersSteps) {
            return (
              <div className="grid grid-cols-[7fr_3fr] gap-3 items-stretch">
                <ClientUsersCard clientIdCode={clientIdCode} allSteps={allSteps} />
                <AsanaPanel clientIdCode={clientIdCode} stepKey="add_contact_emails" teamMembers={teamMembers} siblingStepKeys={["hub_add_user", "hub_assign_role", "hub_assign_client"]} />
              </div>
            );
          }

          // Default: render each step as a StepCard
          return (
            <>
              {steps.map((step) => {
                if (step.key === "amazon_import_attributes") {
                  const done = step.status === "completed";
                  return (
                    <div key={step.key} className="grid grid-cols-[7fr_3fr] gap-3 items-stretch">
                      <div className="rounded-xl border bg-card text-card-foreground p-5 space-y-3">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold">{step.label}</h3>
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                              done
                                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                                : "bg-stone-200 text-stone-700 dark:bg-muted dark:text-muted-foreground"
                            }`}
                          >
                            {done ? "Completed" : "AIA"}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">{step.description}</p>
                        <ClrAttributeImport clientIdCode={clientIdCode} onSuccess={onImportSuccess} />
                      </div>
                      <AsanaPanel clientIdCode={clientIdCode} stepKey={step.key} teamMembers={teamMembers} />
                    </div>
                  );
                }
                if (step.key === "amazon_import_catalog") {
                  const done = step.status === "completed";
                  return (
                    <div key={step.key} className="grid grid-cols-[7fr_3fr] gap-3 items-stretch">
                      <div className="rounded-xl border bg-card text-card-foreground p-5 space-y-3">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold">{step.label}</h3>
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                              done
                                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                                : "bg-stone-200 text-stone-700 dark:bg-muted dark:text-muted-foreground"
                            }`}
                          >
                            {done ? "Completed" : "AIA"}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">{step.description}</p>
                        <AlrLinkAndMerge clientIdCode={clientIdCode} onSuccess={onImportSuccess} />
                      </div>
                      <AsanaPanel clientIdCode={clientIdCode} stepKey={step.key} teamMembers={teamMembers} />
                    </div>
                  );
                }
                if (step.key === "generate_listing_sheet") {
                  const step82 = allSteps.find((s) => s.key === "amazon_import_attributes");
                  const step82Complete = step82?.status === "completed";
                  return (
                    <GenerateListingSheetCard
                      key={step.key}
                      step={step}
                      clientIdCode={clientIdCode}
                      step82Complete={step82Complete}
                      teamMembers={teamMembers}
                    />
                  );
                }
                return (
                  <div key={step.key} className="grid grid-cols-[7fr_3fr] gap-3 items-stretch">
                    <StepCard
                      step={step}
                      clientIdCode={clientIdCode}
                      clientName={clientName}
                      onEdit={step.key === "create_client" ? onEditClient : undefined}
                      allSteps={allSteps}
                      teamMembers={teamMembers}
                    />
                    {ASANA_STEP_KEYS.has(step.key) && (
                      <AsanaPanel clientIdCode={clientIdCode} stepKey={step.key} teamMembers={teamMembers} />
                    )}
                  </div>
                );
              })}
            </>
          );
        })()}
      </div>
    </div>
  );
}

// ── Section List ──────────────────────────────────────────────────

function SectionList({
  steps,
  clientIdCode,
  clientName,
  onEditClient,
  allSteps,
  teamMembers,
  clientType,
}: {
  steps: OnboardingStep[];
  clientIdCode: string;
  clientName?: string;
  onEditClient: () => void;
  allSteps: OnboardingStep[];
  teamMembers: TeamMember[];
  clientType: "AIA" | "NTA" | null;
}) {
  // Group steps by parent, ordered by PARENT_GROUP_LABELS
  const groupOrder = Object.entries(PARENT_GROUP_LABELS)
    .sort(([, a], [, b]) => a.order - b.order)
    .map(([key]) => key);

  const groups: { parentKey: string; steps: OnboardingStep[] }[] = [];

  for (const parentKey of groupOrder) {
    const groupSteps = steps.filter((s) => s.parent === parentKey);
    if (groupSteps.length > 0) {
      groups.push({ parentKey, steps: groupSteps });
    }
  }

  return (
    <div className="space-y-1">
      {groups.map((g) => (
        <CollapsibleGroup
          key={g.parentKey}
          parentKey={g.parentKey}
          steps={g.steps}
          clientIdCode={clientIdCode}
          clientName={clientName}
          onEditClient={onEditClient}
          allSteps={allSteps}
          teamMembers={teamMembers}
          clientType={clientType}
        />
      ))}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const { clientIdCode } = useParams<{ clientIdCode: string }>();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editData, setEditData] = useState<ClientEditData | undefined>();

  // Fetch client details for edit dialog pre-fill
  const { data: clientData } = useQuery<{
    client: {
      clientIdCode: string;
      clientName: string;
      clientStatus: string;
      clientType: "AIA" | "NTA" | null;
    };
    rawData?: Record<string, string>;
  }>({
    queryKey: ["client-detail", clientIdCode],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${encodeURIComponent(clientIdCode)}`);
      if (!res.ok) throw new Error("Failed to load client");
      return res.json();
    },
  });

  function handleEditClient() {
    if (clientData?.client) {
      setEditData({
        clientIdCode: clientData.client.clientIdCode,
        clientName: clientData.client.clientName || "",
        clientStatus: clientData.client.clientStatus,
        clientType: clientData.client.clientType ?? null,
        offboardingDate: String(clientData.rawData?.OffboardingDate ?? "").trim(),
      });
    } else {
      setEditData({
        clientIdCode,
        clientName: "",
        clientStatus: "Active",
        clientType: null,
      });
    }
    setEditDialogOpen(true);
  }

  // Fetch team members for assignee picker
  const { data: teamMembers = [] } = useQuery<TeamMember[]>({
    queryKey: ["team-members"],
    queryFn: async () => {
      const res = await fetch("/api/team");
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60_000,
  });

  const { data, isLoading, error } = useQuery<OnboardingResponse>({
    queryKey: ["onboarding", clientIdCode],
    queryFn: async () => {
      const res = await fetch(
        `/api/clients/${encodeURIComponent(clientIdCode)}/onboarding`
      );
      if (!res.ok) throw new Error("Failed to load onboarding status");
      return res.json();
    },
    refetchInterval: 5000, // poll while steps may be running
  });

  const allSteps = data?.steps ?? [];
  // Group steps into sections (by parent). A section is "completed" only when all its sub-steps are.
  const sections = (() => {
    const groups = new Map<string, typeof allSteps>();
    for (const s of allSteps) {
      const key = s.parent ?? s.key;
      const list = groups.get(key);
      if (list) list.push(s);
      else groups.set(key, [s]);
    }
    return Array.from(groups.entries()).map(([key, steps]) => {
      const status: "pending" | "in_progress" | "completed" | "failed" = steps.every(isStepSatisfied)
        ? "completed"
        : steps.some((st) => st.status === "failed")
          ? "failed"
          : steps.some((st) => st.status === "in_progress")
            ? "in_progress"
            : "pending";
      const minOrder = steps.reduce((m, st) => (st.order < m ? st.order : m), steps[0]?.order ?? 0);
      return { key, steps, status, order: minOrder };
    }).sort((a, b) => a.order - b.order);
  })();
  const completedCount = sections.filter((sec) => sec.status === "completed").length;
  const totalCount = sections.length;

  return (
    <div>
      <PageMetaSlot>
        <div className="flex items-center gap-3 -ml-2 lg:-ml-3">
          <Link
            href="/onboarding"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Client Onboarding
          </Link>
          <h1
            className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
            aria-label="Client Onboarding"
          >
            <span className="font-bold text-sidebar-foreground">Client</span>
            <span className="font-normal text-brand">Onboarding</span>
          </h1>
        </div>
        <Link
          href={`/clients/${clientIdCode}`}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <ClientMark compact client={{ clientIdCode, clientName: clientData?.client.clientName || clientIdCode }} />
          {clientIdCode}
        </Link>
      </PageMetaSlot>
      <div className="sticky top-0 z-30 -mx-6 lg:-mx-10 px-6 lg:px-10 py-3 mb-4 bg-background border-b border-sidebar-border/40">
          {/* Progress bar + summary */}
          {totalCount > 0 && (() => {
            const pct = Math.round((completedCount / totalCount) * 100);
            const pendingCount = sections.filter((sec) => sec.status === "pending").length;
            const inProgressCount = sections.filter((sec) => sec.status === "in_progress").length;
            const failedCount = sections.filter((sec) => sec.status === "failed").length;
            const allDone = completedCount === totalCount;
            return (
              <div className="flex items-start gap-6">
                {/* Left: step stats in rows */}
                <div className="flex flex-col gap-1 shrink-0 min-w-[100px]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[10px] text-muted-foreground">Total</span>
                    <span className="text-xs font-bold tabular-nums">{totalCount}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[10px] text-[var(--brand-green)]">Completed</span>
                    <span className="text-xs font-bold tabular-nums text-[var(--brand-green)]">{completedCount}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[10px] text-muted-foreground">Pending</span>
                    <span className="text-xs font-bold tabular-nums text-muted-foreground">{pendingCount + inProgressCount + failedCount}</span>
                  </div>
                </div>

                {/* Right: progress bar with step tick marks */}
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase">Progress</span>
                    <span className={`text-xs font-bold tabular-nums ${allDone ? "text-[var(--brand-green)]" : ""}`}>{pct}%</span>
                  </div>
                  <div className="relative">
                    <div className="h-4 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${allDone ? "bg-[var(--brand-green)]" : "bg-[var(--brand)]"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    {/* Section tick marks (one per parent group) */}
                    <div className="absolute inset-0 flex items-center pointer-events-none">
                      {sections.map((sec, i) => {
                        const pos = ((i + 1) / totalCount) * 100;
                        const done = sec.status === "completed";
                        return (
                          <div
                            key={sec.key}
                            className="absolute top-0 h-full flex items-center"
                            style={{ left: `${pos}%` }}
                          >
                            <div className={`w-px h-full ${done ? "bg-black/50" : "bg-black/20"}`} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-1.5">
                    {inProgressCount > 0 && <span className="text-[10px] text-[var(--brand-yellow)] tabular-nums">{inProgressCount} in progress</span>}
                    {failedCount > 0 && <span className="text-[10px] text-[var(--brand-red)] tabular-nums">{failedCount} failed</span>}
                  </div>
                </div>
              </div>
            );
          })()}
      </div>

      <div className="w-full">
        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="rounded-xl border border-[var(--brand-red)]/20 bg-red-500/5 p-5 text-center">
            <AlertCircle className="size-5 text-[var(--brand-red)] mx-auto mb-2" />
            <p className="text-sm text-[var(--brand-red)]">{error.message}</p>
          </div>
        )}

        {/* Steps */}
        {data && (
          <SectionList
            steps={data.steps.toSorted((a, b) => a.order - b.order)}
            clientIdCode={clientIdCode}
            clientName={clientData?.client.clientName}
            onEditClient={handleEditClient}
            allSteps={data.steps}
            teamMembers={teamMembers}
            clientType={clientData?.client.clientType ?? null}
          />
        )}

        {/* Empty state for when all done */}
        {data && completedCount === totalCount && totalCount > 0 && (
          <div className="mt-6 rounded-xl border bg-emerald-500/5 border-emerald-500/20 p-5 text-center">
            <CheckCircle2 className="size-6 text-[var(--brand-green)] mx-auto mb-2" />
            <p className="text-sm font-medium">All onboarding steps completed</p>
            <p className="text-xs text-muted-foreground mt-1">
              {clientIdCode} is fully set up and ready to go.
            </p>
          </div>
        )}
      </div>

      <NewClientDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        editData={editData}
      />
    </div>
  );
}
