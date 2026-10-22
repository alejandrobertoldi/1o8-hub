"use client";

import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw } from "lucide-react";
import { DeckView } from "@/components/case-study/kit/deck-view";
import { SlideEditor } from "@/components/case-study/kit/slide-editor";
import { SlideStrip } from "@/components/case-study/kit/slide-strip";
import { CreateDeckDialog } from "@/components/case-study/kit/create-deck-dialog";
import { ExportPdfButton } from "@/components/case-study/kit/export-pdf-button";
import { CaseStudyMeta } from "./page-meta";
import { isEditorOrAbove } from "@/lib/roles";
import { STAGE_LABELS, canTransition, STAGES, type Stage } from "@/lib/case-study/kit/stages";
import type { DeckFormat } from "@/lib/case-study/kit/display";
import type { KitCaseStudy, TrackerCell } from "@/lib/case-study/kit/types";
import type { Blocker } from "@/lib/case-study/kit/slides";

type CaseStudyDetail = KitCaseStudy & { blockers: Blocker[] };
type TeamMember = { id: string; name: string | null; email: string | null };

const FORMAT_LABEL: Record<DeckFormat, string> = { high_level: "High-Level", detailed: "Detailed" };

export default function CaseStudyPage() {
  const { clientIdCode } = useParams<{ clientIdCode: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const readOnly = !isEditorOrAbove(role);

  const format: DeckFormat = searchParams.get("format") === "high_level" ? "high_level" : "detailed";

  const [data, setData] = useState<CaseStudyDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editSectionId, setEditSectionId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [blockersDialogOpen, setBlockersDialogOpen] = useState(false);
  const [stageErrorDialog, setStageErrorDialog] = useState<{ error: string; blockers: Blocker[] } | null>(null);
  const [noAccountBanner, setNoAccountBanner] = useState(false);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (readOnly) return;
    fetch("/api/team").then((r) => (r.ok ? r.json() : [])).then((rows: TeamMember[]) => setTeam(rows)).catch(() => setTeam([]));
  }, [readOnly]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/case-studies?clientIdCode=${clientIdCode}&format=${format}`);
      if (!res.ok) { setData(null); setNotFound(true); return; }
      const summary = (await res.json()) as TrackerCell | (KitCaseStudy & { id: string }) | null;
      if (!summary?.id) { setData(null); setNotFound(true); return; }
      const detail = await fetch(`/api/case-studies/${summary.id}`);
      if (detail.ok) { setData(await detail.json()); setNotFound(false); }
      else { setData(null); setNotFound(true); }
    } catch {
      setData(null);
      setNotFound(true);
      setLoadError("Couldn't load this case study. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [clientIdCode, format]);

  useEffect(() => { load(); }, [load]);

  const handleFormatChange = (nextFormat: DeckFormat) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("format", nextFormat);
    router.push(`?${params.toString()}`);
  };

  const handleStageChange = async (to: Stage) => {
    if (!data) return;
    try {
      const res = await fetch(`/api/case-studies/${data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: to }),
      });
      if (res.status === 409) {
        const json = await res.json().catch(() => ({ error: "Cannot approve", blockers: [] }));
        setStageErrorDialog({ error: json.error ?? "Cannot approve", blockers: json.blockers ?? [] });
        return;
      }
      if (!res.ok) {
        const json = await res.json().catch(() => ({ error: "Failed to change stage" }));
        setStageErrorDialog({ error: json.error ?? "Failed to change stage", blockers: [] });
        return;
      }
      await load();
    } catch {
      alert("Failed to change stage. Check your connection and try again.");
    }
  };

  const handleRefresh = async () => {
    if (!data) return;
    if (!confirm("Re-pull numbers from Redshift and images from Design? Your overrides, copy and manual images are kept.")) return;
    setRefreshing(true);
    try {
      const res = await fetch(`/api/case-studies/${data.id}/refresh`, { method: "POST" });
      if (!res.ok) { alert("Refresh failed. Please try again."); return; }
      const json = await res.json().catch(() => ({}));
      setNoAccountBanner(Boolean(json?.noAccount));
      await load();
    } catch {
      alert("Refresh failed. Check your connection and try again.");
    } finally {
      setRefreshing(false);
    }
  };

  const handleOwnerChange = async (ownerId: string) => {
    if (!data) return;
    try {
      const res = await fetch(`/api/case-studies/${data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId: ownerId === "unassigned" ? null : ownerId }),
      });
      if (!res.ok) { alert("Failed to change owner. Please try again."); return; }
      await load();
    } catch {
      alert("Failed to change owner. Check your connection and try again.");
    }
  };

  const openEditor = (sectionId: string) => { setEditSectionId(sectionId); setEditorOpen(true); };

  if (loading) return <div className="p-8 text-muted-foreground">Loading…</div>;

  if (!data || notFound) {
    return (
      <>
        <CaseStudyMeta />
        <div className="p-8 flex flex-col items-center justify-center gap-4 min-h-[400px]">
          {loadError ? (
            <p className="text-destructive text-sm">{loadError}</p>
          ) : (
            <p className="text-muted-foreground">No {FORMAT_LABEL[format]} case study yet</p>
          )}
          {!readOnly && !loadError && (
            <>
              <Button onClick={() => setCreateOpen(true)}>Create</Button>
              <CreateDeckDialog
                clientIdCode={clientIdCode}
                format={format}
                open={createOpen}
                onOpenChange={setCreateOpen}
                onCreated={() => load()}
              />
            </>
          )}
        </div>
      </>
    );
  }

  const nextStages = STAGES.filter((s) => canTransition(data.stage, s));

  return (
    <>
      <CaseStudyMeta />
      <div>
        <div className="flex items-center justify-between px-6 py-3 border-b bg-card gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-sm">{data.clientName}</span>
            <div className="flex items-center gap-1 text-xs">
              {(["high_level", "detailed"] as DeckFormat[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => handleFormatChange(f)}
                  className={f === format ? "font-bold text-brand" : "text-muted-foreground hover:underline"}
                >
                  {FORMAT_LABEL[f]}
                </button>
              ))}
            </div>
            <Badge variant="outline">{STAGE_LABELS[data.stage]}</Badge>
            {!readOnly && nextStages.length > 0 && (
              <Select onValueChange={(v) => handleStageChange(v as Stage)}>
                <SelectTrigger size="sm" className="h-8 text-xs">
                  <SelectValue placeholder="Move to…" />
                </SelectTrigger>
                <SelectContent>
                  {nextStages.map((s) => (
                    <SelectItem key={s} value={s}>{STAGE_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <span className="text-xs text-muted-foreground">
              {data.dateRangeStart} → {data.dateRangeEnd}
            </span>
            {readOnly ? (
              <span className="text-xs text-muted-foreground">Owner: {data.ownerName ?? "Unassigned"}</span>
            ) : (
              <Select value={data.ownerId ?? "unassigned"} onValueChange={handleOwnerChange}>
                <SelectTrigger size="sm" className="h-8 text-xs">
                  <SelectValue placeholder="Owner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {team.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name ?? m.email ?? m.id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          {!readOnly && (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={handleRefresh} disabled={refreshing}>
                <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? "animate-spin" : ""}`} />
                Refresh data
              </Button>
              <ExportPdfButton
                caseStudyId={data.id}
                stage={data.stage}
                onExported={load}
                onError={(error) => setStageErrorDialog({ error, blockers: [] })}
              />
            </div>
          )}
        </div>
        {noAccountBanner && (
          <div className="px-6 py-2 text-sm bg-amber-50 text-amber-900 border-b border-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-900">
            No Intentwise account linked — every number will need data
          </div>
        )}
        {data.metrics.failed.some((f) => f !== "design") && (
          <div className="px-6 py-2 text-sm bg-amber-50 text-amber-900 border-b border-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-900">
            Redshift didn&apos;t return: {data.metrics.failed.filter((f) => f !== "design").join(", ")} — try Refresh data
          </div>
        )}
        {data.metrics.failed.includes("design") && (
          <div className="px-6 py-2 text-sm bg-amber-50 text-amber-900 border-b border-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-900">
            Design images couldn&apos;t be loaded — try Refresh data
          </div>
        )}
        {data.blockers.length > 0 && (
          <div className="px-6 py-2 text-sm bg-red-50 text-red-700 border-b border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900">
            <button type="button" className="underline" onClick={() => setBlockersDialogOpen(true)}>
              {data.blockers.length} thing{data.blockers.length === 1 ? "" : "s"} to resolve before this deck is ready
            </button>
          </div>
        )}
        <SlideStrip sections={data.sections} />
        <DeckView cs={data} editing={!readOnly} onEditSlide={readOnly ? undefined : openEditor} />
        {!readOnly && editSectionId && (
          <SlideEditor
            key={editSectionId}
            cs={data}
            sectionId={editSectionId}
            open={editorOpen}
            onOpenChange={(o) => { setEditorOpen(o); if (!o) setEditSectionId(null); }}
            onSaved={load}
            readOnly={readOnly}
          />
        )}
      </div>

      <Dialog open={blockersDialogOpen} onOpenChange={setBlockersDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Things to resolve</DialogTitle>
          </DialogHeader>
          <ul className="space-y-1 text-sm list-disc pl-5">
            {data.blockers.map((b, i) => <li key={i}>{b.message}</li>)}
          </ul>
          <DialogFooter>
            <Button onClick={() => setBlockersDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!stageErrorDialog} onOpenChange={(o) => { if (!o) setStageErrorDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{stageErrorDialog?.error}</DialogTitle>
          </DialogHeader>
          {stageErrorDialog && stageErrorDialog.blockers.length > 0 && (
            <ul className="space-y-1 text-sm list-disc pl-5">
              {stageErrorDialog.blockers.map((b, i) => <li key={i}>{b.message}</li>)}
            </ul>
          )}
          <DialogFooter>
            <Button onClick={() => setStageErrorDialog(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
