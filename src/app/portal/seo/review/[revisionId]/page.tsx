"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import type { Product } from "@/lib/db/schema";
import { RevisionPreview } from "@/components/seo/revision/revision-preview";
import { CommentThread } from "@/components/seo/revision/comment-thread";
import { DecisionBar } from "@/components/seo/revision/decision-bar";
import { highlightKeywords, keywordTierMap } from "@/components/seo/highlight-keywords";
import { suggestionNote } from "@/lib/seo/revision-edit";

interface ClientRevision {
  id: string; revisionNumber: number; status: string; projectName: string; submittedAt: string;
  content: Record<string, Record<string, string>>;
  comments: Array<{ id: string; asin: string; fieldKey: string; authorName: string | null; body: string; createdAt: string; resolved: boolean }>;
  decision: { at: string; byName: string | null; action: string } | null;
}

export default function PortalSeoReviewPage({ params }: { params: Promise<{ revisionId: string }> }) {
  const [revisionId, setRevisionId] = useState<string | null>(null);
  useEffect(() => { void params.then((p) => setRevisionId(p.revisionId)); }, [params]);
  const [rev, setRev] = useState<ClientRevision | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [clientName, setClientName] = useState<string | null>(null);
  const [listingImages, setListingImages] = useState<Record<string, Record<string, string>>>({});
  const [kwMap, setKwMap] = useState<Map<string, number>>(new Map());
  const [field, setField] = useState<{ asin: string; key: string } | null>(null);
  const load = useCallback(async () => {
    if (!revisionId) return;
    const res = await fetch(`/api/portal/seo/revisions/${revisionId}`);
    if (!res.ok) { toast.error((await res.json().catch(() => ({}))).error ?? "Could not load"); return; }
    const body = await res.json();
    setRev(body.revision);
    // The API sends a client-safe subset of Product (see toClientProduct); the read-only PDP only reads those fields.
    setProducts((body.products ?? []) as Product[]);
    setClientName(body.clientName ?? null);
    setListingImages(body.listingImages ?? {});
    setKwMap(keywordTierMap(body.keywords ?? []));
  }, [revisionId]);
  useEffect(() => { void load(); }, [load]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const m of rev?.comments ?? []) if (!m.resolved) c[`${m.asin}::${m.fieldKey}`] = (c[`${m.asin}::${m.fieldKey}`] ?? 0) + 1;
    return c;
  }, [rev]);

  if (!rev) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  const open = rev.status === "client_review";
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <Link href="/portal/seo" className="text-xs text-muted-foreground hover:underline">← Back</Link>
      <h1 className="text-xl">
        <span className="font-bold text-foreground">Review</span>{" "}
        <span className="font-normal text-portal-accent">{rev.projectName}</span> · r{rev.revisionNumber}
      </h1>
      <RevisionPreview products={products} content={rev.content} familyEnabled={false} selectedField={field}
        onSelectField={(asin, key) => setField({ asin, key })} onCloseField={() => setField(null)}
        renderThread={() => field && (
          <CommentThread comments={rev.comments.filter((c) => c.asin === field.asin && c.fieldKey === field.key)} allowAudience={false} readOnly={!open}
            currentText={rev.content[field.asin]?.[field.key]}
            onAdd={async (body) => {
              const res = await fetch(`/api/portal/seo/revisions/${revisionId}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ asin: field.asin, fieldKey: field.key, body }) });
              if (!res.ok) toast.error((await res.json().catch(() => ({}))).error ?? "Comment failed");
              await load();
            }} />
        )}
        highlightText={kwMap.size ? (t) => highlightKeywords(t, kwMap, undefined, true) : undefined}
        listingImages={listingImages}
        canEdit={open} editMode="suggest"
        onEditField={async (asin, key, value) => {
          const before = rev.content[asin]?.[key] ?? "";
          const res = await fetch(`/api/portal/seo/revisions/${revisionId}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ asin, fieldKey: key, body: suggestionNote(before, value) }) });
          if (!res.ok) { toast.error((await res.json().catch(() => ({}))).error ?? "Could not send your suggestion"); return; }
          toast.success("Suggestion sent — our team will review it");
          await load();
        }}
        commentCounts={counts} tone="portal" storeName={clientName} />
      {open ? (
        <DecisionBar actions={["approve", "request_changes"]} actedAs="client" waitingFor={null}
          onDecide={async (action, note) => {
            const res = await fetch(`/api/portal/seo/revisions/${revisionId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, expectedStatus: "client_review", note }) });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Something went wrong");
            await load();
          }} />
      ) : rev.decision ? (
        <p className="text-sm">{rev.decision.action === "approve" ? "Approved" : "Changes requested"} by {rev.decision.byName ?? "—"} · {rev.decision.at.slice(0, 10)}</p>
      ) : null}
    </div>
  );
}
