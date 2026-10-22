"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

type Source = { projectId: string; projectName: string; asin: string; asinId: string; pairCount: number };

export function Aplus2QaPopulate({ moduleId }: { moduleId: string }) {
  const [projectId, setProjectId] = useState("");
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["aplus2-qa-sources", moduleId],
    queryFn: async () => {
      const r = await fetch(`/api/aplus2/modules/${moduleId}/seo-qa-sources`);
      const d = await r.json();
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Failed");
      return (d as { sources: Source[] }).sources;
    },
  });
  const sources = data ?? [];

  const populateMut = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/aplus2/modules/${moduleId}/populate-qa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Failed");
      return d as { items: unknown[]; truncated: boolean };
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["aplus2-set"] });
      toast.success(
        `Loaded ${d.items.length} Q&A pair${d.items.length === 1 ? "" : "s"} from SEO` +
          (d.truncated ? " (some text truncated to fit limits)" : "")
      );
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed"),
  });

  if (!isLoading && sources.length === 0) {
    return <span className="text-[11px] text-muted-foreground">No SEO Q&A available for this client.</span>;
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={projectId} onValueChange={setProjectId}>
        <SelectTrigger className="h-7 text-xs w-[280px]">
          <SelectValue placeholder={isLoading ? "Loading…" : "Select SEO project…"} />
        </SelectTrigger>
        <SelectContent>
          {sources.map((s) => (
            <SelectItem key={s.projectId} value={s.projectId} className="text-xs">
              {s.projectName} · {s.asin} · {s.pairCount} pairs
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs"
        disabled={!projectId || populateMut.isPending}
        onClick={() => {
          if (confirm("Replace the current Q&A pairs with SEO content?")) populateMut.mutate();
        }}
      >
        <Sparkles className="size-3 mr-1" /> Populate from SEO
      </Button>
    </div>
  );
}
