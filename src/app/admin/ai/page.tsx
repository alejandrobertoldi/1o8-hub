/* eslint-disable jsx-a11y/label-has-associated-control */
/* eslint-disable react-doctor/design-no-bold-heading */
"use client";
/* eslint-disable react-doctor/rendering-hydration-mismatch-time */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, RotateCcw, Save, ChevronDown, ChevronRight } from "lucide-react";
import { AI_DEFAULTS, AVAILABLE_MODELS, AI_FEATURE_KEYS } from "@/lib/ai-config";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import type { AiFeatureKey, AiFeatureConfig } from "@/lib/ai-config";

interface AiConfigResponse {
  features: Record<AiFeatureKey, AiFeatureConfig>;
  updatedAt: string | null;
  updatedBy: string | null;
}

export default function AdminAiPage() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<AiConfigResponse>({
    queryKey: ["admin-ai-config"],
    queryFn: async () => {
      const res = await fetch("/api/admin/ai-config");
      if (!res.ok) throw new Error("Failed to load AI config");
      return res.json();
    },
  });

  const [localConfig, setLocalConfig] = useState<Record<string, AiFeatureConfig> | null>(null);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  // Initialize local state from server data
  const config = localConfig ?? data?.features ?? null;

  // Track if user has made changes
  const hasChanges = localConfig !== null;

  function updateFeature(key: AiFeatureKey, field: keyof AiFeatureConfig, value: string | number | boolean) {
    const current = config ?? data?.features;
    if (!current) return;

    setLocalConfig({
      ...current,
      [key]: { ...current[key], [field]: value },
    });
  }

  function resetToDefaults() {
    const reset: Record<string, AiFeatureConfig> = {};
    for (const key of AI_FEATURE_KEYS) {
      reset[key] = { ...AI_DEFAULTS[key] };
    }
    setLocalConfig(reset);
  }

  const saveMutation = useMutation({
    mutationFn: async (features: Record<string, AiFeatureConfig>) => {
      const res = await fetch("/api/admin/ai-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ features }),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => {
      toast.success("AI configuration saved");
      setLocalConfig(null);
      queryClient.invalidateQueries({ queryKey: ["admin-ai-config"] });
    },
    onError: () => toast.error("Failed to save AI configuration"),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 text-red-400">
        Failed to load AI configuration. Make sure you have admin access.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <PageMetaSlot>
        <h1
          className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
          aria-label="AI Config"
        >
          <span className="font-bold text-sidebar-foreground">AI</span>
          <span className="font-normal text-brand">Config</span>
        </h1>
      </PageMetaSlot>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          {data.updatedAt && (
            <p className="text-xs text-zinc-500">
              Last updated {new Date(data.updatedAt).toLocaleDateString("en-US")} by {data.updatedBy}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={resetToDefaults}
            className="flex items-center gap-1.5 rounded-md border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-700"
          >
            <RotateCcw className="size-3.5" />
            Reset Defaults
          </button>
          <button
            onClick={() => config && saveMutation.mutate(config)}
            disabled={!hasChanges || saveMutation.isPending}
            className="flex items-center gap-1.5 rounded-md bg-[#F8BF1D] px-4 py-1.5 text-xs font-semibold text-[#0F1111] hover:bg-[#F8BF1D]/90 disabled:opacity-40"
          >
            {saveMutation.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Save className="size-3.5" />
            )}
            Save Changes
          </button>
        </div>
      </div>

      {/* Feature cards */}
      <div className="space-y-3">
        {AI_FEATURE_KEYS.map((key) => {
          const feat = config?.[key] ?? AI_DEFAULTS[key];
          const defaults = AI_DEFAULTS[key];
          const isDefault = feat.model === defaults.model && feat.maxTokens === defaults.maxTokens && feat.enabled === defaults.enabled;

          return (
            <div
              key={key}
              className={`rounded-lg border p-4 ${
                feat.enabled
                  ? "border-zinc-700 bg-zinc-800/50"
                  : "border-zinc-800 bg-zinc-900/50 opacity-60"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                {/* Left: label + route */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-zinc-100">{feat.label}</h3>
                    {!isDefault && (
                      <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                        MODIFIED
                      </span>
                    )}
                  </div>
                  <code className="mt-0.5 block text-xs text-zinc-500">{feat.route}</code>
                </div>

                {/* Right: enabled toggle */}
                <label className="flex cursor-pointer items-center gap-2">
                  <span className="text-xs text-zinc-400">
                    {feat.enabled ? "Enabled" : "Disabled"}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={feat.enabled}
                    onClick={() => updateFeature(key, "enabled", !feat.enabled)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      feat.enabled ? "bg-emerald-500" : "bg-zinc-600"
                    }`}
                  >
                    <span
                      className={`inline-block size-3.5 transform rounded-full bg-white transition-transform ${
                        feat.enabled ? "translate-x-[18px]" : "translate-x-[3px]"
                      }`}
                    />
                  </button>
                </label>
              </div>

              {/* Config row */}
              <div className="mt-3 flex items-center gap-4">
                {/* Model selector */}
                <div className="flex-1">
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                    Model
                  </label>
                  <select
                    value={feat.model}
                    onChange={(e) => updateFeature(key, "model", e.target.value)}
                    className="w-full rounded-md border border-zinc-600 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 outline-none focus:border-[#F8BF1D]/50"
                  >
                    {AVAILABLE_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Max tokens */}
                <div className="w-32">
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                    Max Tokens
                  </label>
                  <input
                    type="number"
                    min={50}
                    max={16384}
                    step={50}
                    value={feat.maxTokens}
                    onChange={(e) => updateFeature(key, "maxTokens", Number(e.target.value))}
                    className="w-full rounded-md border border-zinc-600 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 outline-none focus:border-[#F8BF1D]/50"
                  />
                </div>
              </div>

              {/* System Prompt (expandable) — only show for features that have one */}
              {(feat.systemPrompt || AI_DEFAULTS[key].systemPrompt) && (
                <div className="mt-3 border-t border-zinc-700 pt-3">
                  <button
                    type="button"
                    onClick={() => {
                      const next = new Set(expandedCards);
                      next.has(key) ? next.delete(key) : next.add(key);
                      setExpandedCards(next);
                    }}
                    className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200"
                  >
                    {expandedCards.has(key) ? (
                      <ChevronDown className="size-3.5" />
                    ) : (
                      <ChevronRight className="size-3.5" />
                    )}
                    System Prompt
                    <span className="text-zinc-600">
                      ({(feat.systemPrompt || AI_DEFAULTS[key].systemPrompt || "").length} chars)
                    </span>
                  </button>
                  {expandedCards.has(key) && (
                    <textarea
                      value={feat.systemPrompt ?? AI_DEFAULTS[key].systemPrompt ?? ""}
                      onChange={(e) => updateFeature(key, "systemPrompt" as keyof AiFeatureConfig, e.target.value)}
                      rows={12}
                      className="mt-2 w-full rounded-md border border-zinc-600 bg-zinc-900 px-3 py-2 text-xs font-mono text-zinc-300 outline-none focus:border-[#F8BF1D]/50 leading-relaxed"
                      placeholder="System prompt for this AI feature…"
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
