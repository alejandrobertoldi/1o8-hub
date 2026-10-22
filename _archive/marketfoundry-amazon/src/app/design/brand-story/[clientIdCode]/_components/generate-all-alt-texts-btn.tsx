"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { SUGGESTION_MAX } from "@/lib/brand-story/alt-text-prompt";

const globalAltSuggestionDrafts = new Map<string, string>();

type AssetRef = { driveFileId: string } | null;

type AsinItem = {
  id: string;
  position: number;
  asin: string;
  imageAlt: string;
  asset: AssetRef;
};

type QaItem = {
  id: string;
  position: number;
  question: string;
  answer: string;
};

type Module = {
  id: string;
  type: "asin-showcase" | "focus-image" | "logo-description" | "qa";
  headline: string | null;
  body: string | null;
  imageAlt: string | null;
  brandStoreId: string | null;
  focusAsset: AssetRef;
  logoAsset: AssetRef;
  asinItems: AsinItem[];
  qaItems: QaItem[];
};

export type BulkAltVersion = {
  id: string;
  desktopBgAlt: string;
  mobileBgAlt: string;
  bgDesktop: AssetRef;
  bgMobile: AssetRef;
  modules: Module[];
};

type Job = {
  driveFileId?: string;
  moduleType: string;
  headline?: string;
  body?: string;
  currentAlt?: string;
};

async function fetchAltText(versionId: string, job: Job & { suggestion?: string }) {
  const res = await fetch(
    `/api/design-status/brand-story-versions/${versionId}/ai/alt-text`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        driveFileId: job.driveFileId || undefined,
        moduleType: job.moduleType,
        headline: job.headline || undefined,
        body: job.body || undefined,
        currentAlt: job.currentAlt || undefined,
        suggestion: job.suggestion || undefined,
      }),
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Generation failed");
  return (data.altText as string) ?? "";
}

function collectJobs(v: BulkAltVersion): Job[] {
  const bgJobs: Job[] = [
    {
      driveFileId: v.bgDesktop?.driveFileId,
      moduleType: "bg_desktop",
      currentAlt: v.desktopBgAlt || undefined,
    },
    {
      driveFileId: v.bgMobile?.driveFileId,
      moduleType: "bg_mobile",
      currentAlt: v.mobileBgAlt || undefined,
    },
  ];
  const moduleJobs: Job[] = v.modules.flatMap((m) => {
    if (m.type === "focus-image") {
      return [
        {
          driveFileId: m.focusAsset?.driveFileId,
          moduleType: "focus-image",
          headline: m.headline ?? undefined,
          body: m.body ?? undefined,
          currentAlt: m.imageAlt ?? undefined,
        },
      ];
    }
    if (m.type === "logo-description") {
      return [
        {
          driveFileId: m.logoAsset?.driveFileId,
          moduleType: "logo-description",
          headline: m.headline ?? undefined,
          body: m.body ?? undefined,
          currentAlt: m.imageAlt ?? undefined,
        },
      ];
    }
    if (m.type === "asin-showcase") {
      return m.asinItems.map((it) => ({
        driveFileId: it.asset?.driveFileId,
        moduleType: "asin-showcase",
        currentAlt: it.imageAlt || undefined,
      }));
    }
    return [];
  });
  return [...bgJobs, ...moduleJobs];
}

export function GenerateAllAltTextsBtn({
  v,
  clientIdCode,
}: {
  v: BulkAltVersion;
  clientIdCode: string;
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
    try {
      const hint = suggestionRef.current.trim().slice(0, SUGGESTION_MAX);
      const allJobs = collectJobs(v);
      const results = await Promise.all(
        allJobs.map((j) =>
          fetchAltText(v.id, {
            ...j,
            currentAlt: hint ? j.currentAlt : undefined,
            suggestion: hint || undefined,
          })
        )
      );

      const [bgDesktopAlt, bgMobileAlt, ...moduleAlts] = results;
      let idx = 0;
      const updatedModules = v.modules.map((m) => {
        if (m.type === "focus-image" || m.type === "logo-description") {
          return { ...m, imageAlt: moduleAlts[idx++] };
        }
        if (m.type === "asin-showcase") {
          return {
            ...m,
            asinItems: m.asinItems.map((it) => ({ ...it, imageAlt: moduleAlts[idx++] })),
          };
        }
        return m;
      });

      const patchModules = updatedModules.map((m) => ({
        id: m.id,
        type: m.type,
        headline: m.headline,
        body: m.body,
        imageAlt: m.imageAlt,
        brandStoreId: m.brandStoreId,
        ...(m.type === "asin-showcase"
          ? {
              asinItems: m.asinItems.map((it) => ({
                id: it.id,
                position: it.position,
                asin: it.asin,
                imageAlt: it.imageAlt,
              })),
            }
          : {}),
        ...(m.type === "qa"
          ? {
              qaItems: m.qaItems.map((it) => ({
                id: it.id,
                position: it.position,
                question: it.question,
                answer: it.answer,
              })),
            }
          : {}),
      }));

      const patchRes = await fetch(`/api/design-status/brand-story-versions/${v.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          desktopBgAlt: bgDesktopAlt,
          mobileBgAlt: bgMobileAlt,
          modules: patchModules,
        }),
      });
      if (!patchRes.ok) throw new Error("Failed to save alt texts");

      qc.invalidateQueries({ queryKey: ["brand-story-versions", clientIdCode] });
      toast.success(`${allJobs.length} alt texts generated`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate alt text");
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
        onClick={generate}
        disabled={loading}
        className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full bg-brand px-3 text-[13px] font-medium leading-none text-white transition-colors hover:bg-brand-hover disabled:cursor-wait disabled:bg-muted disabled:text-muted-foreground"
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
