"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { SUGGESTION_MAX } from "@/lib/aplus2/alt-text-prompt";
import type { ModuleDto } from "./aplus2-module-editor";

const globalAltSuggestionDrafts = new Map<string, string>();

export type BulkAltVersion = {
  id: string;
  modules: ModuleDto[];
};

function isImageAsset(a: ModuleDto["assets"][number]) {
  return a.kind === "image" && a.variant === "desktop";
}

async function fetchAltText(job: {
  assetId: string;
  currentAlt?: string;
  suggestion?: string;
}): Promise<string | null> {
  const r = await fetch("/api/aplus2/ai/alt-text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      assetId: job.assetId,
      currentAlt: job.currentAlt || undefined,
      suggestion: job.suggestion || undefined,
    }),
  });
  const d = await r.json();
  return r.ok && d.altText ? (d.altText as string) : null;
}

export function GenerateAllAltTextsBtn({
  v,
  setId,
}: {
  v: BulkAltVersion;
  setId: string;
}) {
  const draftKey = v.id;
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState(
    () => globalAltSuggestionDrafts.get(draftKey) ?? ""
  );
  const suggestionRef = useRef(suggestion);
  suggestionRef.current = suggestion;
  const qc = useQueryClient();

  useEffect(() => {
    const stored = globalAltSuggestionDrafts.get(draftKey) ?? "";
    suggestionRef.current = stored;
    setSuggestion(stored);
  }, [draftKey]);

  function updateSuggestion(value: string) {
    globalAltSuggestionDrafts.set(draftKey, value);
    suggestionRef.current = value;
    setSuggestion(value);
  }

  async function generate() {
    setLoading(true);
    let count = 0;
    const hint = suggestionRef.current.trim().slice(0, SUGGESTION_MAX);
    try {
      for (const mod of v.modules) {
        const modDesktop = mod.assets.find((a) => isImageAsset(a) && !a.moduleItemId);
        const alreadyHasModuleAlt = Boolean(mod.altText && mod.mobileAltText);
        if (modDesktop && (hint || !alreadyHasModuleAlt)) {
          try {
            const alt = await fetchAltText({
              assetId: modDesktop.id,
              currentAlt: hint ? mod.altText || undefined : undefined,
              suggestion: hint || undefined,
            });
            if (alt) {
              await fetch(`/api/aplus2/modules/${mod.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ altText: alt, mobileAltText: alt }),
              });
              count++;
            }
          } catch {
            /* skip */
          }
        }
        for (const item of mod.items ?? []) {
          const itemDesktop = mod.assets.find(
            (a) => isImageAsset(a) && a.moduleItemId === item.id
          );
          if (!itemDesktop) continue;
          const itemAlt =
            typeof item.data.altText === "string" ? item.data.altText : "";
          const itemMobileAlt =
            typeof item.data.mobileAltText === "string" ? item.data.mobileAltText : "";
          if (!hint && itemAlt && itemMobileAlt) continue;
          try {
            const alt = await fetchAltText({
              assetId: itemDesktop.id,
              currentAlt: hint ? itemAlt || undefined : undefined,
              suggestion: hint || undefined,
            });
            if (!alt) continue;
            await fetch(`/api/aplus2/items/${item.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                data: { ...item.data, altText: alt, mobileAltText: alt },
              }),
            });
            count++;
          } catch {
            /* skip */
          }
        }
      }
      toast.success(
        count > 0
          ? `Generated alt text for ${count} image${count > 1 ? "s" : ""}`
          : "All images already have alt text"
      );
      qc.invalidateQueries({ queryKey: ["aplus2-set", setId] });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-w-[148px] flex-1 items-center gap-1.5">
      <Input
        value={suggestion}
        onChange={(e) => updateSuggestion(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (!loading) void generate();
          }
        }}
        placeholder="Edit suggestion"
        maxLength={SUGGESTION_MAX}
        aria-label="Edit suggestion"
        className="h-9 min-w-[148px] flex-1 rounded-full text-[13px] px-3"
      />
      <button
        type="button"
        onClick={() => void generate()}
        disabled={loading}
        className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full bg-brand px-3 text-[13px] font-medium leading-none text-white whitespace-nowrap transition-colors hover:bg-brand-hover disabled:cursor-wait disabled:bg-muted disabled:text-muted-foreground"
      >
        {loading ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Sparkles className="size-3.5 shrink-0" strokeWidth={1.75} />
        )}
        {loading ? "Generating…" : "Generate Alt Text"}
      </button>
    </div>
  );
}
