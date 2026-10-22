"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { parseEditNote } from "@/lib/seo/revision-edit";
import { stageLabel } from "@/lib/seo/revision-rules";
import { FIELD_LABELS } from "@/lib/seo/revision-fields";

interface Rev { id: string; revisionNumber: number; status: string; submittedAt?: string; isCurrent: boolean }
interface State { revisions: Rev[]; open: Rev | null; current: Rev | null; approvers: { pm: { name: string; email: string | null } | null; am: { name: string; email: string | null } | null }; canSubmit?: boolean; displayId?: string | null; pushed?: boolean }

export function RevisionStrip({ projectId, refreshKey, onOpenChange, onCurrentChange, onOpenReview, onLatestChange, onPushedChange, compact = false }: {
  projectId: string; refreshKey: number;
  onOpenChange: (open: boolean) => void;
  onCurrentChange: (current: { id: string; revisionNumber: number } | null) => void;
  /** Embedded in S6.9: "Open review" / History show a revision in place instead of navigating. */
  onOpenReview?: (revisionId: string) => void;
  /** Reports the newest revision id (null when there is none). */
  onLatestChange?: (revisionId: string | null) => void;
  /** Whether S8 content was ever pushed for this project (keeps the S8 tick after a reload). */
  onPushedChange?: (pushed: boolean) => void;
  /** Inside S6.9 (the review panel shows status + history): render only warnings, Submit and comments to address. */
  compact?: boolean;
}) {
  const [state, setState] = useState<State | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [openComments, setOpenComments] = useState<Array<{ id: string; asin: string; fieldKey: string; authorName: string | null; body: string; resolvedAt: string | null }>>([]);
  const [commentsKey, setCommentsKey] = useState(0);
  const [error, setError] = useState(false);
  const [commentsError, setCommentsError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    // Fail CLOSED: any failure reads as "a revision may be open" so S6 stays locked.
    fetch(`/api/seo/projects/${projectId}/revisions`).then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const s = await r.json();
      if (!s || !Array.isArray(s.revisions)) throw new Error("Bad revisions body");
      return s as State;
    }).then((s) => {
      if (!alive) return;
      setError(false);
      setState(s);
      onOpenChange(!!s.open);
      onCurrentChange(s.current ? { id: s.current.id, revisionNumber: s.current.revisionNumber } : null);
      onPushedChange?.(!!s.pushed);
    }).catch(() => {
      if (!alive) return;
      setError(true);
      onOpenChange(true);
      onCurrentChange(null);
    });
    return () => { alive = false; };
  }, [projectId, refreshKey, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // After "changes requested" the specialist works through that revision's comments here in S6 (spec §5).
  // A closed duplicate of the approved text has nothing to address: show the approved revision instead.
  const newestId = state ? (state.displayId !== undefined ? state.displayId : state.revisions[0]?.id ?? null) : null;
  const latestId = state?.revisions[0]?.status === "changes_requested" && state.revisions[0].id === newestId ? state.revisions[0].id : null;
  useEffect(() => { if (state) onLatestChange?.(newestId); }, [state, newestId, onLatestChange]);
  useEffect(() => {
    if (!latestId) { setOpenComments([]); return; }
    let alive = true;
    fetch(`/api/seo/revisions/${latestId}`).then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }).then((d) => { if (alive) { setCommentsError(false); setOpenComments(Array.isArray(d?.comments) ? d.comments.filter((c: { body: string }) => !parseEditNote(c.body)) : []); } })
      .catch(() => { if (alive) { setCommentsError(true); setOpenComments([]); } });
    return () => { alive = false; };
  }, [latestId, commentsKey]);

  if (error) {
    return (
      <div className="mb-4 rounded-xl border border-border bg-card px-4 py-3 text-xs">
        <span className="text-red-500">Could not load review status — reload the page</span>
      </div>
    );
  }
  async function submit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const r = await fetch(`/api/seo/projects/${projectId}/revisions`, { method: "POST" });
      if (!r.ok) {
        const d = await r.json().catch(() => null);
        setSubmitError(d?.error || `Could not submit (HTTP ${r.status})`);
      } else {
        setReloadKey((n) => n + 1);
      }
    } catch {
      setSubmitError("Could not submit — check your connection");
    } finally {
      setSubmitting(false);
    }
  }
  const submitControl = state?.canSubmit ? (
    <>
      <button type="button" disabled={submitting} onClick={submit} className="rounded-md bg-foreground px-3 py-1 font-bold text-background disabled:opacity-50">
        {submitting ? "Submitting…" : "Submit for review"}
      </button>
      {submitError && <span className="text-red-500">{submitError}</span>}
    </>
  ) : null;
  if (!state) return null;
  if (state.revisions.length === 0) {
    if (!submitControl) return null;
    return <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-xs">{submitControl}</div>;
  }
  const latest = state.revisions[0];
  const who = latest.status === "pm_review" ? state.approvers.pm : latest.status === "am_review" ? state.approvers.am : null;
  const waiting = latest.status === "client_review" ? "the client"
    : who?.email ? who.name
    : who ? null
    : latest.status === "pm_review" || latest.status === "am_review" ? null : undefined;

  const missingApprover = (latest.status === "pm_review" || latest.status === "am_review") && (!who || !who.email);
  const hasComments = !!latestId && (commentsError || openComments.length > 0);
  if (compact && !submitControl && !missingApprover && !hasComments) return null;

  return (
    <div className="mb-4 rounded-xl border border-border bg-card px-4 py-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        {!compact && <span className="font-bold">r{latest.revisionNumber} · {stageLabel(latest.status)}{waiting ? ` · waiting for ${waiting}` : ""}</span>}
        {who && !who.email && <span className="text-red-500">No user matched &quot;{who.name}&quot; in the client team — an Owner/Super Admin must decide</span>}
        {(latest.status === "pm_review" || latest.status === "am_review") && !who && <span className="text-red-500">No {latest.status === "pm_review" ? "PM" : "AM"} set for this client — an Owner/Super Admin must decide</span>}
        {!compact && state.current && <span className="text-emerald-600">Approved text: r{state.current.revisionNumber}</span>}
        {submitControl}
        {compact ? null : onOpenReview
          ? <button type="button" onClick={() => onOpenReview(latest.id)} className="ml-auto font-bold underline">Open review</button>
          : <Link href={`/seo/${projectId}/review/${latest.id}`} className="ml-auto font-bold underline">Open review</Link>}
        {!compact && <button type="button" onClick={() => setShowHistory((v) => !v)} className="text-muted-foreground underline">{showHistory ? "Hide history" : "History"}</button>}
      </div>
      {latestId && commentsError && <p className="mt-3 text-red-500">Could not load comments</p>}
      {latestId && openComments.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="font-bold">Comments to address ({openComments.filter((c) => !c.resolvedAt).length} open) — unresolved ones carry over to the next round</p>
          {Object.entries(openComments.reduce<Record<string, typeof openComments>>((g, c) => { (g[c.asin] ??= []).push(c); return g; }, {})).map(([asin, list]) => (
            <div key={asin}>
              <p className="font-mono text-[10px] text-muted-foreground">{asin}</p>
              {list.map((c) => (
                <label key={c.id} className="flex items-start gap-2 py-0.5">
                  <input type="checkbox" checked={!!c.resolvedAt} onChange={async (e) => {
                    await fetch(`/api/seo/revisions/${latestId}/comments`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ commentId: c.id, resolved: e.target.checked }) });
                    setCommentsKey((n) => n + 1);
                  }} />
                  <span className={c.resolvedAt ? "line-through opacity-60" : ""}><b>{FIELD_LABELS[c.fieldKey] ?? c.fieldKey}</b> · {c.authorName ?? "—"}: {c.body}</span>
                </label>
              ))}
            </div>
          ))}
        </div>
      )}
      {showHistory && (
        <ul className="mt-2 space-y-1">
          {state.revisions.map((r) => (
            <li key={r.id}>{onOpenReview
              ? <button type="button" onClick={() => onOpenReview(r.id)} className="hover:underline">r{r.revisionNumber} · {stageLabel(r.status)}{r.isCurrent ? " · current approved" : ""}</button>
              : <Link href={`/seo/${projectId}/review/${r.id}`} className="hover:underline">r{r.revisionNumber} · {stageLabel(r.status)}{r.isCurrent ? " · current approved" : ""}</Link>}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
