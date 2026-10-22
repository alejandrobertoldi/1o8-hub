"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink, Loader2 } from "lucide-react";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WEB_SOCIAL_FIELDS, normalizeSocial, type WebSocialKey } from "@/lib/clients/web-social";

const META = (
  <h1 className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none" aria-label="Website & Social">
    <span className="font-bold text-sidebar-foreground">Website</span>
    <span className="font-normal text-brand">&nbsp;&amp; Social</span>
  </h1>
);

/** Client Settings → Website & Social: the brand's site and social accounts. */
export function WebSocialPage({
  clientIdCode,
  clientName,
  initial,
  readOnly,
}: {
  clientIdCode: string;
  clientName: string;
  initial: Record<string, string>;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);
  const dirty = WEB_SOCIAL_FIELDS.filter((f) => (values[f.key] ?? "") !== (saved[f.key] ?? ""));

  const save = async () => {
    setSaving(true);
    try {
      const next = { ...saved };
      // One PUT per changed field: the client route writes a single raw key and logs it in the activity feed.
      for (const f of dirty) {
        const value = normalizeSocial(f.key as WebSocialKey, values[f.key] ?? "");
        const res = await fetch(`/api/clients/${encodeURIComponent(clientIdCode)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ field: f.key, value }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Could not save ${f.label}`);
        next[f.key] = value;
      }
      setSaved(next);
      setValues(next);
      toast.success("Saved");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-6">
      <PageMetaSlot>{META}</PageMetaSlot>
      <p className="text-sm text-muted-foreground">
        {clientName} · where the brand lives online. Used across the hub and by writers and AI for links and references.
      </p>
      <section className="rounded-xl border bg-card">
        <header className="flex items-start gap-3 border-b px-5 py-4">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-brand-foreground">1</span>
          <div>
            <h2 className="font-bold">Website and social accounts</h2>
            <p className="text-sm text-muted-foreground">Paste a full link, a handle (@brand) or a domain; it&apos;s saved as a link.</p>
          </div>
        </header>
        <fieldset disabled={readOnly || saving} className="grid gap-4 px-5 py-4 sm:grid-cols-2">
          {WEB_SOCIAL_FIELDS.map((f) => {
            const v = values[f.key] ?? "";
            const href = v ? normalizeSocial(f.key, v) : "";
            return (
              <label key={f.key} className="grid content-start gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{f.label}</span>
                <div className="flex items-center gap-2">
                  <Input value={v} placeholder={f.placeholder} onChange={(e) => setValues((s) => ({ ...s, [f.key]: e.target.value }))} />
                  {href && (
                    <a href={href} target="_blank" rel="noreferrer" aria-label={`Open ${f.label}`} className="shrink-0 text-muted-foreground hover:text-brand">
                      <ExternalLink className="size-4" />
                    </a>
                  )}
                </div>
              </label>
            );
          })}
        </fieldset>
      </section>
      {!readOnly && (
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={!dirty.length || saving} onClick={() => setValues(saved)}>
            Discard
          </Button>
          <Button variant="brand" disabled={!dirty.length || saving} onClick={save}>
            {saving && <Loader2 className="size-4 animate-spin" />} Save{dirty.length ? ` (${dirty.length})` : ""}
          </Button>
        </div>
      )}
    </div>
  );
}
