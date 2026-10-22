/* eslint-disable react/no-danger */
/* eslint-disable react-doctor/async-defer-await */
/* eslint-disable react-doctor/prefer-use-effect-event */
/* eslint-disable react-doctor/nextjs-no-client-fetch-for-server-data */
/* eslint-disable react-doctor/no-fetch-in-effect */
/* eslint-disable react-doctor/no-cascading-set-state */
/* eslint-disable react-doctor/prefer-useReducer */
/* eslint-disable jsx-a11y/label-has-associated-control */
/* eslint-disable react-doctor/nextjs-missing-metadata */
/* eslint-disable react-doctor/design-no-bold-heading */
/* eslint-disable react-doctor/design-no-em-dash-in-jsx-text */
/* eslint-disable react-doctor/no-array-index-as-key */
"use client";
/* eslint-disable react-doctor/rendering-hydration-mismatch-time */

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { AI_DEFAULTS, AVAILABLE_MODELS, AI_FEATURE_KEYS } from "@/lib/ai-config";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import type { AiFeatureKey, AiFeatureConfig } from "@/lib/ai-config";
import { hasAdminPowers } from "@/lib/roles";

// ── Types ─────────────────────────────────────────────────────────────

type Tab = "pipeline" | "ai-steps" | "skills" | "rules" | "quality";

interface SkillConfig {
  s0_competitive: boolean;
}

const DEFAULT_SKILL_CONFIG: SkillConfig = {
  s0_competitive: false,
};

const PIPELINE_PHASES = [
  { id: "S1", label: "Intake", aiKey: null, color: "bg-blue-500" },
  { id: "S2", label: "Keywords", aiKey: "seo_keywords" as AiFeatureKey, color: "bg-indigo-500" },
  { id: "S3", label: "Reviews", aiKey: "seo_reviews" as AiFeatureKey, color: "bg-purple-500" },
  { id: "S4", label: "Alexa for Shopping", aiKey: "seo_rufus" as AiFeatureKey, color: "bg-pink-500" },
  { id: "S5", label: "COSMO", aiKey: "seo_cosmo" as AiFeatureKey, color: "bg-orange-500" },
  { id: "S6", label: "Content", aiKey: "seo_content" as AiFeatureKey, color: "bg-amber-500" },
];

const SEO_FEATURE_KEYS = AI_FEATURE_KEYS.filter((k) => k.startsWith("seo_"));

// ── Minimal markdown renderer ────────────────────────────────────────

function MarkdownPreview({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) { codeLines.push(lines[i]); i++; }
      elements.push(<pre key={i} className="my-2 rounded-md bg-card border border-border px-4 py-3 text-xs font-mono text-foreground/80 overflow-x-auto whitespace-pre">{codeLines.join("\n")}</pre>);
      i++; continue;
    }
    if (line.startsWith("# ")) { elements.push(<h1 key={i} className="text-lg font-extrabold text-foreground mt-6 mb-2 pb-1 border-b border-border">{line.slice(2)}</h1>); i++; continue; }
    if (line.startsWith("## ")) { elements.push(<h2 key={i} className="text-sm font-bold text-amber-400 mt-5 mb-1.5">{line.slice(3)}</h2>); i++; continue; }
    if (line.startsWith("### ")) { elements.push(<h3 key={i} className="text-xs font-bold text-foreground/80 mt-3 mb-1">{line.slice(4)}</h3>); i++; continue; }
    if (line.startsWith("- ")) {
      elements.push(
        <div key={i} className="flex gap-2 text-xs text-muted-foreground leading-relaxed">
          <span className="mt-1 text-amber-500/60 shrink-0">•</span>
          <span dangerouslySetInnerHTML={{ __html: renderInline(line.slice(2)) }} />
        </div>
      );
      i++; continue;
    }
    if (line.trim() === "") { elements.push(<div key={i} className="h-1" />); i++; continue; }
    elements.push(<p key={i} className="text-xs text-muted-foreground leading-relaxed" dangerouslySetInnerHTML={{ __html: renderInline(line) }} />);
    i++;
  }
  return <div className="space-y-0.5">{elements}</div>;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderInline(text: string): string {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code class="rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-amber-300">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="text-foreground font-semibold">$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em class="text-foreground/80">$1</em>');
}

// ── Tab: Pipeline Overview ───────────────────────────────────────────

function PipelineOverview({ aiConfig }: { aiConfig: Record<string, AiFeatureConfig> | null }) {
  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">Visual overview of the 6-phase SEO pipeline with AI model assignments.</p>

      {/* Pipeline flow */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {PIPELINE_PHASES.map((phase, idx) => {
          const config = phase.aiKey ? (aiConfig?.[phase.aiKey] ?? AI_DEFAULTS[phase.aiKey]) : null;
          return (
            <div key={phase.id} className="flex items-center gap-2">
              <div className="rounded-xl border border-border bg-card p-3 min-w-[140px]">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`size-2 rounded-full ${config?.enabled !== false ? phase.color : "bg-zinc-600"}`} />
                  <span className="text-[10px] font-bold text-muted-foreground">{phase.id}</span>
                  <span className="text-xs font-bold text-foreground">{phase.label}</span>
                </div>
                {config ? (
                  <div className="space-y-0.5">
                    <div className="text-[10px] text-muted-foreground truncate">
                      {AVAILABLE_MODELS.find((m) => m.id === config.model)?.label || config.model}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${config.enabled ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-500/10 text-zinc-500"}`}>
                        {config.enabled ? "ON" : "OFF"}
                      </span>
                      <span className="text-[9px] text-muted-foreground/60">{config.maxTokens} tokens</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-[10px] text-muted-foreground/50">Manual step</div>
                )}
              </div>
              {idx < PIPELINE_PHASES.length - 1 && (
                <svg className="size-4 text-muted-foreground/30 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="rounded-lg border border-border bg-card/50 p-4">
        <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Pipeline Data Flow</h3>
        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <div>S1 Intake → ASIN list, competitors, guidelines</div>
          <div>S2 Keywords → Tiered keywords (T1-T4) with COSMO mapping</div>
          <div>S3 Reviews → Sentiment analysis, insights usable in Alexa for Shopping</div>
          <div>S4 Alexa for Shopping → Q&A intelligence, objections, desires</div>
          <div>S5 COSMO → Entity-relationship map (20 rows)</div>
          <div>S6 Content → Titles, bullets, description, backend</div>
        </div>
      </div>
    </div>
  );
}

// ── Tab: AI Steps ────────────────────────────────────────────────────

function AIStepsTab({
  aiConfig,
  onUpdate,
  onSave,
  onReset,
  hasChanges,
  saving,
  isAdmin,
}: {
  aiConfig: Record<string, AiFeatureConfig>;
  onUpdate: (key: AiFeatureKey, field: keyof AiFeatureConfig, value: string | number | boolean) => void;
  onSave: () => void;
  onReset: () => void;
  hasChanges: boolean;
  saving: boolean;
  isAdmin: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Configure model, token limits, and enabled state for each AI step.</p>
        {isAdmin && (
          <div className="flex gap-2">
            <button onClick={onReset} className="rounded-lg border border-border px-3 py-1.5 text-[10px] font-bold text-muted-foreground hover:text-foreground transition-colors">
              Reset Defaults
            </button>
            <button
              onClick={onSave}
              disabled={!hasChanges || saving}
              className={`rounded-lg px-4 py-1.5 text-[10px] font-bold transition-all ${hasChanges ? "bg-brand-solid text-white hover:bg-brand-solid-hover" : "bg-muted text-muted-foreground cursor-not-allowed"}`}
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {SEO_FEATURE_KEYS.map((key) => {
          const feat = aiConfig[key] ?? AI_DEFAULTS[key];
          const defaults = AI_DEFAULTS[key];
          const isModified = feat.model !== defaults.model || feat.maxTokens !== defaults.maxTokens || feat.enabled !== defaults.enabled;

          return (
            <div key={key} className={`rounded-xl border p-4 transition-colors ${feat.enabled ? "border-border bg-card" : "border-border/50 bg-card/30 opacity-60"}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-foreground">{feat.label}</h3>
                    {isModified && (
                      <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-400">MODIFIED</span>
                    )}
                  </div>
                  <code className="mt-0.5 block text-[10px] text-muted-foreground/60">{feat.route}</code>
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={feat.enabled}
                    onClick={() => onUpdate(key, "enabled", !feat.enabled)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${feat.enabled ? "bg-emerald-500" : "bg-zinc-600"}`}
                  >
                    <span className={`inline-block size-3.5 transform rounded-full bg-white transition-transform ${feat.enabled ? "translate-x-[18px]" : "translate-x-[3px]"}`} />
                  </button>
                )}
              </div>

              <div className="mt-3 flex items-center gap-4">
                <div className="flex-1">
                  <label className="mb-1 block text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider">Model</label>
                  <select
                    value={feat.model}
                    onChange={(e) => onUpdate(key, "model", e.target.value)}
                    disabled={!isAdmin}
                    className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground outline-none focus:border-brand/50"
                  >
                    {AVAILABLE_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                </div>
                <div className="w-28">
                  <label className="mb-1 block text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider">Max Tokens</label>
                  <input
                    type="number"
                    min={50}
                    max={16384}
                    step={50}
                    value={feat.maxTokens}
                    onChange={(e) => onUpdate(key, "maxTokens", Number(e.target.value))}
                    disabled={!isAdmin}
                    className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground outline-none focus:border-brand/50"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Tab: /seo Skills ─────────────────────────────────────────────────

function SkillsTab({
  config,
  onChange,
  onSave,
  hasChanges,
  saving,
  isAdmin,
}: {
  config: SkillConfig;
  onChange: (key: keyof SkillConfig, value: boolean) => void;
  onSave: () => void;
  hasChanges: boolean;
  saving: boolean;
  isAdmin: boolean;
}) {
  const skills = [
    {
      key: "s0_competitive" as const,
      label: "S0 Competitive Analysis",
      description: "Run /seo-page analysis on the Amazon PDP and competitor listings before starting the pipeline. Feeds competitive intelligence into keywords, Alexa for Shopping, COSMO, and content generation.",
      phase: "Pre-Pipeline",
      phaseColor: "text-blue-400",
    },
    // Note: Post-S6 Validation and GEO Readiness are now integrated into S6.6 Audit & Optimize
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">Configure Claude Code /seo skill integrations that run automatically during the pipeline.</p>
          <p className="text-[10px] text-muted-foreground/50 mt-1">These skills analyze live Amazon product pages and competitor listings to enhance content quality.</p>
        </div>
        {isAdmin && hasChanges && (
          <button
            onClick={onSave}
            disabled={saving}
            className="rounded-lg bg-brand-solid px-4 py-1.5 text-[10px] font-bold text-white hover:bg-brand-solid-hover"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        )}
      </div>

      <div className="space-y-3">
        {skills.map((skill) => (
          <div key={skill.key} className={`rounded-xl border p-4 transition-colors ${config[skill.key] ? "border-border bg-card" : "border-border/50 bg-card/30"}`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[9px] font-bold ${skill.phaseColor}`}>{skill.phase}</span>
                  <h3 className="text-sm font-bold text-foreground">{skill.label}</h3>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{skill.description}</p>
              </div>
              {isAdmin && (
                <button
                  type="button"
                  role="switch"
                  aria-checked={config[skill.key]}
                  onClick={() => onChange(skill.key, !config[skill.key])}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${config[skill.key] ? "bg-emerald-500" : "bg-zinc-600"}`}
                >
                  <span className={`inline-block size-3.5 transform rounded-full bg-white transition-transform ${config[skill.key] ? "translate-x-[18px]" : "translate-x-[3px]"}`} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tab: Global Rules (preserved markdown editor) ────────────────────

function GlobalRulesTab({
  content,
  setContent,
  savedContent,
  onSave,
  saving,
  savedMsg,
  isAdmin,
  updatedAt,
  updatedBy,
}: {
  content: string;
  setContent: (v: string) => void;
  savedContent: string;
  onSave: () => void;
  saving: boolean;
  savedMsg: boolean;
  isAdmin: boolean;
  updatedAt: string | null;
  updatedBy: string;
}) {
  const isDirty = content !== savedContent;
  const [mode, setMode] = useState<"edit" | "preview" | "split">("split");

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">
            Global AI rules and guidelines injected into every Claude call.
            {updatedAt && (
              <span className="ml-2 text-muted-foreground/50">
                Last saved {new Date(updatedAt).toLocaleString()}
                {updatedBy && updatedBy !== "system" ? ` by ${updatedBy}` : ""}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <label className="cursor-pointer rounded-lg border border-border px-3 py-1.5 text-[10px] font-bold text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors">
              Upload .md
              <input
                type="file"
                accept=".md,text/markdown,text/plain"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (ev) => {
                    const text = ev.target?.result as string;
                    if (typeof text === "string") setContent(text);
                  };
                  reader.readAsText(file);
                  e.target.value = "";
                }}
              />
            </label>
          )}
          <div className="flex rounded-lg border border-border overflow-hidden text-[10px] font-bold">
            {(["edit", "split", "preview"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)}
                className={`px-3 py-1.5 capitalize transition-colors ${mode === m ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground/80"}`}>
                {m}
              </button>
            ))}
          </div>
          {isAdmin && (
            <button
              onClick={onSave}
              disabled={saving || !isDirty}
              className={`rounded-lg px-4 py-1.5 text-xs font-bold transition-all ${savedMsg ? "bg-emerald-600 text-white" : isDirty ? "bg-amber-500 text-black hover:bg-amber-400" : "bg-muted text-muted-foreground cursor-not-allowed"}`}
            >
              {saving ? "Saving…" : savedMsg ? "Saved" : "Save"}
            </button>
          )}
        </div>
      </div>

      <div className={`grid gap-4 ${mode === "split" ? "grid-cols-2" : "grid-cols-1"}`} style={{ height: "calc(100vh - 16rem)" }}>
        {(mode === "edit" || mode === "split") && (
          <div className="flex flex-col rounded-xl border border-border overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/50">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Markdown</span>
              {isDirty && <span className="text-[10px] text-amber-400">Unsaved changes</span>}
            </div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              readOnly={!isAdmin}
              spellCheck={false}
              className="flex-1 w-full resize-none bg-background px-5 py-4 font-mono text-xs text-foreground/80 leading-relaxed focus:outline-none placeholder:text-muted-foreground/40"
              placeholder="# SEO Manager — Global Configuration&#10;&#10;## Compliance Rules&#10;&#10;- Rule one&#10;- Rule two"
            />
          </div>
        )}
        {(mode === "preview" || mode === "split") && (
          <div className="flex flex-col rounded-xl border border-border overflow-hidden">
            <div className="px-4 py-2 border-b border-border bg-muted/50">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Preview</span>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {content.trim() ? <MarkdownPreview content={content} /> : <p className="text-xs text-muted-foreground/40 italic">Nothing to preview.</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────

export default function SEOConfigPage() {
  const { data: session } = useSession();
  const isAdmin = hasAdminPowers(session?.user?.role);

  const [tab, setTab] = useState<Tab>("pipeline");

  // Global rules state
  const [rulesContent, setRulesContent] = useState("");
  const [savedRulesContent, setSavedRulesContent] = useState("");
  const [rulesUpdatedAt, setRulesUpdatedAt] = useState<string | null>(null);
  const [rulesUpdatedBy, setRulesUpdatedBy] = useState("");
  const [rulesSaving, setRulesSaving] = useState(false);
  const [rulesSavedMsg, setRulesSavedMsg] = useState(false);

  // AI config state
  const [aiConfig, setAiConfig] = useState<Record<string, AiFeatureConfig> | null>(null);
  const [localAiConfig, setLocalAiConfig] = useState<Record<string, AiFeatureConfig> | null>(null);
  const [aiSaving, setAiSaving] = useState(false);
  const aiHasChanges = localAiConfig !== null;
  const effectiveAiConfig = localAiConfig ?? aiConfig;

  // Skill config state
  const [skillConfig, setSkillConfig] = useState<SkillConfig>(DEFAULT_SKILL_CONFIG);
  const [savedSkillConfig, setSavedSkillConfig] = useState<SkillConfig>(DEFAULT_SKILL_CONFIG);
  const [skillSaving, setSkillSaving] = useState(false);
  const skillHasChanges = JSON.stringify(skillConfig) !== JSON.stringify(savedSkillConfig);

  // Loading
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load all config on mount
  useEffect(() => {
    Promise.all([
      fetch("/api/seo/config").then((r) => r.json()),
      fetch("/api/admin/ai-config").then((r) => r.ok ? r.json() : null),
      fetch("/api/seo/config?key=skill_config").then((r) => r.ok ? r.json() : null),
    ])
      .then(([rulesData, aiData, skillData]) => {
        // Rules
        setRulesContent(rulesData.value ?? "");
        setSavedRulesContent(rulesData.value ?? "");
        setRulesUpdatedAt(rulesData.updated_at);
        setRulesUpdatedBy(rulesData.updated_by);

        // AI config
        if (aiData?.features) {
          setAiConfig(aiData.features);
        } else {
          // Build from defaults
          const defaults: Record<string, AiFeatureConfig> = {};
          for (const key of AI_FEATURE_KEYS) defaults[key] = { ...AI_DEFAULTS[key] };
          setAiConfig(defaults);
        }

        // Skill config
        if (skillData?.value) {
          try {
            const parsed = typeof skillData.value === "string" ? JSON.parse(skillData.value) : skillData.value;
            const merged = { ...DEFAULT_SKILL_CONFIG, ...parsed };
            setSkillConfig(merged);
            setSavedSkillConfig(merged);
          } catch { /* use defaults */ }
        }
      })
      .catch(() => setError("Failed to load configuration"))
      .finally(() => setLoading(false));
  }, []);

  // AI config handlers
  function updateAiFeature(key: AiFeatureKey, field: keyof AiFeatureConfig, value: string | number | boolean) {
    const current = effectiveAiConfig;
    if (!current) return;
    setLocalAiConfig({ ...current, [key]: { ...current[key], [field]: value } });
  }

  function resetAiDefaults() {
    const reset: Record<string, AiFeatureConfig> = {};
    for (const key of AI_FEATURE_KEYS) reset[key] = { ...AI_DEFAULTS[key] };
    setLocalAiConfig(reset);
  }

  const saveAiConfig = useCallback(async () => {
    if (!effectiveAiConfig || aiSaving) return;
    setAiSaving(true);
    try {
      const res = await fetch("/api/admin/ai-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ features: effectiveAiConfig }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setAiConfig(effectiveAiConfig);
      setLocalAiConfig(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAiSaving(false);
    }
  }, [effectiveAiConfig, aiSaving]);

  // Rules save handler
  const saveRules = useCallback(async () => {
    if (!isAdmin || rulesSaving) return;
    setRulesSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/seo/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: rulesContent }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Save failed");
      const data = await res.json();
      setSavedRulesContent(rulesContent);
      setRulesUpdatedAt(data.updated_at);
      setRulesUpdatedBy(data.updated_by);
      setRulesSavedMsg(true);
      setTimeout(() => setRulesSavedMsg(false), 2500);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRulesSaving(false);
    }
  }, [rulesContent, isAdmin, rulesSaving]);

  // Skill config save handler
  const saveSkillConfig = useCallback(async () => {
    if (!isAdmin || skillSaving) return;
    setSkillSaving(true);
    try {
      const res = await fetch("/api/seo/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "skill_config", value: JSON.stringify(skillConfig) }),
      });
      if (!res.ok) throw new Error("Failed to save skill config");
      setSavedSkillConfig({ ...skillConfig });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSkillSaving(false);
    }
  }, [skillConfig, isAdmin, skillSaving]);

  // Ctrl/Cmd+S to save active tab
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (tab === "rules") saveRules();
        else if (tab === "ai-steps") saveAiConfig();
        else if (tab === "skills") saveSkillConfig();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [tab, saveRules, saveAiConfig, saveSkillConfig]);

  const TABS: { id: Tab; label: string }[] = [
    { id: "pipeline", label: "Pipeline" },
    { id: "ai-steps", label: "AI Steps" },
    { id: "skills", label: "/seo Skills" },
    { id: "rules", label: "Global Rules" },
  ];

  return (
    <div>
      <PageMetaSlot>
        <h1
          className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
          aria-label="SEO Config"
        >
          <span className="font-bold text-sidebar-foreground">SEO</span>
          <span className="font-normal text-brand">Config</span>
        </h1>
        <div className="flex items-center gap-2 ml-4">
          <Link href="/seo" className="text-[10px] font-bold text-muted-foreground hover:text-foreground/80 transition-colors">
            ← SEO Projects
          </Link>
        </div>
      </PageMetaSlot>
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border -mx-6 lg:-mx-10 px-6 lg:px-10 mb-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-xs font-bold transition-colors border-b-2 -mb-px ${tab === t.id ? "border-brand text-foreground" : "border-transparent text-muted-foreground hover:text-foreground/80"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!isAdmin && (
        <div className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-2 text-xs text-amber-400">
          View-only — admin access required to edit.
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-2 text-xs text-red-400 flex items-center justify-between">
          {error}
          <button onClick={() => setError(null)} className="text-red-500 underline text-[10px]">Dismiss</button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-20 text-muted-foreground text-sm">Loading configuration…</div>
      ) : (
        <div className="mt-4">
          {tab === "pipeline" && <PipelineOverview aiConfig={effectiveAiConfig} />}
          {tab === "ai-steps" && effectiveAiConfig && (
            <AIStepsTab
              aiConfig={effectiveAiConfig}
              onUpdate={updateAiFeature}
              onSave={saveAiConfig}
              onReset={resetAiDefaults}
              hasChanges={aiHasChanges}
              saving={aiSaving}
              isAdmin={isAdmin}
            />
          )}
          {tab === "skills" && (
            <SkillsTab
              config={skillConfig}
              onChange={(key, value) => setSkillConfig((prev) => ({ ...prev, [key]: value }))}
              onSave={saveSkillConfig}
              hasChanges={skillHasChanges}
              saving={skillSaving}
              isAdmin={isAdmin}
            />
          )}
          {tab === "rules" && (
            <GlobalRulesTab
              content={rulesContent}
              setContent={setRulesContent}
              savedContent={savedRulesContent}
              onSave={saveRules}
              saving={rulesSaving}
              savedMsg={rulesSavedMsg}
              isAdmin={isAdmin}
              updatedAt={rulesUpdatedAt}
              updatedBy={rulesUpdatedBy}
            />
          )}
        </div>
      )}
    </div>
  );
}
