"use client";

// S0 Project Setup — what the New SEO Project wizard chose (client, target
// ASINs, content rules, name & assignee), shown read-only with a per-section
// "Unlock for Editing". Edit rules:
//   S0.1 Client        never (a different client is a new project)
//   S0.2 Target ASINs  only while S1 isn't approved (S1+ is built on them)
//   S0.3 Content Rules until S6 is approved (they only shape S6 writing)
//   S0.4 Name/Assignee always
// Every save is confirmed first — it writes to the production database.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Lock, LockOpen } from "lucide-react";
import { toast } from "sonner";
import { ClientMark, CoverageRow } from "@/components/seo/target-display";
import { TargetPicker, type CatalogChild, type CatalogFamily, type TargetScope } from "@/components/seo/target-picker";
import { saveProjectState, useSectionHeader } from "@/components/seo/project-shell";
import {
  CONTENT_SECTIONS,
  DIMENSION_COLORS,
  DIMENSION_LABELS,
  type ContentRule,
} from "@/lib/seo/content-sections";

type SectionKey = "client" | "targets" | "rules" | "details";
const STEPS: { key: SectionKey; label: string }[] = [
  { key: "client", label: "S0.1 Client" },
  { key: "targets", label: "S0.2 Target ASINs" },
  { key: "rules", label: "S0.3 Content Rules" },
  { key: "details", label: "S0.4 Name & Assignee" },
];

interface ProjectInfo {
  name: string;
  client_id_code: string | null;
  client_name: string | null;
  brand_name: string;
  assigned_to: string | null;
  content_rules: Record<string, ContentRule> | null;
  s1_approved_at: string | null;
  s6_approved_at: string | null;
}
interface SavedAsin {
  asin: string;
  sku: string;
  parentage_level: string | null;
  flavor: string | null;
  size: string | null;
  color: string | null;
  style: string | null;
}
interface Meta { productId: string; summarizedTitle: string | null }
interface TeamMember { id: string; name: string | null; email: string }

const btn =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-4 text-[13px] font-medium leading-none transition-colors active:scale-[0.97] disabled:opacity-50";
const btnPrimary = `${btn} bg-brand text-white hover:bg-brand-hover`;
const btnSecondary = `${btn} border border-stone-300 text-muted-foreground hover:bg-stone-50 dark:border-zinc-700 dark:hover:bg-zinc-800`;

function SectionCard({
  id, title, locked, lockNote, editing, onUnlock, children,
}: {
  id: string;
  title: string;
  locked: boolean;
  lockNote?: string;
  editing: boolean;
  onUnlock?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div id={id} className="scroll-mt-20 rounded-[18px] border border-border bg-card/80 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="text-xs uppercase text-muted-foreground">{title}</h3>
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${
            editing ? "border-brand/30 bg-brand/10 text-brand" : "border-border text-muted-foreground"
          }`}
        >
          {editing ? <LockOpen className="size-3" /> : <Lock className="size-3" />}
          {editing ? "Editing" : "Locked"}
        </span>
        {!editing && lockNote && <span className="text-[11px] text-muted-foreground">{lockNote}</span>}
        {!editing && !locked && onUnlock && (
          <button type="button" onClick={onUnlock} className={`${btnSecondary} ml-auto`}>
            Unlock for Editing
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

export default function SetupPhase() {
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [asins, setAsins] = useState<SavedAsin[]>([]);
  const [meta, setMeta] = useState<Record<string, Meta>>({});
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [editing, setEditing] = useState<SectionKey | null>(null);
  const [saving, setSaving] = useState(false);
  const [current, setCurrent] = useState<SectionKey>("client");

  const load = useCallback(async () => {
    const [p, a, m] = await Promise.all([
      fetch(`/api/seo/projects/${projectId}`).then((r) => r.json()),
      fetch(`/api/seo/projects/${projectId}/load?phase=s1_intake`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/seo/projects/${projectId}/listing-meta`).then((r) => (r.ok ? r.json() : null)),
    ]);
    if (p && !p.error) setProject(p);
    setAsins((a?.asins || []).filter((x: SavedAsin) => x.asin));
    setMeta(m?.meta || {});
  }, [projectId]);

  useEffect(() => {
    load().catch(() => toast.error("Couldn't load the project setup."));
    fetch("/api/seo/team").then((r) => (r.ok ? r.json() : [])).then(setTeam).catch(() => {});
  }, [load]);

  const scrollTo = (key: string) => {
    setCurrent(key as SectionKey);
    document.getElementById(`s0-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  useSectionHeader({
    title: "Project Setup",
    steps: STEPS,
    currentStep: current,
    onStepClick: scrollTo,
    completedSteps: new Set(STEPS.map((s) => s.key)),
    isApproved: true,
  });

  const metaFor = (asin: string, sku: string) => meta[`${asin}::${sku}`] ?? meta[asin];
  const s1Approved = !!project?.s1_approved_at;
  const s6Approved = !!project?.s6_approved_at;

  // ── S0.2 edit state ────────────────────────────────────────────
  const [families, setFamilies] = useState<CatalogFamily[]>([]);
  const [standalone, setStandalone] = useState<CatalogChild[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [scope, setScope] = useState<TargetScope>("ASIN");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [groupFamily, setGroupFamily] = useState<CatalogFamily | null>(null);
  const [search, setSearch] = useState("");

  const startTargetsEdit = async () => {
    if (!project?.client_id_code) return;
    setEditing("targets");
    setCatalogLoading(true);
    setPicked(new Set(asins.map((a) => metaFor(a.asin, a.sku)?.productId).filter((x): x is string => !!x)));
    try {
      const d = await fetch(`/api/seo/projects/catalog?clientIdCode=${encodeURIComponent(project.client_id_code)}`).then((r) => r.json());
      setFamilies(d.families || []);
      setStandalone(d.standalone || []);
    } catch {
      toast.error("Couldn't load the catalog.");
    }
    setCatalogLoading(false);
  };
  const changeScope = (s: TargetScope) => {
    if (s === scope) return;
    setScope(s);
    setPicked(new Set());
    setGroupFamily(null);
  };
  const saveTargets = async () => {
    if (picked.size === 0 || (scope === "GROUP" && picked.size < 2)) return;
    if (!confirm(`Replace this project's target ASINs with ${picked.size} ASIN${picked.size === 1 ? "" : "s"}? S1 will use the new list.`)) return;
    setSaving(true);
    const res = await fetch(`/api/seo/projects/${projectId}/targets`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_ids: [...picked] }),
    });
    setSaving(false);
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return void toast.error(d.error || "Couldn't save the target ASINs.");
    toast.success("Target ASINs updated.");
    // S1 loaded the old list — reload so every phase reads the new one
    window.location.hash = "#s0";
    window.location.reload();
  };

  // ── S0.3 edit state ────────────────────────────────────────────
  const [rulesDraft, setRulesDraft] = useState<Record<string, ContentRule>>({});
  const availableDims = useMemo(() => {
    const dims = new Set<string>();
    for (const a of asins) for (const d of ["flavor", "size", "color", "style"] as const) if (a[d] && a[d] !== "Parent") dims.add(d);
    return [...dims];
  }, [asins]);
  const toggleRuleDim = (key: string, dim: string) => {
    setRulesDraft((prev) => {
      const rule = prev[key] || { mode: "shared" as const, dimensions: [] };
      const dims = rule.dimensions.includes(dim) ? rule.dimensions.filter((d) => d !== dim) : [...rule.dimensions, dim];
      return { ...prev, [key]: { mode: dims.length ? "dimension_specific" : "shared", dimensions: dims } };
    });
  };
  const saveRules = async () => {
    if (!confirm("Save the content rules? S6 will write with these rules.")) return;
    setSaving(true);
    const res = await fetch(`/api/seo/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content_rules: rulesDraft }),
    });
    setSaving(false);
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return void toast.error(d.error || "Couldn't save the content rules.");
    setProject((p) => (p ? { ...p, content_rules: rulesDraft } : p));
    setEditing(null);
    toast.success("Content rules saved.");
  };

  // ── S0.4 edit state ────────────────────────────────────────────
  const [nameDraft, setNameDraft] = useState("");
  const [assigneeDraft, setAssigneeDraft] = useState("");
  const saveDetails = async () => {
    if (!nameDraft.trim()) return;
    if (!confirm("Save the project name and assignee?")) return;
    setSaving(true);
    const res = await fetch(`/api/seo/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nameDraft.trim(), assigned_to: assigneeDraft || null }),
    });
    setSaving(false);
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return void toast.error(d.error || "Couldn't save.");
    setProject((p) => (p ? { ...p, name: nameDraft.trim(), assigned_to: assigneeDraft || null } : p));
    saveProjectState(projectId, { name: nameDraft.trim() });
    window.dispatchEvent(new Event("project_state_updated"));
    setEditing(null);
    toast.success("Saved.");
  };

  if (!project) return <p className="py-10 text-center text-sm text-muted-foreground">Loading project setup…</p>;

  const rules = project.content_rules || {};
  const customized = CONTENT_SECTIONS.filter((s) => rules[s.key]?.mode === "dimension_specific");
  const assignee = team.find((m) => m.id === project.assigned_to);
  const clientName = project.client_name || project.brand_name || project.client_id_code || "—";
  const selectedCount = picked.size;

  return (
    <div className="space-y-4">
      {/* S0.1 Client */}
      <SectionCard id="s0-client" title="S0.1 Client" locked editing={false} lockNote="A different client is a new project — create one instead.">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{clientName}</p>
            <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{project.client_id_code}</p>
          </div>
          {project.client_id_code && <ClientMark compact client={{ clientIdCode: project.client_id_code, clientName }} />}
        </div>
      </SectionCard>

      {/* S0.2 Target ASINs */}
      <SectionCard
        id="s0-targets"
        title="S0.2 Target ASINs"
        locked={s1Approved}
        lockNote={s1Approved ? "Locked — S1 is approved, and S1 onward is built on these ASINs." : undefined}
        editing={editing === "targets"}
        onUnlock={startTargetsEdit}
      >
        {editing === "targets" ? (
          <div>
            <TargetPicker
              families={families}
              standalone={standalone}
              loading={catalogLoading}
              scope={scope}
              onScopeChange={changeScope}
              selectedIds={picked}
              onSelectedIdsChange={setPicked}
              groupFamily={groupFamily}
              onGroupFamilyChange={setGroupFamily}
              search={search}
              onSearchChange={setSearch}
              productFrom="seo-project"
            />
            <div className="mt-4 flex items-center justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} className={btnSecondary}>Cancel</button>
              <button
                type="button"
                onClick={saveTargets}
                disabled={saving || selectedCount === 0 || (scope === "GROUP" && selectedCount < 2)}
                className={btnPrimary}
              >
                {saving ? "Saving…" : `Save ${selectedCount} ASIN${selectedCount === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2">
            {asins.map((a) => {
              const m = metaFor(a.asin, a.sku);
              const badge = (a.parentage_level || "").toLowerCase() === "parent" ? "Parent" : (a.parentage_level || "").toLowerCase() === "child" ? "Child" : "Standalone";
              return (
                <CoverageRow key={`${a.asin}::${a.sku}`} badge={badge} asin={a.asin} productId={m?.productId} from="seo-project" title={m?.summarizedTitle || null} />
              );
            })}
            {asins.length === 0 && <p className="text-sm text-muted-foreground">No target ASINs.</p>}
          </div>
        )}
      </SectionCard>

      {/* S0.3 Content Rules */}
      <SectionCard
        id="s0-rules"
        title="S0.3 Content Rules"
        locked={s6Approved}
        lockNote={s6Approved ? "Locked — S6 is approved." : undefined}
        editing={editing === "rules"}
        onUnlock={() => { setRulesDraft({ ...rules }); setEditing("rules"); }}
      >
        {editing === "rules" ? (
          <div className="space-y-2">
            {availableDims.length === 0 && (
              <p className="text-xs text-muted-foreground">These ASINs have no Flavor / Size / Color / Style values, so every section is shared.</p>
            )}
            {availableDims.length > 0 && CONTENT_SECTIONS.map((s) => {
              const dims = rulesDraft[s.key]?.dimensions || [];
              return (
                <div key={s.key} className="flex flex-wrap items-center gap-2">
                  <span className="w-48 text-xs text-foreground">{s.label}</span>
                  {availableDims.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleRuleDim(s.key, d)}
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${dims.includes(d) ? DIMENSION_COLORS[d] : "border-border text-muted-foreground"}`}
                    >
                      {DIMENSION_LABELS[d]}
                    </button>
                  ))}
                  <span className="text-[10px] text-muted-foreground">{dims.length ? "dimension-specific" : "shared"}</span>
                </div>
              );
            })}
            <div className="mt-3 flex items-center justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} className={btnSecondary}>Cancel</button>
              <button type="button" onClick={saveRules} disabled={saving} className={btnPrimary}>{saving ? "Saving…" : "Save rules"}</button>
            </div>
          </div>
        ) : customized.length === 0 ? (
          <p className="text-sm text-muted-foreground">All {CONTENT_SECTIONS.length} sections shared.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {customized.map((s) => (
              <div key={s.key} className="flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-2 py-1">
                <span className="text-[10px] font-medium text-foreground">{s.label}</span>
                <span className="text-[9px] text-muted-foreground">→</span>
                {rules[s.key].dimensions.map((d) => (
                  <span key={d} className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${DIMENSION_COLORS[d]}`}>{DIMENSION_LABELS[d]}</span>
                ))}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* S0.4 Name & Assignee */}
      <SectionCard
        id="s0-details"
        title="S0.4 Name & Assignee"
        locked={false}
        editing={editing === "details"}
        onUnlock={() => { setNameDraft(project.name); setAssigneeDraft(project.assigned_to || ""); setEditing("details"); }}
      >
        {editing === "details" ? (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-[10px] font-bold text-muted-foreground">Project Name</label>
              <input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                className="h-9 w-full rounded-full border border-stone-300 bg-white px-4 text-sm text-foreground focus:border-amber-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold text-muted-foreground">Assignee</label>
              <select
                value={assigneeDraft}
                onChange={(e) => setAssigneeDraft(e.target.value)}
                className="h-9 w-full rounded-full border border-stone-300 bg-white px-4 text-sm text-foreground focus:border-amber-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
              >
                <option value="">Unassigned</option>
                {team.map((m) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
              </select>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} className={btnSecondary}>Cancel</button>
              <button type="button" onClick={saveDetails} disabled={saving || !nameDraft.trim()} className={btnPrimary}>{saving ? "Saving…" : "Save"}</button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <p className="text-[10px] font-bold text-muted-foreground">Project Name</p>
              <p className="text-sm font-medium">{project.name}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-muted-foreground">Assignee</p>
              <p className="text-sm">{assignee ? assignee.name || assignee.email : project.assigned_to ? "—" : "Unassigned"}</p>
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
