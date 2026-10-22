"use client";
/* eslint-disable react-doctor/no-mirror-prop-effect */
/* eslint-disable react-doctor/no-derived-state-effect */
/* eslint-disable react-doctor/no-derived-useState */
/* eslint-disable react-doctor/react-compiler-destructure-method */
/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable react-doctor/design-no-bold-heading */
/* eslint-disable react-doctor/no-array-index-as-key */

import { hasAdminPowers } from "@/lib/roles";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Loader2, Check, Package, Search, ChevronDown, ChevronRight, CalendarDays } from "lucide-react";

import { Button } from "@/components/ui/button";
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
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ALL_STATUSES,
  STATUS_CHIP_STYLES,
  STATUS_CHIP_EMPTY,
  TEAM_ROLES,
} from "@/lib/constants";
import { EditableCell } from "./editable-cell";
import { ClientAsanaSummary } from "./client-asana-summary";
import { ClientHoursSummary } from "./client-hours-summary";
import { ContractSection, LinksSection, SowBadge } from "./client-contract";
import { ClientCompetitors } from "./client-competitors";
import { sowStatus } from "@/lib/clients/sow";

// ── Types ──────────────────────────────────────────────────────────────

type ClientDetailResponse = {
  client: {
    id: number;
    clientIdCode: string;
    clientStatus: string | null;
    clientName: string | null;
    clientType: "AIA" | "NTA" | null;
    updatedAt: string | null;
  };
  rawData: Record<string, string>;
  productStats: {
    count: number;
    activeCount: number;
    statusBreakdown: Record<string, number>;
  };
};

type SectionProps = {
  rawData: Record<string, string>;
  readOnly: boolean;
  onSave: (field: string, value: string) => Promise<void>;
};

// ── Section helpers ────────────────────────────────────────────────────

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card text-card-foreground">
      <div className="px-5 py-3 border-b border-border/50">
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

function KeyValueRow({
  label,
  rawKey,
  value,
  readOnly,
  onSave,
  type = "text",
}: {
  label: string;
  rawKey: string;
  value: string;
  readOnly: boolean;
  onSave: (field: string, value: string) => Promise<void>;
  type?: "text" | "url" | "email";
}) {
  return (
    <div className="grid grid-cols-[180px_1fr] gap-2 py-1.5 text-sm border-b border-border/30 last:border-0">
      <span className="text-muted-foreground truncate">{label}</span>
      <EditableCell
        field={rawKey}
        value={value}
        readOnly={readOnly}
        onSave={onSave}
        type={type}
      />
    </div>
  );
}

function Badge({
  children,
  className,
}: {
  children: React.ReactNode;
  className: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${className}`}
    >
      {children}
    </span>
  );
}

// ── Client Status Select ───────────────────────────────────────────────

function ClientStatusSelect({
  value,
  offboardingDate,
  onSave,
}: {
  value: string;
  offboardingDate: string;
  onSave: (value: string, extras?: { offboardingDate?: string }) => Promise<void>;
}) {
  const [localValue, setLocalValue] = useState(value);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [pending, setPending] = useState<string | null>(null);
  const [pendingOffboarding, setPendingOffboarding] = useState("");

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  function handleChange(next: string) {
    if (next === localValue) return;
    const needsConfirm = next === "Inactive" || (next === "Active" && localValue === "Inactive");
    if (needsConfirm) {
      setPendingOffboarding(offboardingDate);
      setPending(next);
    } else {
      void commit(next);
    }
  }

  async function commit(next: string, extras?: { offboardingDate?: string }) {
    setLocalValue(next);
    setSaveState("saving");
    try {
      await onSave(next, extras);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1500);
    } catch {
      setLocalValue(value);
      setSaveState("idle");
    }
  }

  const statusLower = localValue.toLowerCase();
  const isActive = statusLower === "active";
  const isProspect = statusLower === "prospect";

  const confirmTitle = pending === "Inactive"
    ? "Disable this client?"
    : "Re-activate this client?";
  const confirmDescription = pending === "Inactive"
    ? "This will mark the client as Inactive and move their Drive folder to Inactive Clients."
    : "This will mark the client as Active and move their Drive folder back to the 1o8 Hub shared drive.";

  return (
    <>
      <div className="flex items-center gap-1.5">
        <Select value={localValue} onValueChange={handleChange}>
          <SelectTrigger
            className={`h-7 w-[110px] text-xs font-semibold border ${
              isActive
                ? "text-emerald-500 border-emerald-500/30"
                : isProspect
                  ? "text-brand border-brand/30"
                  : "text-red-500 border-red-500/30"
            }`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Active">
              <span className="text-emerald-500 font-medium">Active</span>
            </SelectItem>
            <SelectItem value="Prospect">
              <span className="text-brand font-medium">Prospect</span>
            </SelectItem>
            <SelectItem value="Inactive">
              <span className="text-red-500 font-medium">Inactive</span>
            </SelectItem>
          </SelectContent>
        </Select>
        {saveState === "saving" && (
          <Loader2 className="size-3 animate-spin text-muted-foreground" />
        )}
        {saveState === "saved" && (
          <Check className="size-3 text-emerald-500" />
        )}
      </div>

      <AlertDialog open={pending !== null} onOpenChange={(open) => { if (!open) setPending(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{confirmDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          {pending === "Inactive" && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wide text-foreground">
                Offboarding date <span className="text-destructive">*</span>
              </label>
              <DatePicker
                value={pendingOffboarding}
                onChange={setPendingOffboarding}
                placeholder="Select a date"
                className={`h-8 w-full max-w-[180px] text-sm ${
                  pendingOffboarding
                    ? ""
                    : "border-amber-500/60 text-amber-500 hover:border-amber-500"
                }`}
              />
              {!pendingOffboarding.trim() && (
                <p className="text-[10px] text-amber-500 font-medium">
                  Required to mark this client Inactive
                </p>
              )}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPending(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending === "Inactive" && !pendingOffboarding.trim()}
              onClick={(e) => {
                if (pending === "Inactive" && !pendingOffboarding.trim()) {
                  e.preventDefault();
                  return;
                }
                const next = pending!;
                const extras =
                  next === "Inactive" ? { offboardingDate: pendingOffboarding.trim() } : undefined;
                setPending(null);
                void commit(next, extras);
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Date field ─────────────────────────────────────────────────────────

function DateField({
  label,
  rawKey,
  value,
  readOnly,
  disabled,
  warn,
  disabledHint,
  onSave,
}: {
  label: string;
  rawKey: string;
  value: string;
  readOnly: boolean;
  disabled?: boolean;
  warn?: boolean;
  disabledHint?: string;
  onSave: (field: string, value: string) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleChange = async (newVal: string) => {
    setSaving(true);
    try {
      await onSave(rawKey, newVal);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const display = value
    ? new Date(value + "T12:00:00").toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric",
      })
    : "";

  return (
    <div className="text-sm flex items-center gap-2">
      <span className={`w-24 shrink-0 ${warn ? "text-amber-500" : "text-muted-foreground"}`}>{label}:</span>
      <div className="flex items-center gap-1.5">
        {readOnly ? (
          <span>{display || "—"}</span>
        ) : (
          <div className="relative group/date">
            <DatePicker
              value={value || ""}
              onChange={handleChange}
              disabled={disabled}
              className={`h-7 text-sm rounded-lg ${
                disabled
                  ? "border border-border/30 text-muted-foreground/40 opacity-50"
                  : warn
                    ? "border border-amber-500/60 hover:border-amber-500 focus:border-amber-500 text-amber-500"
                    : `border border-border/50`
              }`}
            />
            {disabled && disabledHint && (
              <span className="absolute left-0 -bottom-5 hidden group-hover/date:block text-[10px] text-muted-foreground/60 whitespace-nowrap pointer-events-none">
                {disabledHint}
              </span>
            )}
          </div>
        )}
        {saving && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
        {saved && <Check className="size-3 text-emerald-500" />}
        {warn && !saving && !saved && (
          <span className="text-[10px] text-amber-500 font-medium">Required</span>
        )}
      </div>
    </div>
  );
}

// ── Team section ───────────────────────────────────────────────────────

function splitTeamLabel(label: string): { position: string; company: string } {
  const match = label.match(/^(.*)\s\(([^)]+)\)$/);
  return match ? { position: match[1], company: match[2] } : { position: label, company: "" };
}

function TeamRoleLabel({ label }: { label: string }) {
  const { position, company } = splitTeamLabel(label);
  return (
    <span className="text-muted-foreground flex flex-col leading-tight">
      <span className="truncate">{position}</span>
      {company && <span className="truncate text-xs text-muted-foreground/60">{company}</span>}
    </span>
  );
}

function TeamMemberSelect({
  label,
  rawKey,
  value,
  readOnly,
  onSave,
  teamMembers,
}: {
  label: string;
  rawKey: string;
  value: string;
  readOnly: boolean;
  onSave: (field: string, value: string) => Promise<void>;
  teamMembers: { id: string; name: string | null; email: string | null; role: string | null }[];
}) {
  if (readOnly) {
    return (
      <div className="grid grid-cols-[180px_1fr] gap-2 py-1.5 text-sm border-b border-border/30 last:border-0">
        <TeamRoleLabel label={label} />
        <span>{value || "—"}</span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[180px_1fr] items-center gap-2 py-1.5 text-sm border-b border-border/30 last:border-0">
      <TeamRoleLabel label={label} />
      <Select value={value || "__none__"} onValueChange={(v) => onSave(rawKey, v === "__none__" ? "" : v)}>
        <SelectTrigger className="h-7 text-sm border-border/40 px-2 w-auto min-w-[140px]">
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">
            <span className="text-muted-foreground">None</span>
          </SelectItem>
          {teamMembers.toSorted((a, b) => (a.name ?? a.email ?? "").localeCompare(b.name ?? b.email ?? "")).map((m) => (
            <SelectItem key={m.id} value={m.name ?? m.email ?? m.id}>
              {m.name ?? m.email}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function TeamSection({
  title,
  keys,
  rawData,
  readOnly,
  onSave,
}: {
  title: string;
  keys: string[];
} & SectionProps) {
  const { data: allUsers } = useQuery<{ id: string; name: string | null; email: string | null; role: string | null; clientIdCode: string | null }[]>({
    queryKey: ["team-members"],
    queryFn: () => fetch("/api/team").then((r) => r.json()),
    staleTime: 10 * 60 * 1000,
  });

  const teamMembers = useMemo(
    () => (allUsers ?? []).filter((u) => hasAdminPowers(u.role) || u.role === "editor"),
    [allUsers]
  );

  const rows = keys.map((key) => ({
    key,
    label: TEAM_ROLES[key] ?? key.replace(/_/g, " "),
    name: String(rawData[key] ?? "").trim() ?? "",
  }));

  const visible = readOnly ? rows.filter((r) => r.name) : rows;
  if (visible.length === 0) return null;

  return (
    <SectionCard title={title}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
        {visible.map((r) => (
          <TeamMemberSelect
            key={r.key}
            label={r.label}
            rawKey={r.key}
            value={r.name}
            readOnly={readOnly}
            onSave={onSave}
            teamMembers={teamMembers ?? []}
          />
        ))}
      </div>
    </SectionCard>
  );
}

// ── Client Contacts ────────────────────────────────────────────────────

function ContactsSection({ rawData, readOnly, onSave }: SectionProps) {
  const slots: { nameKey: string; emailKey: string; label: string; forceReadOnly?: boolean }[] = [];
  for (let i = 1; i <= 5; i++) {
    slots.push({
      nameKey: `ClientContactName${i}`,
      emailKey: `ClientContactEmail${i}`,
      label: `Contact ${i}`,
      forceReadOnly: true,
    });
  }
  slots.push({
    nameKey: "AmazonContactName",
    emailKey: "AmazonContactEmail",
    label: "Amazon Contact",
    forceReadOnly: false,
  });

  const visible = readOnly
    ? slots.filter(
        (s) => String(rawData[s.nameKey] ?? "").trim() || String(rawData[s.emailKey] ?? "").trim()
      )
    : slots;

  if (visible.length === 0) return null;

  return (
    <SectionCard title="Client Contacts">
      <div className="space-y-0">
        {visible.map((s) => (
          <div
            key={s.label}
            className="grid grid-cols-[140px_1fr_1fr] gap-2 py-1.5 text-sm border-b border-border/30 last:border-0"
          >
            <span className="text-muted-foreground">{s.label}</span>
            <EditableCell
              field={s.nameKey}
              value={String(rawData[s.nameKey] ?? "").trim() ?? ""}
              readOnly={s.forceReadOnly ?? readOnly}
              onSave={onSave}
              type="text"
            />
            <EditableCell
              field={s.emailKey}
              value={String(rawData[s.emailKey] ?? "").trim() ?? ""}
              readOnly={s.forceReadOnly ?? readOnly}
              onSave={onSave}
              type="email"
            />
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

// ── Financial ──────────────────────────────────────────────────────────

function FinancialSection({ rawData, readOnly, onSave }: SectionProps) {
  // Tier / retainer moved to Contract & services.
  const finFields = [{ key: "Commission", label: "Commission" }];
  const billingKeys = [1, 2, 3, 4].map((i) => ({
    nameKey: `BillingName${i}`,
    emailKey: `Billingemail${i}`,
    label: `Billing ${i}`,
  }));
  const allFields = [...finFields, ...billingKeys];

  const visible = readOnly
    ? allFields.filter(
        (f) =>
          "nameKey" in f
            ? String(rawData[f.nameKey] ?? "").trim() || String(rawData[f.emailKey] ?? "").trim()
            : String(rawData[f.key] ?? "").trim()
      )
    : allFields;

  if (visible.length === 0) return null;

  return (
    <SectionCard title="Financial">
      <div className="space-y-0">
        {visible.map((f) =>
          "nameKey" in f ? (
            <div
              key={f.label}
              className="grid grid-cols-[140px_1fr_1fr] gap-2 py-1.5 text-sm border-b border-border/30 last:border-0"
            >
              <span className="text-muted-foreground">{f.label}</span>
              <EditableCell
                field={f.nameKey}
                value={String(rawData[f.nameKey] ?? "").trim() ?? ""}
                readOnly={readOnly}
                onSave={onSave}
                type="text"
              />
              <EditableCell
                field={f.emailKey}
                value={String(rawData[f.emailKey] ?? "").trim() ?? ""}
                readOnly={readOnly}
                onSave={onSave}
                type="email"
              />
            </div>
          ) : (
            <KeyValueRow
              key={f.key}
              label={f.label}
              rawKey={f.key}
              value={String(rawData[f.key] ?? "").trim() ?? ""}
              readOnly={readOnly}
              onSave={onSave}
              type={f.key.startsWith("Billing") ? "email" : "text"}
            />
          )
        )}
      </div>
    </SectionCard>
  );
}

// ── Main component ─────────────────────────────────────────────────────

export function ClientDetail({ clientIdCode }: { clientIdCode: string }) {
  const router = useRouter();
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const readOnly = role === "viewer" || !role;

  const { data, isLoading, error } = useQuery<ClientDetailResponse>({
    queryKey: ["client-detail", clientIdCode],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${clientIdCode}`);
      if (!res.ok) throw new Error("Failed to fetch client");
      return res.json();
    },
  });

  const mutation = useMutation({
    mutationFn: async ({
      field,
      value,
      extra,
    }: {
      field: string;
      value: string;
      extra?: { offboardingDate?: string };
    }) => {
      const res = await fetch(`/api/clients/${clientIdCode}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field, value, ...extra }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        let msg = "Save failed";
        try {
          const data = JSON.parse(text) as { error?: string };
          if (data?.error) msg = data.error;
        } catch {
          /* keep default */
        }
        throw new Error(msg);
      }
    },
    onSuccess: (_data, variables) => {
      // Optimistic update in the query cache
      queryClient.setQueryData<ClientDetailResponse>(
        ["client-detail", clientIdCode],
        (old) => {
          if (!old) return old;
          const newRawData = { ...old.rawData, [variables.field]: variables.value };
          if (variables.extra?.offboardingDate !== undefined) {
            newRawData.OffboardingDate = variables.extra.offboardingDate;
          }
          const newClient = { ...old.client };
          if (variables.field === "ClientName") newClient.clientName = variables.value;
          if (variables.field === "ClientStatus") newClient.clientStatus = variables.value;
          return { ...old, rawData: newRawData, client: newClient };
        }
      );
      // Refresh clients list & sidebar when status or name changes
      if (variables.field === "ClientStatus" || variables.field === "ClientName") {
        queryClient.invalidateQueries({ queryKey: ["clients"] });
      }
      // Sync onboarding date change to onboarding page
      if (variables.field === "OnboardingDate") {
        queryClient.invalidateQueries({ queryKey: ["onboarding", clientIdCode] });
      }
      // Sync contact changes to onboarding page
      if (variables.field.startsWith("ClientContact")) {
        queryClient.invalidateQueries({ queryKey: ["onboarding", clientIdCode] });
      }
      // Sync Intentwise edits to onboarding "Get ID" cards (auto-completion + prefill)
      if (
        variables.field === "IntentwiseID" ||
        variables.field === "IntentwiseName" ||
        variables.field === "IntentwiseIDAMC" ||
        variables.field === "IntentwiseNameAMC"
      ) {
        queryClient.invalidateQueries({ queryKey: ["onboarding", clientIdCode] });
      }
    },
  });

  const handleSave = useCallback(
    async (field: string, value: string) => {
      await mutation.mutateAsync({ field, value });
    },
    [mutation]
  );

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="h-40 bg-muted/50 rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 bg-muted/50 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <p className="text-destructive">Failed to load client data.</p>
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => router.back()}>
          <ArrowLeft className="size-4 mr-1" /> Go Back
        </Button>
      </div>
    );
  }

  const { client, rawData, productStats } = data;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const statusLower = client.clientStatus?.toLowerCase();
  const isActive = statusLower === "active";
  const isProspect = statusLower === "prospect";

  // The nine account-team roles of the 1o8 AAC sheet (see TEAM_ROLES).
  const teamMFKeys = Object.keys(TEAM_ROLES);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground hover:text-foreground -ml-2"
        onClick={() => router.push("/")}
      >
        <ArrowLeft className="size-4 mr-1" /> Clients
      </Button>

      {/* Header */}
      <div className="rounded-xl border bg-card text-card-foreground p-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              {readOnly ? (
                <h1 className="text-2xl font-bold text-brand">
                  {client.clientName || clientIdCode}
                </h1>
              ) : (
                <EditableCell
                  field="ClientName"
                  value={client.clientName ?? ""}
                  readOnly={false}
                  onSave={handleSave}
                  className="text-2xl font-bold text-brand"
                />
              )}
              {readOnly ? (
                <Badge
                  className={
                    isActive
                      ? "bg-emerald-600/15 text-emerald-500 border border-emerald-500/30"
                      : isProspect
                        ? "bg-brand/15 text-brand border border-brand/30"
                        : "bg-red-600/15 text-red-500 border border-red-500/30"
                  }
                >
                  {client.clientStatus || "Unknown"}
                </Badge>
              ) : (
                <ClientStatusSelect
                  value={client.clientStatus ?? "Active"}
                  offboardingDate={String(rawData["OffboardingDate"] ?? "").trim()}
                  onSave={(v, extras) =>
                    mutation.mutateAsync({
                      field: "ClientStatus",
                      value: v,
                      extra: extras,
                    })
                  }
                />
              )}
              {client.clientType && (
                <Badge
                  className={
                    client.clientType === "AIA"
                      ? "bg-brand/15 text-brand border border-brand/30"
                      : "bg-[var(--brand-nta)]/15 text-[var(--brand-nta)] border border-[var(--brand-nta)]/30"
                  }
                >
                  {client.clientType}
                </Badge>
              )}
              <SowBadge status={sowStatus(rawData, today)} />
            </div>
            <div className="text-sm flex items-center gap-2">
              <span className="text-muted-foreground w-24 shrink-0">Client ID:</span>
              <span className="font-mono text-foreground">{client.clientIdCode}</span>
            </div>
            <DateField
              label="Onboarding"
              rawKey="OnboardingDate"
              value={String(rawData["OnboardingDate"] ?? "").trim() ?? ""}
              readOnly={readOnly}
              onSave={handleSave}
            />
            {(String(rawData["OffboardingDate"] ?? "").trim() || !readOnly) && (
              <DateField
                label="Offboarding"
                rawKey="OffboardingDate"
                value={String(rawData["OffboardingDate"] ?? "").trim() ?? ""}
                readOnly={readOnly}
                disabled={isActive}
                warn={!isActive && !isProspect && !String(rawData["OffboardingDate"] ?? "").trim()}
                disabledHint="Set status to Inactive to enable"
                onSave={handleSave}
              />
            )}
            {/* Brand URL */}
            {(String(rawData["BrandURL"] ?? "").trim() || !readOnly) && (
              <div className="text-sm flex items-center gap-1">
                <span className="text-muted-foreground">Brand URL:</span>
                <EditableCell
                  field="BrandURL"
                  value={String(rawData["BrandURL"] ?? "").trim() ?? ""}
                  readOnly={readOnly}
                  onSave={handleSave}
                  type="url"
                />
              </div>
            )}
          </div>

          {/* Asana workload (replaces MF's Amazon product stats) */}
          <div className="shrink-0 space-y-3">
            <ClientAsanaSummary clientIdCode={client.clientIdCode} />
            <ClientHoursSummary clientIdCode={client.clientIdCode} />
            <div className="flex items-center gap-3 mt-1">
              {!readOnly && (
                <>
                  <Link
                    href={`/clients/${client.clientIdCode}/onboarding`}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Onboarding
                  </Link>
                  <Link
                    href={`/clients/${client.clientIdCode}/timeline`}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <CalendarDays className="size-3.5" />
                    Timeline
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Sections */}
      <ContractSection rawData={rawData} readOnly={readOnly} onSave={handleSave} />
      <TeamSection title="Team (1o8 Agency)" keys={teamMFKeys} rawData={rawData} readOnly={readOnly} onSave={handleSave} />
      <ContactsSection rawData={rawData} readOnly={readOnly} onSave={handleSave} />
      <FinancialSection rawData={rawData} readOnly={readOnly} onSave={handleSave} />
      <LinksSection rawData={rawData} readOnly={readOnly} onSave={handleSave} />
      <ClientCompetitors clientIdCode={client.clientIdCode} />
    </div>
  );
}
