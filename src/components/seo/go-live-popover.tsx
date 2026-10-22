"use client";

import { useEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { ProjectStatus } from "@/lib/seo-pipeline-types";

interface AsinState {
  asin: string;
  status: "live" | "deprecated" | null;
  liveDate: string | null;
  deprecatedDate: string | null;
  deprecatedByProjectName: string | null;
}
interface LiveInfo { version: number | null; asins: AsinState[]; liveCount: number; total: number }

/** Fixed-position coordinates for the portaled popover, right-aligned under the pill. */
export interface GoLiveAnchor {
  top: number;
  right: number;
}

interface GoLivePopoverProps {
  projectId: string;
  anchor: GoLiveAnchor;
  /** Ref the parent's outside-click hook also checks, since this content lives
   * outside the parent's own DOM subtree once portaled. */
  portalRef: RefObject<HTMLDivElement | null>;
  onUpdated: (s: ProjectStatus) => void;
}

export function GoLivePopover({ projectId, anchor, portalRef, onUpdated }: GoLivePopoverProps) {
  // SSR-safe: document.body only exists on the client.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [info, setInfo] = useState<LiveInfo | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch(`/api/seo/projects/${projectId}/live`);
    if (!res.ok) { toast.error("Could not load go-live state"); return; }
    setInfo(await res.json());
  }
  useEffect(() => { void load(); }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function send(method: "POST" | "DELETE") {
    if (picked.size === 0 || saving) return;
    if (method === "POST" && !/^\d{4}-\d{2}-\d{2}$/.test(date)) { toast.error("Pick a go-live date"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/seo/projects/${projectId}/live`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(method === "POST" ? { asins: [...picked], liveDate: date } : { asins: [...picked] }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const extra = Array.isArray(body.missing) && body.missing.length ? `: ${body.missing.join(", ")}` : "";
        throw new Error(`${body.error || "Save failed"}${extra}`);
      }
      onUpdated(body.status as ProjectStatus);
      setPicked(new Set());
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (!mounted) return null;

  const tag = info?.version == null ? "no version" : `V${String(info.version).padStart(2, "0")}`;
  const body = !info ? (
    <div className="p-3"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>
  ) : (
    <div className="w-72 space-y-2 p-3 text-xs">
      <p className="font-semibold">Go live · {tag} · {info.liveCount}/{info.total} ASINs live</p>
      <ul className="max-h-48 space-y-1 overflow-y-auto">
        {info.asins.map((a) => (
          <li key={a.asin} className="flex items-center gap-2">
            <input
              type="checkbox"
              aria-label={`Select ${a.asin}`}
              checked={picked.has(a.asin)}
              onChange={(e) => setPicked((prev) => { const n = new Set(prev); if (e.target.checked) n.add(a.asin); else n.delete(a.asin); return n; })}
            />
            <span className="font-mono">{a.asin}</span>
            <span className="text-muted-foreground">
              {a.status === "live" ? `live ${a.liveDate}` : a.status === "deprecated" ? `deprecated ${a.deprecatedDate}${a.deprecatedByProjectName ? ` by ${a.deprecatedByProjectName}` : ""}` : "not live"}
            </span>
          </li>
        ))}
      </ul>
      <input
        type="date"
        aria-label="Go-live date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") void send("POST"); }}
        className="w-full rounded-md border border-stone-300 px-3 py-1 dark:border-zinc-700 dark:bg-zinc-900"
      />
      <div className="flex gap-2">
        <button type="button" disabled={saving || picked.size === 0} onClick={() => void send("POST")} className="rounded-full bg-brand px-3 py-1 font-semibold text-brand-foreground disabled:opacity-50">
          Mark live
        </button>
        <button type="button" disabled={saving || picked.size === 0} onClick={() => void send("DELETE")} className="rounded-full border border-stone-300 px-3 py-1 disabled:opacity-50 dark:border-zinc-700">
          Mark not live
        </button>
        {saving && <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-label="Saving" />}
      </div>
    </div>
  );

  // Portaled to document.body so this popover is no longer a DOM descendant of
  // the project card's <a> (I1 fix) — a click in the date input could
  // otherwise fall through to the anchor's native navigation. React still
  // bubbles synthetic events through the portal to React ancestors, so
  // stopPropagation here still keeps the click from reaching the card.
  return createPortal(
    <div
      ref={portalRef}
      style={{ position: "fixed", top: anchor.top, right: anchor.right }}
      className="z-50 rounded-lg border border-stone-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
      onClick={(e) => e.stopPropagation()}
    >
      {body}
    </div>,
    document.body,
  );
}
