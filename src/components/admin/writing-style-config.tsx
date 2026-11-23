"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";

type StyleGuide = { text: string; defaultText: string; reportRules: string; updatedAt: string | null; updatedBy: string | null; isDefault: boolean };

/**
 * 1o8's writing style guide, used by Claude when it writes client reports.
 * Starts as the SEO blog tool's default guide; blog-only sections (hooks,
 * SEO, CTAs) are left out of the report prompt automatically.
 */
export function WritingStyleConfig() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<StyleGuide>({
    queryKey: ["writing-style"],
    queryFn: async () => {
      const res = await fetch("/api/admin/writing-style");
      if (!res.ok) throw new Error("Could not load the style guide");
      return res.json();
    },
  });
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? data?.text ?? "";
  const save = useMutation({
    mutationFn: async (value: string) => {
      const res = await fetch("/api/admin/writing-style", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: value }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Could not save");
    },
    onSuccess: () => {
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["writing-style"] });
    },
  });

  if (isLoading || !data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const dirty = draft !== null && draft !== data.text;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl text-sm text-muted-foreground">
          <p>
            Claude follows this guide when it writes client monthly reports. It started as the default guide of the 1o8 SEO blog tool.
            Sections about intros and hooks, SEO and CTAs only apply to blog posts, so the report writer skips them.
          </p>
          <p className="mt-1 text-xs">
            {data.isDefault ? "Using the default guide." : `Last saved ${data.updatedAt ? new Date(data.updatedAt).toLocaleDateString("en-US") : ""}${data.updatedBy ? ` by ${data.updatedBy}` : ""}.`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setDraft(data.defaultText)} disabled={text === data.defaultText}>
            <RotateCcw className="size-4" /> Default
          </Button>
          <Button size="sm" onClick={() => save.mutate(text)} disabled={!dirty || save.isPending}>
            {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save
          </Button>
        </div>
      </div>
      {save.error && <p className="text-sm text-red-500">{(save.error as Error).message}</p>}
      <textarea
        aria-label="Writing style guide (Markdown)"
        value={text}
        onChange={(e) => setDraft(e.target.value)}
        spellCheck
        className="h-[60vh] w-full resize-y rounded-lg border bg-card p-4 font-mono text-[12.5px] leading-relaxed outline-none focus:border-brand"
      />
      <details className="rounded-lg border bg-card p-3 text-sm">
        <summary className="cursor-pointer font-semibold">What the report writer uses</summary>
        <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap text-[12px] text-muted-foreground">{data.reportRules}</pre>
      </details>
    </div>
  );
}
