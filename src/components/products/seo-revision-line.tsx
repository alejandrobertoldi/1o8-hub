"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface Push { projectName: string; projectId: string; revisionId: string | null; revisionNumber: number | null; approvedAt: string | null; approvedByName?: string | null; finalVia: string | null; pushedAt: string; pushedBy: string; overrideReason: string | null }

export function SeoRevisionLine({ productId }: { productId: string }) {
  const [push, setPush] = useState<Push | null>(null);
  useEffect(() => {
    let alive = true;
    setPush(null);
    fetch(`/api/products/${productId}/seo-revision`).then((r) => (r.ok ? r.json() : { push: null })).then((b) => { if (alive) setPush(b.push); }).catch(() => {});
    return () => { alive = false; };
  }, [productId]);
  if (!push) return null;
  const pushed = `pushed ${push.pushedAt.slice(0, 10)} by ${push.pushedBy}`;
  const text = push.revisionId
    ? `SEO: ${push.projectName} r${push.revisionNumber} · approved ${push.approvedAt?.slice(0, 10) ?? "—"}${push.approvedByName ? ` by ${push.approvedByName}` : ""} (${push.finalVia === "client" ? "client" : "AM final"}) · ${pushed}`
    : `SEO: ${push.projectName} · pushed without review (${push.overrideReason}) · ${pushed}`;
  return push.revisionId
    ? <Link href={`/seo/${push.projectId}/review/${push.revisionId}`} className="text-xs text-muted-foreground hover:underline">{text}</Link>
    : <p className="text-xs text-muted-foreground">{text}</p>;
}
