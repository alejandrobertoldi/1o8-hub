/* eslint-disable jsx-a11y/no-autofocus */
/* eslint-disable react-doctor/nextjs-no-client-fetch-for-server-data */
/* eslint-disable react-doctor/no-derived-useState */
/* eslint-disable react-doctor/no-fetch-in-effect */
/* eslint-disable react-doctor/react-compiler-destructure-method */
/* eslint-disable react-doctor/prefer-useReducer */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable jsx-a11y/label-has-associated-control */
/* eslint-disable react-doctor/nextjs-missing-metadata */
/* eslint-disable react-doctor/design-no-bold-heading */
/* eslint-disable react-doctor/no-array-index-as-key */
"use client";
/* eslint-disable react-doctor/rendering-hydration-mismatch-time */

import { CoverageRow } from "@/components/seo/target-display";
import type { TrailRow } from "@/lib/seo/phase-trail";
import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { toast } from "sonner";
import { SectionDots } from "@/components/seo/section-dots";
import { AvatarCircle } from "@/components/seo/avatar-circle";
import { BulkActionBar } from "@/components/seo/manager/bulk-action-bar";
import { ProjectStatusPicker } from "@/components/seo/project-status-picker";
import { useOutsideClick } from "@/hooks/use-outside-click";
import { hasAdminPowers } from "@/lib/roles";
import { stageLabel } from "@/lib/seo/revision-rules";

/**
 * Deadline for the lists this page renders from. A starved database connection
 * makes the Vercel function stop responding entirely rather than fail fast, so
 * an un-deadlined fetch here is what produced the "loads forever" report.
 */
const PROJECTS_FETCH_TIMEOUT_MS = 25_000;

// ── Types ─────────────────────────────────────────────────────────────

interface ClientEntry {
  clientIdCode: string;
  clientName: string;
}

interface TeamMember {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

interface ProjectSummary {
  id: string;
  name: string;
  brand_name: string;
  status: string;
  current_phase: string;
  trail?: TrailRow[];
  asins?: Array<{ asin: string; sku: string; parentage_level: string | null; product_id: string | null; title: string | null }>;
  client_id_code: string | null;
  review_stage?: string | null;
  created_by: string;
  assigned_to: string | null;
  assignee_name: string | null;
  assignee_image: string | null;
  created_at: string;
  s1_approved_at: string | null;
  s2_approved_at: string | null;
  s3_approved_at: string | null;
  s4_approved_at: string | null;
  s5_approved_at: string | null;
  s6_approved_at: string | null;
  variation_id: string | null;
  variation_name: string | null;
  variation_code: string | null;
  version: number;
  // Enriched fields
  content_preview: { title: string; bullet1: string; description: string } | null;
  quality_score: {
    overall_score: number;
    scored_at: string;
  } | null;
  export_info: {
    export_count: number;
    last_exported_at: string;
    last_url: string | null;
  } | null;
}

// ── Constants ────────────────────────────────────────────────────────

const sectionRoute: Record<string, string> = {
  S1: "intake", S2: "keywords", S3: "reviews", S4: "rufus", S5: "cosmo", S6: "seo",
};

// ── Project Menu ─────────────────────────────────────────────────────

function ProjectMenu({
  onRename, onDelete, onDuplicate, onChangeClient, onLinkVariation, onClose, showLinkVariation,
}: {
  onRename: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onChangeClient: () => void;
  onLinkVariation: () => void;
  onClose: () => void;
  showLinkVariation: boolean;
}) {
  const ref = useOutsideClick<HTMLDivElement>(onClose);

  const itemClass = "w-full flex items-center gap-2 px-3 py-2 text-xs text-stone-600 hover:bg-stone-50 transition-colors dark:text-zinc-300 dark:hover:bg-zinc-800 focus:bg-stone-50 dark:focus:bg-zinc-800 outline-none";

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const items = (e.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>("[role=menuitem]");
      const current = document.activeElement as HTMLElement;
      const idx = Array.from(items).indexOf(current as HTMLButtonElement);
      const next = e.key === "ArrowDown"
        ? items[(idx + 1) % items.length]
        : items[(idx - 1 + items.length) % items.length];
      next?.focus();
    }
  }

  return (
    <div ref={ref} role="menu" onKeyDown={handleKeyDown} className="absolute right-0 bottom-full mb-1 z-50 w-44 rounded-lg border border-stone-200 bg-white shadow-xl py-1 dark:border-zinc-700 dark:bg-zinc-900">
      <button role="menuitem" onMouseDown={onRename} className={itemClass}>
        <svg className="size-3.5 text-stone-400 dark:text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
        Rename
      </button>
      <button role="menuitem" onMouseDown={onDuplicate} className={itemClass}>
        <svg className="size-3.5 text-stone-400 dark:text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
        New Version
      </button>
      <button role="menuitem" onMouseDown={onChangeClient} className={itemClass}>
        <svg className="size-3.5 text-stone-400 dark:text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
        Change Client
      </button>
      {showLinkVariation && (
        <>
          <div className="my-1 border-t border-stone-200 dark:border-zinc-800" />
          <button role="menuitem" onMouseDown={onLinkVariation} className={itemClass}>
            <svg className="size-3.5 text-stone-400 dark:text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
            Link to Variation
          </button>
        </>
      )}
      <div className="my-1 border-t border-stone-200 dark:border-zinc-800" />
      <button role="menuitem" onMouseDown={onDelete} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50 transition-colors dark:text-red-400 dark:hover:bg-red-500/10 focus:bg-red-50 dark:focus:bg-red-500/10 outline-none">
        <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
        Delete SEO
      </button>
    </div>
  );
}

// ── Rename Modal ─────────────────────────────────────────────────────

function RenameModal({
  project, onSave, onClose,
}: {
  project: ProjectSummary;
  onSave: (name: string, brand: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(project.name);
  const [brand, setBrand] = useState(project.brand_name);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-6 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-bold text-foreground mb-4">Rename Project</h3>
        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-bold text-muted-foreground mb-1 block">Project Name</label>
            <input autoFocus value={name} onChange={e => setName(e.target.value)}
              className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-foreground focus:border-amber-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800"
              onKeyDown={e => { if (e.key === "Enter") onSave(name, brand); }} />
          </div>
          <div>
            <label className="text-[10px] font-bold text-muted-foreground mb-1 block">Brand Name</label>
            <input value={brand} onChange={e => setBrand(e.target.value)}
              className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-foreground focus:border-amber-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800"
              onKeyDown={e => { if (e.key === "Enter") onSave(name, brand); }} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="rounded-lg border border-stone-300 px-4 py-2 text-xs text-muted-foreground hover:bg-stone-50 dark:border-zinc-700 dark:hover:bg-zinc-800">Cancel</button>
          <button onClick={() => onSave(name, brand)} disabled={!name.trim()} className="rounded-lg bg-brand-solid px-4 py-2 text-xs font-bold text-white hover:bg-brand-solid-hover disabled:opacity-50">Save</button>
        </div>
      </div>
    </div>
  );
}

// ── Delete Modal ─────────────────────────────────────────────────────

function DeleteModal({
  project, onConfirm, onClose,
}: {
  project: ProjectSummary;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  const needsConfirm = typed.toLowerCase() === "delete";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-red-300 bg-white p-6 shadow-2xl dark:border-red-500/30 dark:bg-zinc-900" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-bold text-red-600 dark:text-red-400 mb-2">Delete Project</h3>
        <p className="text-xs text-muted-foreground mb-1">
          This will permanently delete <span className="font-bold text-foreground">{project.name}</span> and all its data.
        </p>
        <p className="text-xs text-muted-foreground/70 mb-4">This action cannot be undone.</p>
        <div>
          <label className="text-[10px] font-bold text-muted-foreground mb-1 block">Type <span className="text-red-600 dark:text-red-400">delete</span> to confirm</label>
          <input value={typed} onChange={e => setTyped(e.target.value)} placeholder="delete"
            className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-foreground focus:border-red-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800"
            onKeyDown={e => { if (e.key === "Enter" && needsConfirm) onConfirm(); }} />
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="rounded-lg border border-stone-300 px-4 py-2 text-xs text-muted-foreground hover:bg-stone-50 dark:border-zinc-700 dark:hover:bg-zinc-800">Cancel</button>
          <button onClick={onConfirm} disabled={!needsConfirm} className="rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-500 disabled:opacity-30 disabled:cursor-not-allowed dark:bg-red-500 dark:hover:bg-red-400">Delete Permanently</button>
        </div>
      </div>
    </div>
  );
}

// ── Assignee Select (Create form) ────────────────────────────────────

function AssigneeSelect({
  value, team, onChange,
}: {
  value: string;
  team: TeamMember[];
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClick<HTMLDivElement>(() => setOpen(false));
  const selected = team.find((m) => m.id === value);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)}
        className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-xs text-left text-foreground focus:border-amber-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 flex items-center gap-2">
        {selected ? (
          <>
            <AvatarCircle name={selected.name} image={selected.image} size={18} />
            <span>{selected.name || selected.email}</span>
          </>
        ) : (
          <span className="text-muted-foreground">Select assignee…</span>
        )}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-30 w-full rounded-lg border border-stone-200 bg-white shadow-xl py-1 max-h-48 overflow-y-auto dark:border-zinc-700 dark:bg-zinc-900">
          <button type="button" onClick={() => { onChange(""); setOpen(false); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:bg-stone-50 dark:hover:bg-zinc-800">
            No assignee
          </button>
          {team.map((m) => (
            <button type="button" key={m.id} onClick={() => { onChange(m.id); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-stone-50 dark:hover:bg-zinc-800 ${m.id === value ? "bg-amber-50 dark:bg-amber-500/10" : ""}`}>
              <AvatarCircle name={m.name} image={m.image} size={18} />
              <span className="text-foreground">{m.name || m.email}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Inline Assignee Picker ───────────────────────────────────────────

function InlineAssigneePicker({
  project, team, isOpen, onToggle, onSelect, onClose, isAdmin, currentUserId,
}: {
  project: ProjectSummary;
  team: TeamMember[];
  isOpen: boolean;
  onToggle: (e: React.MouseEvent) => void;
  onSelect: (userId: string) => void;
  onClose: () => void;
  isAdmin: boolean;
  currentUserId?: string;
}) {
  const ref = useOutsideClick<HTMLDivElement>(onClose, isOpen);

  return (
    <div ref={ref} className="relative">
      {project.assigned_to ? (
        <button type="button"
          onClick={(isAdmin || project.assigned_to === currentUserId) ? onToggle : undefined}
          className={`flex items-center gap-1.5 ${(isAdmin || project.assigned_to === currentUserId) ? "cursor-pointer hover:opacity-80" : ""}`}
          title={project.assignee_name || "Assigned"}>
          <AvatarCircle name={project.assignee_name} image={project.assignee_image} size={22} />
          <span className="text-[10px] text-muted-foreground max-w-[80px] truncate hidden sm:inline">
            {project.assignee_name?.split(" ")[0] || "Assigned"}
          </span>
        </button>
      ) : (
        <button type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (isAdmin) { onToggle(e); } else if (currentUserId) { onSelect(currentUserId); } }}
          className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground border border-dashed border-stone-300 dark:border-zinc-700 rounded-full px-2 py-0.5 transition-colors">
          {isAdmin ? "+ Assign" : "+ Claim"}
        </button>
      )}
      {isOpen && (
        <div className="absolute right-0 top-full mt-1 z-30 w-52 rounded-lg border border-stone-200 bg-white shadow-xl py-1 max-h-48 overflow-y-auto dark:border-zinc-700 dark:bg-zinc-900">
          {project.assigned_to && (
            <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSelect(""); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:bg-stone-50 dark:hover:bg-zinc-800">
              Unassign
            </button>
          )}
          {team.map((m) => (
            <button type="button" key={m.id}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSelect(m.id); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-stone-50 dark:hover:bg-zinc-800 ${m.id === project.assigned_to ? "bg-amber-50 dark:bg-amber-500/10" : ""}`}>
              <AvatarCircle name={m.name} image={m.image} size={18} />
              <span className="text-foreground">{m.name || m.email}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Client Picker Modal ──────────────────────────────────────────────

function ClientPickerModal({
  project, clients, onSave, onClose,
}: {
  project: ProjectSummary;
  clients: ClientEntry[];
  onSave: (clientIdCode: string) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState(project.client_id_code || "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl border border-stone-200 bg-white p-6 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-bold text-foreground mb-4">Change Client</h3>
        <select value={selected} onChange={e => setSelected(e.target.value)}
          className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-foreground focus:border-amber-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          <option value="">No client</option>
          {clients.map((c) => (
            <option key={c.clientIdCode} value={c.clientIdCode}>{c.clientName}</option>
          ))}
        </select>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="rounded-lg border border-stone-300 px-4 py-2 text-xs text-muted-foreground hover:bg-stone-50 dark:border-zinc-700 dark:hover:bg-zinc-800">Cancel</button>
          <button onClick={() => onSave(selected)} className="rounded-lg bg-brand-solid px-4 py-2 text-xs font-bold text-white hover:bg-brand-solid-hover">Save</button>
        </div>
      </div>
    </div>
  );
}

// ── Main Content ─────────────────────────────────────────────────────

function SEOManagerContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const clientFilter = searchParams.get("client");
  const { data: session } = useSession();
  const isAdmin = hasAdminPowers(session?.user?.role);

  // Data
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [activeClients, setActiveClients] = useState<ClientEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Create form moved to /seo/new wizard

  // UI state
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [assigneePickerOpen, setAssigneePickerOpen] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<ProjectSummary | null>(null);
  const [deleting, setDeleting] = useState<ProjectSummary | null>(null);
  const [changingClient, setChangingClient] = useState<ProjectSummary | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Bulk mode
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Per-client collapse/expand (default: all collapsed)
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const toggleClient = useCallback((key: string) => {
    setExpandedClients((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Diff modal

  // Lookups
  const clientNameMap = Object.fromEntries(activeClients.map((c) => [c.clientIdCode, c.clientName]));
  const [awaiting, setAwaiting] = useState<Array<{ projectId: string; revisionId: string; unassigned: boolean }>>([]);
  const [onlyMine, setOnlyMine] = useState(false);
  useEffect(() => {
    fetch("/api/seo/revisions?awaiting=me").then((r) => (r.ok ? r.json() : { items: [] })).then((b) => setAwaiting(b.items ?? [])).catch(() => {});
  }, []);
  const awaitingIds = useMemo(() => new Set(awaiting.map((a) => a.projectId)), [awaiting]);
  const clientScoped = clientFilter
    ? projects.filter((p) => p.client_id_code === clientFilter)
    : projects;
  const filteredProjects = onlyMine ? clientScoped.filter((p) => awaitingIds.has(p.id)) : clientScoped;

  // ── Data loading ───────────────────────────────────────────────────

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // The deadline is load-bearing, not defensive. Without it a request that
      // never responds — which is what a starved DB connection produces; the
      // Vercel function returns responseStatusCode 0 until the 60s platform
      // limit — leaves this promise pending, so setLoading(false) never runs and
      // the skeleton below stays up forever. Matches page.tsx's 25s deadline.
      const res = await fetch("/api/seo/projects", {
        signal: AbortSignal.timeout(PROJECTS_FETCH_TIMEOUT_MS),
      });
      // `if (res.ok)` with no else was silently leaving the list empty: a 503
      // never reaches the catch, so the user saw "no projects" for an outage.
      if (!res.ok) throw new Error(`Failed to load projects (HTTP ${res.status})`);
      setProjects(await res.json());
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === "TimeoutError"
          ? "The request timed out. The database may be under load — try again in a moment."
          : err instanceof Error
            ? err.message
            : "Something went wrong.";
      setLoadError(message);
      toast.error(message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadProjects();
    // These two lookups used to swallow any failure into an empty array, which
    // degrades the UI silently rather than visibly: an empty activeClients makes
    // clientNameMap empty, so every project row renders a bare client code and
    // the client filter renders with no options — indistinguishable from "this
    // hub has no clients". Tell the user instead.
    fetch("/api/seo/team", { signal: AbortSignal.timeout(PROJECTS_FETCH_TIMEOUT_MS) })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setTeam)
      .catch(() => toast.error("Couldn't load the team list — assignee names may be missing."));
    fetch("/api/clients?lite=1", { signal: AbortSignal.timeout(PROJECTS_FETCH_TIMEOUT_MS) })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setActiveClients)
      .catch(() =>
        toast.error("Couldn't load the client list — client names and the filter may be incomplete."),
      );
  }, [loadProjects]);

  // ── Project actions ────────────────────────────────────────────────

  async function renameProject(id: string, name: string, brand: string) {
    setActionLoading(true);
    try {
      await fetch(`/api/seo/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, brand_name: brand }),
      });
      setProjects(prev => prev.map(p => p.id === id ? { ...p, name, brand_name: brand } : p));
    } catch {
      toast.error("Failed to rename project");
    }
    setRenaming(null);
    setActionLoading(false);
  }

  async function deleteProject(id: string) {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/seo/projects/${id}`, { method: "DELETE" });
      if (res.ok) {
        setProjects(prev => prev.filter(p => p.id !== id));
      } else {
        const err = await res.json().catch(() => ({ error: "Delete failed" }));
        alert(err.error || "Failed to delete project");
      }
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to delete project");
    }
    setDeleting(null);
    setActionLoading(false);
  }

  async function duplicateProject(project: ProjectSummary) {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/seo/projects/${project.id}/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        await loadProjects();
        router.push(`/seo/${data.id}/intake`);
      }
    } catch {
      toast.error("Failed to duplicate project");
    }
    setMenuOpen(null);
    setActionLoading(false);
  }

  async function updateAssignee(projectId: string, assignedTo: string) {
    try {
      const res = await fetch(`/api/seo/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigned_to: assignedTo || null }),
      });
      if (res.ok) await loadProjects();
    } catch {
      toast.error("Failed to update assignee");
    }
  }

  async function linkToVariation(project: ProjectSummary) {
    setMenuOpen(null);
    toast.promise(
      fetch(`/api/seo/projects/${project.id}/link-variation`, { method: "POST" })
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Failed to link");
          await loadProjects();
          if (data.unmatchedAsins?.length > 0 || data.unassignedAsins?.length > 0) {
            const warns: string[] = [];
            if (data.unmatchedAsins.length > 0) warns.push(`${data.unmatchedAsins.length} ASINs not in catalog`);
            if (data.unassignedAsins.length > 0) warns.push(`${data.unassignedAsins.length} ASINs not in a variation`);
            toast.warning(`Linked with warnings: ${warns.join(", ")}`, { duration: 6000 });
          }
          return data;
        }),
      {
        loading: "Linking to variation…",
        success: (data) => `Linked to ${data.variationCode} (V${data.version})`,
        error: (err) => err instanceof Error ? err.message : "Failed to link to variation",
      }
    );
  }

  async function updateClient(projectId: string, clientIdCode: string) {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/seo/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id_code: clientIdCode || null }),
      });
      if (res.ok) await loadProjects();
    } catch {
      toast.error("Failed to update client");
    }
    setChangingClient(null);
    setActionLoading(false);
  }

  // ── Bulk operations ────────────────────────────────────────────────

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkApprove() {
    const res = await fetch("/api/seo/projects/bulk", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve", projectIds: [...selectedIds] }),
    });
    if (res.ok) {
      setBulkMode(false);
      setSelectedIds(new Set());
      await loadProjects();
    }
  }

  async function bulkExport() {
    const res = await fetch("/api/seo/projects/bulk", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "export", projectIds: [...selectedIds] }),
    });
    if (res.ok) {
      setBulkMode(false);
      setSelectedIds(new Set());
      await loadProjects();
    }
  }

  async function bulkReassign(userId: string) {
    const res = await fetch("/api/seo/projects/bulk", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reassign", projectIds: [...selectedIds], assignTo: userId }),
    });
    if (res.ok) {
      setBulkMode(false);
      setSelectedIds(new Set());
      await loadProjects();
    }
  }

  // ── Keyboard handlers ─────────────────────────────────────────────

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && bulkMode) {
        setBulkMode(false);
        setSelectedIds(new Set());
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [bulkMode]);

  // ── Render ─────────────────────────────────────────────────────────

  const currentUserId = team.find(m => m.email === session?.user?.email)?.id;

  return (
    <div className={bulkMode && selectedIds.size > 0 ? "pb-20" : ""}>
      <PageMetaSlot>
        <h1
          className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
          aria-label="SEO Manager"
        >
          <span className="font-bold text-sidebar-foreground">SEO</span>
          <span className="font-normal text-brand">Manager</span>
        </h1>
        <div className="flex items-center gap-2 ml-4">
          {isAdmin && (
            <Link href="/seo/config"
              className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-500 hover:text-stone-700 hover:bg-stone-50 transition-colors flex items-center gap-1.5 dark:border-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-zinc-800">
              <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Config
            </Link>
          )}
          <button type="button" onClick={() => setOnlyMine((v) => !v)}
            className={`rounded-full border px-3 py-1 text-xs font-bold ${onlyMine ? "border-brand text-brand" : "border-border text-muted-foreground"}`}>
            Needs my review ({awaiting.length})
          </button>
          <button
            onClick={() => {
              setBulkMode(!bulkMode);
              if (bulkMode) setSelectedIds(new Set());
            }}
            className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${
              bulkMode
                ? "border-brand bg-brand/10 text-brand"
                : "border-stone-300 text-muted-foreground hover:bg-stone-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            }`}
          >
            {bulkMode ? "Cancel Select" : "Select"}
          </button>
          <button
            onClick={() => router.push("/seo/new")}
            className="rounded-lg bg-brand-solid px-4 py-1.5 text-xs font-bold text-white hover:bg-brand-solid-hover shadow-[0_0_16px_-4px_var(--brand-glow)]"
          >
            + New Project
          </button>
        </div>
      </PageMetaSlot>

      {/* Client filter banner */}
      {clientFilter && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-amber-300/40 bg-amber-50 px-4 py-2.5 dark:border-amber-500/20 dark:bg-amber-500/5">
          <span className="text-xs text-foreground">
            Showing <span className="font-bold">{filteredProjects.length}</span> project{filteredProjects.length !== 1 ? "s" : ""} for{" "}
            <span className="font-bold">{clientNameMap[clientFilter] || clientFilter}</span>
          </span>
          <Link href="/seo/manager" className="text-[10px] font-bold text-amber-700 hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-300 underline">
            Clear filter
          </Link>
        </div>
      )}

      {/* Section legend */}
      <div className="flex items-center gap-4 mb-4 text-[10px] text-muted-foreground">
        <span>Status:</span>
        <div className="flex items-center gap-1.5"><div className="size-3 rounded bg-emerald-100 border border-emerald-300 dark:bg-emerald-500/20 dark:border-emerald-500/30" /><span>Approved</span></div>
        <div className="flex items-center gap-1.5"><div className="size-3 rounded bg-amber-100 border border-amber-300 dark:bg-amber-500/20 dark:border-amber-500/30" /><span>Active</span></div>
        <div className="flex items-center gap-1.5"><div className="size-3 rounded bg-stone-200 border border-stone-300 dark:bg-zinc-800/50 dark:border-zinc-800" /><span>Pending</span></div>
      </div>

      {/* Projects list -- grouped by client */}
      {loading ? (
        <div className="space-y-6">
          {[1, 2].map((i) => (
            <div key={i} className="space-y-3">
              <div className="h-4 w-48 bg-muted-foreground/10 rounded animate-pulse" />
              <div className="rounded-xl border border-stone-200 dark:border-zinc-800 p-5 space-y-3">
                <div className="flex justify-between">
                  <div className="h-5 w-56 bg-muted-foreground/10 rounded animate-pulse" />
                  <div className="h-5 w-24 bg-muted-foreground/10 rounded animate-pulse" />
                </div>
                <div className="h-4 w-80 bg-muted-foreground/10 rounded animate-pulse" />
                <div className="h-4 w-64 bg-muted-foreground/10 rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : loadError ? (
        <div className="rounded-xl border border-red-300 bg-red-50 p-6 text-center dark:border-red-500/30 dark:bg-red-500/10">
          <p className="text-sm font-medium text-red-600 dark:text-red-400">
            Couldn&apos;t load projects
          </p>
          <p className="mt-1 text-xs text-red-600/80 dark:text-red-400/80">{loadError}</p>
          <button
            type="button"
            onClick={() => loadProjects()}
            className="mt-4 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-100 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/20"
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {(() => {
            const grouped: Record<string, ProjectSummary[]> = {};
            for (const p of filteredProjects) {
              const key = p.client_id_code || "__none__";
              if (!grouped[key]) grouped[key] = [];
              grouped[key].push(p);
            }
            const isInactive = (key: string) => key !== "__none__" && !clientNameMap[key];
            const sortedKeys = Object.keys(grouped).sort((a, b) => {
              if (a === "__none__") return 1;
              if (b === "__none__") return -1;
              const aInactive = isInactive(a);
              const bInactive = isInactive(b);
              if (aInactive && !bInactive) return 1;
              if (!aInactive && bInactive) return -1;
              return (clientNameMap[a] || a).localeCompare(clientNameMap[b] || b);
            });
            let globalIndex = 0;
            return sortedKeys.map((clientKey) => {
              const inactive = isInactive(clientKey);
              const expanded = expandedClients.has(clientKey) || !!clientFilter;
              return (
              <div key={clientKey}>
                <button
                  type="button"
                  onClick={() => toggleClient(clientKey)}
                  className="flex items-center gap-2 mb-2 w-full text-left group/header"
                >
                  <span className={`text-[10px] transition-transform ${expanded ? "rotate-90" : ""} ${inactive ? "text-muted-foreground/50" : "text-brand"}`}>▸</span>
                  <h2 className={`text-xs font-bold uppercase tracking-wider ${inactive ? "text-muted-foreground/60" : "text-brand"}`}>
                    {clientKey === "__none__" ? "No Client" : clientNameMap[clientKey] || clientKey}
                  </h2>
                  <span className="text-[10px] text-muted-foreground">({grouped[clientKey].length})</span>
                  <div className="flex-1 h-px bg-border" />
                </button>
                {expanded && (
                <div className="space-y-2.5">
                  {grouped[clientKey].map((p) => {
                    const index = globalIndex++;
                    const isSelected = selectedIds.has(p.id);
                    return (
                      <div
                        key={p.id}
                        className={`rounded-xl border transition-all group card-glow animate-card-enter ${
                          isSelected
                            ? "border-amber-300/40 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/5"
                            : "border-stone-200 bg-card hover:border-stone-300 hover:shadow-md dark:border-zinc-800 dark:hover:border-zinc-700"
                        }`}
                        style={{ animationDelay: `${index * 50}ms` }}
                      >
                        <div className="flex items-start gap-4 p-5">
                          {/* Bulk checkbox */}
                          {bulkMode && (
                            <button
                              onClick={() => toggleSelect(p.id)}
                              className="mt-1 shrink-0 size-[44px] flex items-center justify-center"
                              aria-label={isSelected ? "Deselect project" : "Select project"}
                            >
                              <div className={`size-5 rounded border-2 transition-colors flex items-center justify-center ${
                                isSelected
                                  ? "border-brand bg-brand"
                                  : "border-stone-300 dark:border-zinc-600"
                              }`}>
                                {isSelected && (
                                  <svg className="size-3 text-brand-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </div>
                            </button>
                          )}

                          <div className="flex-1 min-w-0">
                          <a href={`/seo/${p.id}/${sectionRoute[p.current_phase] || "intake"}`} className="block">
                            {/* TIER 1: Identity */}
                            <div className="flex items-center justify-between mb-3">
                              <div className="min-w-0">
                                <div className="text-sm font-bold text-foreground group-hover:text-amber-800 dark:group-hover:text-zinc-100 truncate flex items-center gap-1.5">{p.name}{p.variation_id && <span className="px-1 py-0.5 rounded text-[9px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/20 shrink-0">V{p.version}</span>}</div>
                                <div className="text-[10px] text-muted-foreground mt-0.5">
                                  {p.brand_name || "No brand"} &middot; Created {new Date(p.created_at).toLocaleDateString("en-US")}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0 ml-3">
                                <InlineAssigneePicker
                                  project={p} team={team}
                                  isOpen={assigneePickerOpen === p.id}
                                  onToggle={(e) => { e.preventDefault(); e.stopPropagation(); setAssigneePickerOpen(assigneePickerOpen === p.id ? null : p.id); }}
                                  onSelect={(userId) => { setAssigneePickerOpen(null); updateAssignee(p.id, userId); }}
                                  onClose={() => setAssigneePickerOpen(null)}
                                  isAdmin={isAdmin}
                                  currentUserId={currentUserId}
                                />
                                <ProjectStatusPicker
                                  projectId={p.id}
                                  status={p.status}
                                  disabled={session?.user?.role === "viewer"}
                                  onUpdated={(status) =>
                                    setProjects((prev) =>
                                      prev.map((row) => (row.id === p.id ? { ...row, status } : row)),
                                    )
                                  }
                                />
                                {p.review_stage && <span className="rounded-md bg-sky-500/10 px-1.5 py-0.5 text-[8px] font-bold text-sky-600 dark:text-sky-400">{stageLabel(p.review_stage)}</span>}
                                {awaiting.find((a) => a.projectId === p.id)?.unassigned && <span className="text-[8px] font-bold text-red-500">unassigned</span>}
                              </div>
                            </div>

                          </a>

                            {/* TIER 2: targeted ASINs (left, own Hub + Amazon links) | phases + team + review stages (right, opens the project) */}
                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:gap-8">
                              <div className="min-w-0 flex-1">
                                {(p.asins ?? []).map((a) => {
                                  const lvl = (a.parentage_level || "").toLowerCase();
                                  const badge = lvl === "parent" ? "Parent" : lvl === "child" ? "Child" : "Standalone";
                                  return <CoverageRow key={`${a.asin}::${a.sku}`} badge={badge} asin={a.asin} productId={a.product_id} from="seo-project" title={a.title} />;
                                })}
                              </div>
                              <a href={`/seo/${p.id}/${sectionRoute[p.current_phase] || "intake"}`} className="flex shrink-0 items-start gap-3 md:border-l md:border-border md:pl-6">
                                <SectionDots project={p} vertical trail={p.trail} />
                                {p.variation_code && (
                                  <span className="rounded-md bg-violet-50 px-1.5 py-0.5 text-[8px] font-bold text-violet-700 dark:bg-violet-500/10 dark:text-violet-400">
                                    {p.variation_code}
                                  </span>
                                )}
                              </a>
                            </div>
                          </div>

                          <div className="relative shrink-0">
                            <button
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(menuOpen === p.id ? null : p.id); }}
                              className="p-1.5 rounded-md text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors dark:text-zinc-600 dark:hover:text-zinc-400 dark:hover:bg-zinc-800"
                            >
                              <svg className="size-4" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                              </svg>
                            </button>
                            {menuOpen === p.id && (
                              <ProjectMenu
                                onRename={() => { setMenuOpen(null); setRenaming(p); }}
                                onDelete={() => { setMenuOpen(null); setDeleting(p); }}
                                onDuplicate={() => duplicateProject(p)}
                                onChangeClient={() => { setMenuOpen(null); setChangingClient(p); }}
                                onLinkVariation={() => linkToVariation(p)}
                                showLinkVariation={!p.variation_id}
                                onClose={() => setMenuOpen(null)}
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                )}
              </div>
              );
            });
          })()}

          {filteredProjects.length === 0 && (
            <div className="text-center py-12 text-xs text-muted-foreground">
              {onlyMine ? (
                <p>Nothing is waiting for your review.</p>
              ) : clientFilter ? (
                <p>No SEO projects found for this client.</p>
              ) : (
                <>
                  <p className="mb-2">No SEO projects yet.</p>
                  <button onClick={() => router.push("/seo/new")} className="text-amber-700 hover:text-amber-600 underline dark:text-amber-400 dark:hover:text-amber-300">Create your first project</button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Bulk Action Bar */}
      {bulkMode && (
        <BulkActionBar
          selectedCount={selectedIds.size}
          onApprove={bulkApprove}
          onExport={bulkExport}
          onReassign={bulkReassign}
          onClear={() => { setBulkMode(false); setSelectedIds(new Set()); }}
          team={team}
        />
      )}

      {/* Loading overlay */}
      {actionLoading && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 dark:bg-black/40">
          <div className="text-sm text-foreground bg-card rounded-lg px-4 py-3 shadow-lg border border-border/60">Processing…</div>
        </div>
      )}

      {/* Modals */}
      {renaming && (
        <RenameModal
          project={renaming}
          onSave={(name, brand) => renameProject(renaming.id, name, brand)}
          onClose={() => setRenaming(null)}
        />
      )}
      {deleting && (
        <DeleteModal
          project={deleting}
          onConfirm={() => deleteProject(deleting.id)}
          onClose={() => setDeleting(null)}
        />
      )}
      {changingClient && (
        <ClientPickerModal
          project={changingClient}
          clients={activeClients}
          onSave={(clientIdCode) => updateClient(changingClient.id, clientIdCode)}
          onClose={() => setChangingClient(null)}
        />
      )}
    </div>
  );
}

export default function SEOManagerPage() {
  return (
    <Suspense fallback={<div className="text-center py-10 text-muted-foreground text-sm">Loading…</div>}>
      <SEOManagerContent />
    </Suspense>
  );
}
