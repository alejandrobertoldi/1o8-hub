/* eslint-disable react-doctor/nextjs-no-img-element */
/* eslint-disable react-doctor/rendering-hydration-mismatch-time */
/* eslint-disable react-doctor/no-derived-useState */
/* eslint-disable react-doctor/nextjs-missing-metadata */
/* eslint-disable react-doctor/rerender-state-only-in-handlers */
/* eslint-disable react-doctor/react-compiler-destructure-method */
/* eslint-disable react-doctor/prefer-useReducer */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable jsx-a11y/label-has-associated-control */
/* eslint-disable react-doctor/design-no-em-dash-in-jsx-text */
/* eslint-disable react-doctor/design-no-bold-heading */
"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createAuthBrowserClient } from "@/lib/auth-browser";

interface ProjectSummary {
  id: string;
  name: string;
  brand_name: string;
  status: string;
  current_phase: string;
  created_at: string;
  s1_approved_at: string | null;
  s2_approved_at: string | null;
  s3_approved_at: string | null;
  s4_approved_at: string | null;
  s5_approved_at: string | null;
  s6_approved_at: string | null;
}

const SECTIONS = [
  { key: "s1", code: "S1", label: "Intake" },
  { key: "s2", code: "S2", label: "Keywords" },
  { key: "s3", code: "S3", label: "Reviews" },
  { key: "s4", code: "S4", label: "Rufus" },
  { key: "s5", code: "S5", label: "COSMO" },
  { key: "s6", code: "S6", label: "SEO Content" },
];

function Logo() {
  return <img src="/logo.png" alt="1o8 Agency" width={48} height={48} className="rounded-lg" />;
}

function SectionDots({ project }: { project: ProjectSummary }) {
  return (
    <div className="flex items-center gap-1.5">
      {SECTIONS.map((s, i) => {
        const approvedKey = `${s.key}_approved_at` as keyof ProjectSummary;
        const isApproved = !!project[approvedKey];
        const isCurrent = project.current_phase === s.code;
        return (
          <div key={s.key} className="flex flex-col items-center gap-0.5">
            <span className={`text-[8px] font-bold leading-none ${
              isApproved ? "text-emerald-500/70" : isCurrent ? "text-amber-500/70" : "text-zinc-700"
            }`}>{s.code}</span>
            <div className={`size-5 rounded flex items-center justify-center text-[8px] font-bold transition-colors ${
              isApproved ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" :
              isCurrent ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" :
              "bg-zinc-800/50 text-zinc-600 border border-zinc-800"
            }`}>
              {isApproved ? "✓" : i + 1}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Context Menu ─────────────────────────────────────────────
function ProjectMenu({
  project,
  onRename,
  onDelete,
  onDuplicate,
  onClose,
}: {
  project: ProjectSummary;
  onRename: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  return (
    <div ref={ref} className="absolute right-0 top-full mt-1 z-20 w-44 rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl py-1">
      <button onClick={onRename} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800 transition-colors">
        <svg className="size-3.5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
        Rename
      </button>
      <button onClick={onDuplicate} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800 transition-colors">
        <svg className="size-3.5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
        Duplicate
      </button>
      <div className="my-1 border-t border-zinc-800" />
      <button onClick={onDelete} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 transition-colors">
        <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
        Delete Project
      </button>
    </div>
  );
}

// ── Rename Modal ─────────────────────────────────────────────
function RenameModal({
  project,
  onSave,
  onClose,
}: {
  project: ProjectSummary;
  onSave: (name: string, brand: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(project.name);
  const [brand, setBrand] = useState(project.brand_name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.select(); }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-bold text-zinc-200 mb-4">Rename Project</h3>
        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-bold text-zinc-500 mb-1 block">Project Name</label>
            <input ref={inputRef} value={name} onChange={e => setName(e.target.value)}
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 focus:border-amber-500 focus:outline-none"
              onKeyDown={e => { if (e.key === "Enter") onSave(name, brand); }} />
          </div>
          <div>
            <label className="text-[10px] font-bold text-zinc-500 mb-1 block">Brand Name</label>
            <input value={brand} onChange={e => setBrand(e.target.value)}
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 focus:border-amber-500 focus:outline-none"
              onKeyDown={e => { if (e.key === "Enter") onSave(name, brand); }} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="rounded-lg border border-zinc-700 px-4 py-2 text-xs text-zinc-400 hover:bg-zinc-800">Cancel</button>
          <button onClick={() => onSave(name, brand)} disabled={!name.trim()} className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-black hover:bg-amber-400 disabled:opacity-50">Save</button>
        </div>
      </div>
    </div>
  );
}

// ── Delete Confirmation ──────────────────────────────────────
function DeleteModal({
  project,
  onConfirm,
  onClose,
}: {
  project: ProjectSummary;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  const needsConfirm = typed.toLowerCase() === "delete";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-red-500/30 bg-zinc-900 p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-bold text-red-400 mb-2">Delete Project</h3>
        <p className="text-xs text-zinc-400 mb-1">
          This will permanently delete <span className="font-bold text-zinc-200">{project.name}</span> and all its data (ASINs, keywords, reviews, Rufus, COSMO).
        </p>
        <p className="text-xs text-zinc-500 mb-4">This action cannot be undone.</p>
        <div>
          <label className="text-[10px] font-bold text-zinc-500 mb-1 block">Type <span className="text-red-400">delete</span> to confirm</label>
          <input value={typed} onChange={e => setTyped(e.target.value)} placeholder="delete"
            className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 focus:border-red-500 focus:outline-none"
            onKeyDown={e => { if (e.key === "Enter" && needsConfirm) onConfirm(); }} />
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="rounded-lg border border-zinc-700 px-4 py-2 text-xs text-zinc-400 hover:bg-zinc-800">Cancel</button>
          <button onClick={onConfirm} disabled={!needsConfirm} className="rounded-lg bg-red-500 px-4 py-2 text-xs font-bold text-white hover:bg-red-400 disabled:opacity-30 disabled:cursor-not-allowed">Delete Permanently</button>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// DASHBOARD
// ═════════════════════════════════════════════════════════════
export default function Dashboard() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newBrand, setNewBrand] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [dbConnected, setDbConnected] = useState<boolean | null>(null);

  // Action states
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<ProjectSummary | null>(null);
  const [deleting, setDeleting] = useState<ProjectSummary | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createAuthBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  useEffect(() => { loadProjects(); }, []);

  async function loadProjects() {
    setLoading(true);
    try {
      const res = await fetch("/api/projects");
      if (res.ok) { setProjects(await res.json()); setDbConnected(true); }
      else setDbConnected(false);
    } catch { setDbConnected(false); }
    setLoading(false);
  }

  async function createProject() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, brand_name: newBrand }),
      });
      if (res.ok) {
        const project = await res.json();
        router.push(`/projects/${project.id}/intake`);
      }
    } catch {}
    setCreating(false);
  }

  async function renameProject(id: string, name: string, brand: string) {
    setActionLoading(true);
    try {
      await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, brand_name: brand }),
      });
      setProjects(prev => prev.map(p => p.id === id ? { ...p, name, brand_name: brand } : p));
    } catch {}
    setRenaming(null);
    setActionLoading(false);
  }

  async function deleteProject(id: string) {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
      if (res.ok) {
        setProjects(prev => prev.filter(p => p.id !== id));
      }
    } catch {}
    setDeleting(null);
    setActionLoading(false);
  }

  async function duplicateProject(project: ProjectSummary) {
    setActionLoading(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `${project.name} (copy)`, brand_name: project.brand_name }),
      });
      if (res.ok) {
        await loadProjects();
      }
    } catch {}
    setMenuOpen(null);
    setActionLoading(false);
  }

  const phaseLabel: Record<string, string> = {
    S1: "Intake", S2: "Keywords", S3: "Reviews", S4: "Rufus",
    S5: "COSMO", S6: "SEO Content",
  };

  const sectionRoute: Record<string, string> = {
    S1: "intake", S2: "keywords", S3: "reviews", S4: "rufus",
    S5: "cosmo", S6: "seo",
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      <div className="mx-auto max-w-5xl px-6 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-4">
            <Logo />
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-zinc-100">1o8 Marketplace SEO Manager</h1>
              <p className="text-xs text-zinc-500 mt-0.5">Amazon Listing Optimization — RUFUS & COSMO System</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[10px] font-bold ${
              dbConnected === true ? "bg-emerald-500/10 text-emerald-400" :
              dbConnected === false ? "bg-red-500/10 text-red-400" : "bg-zinc-800 text-zinc-500"
            }`}>
              <span className={`inline-block size-1.5 rounded-full ${
                dbConnected === true ? "bg-emerald-400" : dbConnected === false ? "bg-red-400" : "bg-zinc-600"
              }`} />
              {dbConnected === true ? "DB Connected" : dbConnected === false ? "DB Offline" : "Checking…"}
            </div>
            <button onClick={() => setShowCreate(true)} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-black hover:bg-amber-400">+ New Project</button>
            <button onClick={handleSignOut} disabled={signingOut} className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors">
              {signingOut ? "Signing out…" : "Sign Out"}
            </button>
          </div>
        </div>

        {/* Create form */}
        {showCreate && (
          <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
            <div className="text-sm font-bold text-zinc-200 mb-3">Create New Project</div>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="text-[10px] font-bold text-zinc-500 mb-1 block">Project Name</label>
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Dr. Cuddles — ReadyRESCUE"
                  className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-300 focus:border-amber-500 focus:outline-none"
                  onKeyDown={e => { if (e.key === "Enter") createProject(); }} />
              </div>
              <div className="flex-1">
                <label className="text-[10px] font-bold text-zinc-500 mb-1 block">Brand Name</label>
                <input value={newBrand} onChange={e => setNewBrand(e.target.value)} placeholder="Dr. Cuddles"
                  className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-300 focus:border-amber-500 focus:outline-none"
                  onKeyDown={e => { if (e.key === "Enter") createProject(); }} />
              </div>
              <button onClick={createProject} disabled={creating || !newName.trim()}
                className="rounded-lg bg-amber-500 px-5 py-2 text-sm font-bold text-black hover:bg-amber-400 disabled:opacity-50">
                {creating ? "Creating…" : "Create"}
              </button>
              <button onClick={() => { setShowCreate(false); setNewName(""); setNewBrand(""); }}
                className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-800">Cancel</button>
            </div>
          </div>
        )}

        {/* Section legend */}
        <div className="flex items-center gap-4 mb-4 text-[10px] text-zinc-600">
          <span>Section status:</span>
          <div className="flex items-center gap-1.5"><div className="size-3 rounded bg-emerald-500/20 border border-emerald-500/30" /><span>Approved</span></div>
          <div className="flex items-center gap-1.5"><div className="size-3 rounded bg-amber-500/20 border border-amber-500/30" /><span>Active</span></div>
          <div className="flex items-center gap-1.5"><div className="size-3 rounded bg-zinc-800/50 border border-zinc-800" /><span>Pending</span></div>
        </div>

        {/* Projects list */}
        {loading ? (
          <div className="text-center py-10 text-zinc-500 text-sm">Loading projects…</div>
        ) : (
          <div className="space-y-2">
            {projects.map(p => (
              <div key={p.id} className="rounded-xl border border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 transition-colors group">
                <div className="flex items-start gap-4 p-5">
                  {/* Clickable area — navigates to project */}
                  <a href={`/projects/${p.id}/${sectionRoute[p.current_phase] || "intake"}`} className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-3">
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-zinc-200 group-hover:text-zinc-100 truncate">{p.name}</div>
                        <div className="text-[10px] text-zinc-500 mt-0.5">{p.brand_name || "No brand"} • Created {new Date(p.created_at).toLocaleDateString()}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[9px] font-bold text-amber-400">
                          {p.current_phase} {phaseLabel[p.current_phase] || ""}
                        </span>
                        <span className={`rounded px-1.5 py-0.5 text-[8px] font-bold ${
                          p.status === "in_progress" ? "bg-amber-500/10 text-amber-400/70" :
                          p.status === "completed" ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-800 text-zinc-500"
                        }`}>{p.status}</span>
                      </div>
                    </div>
                    <SectionDots project={p} />
                  </a>

                  {/* Menu button */}
                  <div className="relative shrink-0">
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(menuOpen === p.id ? null : p.id); }}
                      className="p-1.5 rounded-md text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800 transition-colors"
                    >
                      <svg className="size-4" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                      </svg>
                    </button>
                    {menuOpen === p.id && (
                      <ProjectMenu
                        project={p}
                        onRename={() => { setMenuOpen(null); setRenaming(p); }}
                        onDelete={() => { setMenuOpen(null); setDeleting(p); }}
                        onDuplicate={() => duplicateProject(p)}
                        onClose={() => setMenuOpen(null)}
                      />
                    )}
                  </div>
                </div>
              </div>
            ))}

            {projects.length === 0 && dbConnected && (
              <div className="text-center py-12 text-xs text-zinc-600">
                <p className="mb-2">No projects yet.</p>
                <button onClick={() => setShowCreate(true)} className="text-amber-400 hover:text-amber-300 underline">Create your first project</button>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="mt-12 text-center">
          <p className="text-[10px] text-zinc-700">1o8 Marketplace SEO — RUFUS + COSMO System v2.0</p>
        </div>
      </div>

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
    </div>
  );
}
