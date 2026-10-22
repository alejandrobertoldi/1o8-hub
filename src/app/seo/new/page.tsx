/* eslint-disable react-doctor/prefer-use-effect-event */
/* eslint-disable jsx-a11y/no-autofocus */
/* eslint-disable react-doctor/nextjs-no-client-fetch-for-server-data */
/* eslint-disable react-doctor/no-fetch-in-effect */
/* eslint-disable react-doctor/react-compiler-destructure-method */
/* eslint-disable react-doctor/no-cascading-set-state */
/* eslint-disable react-doctor/prefer-useReducer */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable react-doctor/js-combine-iterations */
/* eslint-disable jsx-a11y/label-has-associated-control */
/* eslint-disable react-doctor/nextjs-missing-metadata */
/* eslint-disable react-doctor/js-set-map-lookups */
/* eslint-disable react-doctor/js-flatmap-filter */
/* eslint-disable react-doctor/design-no-bold-heading */
"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { AmazonPdpLink } from "@/components/amazon-pdp-link";
import { buildSeoProjectBaseName } from "@/lib/seo/project-naming";
import {
  CONTENT_SECTIONS,
  DIMENSION_COLORS,
  DIMENSION_LABELS,
  type ContentRule,
} from "@/lib/seo/content-sections";
import { ClientMark, CoverageRow, PARENTAGE_STYLES, ScopePill } from "@/components/seo/target-display";
import {
  SCOPE_HELP,
  TargetPicker,
  familyVariationLabel,
  type CatalogChild,
  type CatalogFamily,
  type TargetScope,
} from "@/components/seo/target-picker";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { toast } from "sonner";
import { hasAdminPowers } from "@/lib/roles";

/**
 * Deadline for the client/team lookups. A starved database connection makes the
 * Vercel function stop responding rather than fail fast, so without this the
 * fetch never settles and the client picker never leaves its loading state.
 */
const CLIENTS_FETCH_TIMEOUT_MS = 25_000;

// ── Types ────────────────────────────────────────────────────────────

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

type WizardStep = "client" | "asins" | "content_rules" | "confirm";

const STEPS: { id: WizardStep; label: string; number: number }[] = [
  { id: "client", label: "Select Client", number: 1 },
  { id: "asins", label: "Target ASINs", number: 2 },
  { id: "content_rules", label: "Content Rules", number: 3 },
  { id: "confirm", label: "Confirm & Create", number: 4 },
];

// Unified group color for sub-headers and badges
const GROUP_COLOR = { text: "text-brand-group", bg: "bg-brand-group/10", border: "border-brand-group/20" };


/**
 * Session-storage key for the in-progress wizard. Lets the user open a product
 * (same tab), come back, or refresh without losing their selection.
 */
const WIZARD_STORAGE_KEY = "seo-new-wizard:v1";

interface PersistedWizard {
  step: WizardStep;
  client: ClientEntry | null;
  scope: TargetScope;
  groupFamilyKey: string | null;
  selectedIds: string[];
  contentRules: Record<string, ContentRule>;
  projectName: string;
  assignee: string;
}

function readPersistedWizard(): PersistedWizard | null {
  try {
    const raw = sessionStorage.getItem(WIZARD_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PersistedWizard) : null;
  } catch {
    return null;
  }
}

function clearPersistedWizard() {
  try {
    sessionStorage.removeItem(WIZARD_STORAGE_KEY);
  } catch {
    // storage blocked — nothing to clear
  }
}

// ── Main Component ───────────────────────────────────────────────────

export default function NewSeoProjectPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const isAdmin = hasAdminPowers((session?.user as { role?: string })?.role);

  // Wizard state
  const [step, setStep] = useState<WizardStep>("client");

  // Step 1: Client
  const [clients, setClients] = useState<ClientEntry[]>([]);
  const [clientSearch, setClientSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<ClientEntry | null>(null);
  const [clientsLoading, setClientsLoading] = useState(true);

  // Step 2: ASINs
  const [families, setFamilies] = useState<CatalogFamily[]>([]);
  const [standalone, setStandalone] = useState<CatalogChild[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [scope, setScope] = useState<TargetScope>("ASIN");
  // GROUP scope: the parent being browsed. Kept as a snapshot so a search that
  // filters it out of `families` doesn't drop the user back to the parent list.
  const [groupFamilySnap, setGroupFamily] = useState<CatalogFamily | null>(null);

  // Group assignment
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupInput, setGroupInput] = useState("");
  const [assigningGroup, setAssigningGroup] = useState(false);

  // Step 3: Content Rules
  const [contentRules, setContentRules] = useState<Record<string, ContentRule>>({});
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Step 4: Confirm
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [projectName, setProjectName] = useState("");
  const [assignee, setAssignee] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Detect available dimensions from selected ASINs ────────────────

  const availableDimensions = useMemo(() => {
    const dims = new Set<string>();
    // Pull from theme_attributes of every family that has at least one selected child
    for (const f of families) {
      if (!f.children.some((c) => selectedIds.has(c.id))) continue;
      for (const attr of f.themeAttributes || []) {
        const lower = attr.toLowerCase();
        if (DIMENSION_LABELS[lower]) dims.add(lower);
      }
    }
    // Fallback for standalone ASINs (no family/theme): infer from per-child values
    const selectedStandalone = standalone.filter((c) => selectedIds.has(c.id));
    if (selectedStandalone.some((c) => c.flavor)) dims.add("flavor");
    if (selectedStandalone.some((c) => c.size)) dims.add("size");
    if (selectedStandalone.some((c) => c.color)) dims.add("color");
    if (selectedStandalone.some((c) => c.style)) dims.add("style");
    return Array.from(dims);
  }, [families, standalone, selectedIds]);

  // ── Initialize content rules with defaults when entering step 3 ────

  const initContentRules = useCallback(() => {
    setContentRules((prev) => {
      const rules: Record<string, ContentRule> = {};
      for (const section of CONTENT_SECTIONS) {
        rules[section.key] = prev[section.key] || { mode: "shared", dimensions: [] };
      }
      return rules;
    });
  }, []);

  // ── Load clients on mount ────────────────────────────────────────

  useEffect(() => {
    // Both fetches carry a deadline and rethrow on a non-OK response. Swallowing
    // either into `[]` rendered "No clients found" for what was actually a 503,
    // and an un-deadlined fetch never settles when a starved DB connection makes
    // the function stop responding — so `.finally` never fired and the client
    // picker stayed in its loading state indefinitely.
    fetch("/api/clients?lite=1", { signal: AbortSignal.timeout(CLIENTS_FETCH_TIMEOUT_MS) })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: Array<{ clientIdCode: string; clientName: string }>) =>
        setClients(data.map((c) => ({ clientIdCode: c.clientIdCode, clientName: c.clientName })))
      )
      .catch(() => toast.error("Couldn't load the client list. Reload to try again."))
      .finally(() => setClientsLoading(false));
    fetch("/api/seo/team", { signal: AbortSignal.timeout(CLIENTS_FETCH_TIMEOUT_MS) })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((members: TeamMember[]) => {
        setTeam(members);
        // Default assignee to current user
        const me = members.find((m) => m.email === session?.user?.email);
        // Don't clobber an assignee restored from session storage
        if (me) setAssignee((cur) => cur || me.id);
      })
      .catch(() => toast.error("Couldn't load the team list — assignee names may be missing."));
  }, [session?.user?.email]);

  // ── Load catalog when client selected ────────────────────────────

  const loadCatalog = useCallback(async (clientIdCode: string, search?: string) => {
    setCatalogLoading(true);
    try {
      const params = new URLSearchParams({ clientIdCode });
      if (search) params.set("search", search);
      const res = await fetch(`/api/seo/projects/catalog?${params}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const fams = data.families || [];
      setFamilies(fams);
      setStandalone(data.standalone || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load catalog");
    }
    setCatalogLoading(false);
  }, []);

  // ── Persist wizard state to session storage ──────────────────────
  // Restore runs once after mount (not in useState initialisers) so the server
  // render and first client render match. Saving waits for the restore so the
  // initial empty state never overwrites what was stored.
  const [restored, setRestored] = useState(false);
  const pendingGroupKey = useRef<string | null>(null);

  useEffect(() => {
    const saved = readPersistedWizard();
    if (saved?.client) {
      setSelectedClient(saved.client);
      setScope(saved.scope ?? "ASIN");
      setSelectedIds(new Set(saved.selectedIds ?? []));
      setContentRules(saved.contentRules ?? {});
      setProjectName(saved.projectName ?? "");
      if (saved.assignee) setAssignee(saved.assignee);
      pendingGroupKey.current = saved.groupFamilyKey;
      setStep(saved.step ?? "asins");
      loadCatalog(saved.client.clientIdCode);
    }
    setRestored(true);
  }, [loadCatalog]);

  // Clears the draft; the save effect drops the stored copy once no client is set.
  const startOver = () => {
    setStep("client");
    setSelectedClient(null);
    setSelectedIds(new Set());
    setScope("ASIN");
    setGroupFamily(null);
    setContentRules({});
    setProjectName("");
    setCatalogSearch("");
    setFamilies([]);
    setStandalone([]);
    setShowGroupModal(false);
    setError(null);
    pendingGroupKey.current = null;
  };

  // GROUP scope: re-select the browsed parent once the catalog is back
  useEffect(() => {
    if (!pendingGroupKey.current || families.length === 0) return;
    const match = families.find((f) => (f.parentAsin || f.parentSku) === pendingGroupKey.current);
    if (match) setGroupFamily(match);
    pendingGroupKey.current = null;
  }, [families]);

  useEffect(() => {
    if (!restored) return;
    try {
      if (!selectedClient) {
        sessionStorage.removeItem(WIZARD_STORAGE_KEY);
        return;
      }
      const state: PersistedWizard = {
        step,
        client: selectedClient,
        scope,
        groupFamilyKey: groupFamilySnap ? groupFamilySnap.parentAsin || groupFamilySnap.parentSku : null,
        selectedIds: Array.from(selectedIds),
        contentRules,
        projectName,
        assignee,
      };
      sessionStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(state));
    } catch {
      // storage blocked or full — the wizard still works, it just won't survive a reload
    }
  }, [restored, step, selectedClient, scope, groupFamilySnap, selectedIds, contentRules, projectName, assignee]);

  // ── Selection helpers ────────────────────────────────────────────

  const familyKey = (f: CatalogFamily) => f.parentAsin || f.parentSku;

  const changeScope = (next: TargetScope) => {
    if (next === scope) return;
    setScope(next);
    setSelectedIds(new Set());
    setGroupFamily(null);
    setShowGroupModal(false);
  };

  const groupFamily = groupFamilySnap
    ? families.find((f) => familyKey(f) === familyKey(groupFamilySnap)) ?? groupFamilySnap
    : null;

  // Collect all existing group names across families for autocomplete
  const allGroupNames = Array.from(
    new Set(families.flatMap((f) => f.groups))
  ).sort();

  const handleAssignGroup = async (groupName: string | null) => {
    if (selectedIds.size === 0) return;
    setAssigningGroup(true);
    try {
      const res = await fetch("/api/products/variation-groups", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_ids: Array.from(selectedIds),
          variation_group: groupName,
        }),
      });
      if (!res.ok) throw new Error("Failed to assign group");

      setFamilies((prev) =>
        prev.map((f) => ({
          ...f,
          children: f.children.map((c) =>
            selectedIds.has(c.id) ? { ...c, variationGroup: groupName } : c
          ),
          groups: (() => {
            const updated = f.children.map((c) =>
              selectedIds.has(c.id) ? groupName : c.variationGroup
            );
            return Array.from(new Set(updated.filter(Boolean) as string[])).sort();
          })(),
        }))
      );
      setStandalone((prev) =>
        prev.map((c) =>
          selectedIds.has(c.id) ? { ...c, variationGroup: groupName } : c
        )
      );
      setShowGroupModal(false);
      setGroupInput("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to assign group");
    }
    setAssigningGroup(false);
  };

  // Count selected
  const selectedCount = selectedIds.size;
  const familyCount = families.filter(
    (f) => f.children.some((c) => selectedIds.has(c.id))
  ).length;
  const standaloneCount = standalone.filter((s) => selectedIds.has(s.id)).length;

  // ── Content rules helpers ─────────────────────────────────────────

  const toggleDimension = (sectionKey: string, dim: string) => {
    setContentRules((prev) => {
      const rule = prev[sectionKey] || { mode: "shared", dimensions: [] };
      const hasDim = rule.dimensions.includes(dim);
      const newDims = hasDim
        ? rule.dimensions.filter((d) => d !== dim)
        : [...rule.dimensions, dim];
      return {
        ...prev,
        [sectionKey]: {
          mode: newDims.length > 0 ? "dimension_specific" : "shared",
          dimensions: newDims,
        },
      };
    });
  };

  const setGroupRule = (groupName: string, dim: string | null) => {
    setContentRules((prev) => {
      const next = { ...prev };
      for (const section of CONTENT_SECTIONS) {
        if (section.group === groupName) {
          if (dim === null) {
            next[section.key] = { mode: "shared", dimensions: [] };
          } else {
            const rule = next[section.key] || { mode: "shared", dimensions: [] };
            const hasDim = rule.dimensions.includes(dim);
            const newDims = hasDim
              ? rule.dimensions.filter((d) => d !== dim)
              : [...rule.dimensions, dim];
            next[section.key] = {
              mode: newDims.length > 0 ? "dimension_specific" : "shared",
              dimensions: newDims,
            };
          }
        }
      }
      return next;
    });
  };

  const toggleGroupExpand = (group: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  // Count dimension-specific rules
  const dimSpecificCount = useMemo(() => {
    return Object.values(contentRules).filter((r) => r.mode === "dimension_specific").length;
  }, [contentRules]);

  // ── Auto-suggest project name ─────────────────────────────────────

  /** Base name (no version) per the SEO convention — see src/lib/seo/project-naming.ts. */
  const generateProjectName = () => {
    if (!selectedClient) return "";
    const allChildren = [...families.flatMap((f) => f.children), ...standalone];
    const selectedKids = allChildren.filter((c) => selectedIds.has(c.id));
    const family =
      scope === "GROUP" ? groupFamily : families.find((f) => f.children.some((c) => selectedIds.has(c.id))) ?? null;
    const parentPicked = !!family?.parentId && selectedIds.has(family.parentId);
    const asins = [...(parentPicked && family ? [family.parentAsin] : []), ...selectedKids.map((c) => c.asin)].filter(Boolean);

    // GROUP label: the named group all picks share, else their theme values
    let groupLabel: string | null = null;
    if (scope === "GROUP") {
      const named = new Set(selectedKids.map((c) => c.variationGroup || ""));
      const [only] = [...named];
      if (named.size === 1 && only) groupLabel = only;
      else {
        const values = new Set(
          selectedKids.flatMap((c) => [c.flavor, c.color, c.size, c.style]).filter((v): v is string => !!v)
        );
        groupLabel = [...values].join("_") || null;
      }
    }

    return buildSeoProjectBaseName({
      clientIdCode: selectedClient.clientIdCode,
      scope,
      asins,
      variationId: family ? familyVariationLabel(family) : null,
      parentAsin: family?.parentAsin ?? null,
      groupLabel,
    });
  };

  // Confirm step: show the name the server will actually allocate (G## / V##).
  // Falls back to the base name if the preview call fails; POST is authoritative.
  useEffect(() => {
    if (step !== "confirm" || !selectedClient || !restored) return;
    const base = generateProjectName();
    if (!base) return;
    const ctrl = new AbortController();
    const params = new URLSearchParams({ client: selectedClient.clientIdCode, name: base });
    fetch(`/api/seo/projects/next-name?${params}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: { name?: string }) => setProjectName(d.name || base))
      .catch((e: unknown) => {
        if ((e as { name?: string })?.name !== "AbortError") setProjectName(base);
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, selectedClient, selectedIds, scope, groupFamily, families, restored]);

  // ── Create project ───────────────────────────────────────────────

  const handleCreate = async () => {
    if (!selectedClient || selectedCount === 0) return;
    setCreating(true);
    setError(null);

    try {
      const res = await fetch("/api/seo/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: projectName || "New Project",
          brand_name: selectedClient.clientName,
          client_id_code: selectedClient.clientIdCode,
          assigned_to: assignee || null,
          targeting: {
            mode: "family",
            product_ids: Array.from(selectedIds),
          },
          content_rules: contentRules,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to create project");
      }

      const project = await res.json();
      clearPersistedWizard();
      router.push(`/seo/${project.id}/intake`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create project");
      setCreating(false);
    }
  };

  // ── Filtered clients ─────────────────────────────────────────────

  const filteredClients = clientSearch
    ? clients.filter(
        (c) =>
          c.clientName.toLowerCase().includes(clientSearch.toLowerCase()) ||
          c.clientIdCode.toLowerCase().includes(clientSearch.toLowerCase())
      )
    : clients;

  // ── Render ───────────────────────────────────────────────────────

  const currentStepIndex = STEPS.findIndex((s) => s.id === step);

  // Group content sections by group for the rules step
  const sectionGroups = useMemo(() => {
    const groups: { name: string; sections: typeof CONTENT_SECTIONS }[] = [];
    const seen = new Set<string>();
    for (const s of CONTENT_SECTIONS) {
      if (!seen.has(s.group)) {
        seen.add(s.group);
        groups.push({ name: s.group, sections: CONTENT_SECTIONS.filter((cs) => cs.group === s.group) });
      }
    }
    return groups;
  }, []);

  return (
    <div>
      <PageMetaSlot>
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/seo/manager"
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 shrink-0"
            title="Back to SEO Manager"
          >
            ←
          </Link>
          <h1 className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none shrink-0">
            <span className="font-bold text-sidebar-foreground">NewSEO</span><span className="font-normal text-brand">Project</span>
          </h1>
          <span className="text-xs text-muted-foreground/70 truncate">
            Select a client, choose ASINs, configure content rules, and create your project.
          </span>
        </div>
      </PageMetaSlot>

      <div className="mx-auto max-w-6xl flex flex-col gap-6 md:flex-row md:items-start">
        {/* Step indicator — vertical rail on the left */}
        <nav aria-label="Wizard steps" className="flex flex-wrap gap-2 md:w-48 md:shrink-0 md:flex-col md:gap-0 md:sticky md:top-4">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2 md:flex-col md:items-stretch md:gap-0">
              {i > 0 && <div className={`hidden md:block ml-[21px] h-5 w-px ${i <= currentStepIndex ? "bg-brand" : "bg-border"}`} />}
              <button
                onClick={() => {
                  if (s.id === "client") setStep("client");
                  else if (s.id === "asins" && selectedClient) setStep("asins");
                  else if (s.id === "content_rules" && selectedCount > 0) { initContentRules(); setStep("content_rules"); }
                  else if (s.id === "confirm" && selectedCount > 0) { setProjectName(generateProjectName()); setStep("confirm"); }
                }}
                disabled={
                  (s.id === "asins" && !selectedClient) ||
                  (s.id === "content_rules" && selectedCount === 0) ||
                  (s.id === "confirm" && selectedCount === 0)
                }
                className={`flex h-9 w-full items-center gap-2 px-3 rounded-full text-[13px] font-medium leading-none text-left transition-all ${
                  step === s.id
                    ? "bg-brand/10 text-brand border border-brand/30"
                    : i < currentStepIndex
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                    : "bg-muted/50 text-muted-foreground border border-border"
                } disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                <span className={`size-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  step === s.id
                    ? "bg-brand-solid text-white"
                    : i < currentStepIndex
                    ? "bg-emerald-500 text-white"
                    : "bg-muted text-muted-foreground"
                }`}>
                  {i < currentStepIndex ? "\u2713" : s.number}
                </span>
                {s.label}
              </button>
            </div>
          ))}
          {selectedClient && (
            <button
              type="button"
              onClick={startOver}
              className="mt-3 inline-flex h-9 w-full items-center gap-1.5 rounded-full border border-border px-3 text-left text-[13px] font-medium leading-none text-muted-foreground transition-colors hover:border-brand-red/40 hover:text-brand-red md:mt-4"
              title="Clear this draft and start a new project"
            >
              ↺ Start over
            </button>
          )}
        </nav>

        <div className="min-w-0 flex-1">
        {/* Error banner */}
        {error && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-400">
            {error}
            <button onClick={() => setError(null)} className="ml-2 text-red-300 hover:text-red-200">Dismiss</button>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* Step 1: Client Selection                                       */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {step === "client" && (
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-sm font-bold text-foreground mb-4">Select Client</h2>
            <input
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              placeholder="Search clients…"
              className="w-full h-9 rounded-full border border-stone-300 bg-white px-4 text-sm text-foreground focus:border-amber-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 mb-4"
              autoFocus
            />

            {clientsLoading ? (
              <div className="text-center py-6 text-sm text-muted-foreground">Loading clients…</div>
            ) : filteredClients.length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground">No clients found</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[500px] overflow-y-auto">
                {filteredClients.map((c) => (
                  <button
                    key={c.clientIdCode}
                    onClick={() => {
                      setSelectedClient(c);
                      setSelectedIds(new Set());
                      setScope("ASIN");
                      setGroupFamily(null);
                      setCatalogSearch("");
                      setProjectName("");
                      setStep("asins");
                      loadCatalog(c.clientIdCode);
                    }}
                    className={`flex flex-col items-center gap-3 rounded-lg border px-4 py-5 text-center transition-all hover:border-amber-500/40 hover:bg-amber-500/5 ${
                      selectedClient?.clientIdCode === c.clientIdCode
                        ? "border-amber-500/40 bg-amber-500/10"
                        : "border-border"
                    }`}
                  >
                    <ClientMark client={c} />
                    <div className="w-full min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">{c.clientName}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">{c.clientIdCode}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* Step 2: ASIN Targeting (Tree Selector)                         */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {step === "asins" && (
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-bold text-foreground">
                  Target ASINs for{" "}
                  <span className="text-brand">{selectedClient?.clientName}</span>
                </h2>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {SCOPE_HELP[scope]}
                  {selectedCount > 0 && (
                    <span className="ml-1 font-bold text-brand">
                      {selectedCount} ASIN{selectedCount !== 1 ? "s" : ""} selected
                      {familyCount > 0 && ` across ${familyCount} famil${familyCount !== 1 ? "ies" : "y"}`}
                      {standaloneCount > 0 && ` + ${standaloneCount} standalone`}
                    </span>
                  )}
                </p>
              </div>
            </div>

            <TargetPicker
              families={families}
              standalone={standalone}
              loading={catalogLoading}
              scope={scope}
              onScopeChange={changeScope}
              selectedIds={selectedIds}
              onSelectedIdsChange={setSelectedIds}
              groupFamily={groupFamily}
              onGroupFamilyChange={setGroupFamily}
              search={catalogSearch}
              onSearchChange={setCatalogSearch}
              toolbarExtra={scope === "GROUP" && selectedCount > 0 && (
                <div className="relative">
                  <button
                    onClick={() => setShowGroupModal(!showGroupModal)}
                    className="inline-flex h-9 items-center rounded-full border border-brand/30 bg-brand/10 px-3 text-[13px] font-medium leading-none text-brand hover:bg-brand/20 transition-all whitespace-nowrap"
                  >
                    Save as named group ({selectedCount})
                  </button>

                  {showGroupModal && (
                    <div className="absolute right-0 top-full mt-1 w-64 rounded-lg border border-border bg-card shadow-lg z-50 p-3">
                      <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-2">
                        Assign group to {selectedCount} ASIN{selectedCount !== 1 ? "s" : ""}
                      </div>
                      <input
                        value={groupInput}
                        onChange={(e) => setGroupInput(e.target.value)}
                        placeholder="Type group name…"
                        className="w-full h-9 rounded-full border border-stone-300 bg-white px-3 text-xs text-foreground focus:border-amber-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 mb-2"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && groupInput.trim()) {
                            handleAssignGroup(groupInput.trim());
                          }
                        }}
                      />

                      {allGroupNames.length > 0 && (
                        <div className="mb-2">
                          <div className="text-[9px] text-muted-foreground mb-1">Existing groups:</div>
                          <div className="flex flex-wrap gap-1">
                            {allGroupNames
                              .filter((g) => !groupInput || g.toLowerCase().includes(groupInput.toLowerCase()))
                              .map((g) => (
                                <button
                                  key={g}
                                  onClick={() => handleAssignGroup(g)}
                                  disabled={assigningGroup}
                                  className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand/10 text-brand border border-brand/20 hover:bg-brand/20 transition-all disabled:opacity-50"
                                >
                                  {g}
                                </button>
                              ))}
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleAssignGroup(groupInput.trim() || null)}
                          disabled={assigningGroup}
                          className="inline-flex h-9 flex-1 items-center justify-center rounded-full bg-brand px-3 text-[13px] font-medium leading-none text-white hover:bg-brand-hover disabled:opacity-50"
                        >
                          {assigningGroup ? "…" : groupInput.trim() ? "Assign" : "Remove Group"}
                        </button>
                        <button
                          onClick={() => { setShowGroupModal(false); setGroupInput(""); }}
                          className="inline-flex h-9 items-center rounded-full border border-border px-3 text-[13px] font-medium leading-none text-muted-foreground hover:bg-muted/50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            />

            {/* Actions */}
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
              <button
                onClick={() => setStep("client")}
                className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full border border-stone-300 px-3 text-[13px] font-medium leading-none text-muted-foreground transition-colors hover:bg-stone-50 active:scale-[0.97] dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                ← Back
              </button>
              <button
                onClick={() => { initContentRules(); setStep("content_rules"); }}
                disabled={selectedCount === 0 || (scope === "GROUP" && selectedCount < 2)}
                className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full bg-brand px-3 text-[13px] font-medium leading-none text-white transition-colors hover:bg-brand-hover active:scale-[0.97] disabled:opacity-50"
              >
                Continue with {selectedCount} ASIN{selectedCount !== 1 ? "s" : ""} →
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* Step 3: Content Rules                                          */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {step === "content_rules" && (
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="mb-6">
              <h2 className="text-sm font-bold text-foreground">Content Rules</h2>
              <p className="text-[10px] text-muted-foreground mt-1">
                Configure which content sections should have variation-specific content.
                By default, all sections are <span className="font-bold">shared</span> (same across all ASINs).
                Tag sections with a dimension to generate unique content per variation attribute.
              </p>
              {availableDimensions.length > 0 && (
                <div className="flex items-center gap-2 mt-3">
                  <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Available dimensions:</span>
                  {availableDimensions.map((d) => (
                    <span key={d} className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${DIMENSION_COLORS[d]}`}>
                      {DIMENSION_LABELS[d]}
                    </span>
                  ))}
                </div>
              )}
              {availableDimensions.length === 0 && (
                <div className="mt-3 rounded-full border border-amber-500/20 bg-amber-500/5 px-4 py-2 text-[10px] text-amber-400">
                  No variation dimensions detected in selected ASINs. All content will be shared.
                </div>
              )}
            </div>

            {/* Summary bar */}
            {dimSpecificCount > 0 && (
              <div className="mb-4 min-h-9 rounded-full border border-brand/20 bg-brand/5 px-4 py-2 flex items-center gap-2">
                <span className="text-[10px] font-bold text-brand">
                  {dimSpecificCount} section{dimSpecificCount !== 1 ? "s" : ""} with dimension-specific content
                </span>
                <button
                  onClick={() => {
                    setContentRules((prev) => {
                      const next: Record<string, ContentRule> = {};
                      for (const key of Object.keys(prev)) {
                        next[key] = { mode: "shared", dimensions: [] };
                      }
                      return next;
                    });
                  }}
                  className="ml-auto text-[9px] text-muted-foreground hover:text-foreground underline"
                >
                  Reset all to shared
                </button>
              </div>
            )}

            {/* Content sections grouped */}
            <div className="space-y-2">
              {sectionGroups.map((group) => {
                const isGroupExpanded = expandedGroups.has(group.name);
                const groupDimCount = group.sections.filter(
                  (s) => contentRules[s.key]?.mode === "dimension_specific"
                ).length;

                return (
                  <div key={group.name} className={`border border-border overflow-hidden ${isGroupExpanded ? "rounded-[18px]" : "rounded-full"}`}>
                    {/* Group header */}
                    <div
                      className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-muted/30 transition-all"
                      onClick={() => toggleGroupExpand(group.name)}
                    >
                      <svg
                        className={`size-3.5 text-muted-foreground transition-transform ${isGroupExpanded ? "rotate-90" : ""}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                      </svg>
                      <span className="text-xs font-bold text-foreground">{group.name}</span>
                      <span className="text-[9px] text-muted-foreground">
                        {group.sections.length} section{group.sections.length !== 1 ? "s" : ""}
                      </span>
                      {groupDimCount > 0 && (
                        <span className="text-[9px] font-bold text-brand">
                          {groupDimCount} customized
                        </span>
                      )}

                      {/* Quick-apply dimension to entire group */}
                      {availableDimensions.length > 0 && (
                        <div className="ml-auto flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <span className="text-[8px] text-muted-foreground mr-1">Apply to all:</span>
                          {availableDimensions.map((dim) => {
                            const allHaveDim = group.sections.every(
                              (s) => contentRules[s.key]?.dimensions?.includes(dim)
                            );
                            return (
                              <button
                                key={dim}
                                onClick={() => setGroupRule(group.name, dim)}
                                className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border transition-all ${
                                  allHaveDim
                                    ? DIMENSION_COLORS[dim]
                                    : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
                                }`}
                              >
                                {DIMENSION_LABELS[dim][0]}
                              </button>
                            );
                          })}
                          <button
                            onClick={() => setGroupRule(group.name, null)}
                            className="text-[9px] px-1.5 py-0.5 rounded-full border border-border bg-muted/50 text-muted-foreground hover:bg-muted ml-0.5"
                            title="Reset group to shared"
                          >
                            ×
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Individual sections */}
                    {isGroupExpanded && (
                      <div className="border-t border-border">
                        {group.sections.map((section) => {
                          const rule = contentRules[section.key] || { mode: "shared", dimensions: [] };
                          const isSpecific = rule.mode === "dimension_specific";

                          return (
                            <div
                              key={section.key}
                              className={`flex items-center gap-3 px-4 py-2 pl-10 border-t border-border/50 first:border-t-0 transition-all ${
                                isSpecific ? "bg-brand/5" : ""
                              }`}
                            >
                              <div className="flex-1 min-w-0">
                                <span className="text-xs text-foreground">{section.label}</span>
                                {isSpecific && (
                                  <span className="ml-2 text-[9px] text-muted-foreground">
                                    → unique per {rule.dimensions.map((d) => DIMENSION_LABELS[d]).join(" + ")}
                                  </span>
                                )}
                              </div>

                              {/* Dimension toggle pills */}
                              {availableDimensions.length > 0 && (
                                <div className="flex items-center gap-1">
                                  {availableDimensions.map((dim) => {
                                    const active = rule.dimensions.includes(dim);
                                    return (
                                      <button
                                        key={dim}
                                        onClick={() => toggleDimension(section.key, dim)}
                                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition-all ${
                                          active
                                            ? DIMENSION_COLORS[dim]
                                            : "bg-muted/50 text-muted-foreground/50 border-border hover:bg-muted hover:text-muted-foreground"
                                        }`}
                                      >
                                        {DIMENSION_LABELS[dim]}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}

                              {/* Status indicator */}
                              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                                isSpecific
                                  ? "bg-brand/10 text-brand"
                                  : "bg-muted text-muted-foreground"
                              }`}>
                                {isSpecific ? "Unique" : "Shared"}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
              <button
                onClick={() => setStep("asins")}
                className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full border border-stone-300 px-3 text-[13px] font-medium leading-none text-muted-foreground transition-colors hover:bg-stone-50 active:scale-[0.97] dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                ← Back
              </button>
              <button
                onClick={() => { setProjectName(generateProjectName()); setStep("confirm"); }}
                className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full bg-brand px-3 text-[13px] font-medium leading-none text-white transition-colors hover:bg-brand-hover active:scale-[0.97] disabled:opacity-50"
              >
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* Step 4: Confirm & Create                                       */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {step === "confirm" && (
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-sm font-bold text-foreground mb-6">Confirm & Create Project</h2>

            {/* Summary */}
            <div className="grid grid-cols-1 gap-4 mb-6 sm:grid-cols-2">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-4">
                <div className="min-w-0">
                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-2">Client</div>
                  <div className="text-sm font-medium text-foreground truncate">{selectedClient?.clientName}</div>
                  <div className="text-[10px] font-mono text-muted-foreground mt-0.5">{selectedClient?.clientIdCode}</div>
                </div>
                {selectedClient && <ClientMark client={selectedClient} compact />}
              </div>
              <div className="rounded-lg border border-border p-4">
                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-2">Content Rules</div>
                <div className="text-sm font-medium text-foreground">
                  {dimSpecificCount > 0
                    ? `${dimSpecificCount} customized`
                    : "All shared"
                  }
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {dimSpecificCount > 0
                    ? `${CONTENT_SECTIONS.length - dimSpecificCount} shared + ${dimSpecificCount} dimension-specific`
                    : `${CONTENT_SECTIONS.length} sections, all shared`
                  }
                </div>
              </div>
            </div>

            {/* Content rules summary */}
            {dimSpecificCount > 0 && (
              <div className="rounded-lg border border-border p-4 mb-6">
                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-3">Dimension-Specific Sections</div>
                <div className="flex flex-wrap gap-2">
                  {CONTENT_SECTIONS.filter((s) => contentRules[s.key]?.mode === "dimension_specific").map((s) => {
                    const rule = contentRules[s.key];
                    return (
                      <div key={s.key} className="flex items-center gap-1.5 px-2 py-1 rounded-full border border-border bg-muted/30">
                        <span className="text-[10px] font-medium text-foreground">{s.label}</span>
                        <span className="text-[9px] text-muted-foreground">→</span>
                        {rule.dimensions.map((d) => (
                          <span key={d} className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${DIMENSION_COLORS[d]}`}>
                            {DIMENSION_LABELS[d]}
                          </span>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Selection — included ASINs, laid out like the A+ set coverage panel */}
            <div className="rounded-lg border border-border p-4 mb-6">
              <div className="flex items-baseline gap-2 mb-3">
                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Selection</div>
                <div className="text-sm font-medium text-foreground">{selectedCount} ASIN{selectedCount !== 1 ? "s" : ""}</div>
                <div className="text-[10px] text-muted-foreground">
                  {familyCount > 0 && `${familyCount} famil${familyCount !== 1 ? "ies" : "y"}`}
                  {familyCount > 0 && standaloneCount > 0 && " + "}
                  {standaloneCount > 0 && `${standaloneCount} standalone`}
                </div>
              </div>
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {families
                  .filter((f) => f.children.some((c) => selectedIds.has(c.id)))
                  .map((f) => (
                    <div key={familyKey(f)} className="rounded-xl border border-border bg-muted/20 p-3">
                      <div className="flex items-center gap-2 mb-2 min-w-0">
                        <ScopePill scope={scope} />
                        <span className="text-sm text-foreground truncate">
                          {familyVariationLabel(f)} {f.parentTitle}
                        </span>
                      </div>
                      {scope === "VARIATION" && f.parentAsin && (
                        <CoverageRow badge="Parent" asin={f.parentAsin} productId={f.parentId} title={f.parentTitle} />
                      )}
                      <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2">
                        {f.children
                          .filter((c) => selectedIds.has(c.id))
                          .map((c) => (
                            <CoverageRow key={c.id} badge="Child" asin={c.asin} productId={c.id} title={c.summarizedTitle || c.title} />
                          ))}
                      </div>
                    </div>
                  ))}
                {standaloneCount > 0 && (
                  <div className="rounded-xl border border-border bg-muted/20 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <ScopePill scope="ASIN" />
                      <span className="text-sm text-foreground">Standalone</span>
                    </div>
                    <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2">
                      {standalone
                        .filter((c) => selectedIds.has(c.id))
                        .map((c) => (
                          <CoverageRow key={c.id} badge={c.parentageLevel || "Standalone"} asin={c.asin} productId={c.id} title={c.summarizedTitle || c.title} />
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Form fields */}
            <div className="space-y-4 mb-6">
              <div>
                <label className="text-[10px] font-bold text-muted-foreground mb-1 block">Project Name</label>
                <div className="w-full flex h-9 items-center rounded-full border border-border bg-muted/50 px-4 text-sm text-foreground">
                  {projectName}
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-muted-foreground mb-1 block">Assignee</label>
                <select
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  disabled={!isAdmin}
                  className="w-full h-9 rounded-full border border-stone-300 bg-white px-4 text-sm text-foreground focus:border-amber-500 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                >
                  <option value="">Unassigned</option>
                  {team.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name || m.email}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-border">
              <button
                onClick={() => setStep("content_rules")}
                className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full border border-stone-300 px-3 text-[13px] font-medium leading-none text-muted-foreground transition-colors hover:bg-stone-50 active:scale-[0.97] dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                ← Back
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !projectName.trim()}
                className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full bg-brand px-3 text-[13px] font-medium leading-none text-white transition-colors hover:bg-brand-hover active:scale-[0.97] disabled:opacity-50"
              >
                {creating ? "Creating…" : "Create Project"}
              </button>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
