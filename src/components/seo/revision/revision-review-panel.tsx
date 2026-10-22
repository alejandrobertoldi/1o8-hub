"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import type { Product } from "@/lib/db/schema";
import { stageLabel, type RevisionAction } from "@/lib/seo/revision-rules";
import { FIELD_LABELS } from "@/lib/seo/revision-fields";
import { RevisionPreview } from "@/components/seo/revision/revision-preview";
import { CommentThread } from "@/components/seo/revision/comment-thread";
import { ReviewTracker } from "@/components/seo/revision/review-tracker";
import { highlightKeywords, keywordTierMap } from "@/components/seo/highlight-keywords";
import { canEditRevision, parseEditNote } from "@/lib/seo/revision-edit";

interface Detail {
  revision: { id: string; revisionNumber: number; status: string; content: Record<string, Record<string, string>>; submittedByName: string | null };
  project: { id: string; name: string; clientName?: string | null };
  products: Product[];
  listingImages?: Record<string, Record<string, string>>;
  comments: Array<{ id: string; asin: string; fieldKey: string; authorName: string | null; body: string; createdAt: string; resolvedAt: string | null; audience: string }>;
  previousOpenComments: Array<{ id: string; asin: string; fieldKey: string; authorName: string | null; body: string }>;
  events: Array<{ id: string; step: string; action: string; actorName: string | null; actedAs: string; note: string | null; createdAt: string }>;
  approvers: { pm: { name: string; email: string | null } | null; am: { name: string; email: string | null } | null };
  me: { step: string | null; actedAs: "assigned" | "override" | null; actions: RevisionAction[] };
}

/** The staff review of one revision — used by the review page and inline in S6.9. */
export function RevisionReviewPanel({ projectId: id, revisionId, embedded = false, onDecided, onContentEdited }: {
  projectId: string; revisionId: string;
  /** Inside the S6.9 card: no page padding, no "Back to S6" link. */
  embedded?: boolean;
  /** Called after an approve / request-changes decision (S6.9 refreshes its revision bar). */
  onDecided?: () => void;
  /** Called after a field is edited in place (S6 updates its own rows to match). */
  onContentEdited?: (asin: string, key: string, value: string) => void;
}) {
  const [data, setData] = useState<Detail | null>(null);
  const [field, setField] = useState<{ asin: string; key: string } | null>(null);
  const load = useCallback(async () => {
    const res = await fetch(`/api/seo/revisions/${revisionId}`);
    if (res.ok) setData(await res.json());
    else toast.error((await res.json().catch(() => ({}))).error ?? "Could not load the revision");
  }, [revisionId]);
  useEffect(() => { void load(); }, [load]);
  // The project's S2 keywords — highlighted in red on the preview, as in S6
  const [kwMap, setKwMap] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    let alive = true;
    fetch(`/api/seo/projects/${id}/load?phase=s2_keywords`).then((r) => (r.ok ? r.json() : null))
      .then((s2) => { if (alive && s2) setKwMap(keywordTierMap(s2.keywords ?? [])); }).catch(() => {});
    return () => { alive = false; };
  }, [id]);
  const highlightText = useCallback((text: string) => highlightKeywords(text, kwMap, undefined, true), [kwMap]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    // Badges count open comments only
    // Edit notes are a log, not open questions — never counted (covers notes logged before they were auto-resolved)
    for (const m of data?.comments ?? []) if (!m.resolvedAt && !parseEditNote(m.body)) c[`${m.asin}::${m.fieldKey}`] = (c[`${m.asin}::${m.fieldKey}`] ?? 0) + 1;
    return c;
  }, [data]);

  if (!data) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  const { revision, project, me, approvers } = data;
  const thread = field ? data.comments.filter((c) => c.asin === field.asin && c.fieldKey === field.key) : [];

  return (
    <div className={embedded ? "space-y-4" : "mx-auto max-w-7xl space-y-4 p-6"}>
      <div className="flex flex-wrap items-baseline gap-3">
        {!embedded && <Link href={`/seo/${id}/seo`} className="text-xs text-muted-foreground hover:underline">← Back to S6</Link>}
        <h1 className={embedded ? "text-sm font-bold" : "text-xl font-bold"}>{project.name} · r{revision.revisionNumber}</h1>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold">{stageLabel(revision.status)}</span>
        <span className="text-xs text-muted-foreground">submitted by {revision.submittedByName ?? "—"}</span>
      </div>

      <RevisionPreview products={data.products} content={revision.content} familyEnabled selectedField={field}
        onSelectField={(asin, key) => setField({ asin, key })} onCloseField={() => setField(null)}
        renderThread={() => field && (
            <CommentThread
              comments={thread.map((c) => ({ id: c.id, authorName: c.authorName, body: c.body, createdAt: c.createdAt, resolved: !!c.resolvedAt, audience: c.audience }))}
              allowAudience readOnly={false}
              currentText={revision.content[field.asin]?.[field.key]}
              onAcceptSuggestion={async (commentId) => {
                const res = await fetch(`/api/seo/revisions/${revisionId}/content`, { method: "PATCH", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ asin: field.asin, fieldKey: field.key, acceptSuggestionId: commentId }) });
                if (!res.ok) { toast.error((await res.json().catch(() => ({}))).error ?? "Could not accept"); await load(); return; }
                await load();
                const fresh = await fetch(`/api/seo/revisions/${revisionId}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
                const v = fresh?.revision?.content?.[field.asin]?.[field.key];
                if (typeof v === "string") onContentEdited?.(field.asin, field.key, v);
                toast.success("Suggestion accepted");
              }}
              onDeclineSuggestion={async (commentId) => {
                await fetch(`/api/seo/revisions/${revisionId}/comments`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ commentId, resolved: true }) });
                await load();
              }}
              onAdd={async (body, audience) => {
                const res = await fetch(`/api/seo/revisions/${revisionId}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ asin: field.asin, fieldKey: field.key, body, audience }) });
                if (!res.ok) toast.error((await res.json().catch(() => ({}))).error ?? "Comment failed");
                await load();
              }}
              onResolve={async (commentId, resolved) => {
                await fetch(`/api/seo/revisions/${revisionId}/comments`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ commentId, resolved }) });
                await load();
              }}
            />
        )}
        highlightText={kwMap.size ? highlightText : undefined}
        canEdit={canEditRevision(revision.status)}
        onEditField={async (asin, key, value) => {
          const res = await fetch(`/api/seo/revisions/${revisionId}/content`, { method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ asin, fieldKey: key, value, expectedValue: revision.content[asin]?.[key] ?? "" }) });
          if (!res.ok) { toast.error((await res.json().catch(() => ({}))).error ?? "Edit failed"); await load(); return; }
          await load();
          onContentEdited?.(asin, key, value);
          toast.success("Edit saved");
        }}
        commentCounts={counts} tone="hub" storeName={project.clientName} listingImages={data.listingImages} />


      {data.previousOpenComments.length > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-xs">
          <p className="mb-2 font-bold">Still open from r{revision.revisionNumber - 1}</p>
          <ul className="space-y-1">
            {data.previousOpenComments.map((c) => (
              <li key={c.id}>{c.asin} · {FIELD_LABELS[c.fieldKey] ?? c.fieldKey} · {c.authorName ?? "—"}: {c.body}</li>
            ))}
          </ul>
        </div>
      )}

      <ReviewTracker status={revision.status} events={data.events} approvers={approvers} me={me}
        onDecide={async (action, note) => {
          const res = await fetch(`/api/seo/revisions/${revisionId}/decision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, expectedStatus: revision.status, note }) });
          if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Decision failed");
          await load();
          onDecided?.();
        }} />
    </div>
  );
}
