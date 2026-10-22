"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import type { BrandVoiceRecord } from "@/lib/brand-voice/queries";

/** Competitors from the client's Brand Voice (the single place they're edited), read-only on the Overview. */
export function ClientCompetitors({ clientIdCode }: { clientIdCode: string }) {
  const { data } = useQuery<BrandVoiceRecord>({
    queryKey: ["brand-voice", clientIdCode],
    queryFn: async () => (await fetch(`/api/clients/${encodeURIComponent(clientIdCode)}/brand-voice`)).json(),
  });
  const list = (data?.voice.competitors ?? []).filter((c) => c.name.trim() || c.url.trim());
  const editHref = `/clients/${encodeURIComponent(clientIdCode)}/brand-voice`;

  return (
    <div className="rounded-xl border bg-card text-card-foreground">
      <div className="flex items-center justify-between border-b border-border/50 px-5 py-3">
        <h3 className="text-sm font-semibold">Competitors</h3>
        <Link href={editHref} className="text-xs text-brand hover:underline">
          Edit in Brand Voice →
        </Link>
      </div>
      <div className="px-5 py-4">
        {!data ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : list.length ? (
          <ul className="flex flex-wrap gap-2">
            {list.map((c, i) => (
              <li key={i}>
                {c.url ? (
                  <a href={c.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs hover:border-brand hover:text-brand">
                    {c.name || c.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                    <ExternalLink className="size-3" />
                  </a>
                ) : (
                  <span className="rounded-full border px-2.5 py-1 text-xs">{c.name}</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No competitors yet. Add them in{" "}
            <Link href={editHref} className="text-brand hover:underline">
              Brand Voice
            </Link>
            .
          </p>
        )}
      </div>
    </div>
  );
}
