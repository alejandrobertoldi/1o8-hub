"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  KEYWORD_INTENTS,
  KEYWORD_PRIORITIES,
  PERSONALITY_TRAITS,
  brandVoiceCompleteness,
  type BrandVoice,
} from "@/lib/brand-voice/types";
import type { BrandVoiceRecord } from "@/lib/brand-voice/queries";

type Props = {
  clientIdCode: string;
  brandName: string | null;
  brandUrl: string | null;
  initial: BrandVoiceRecord;
  readOnly: boolean;
};

// One entry per line <-> string[]
const toLines = (a: string[]) => a.join("\n");
const fromLines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);

export default function BrandVoicePage({ clientIdCode, brandName, brandUrl, initial, readOnly }: Props) {
  const [voice, setVoice] = useState<BrandVoice>(initial.voice);
  const [saved, setSaved] = useState<BrandVoice>(initial.voice);
  const [meta, setMeta] = useState({ source: initial.source, updatedAt: initial.updatedAt, updatedBy: initial.updatedBy });
  const [saving, setSaving] = useState(false);

  const dirty = useMemo(() => JSON.stringify(voice) !== JSON.stringify(saved), [voice, saved]);
  const completeness = brandVoiceCompleteness(voice);
  const set = <K extends keyof BrandVoice>(key: K, value: BrandVoice[K]) => setVoice((v) => ({ ...v, [key]: value }));

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${encodeURIComponent(clientIdCode)}/brand-voice`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(voice),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Save failed (${res.status})`);
      setVoice(body.voice);
      setSaved(body.voice);
      setMeta({ source: body.source, updatedAt: body.updatedAt, updatedBy: body.updatedBy });
      toast.success("Brand voice saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 pb-28">
      {/* Summary */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            {brandName ?? clientIdCode}
            {brandUrl && (
              <>
                {" · "}
                <a href={brandUrl} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
                  {brandUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                </a>
              </>
            )}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {meta.updatedAt
              ? `Last saved ${new Date(meta.updatedAt).toLocaleString("en-US")}${meta.updatedBy ? ` by ${meta.updatedBy}` : ""}${
                  meta.source?.startsWith("seo-writer") ? " · imported from the SEO blog tool" : ""
                }`
              : "Not filled in yet. This is what every writer and AI tool uses to sound like the brand."}
          </p>
        </div>
        <div className="w-56">
          <div className="mb-1 flex justify-between text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            <span>Completeness</span>
            <span className="tabular-nums">{completeness}%</span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div className="h-2 rounded-full bg-brand transition-all" style={{ width: `${completeness}%` }} />
          </div>
        </div>
      </div>

      <fieldset disabled={readOnly} className="grid gap-5">
        <Step n={1} title="Basic information" subtitle="Where is this brand published? Writers and AI use this to link internally and reference the right site.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Platform" hint="e.g. Shopify, WordPress">
              <Input value={voice.platform} onChange={(e) => set("platform", e.target.value)} placeholder="Shopify" />
            </Field>
            <Field label="Blog URL">
              <Input value={voice.blogUrl} onChange={(e) => set("blogUrl", e.target.value)} placeholder="https://brand.com/blog" />
            </Field>
          </div>
        </Step>

        <Step n={2} title="What does the brand do?" subtitle="Explain the brand like you'd tell a friend. One sharp sentence for the value prop, then more context.">
          <Field label="Value proposition" hint="One sentence. What does the brand sell and who does it help?">
            <Textarea rows={3} value={voice.valueProp} onChange={(e) => set("valueProp", e.target.value)} />
          </Field>
          <Field label="Why does the brand exist?" hint="What problem does it solve? Why does the blog exist?">
            <Textarea rows={5} className="max-h-80 overflow-y-auto" value={voice.whyExists} onChange={(e) => set("whyExists", e.target.value)} />
          </Field>
        </Step>

        <Step n={3} title="Who reads the content?" subtitle="Describe three types of readers so the depth and angle match each one.">
          <div className="grid gap-4 sm:grid-cols-3">
            {(
              [
                ["floor", "The casual reader", "Least familiar. Wants a quick answer, probably came from Google."],
                ["middle", "The regular user", "Uses the product regularly. Reads when the topic fits their life."],
                ["ceiling", "The expert buyer", "Knows exactly what they want. Needs specifics, not fluff."],
              ] as const
            ).map(([key, label, hint]) => (
              <Field key={key} label={label} hint={hint}>
                <Textarea
                  rows={5}
                  value={voice.audience[key]}
                  onChange={(e) => set("audience", { ...voice.audience, [key]: e.target.value })}
                />
              </Field>
            ))}
          </div>
        </Step>

        <Step n={4} title="How does the brand sound?" subtitle="Pick the personality traits that fit, then describe the tone in your own words.">
          <Field label="Personality traits" hint="Pick all that apply.">
            <div className="flex flex-wrap gap-2">
              {[...new Set([...PERSONALITY_TRAITS, ...voice.personality])].map((trait) => {
                const on = voice.personality.includes(trait);
                return (
                  <button
                    key={trait}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      set("personality", on ? voice.personality.filter((p) => p !== trait) : [...voice.personality, trait])
                    }
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-semibold capitalize transition-colors",
                      on ? "border-brand bg-brand text-brand-foreground" : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {trait}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="Tone description">
            <Textarea rows={6} className="max-h-80 overflow-y-auto" value={voice.tone} onChange={(e) => set("tone", e.target.value)} />
          </Field>
        </Step>

        <Step n={5} title="What sounds wrong vs. right" subtitle="At least one off-brand line and how you'd rewrite it. This is the most important step.">
          <Rows
            items={voice.voiceExamples}
            empty={{ offBrand: "", onBrand: "" }}
            onChange={(v) => set("voiceExamples", v)}
            addLabel="Add example"
            render={(ex, update) => (
              <div className="grid flex-1 gap-3 sm:grid-cols-2">
                <Field label="Off-brand (what not to write)">
                  <Textarea rows={3} value={ex.offBrand} onChange={(e) => update({ ...ex, offBrand: e.target.value })} />
                </Field>
                <Field label="On-brand (how you'd actually say it)">
                  <Textarea rows={3} value={ex.onBrand} onChange={(e) => update({ ...ex, onBrand: e.target.value })} />
                </Field>
              </div>
            )}
          />
        </Step>

        <Step n={6} title="Words we use, and words we never use" subtitle="One phrase per line.">
          <div className="grid gap-4 sm:grid-cols-2">
            <LinesField label="Signature phrases" value={voice.signaturePhrases} onChange={(v) => set("signaturePhrases", v)} />
            <LinesField label="Banned phrases" value={voice.bannedPhrases} onChange={(v) => set("bannedPhrases", v)} />
          </div>
        </Step>

        <Step n={7} title="Who are the main competitors?" subtitle="Used to find keyword gaps and keep content positioned differently.">
          <Rows
            items={voice.competitors}
            empty={{ name: "", url: "" }}
            onChange={(v) => set("competitors", v)}
            addLabel="Add competitor"
            render={(c, update) => (
              <div className="grid flex-1 gap-3 sm:grid-cols-2">
                <Input aria-label="Competitor name" placeholder="Competitor name" value={c.name} onChange={(e) => update({ ...c, name: e.target.value })} />
                <Input aria-label="Competitor URL" placeholder="https://competitor.com" value={c.url} onChange={(e) => update({ ...c, url: e.target.value })} />
              </div>
            )}
          />
        </Step>

        <Step n={8} title="Posts that already sound right" subtitle="URLs of existing posts to use as voice references. One per line.">
          <LinesField label="Reference posts" value={voice.referencePosts} onChange={(v) => set("referencePosts", v)} rows={4} />
        </Step>

        <Step n={9} title="Pillar keywords" subtitle="The keywords this client's content is built around.">
          <Rows
            items={voice.keywords}
            empty={{ keyword: "", volume: null, kd: null, intent: "", priority: "" }}
            onChange={(v) => set("keywords", v)}
            addLabel="Add keyword"
            header={
              <div className="grid grid-cols-[1fr_6rem_5rem_9rem_7rem] gap-2 pr-10 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                <span>Keyword</span>
                <span>Volume</span>
                <span>KD</span>
                <span>Intent</span>
                <span>Priority</span>
              </div>
            }
            render={(k, update) => (
              <div className="grid flex-1 grid-cols-[1fr_6rem_5rem_9rem_7rem] gap-2">
                <Input aria-label="Keyword" value={k.keyword} onChange={(e) => update({ ...k, keyword: e.target.value })} />
                <NumberInput aria-label="Volume" value={k.volume} onChange={(volume) => update({ ...k, volume })} />
                <NumberInput aria-label="Keyword difficulty" value={k.kd} max={100} onChange={(kd) => update({ ...k, kd })} />
                <NativeSelect aria-label="Intent" value={k.intent} options={KEYWORD_INTENTS} onChange={(intent) => update({ ...k, intent })} />
                <NativeSelect aria-label="Priority" value={k.priority} options={KEYWORD_PRIORITIES} onChange={(priority) => update({ ...k, priority })} />
              </div>
            )}
          />
        </Step>

        <Step n={10} title="Product facts" subtitle="Only claims confirmed on the client's site, so nobody invents specs. Markdown is fine.">
          <Textarea
            rows={14}
            className="max-h-[28rem] overflow-y-auto font-mono text-xs"
            value={voice.productFacts}
            onChange={(e) => set("productFacts", e.target.value)}
          />
          {voice.productFactsScannedUrls.length > 0 && (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">Source pages ({voice.productFactsScannedUrls.length})</summary>
              <ul className="mt-2 list-disc space-y-0.5 pl-5">
                {voice.productFactsScannedUrls.map((u) => (
                  <li key={u} className="break-all">{u}</li>
                ))}
              </ul>
            </details>
          )}
        </Step>

        <Step n={11} title="Internal links" subtitle="Pages content should link to, with the keyword each one targets.">
          <Rows
            items={voice.internalLinks}
            empty={{ title: "", url: "", keyword: "" }}
            onChange={(v) => set("internalLinks", v)}
            addLabel="Add link"
            render={(l, update) => (
              <div className="grid flex-1 gap-2 sm:grid-cols-[1fr_1.2fr_12rem]">
                <Input aria-label="Title" placeholder="Title" value={l.title} onChange={(e) => update({ ...l, title: e.target.value })} />
                <Input aria-label="URL" placeholder="https://…" value={l.url} onChange={(e) => update({ ...l, url: e.target.value })} />
                <Input aria-label="Target keyword" placeholder="Keyword" value={l.keyword} onChange={(e) => update({ ...l, keyword: e.target.value })} />
              </div>
            )}
          />
        </Step>
      </fieldset>

      {!readOnly && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-end gap-3 px-4 py-3">
            <span className="text-xs text-muted-foreground">{dirty ? "Unsaved changes" : "All changes saved"}</span>
            <Button variant="outline" disabled={!dirty || saving} onClick={() => setVoice(saved)}>
              Discard
            </Button>
            <Button variant="brand" disabled={!dirty || saving} onClick={save}>
              {saving ? "Saving…" : "Save brand voice"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Building blocks ────────────────────────────────────────────────────

/** Numbered section card. The Ink circle with a Yellow numeral is the deck's step motif. */
function Step({ n, title, subtitle, children }: { n: number; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card text-card-foreground">
      <header className="flex items-start gap-3 border-b border-border/50 px-5 py-4">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#2C2B35] text-xs font-bold text-[#F7BF1D] dark:bg-[#F7BF1D] dark:text-[#2C2B35]">
          {n}
        </span>
        <div>
          <h2 className="text-sm font-bold">{title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </header>
      <div className="grid gap-4 px-5 py-4">{children}</div>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="grid content-start gap-1.5">
      <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

type LinesFieldProps = { label: string; value: string[]; onChange: (v: string[]) => void; rows?: number };

// Remount when the saved value changes from outside (Discard, Save response) so the local text resyncs.
function LinesField(props: LinesFieldProps) {
  return <LinesFieldInner key={toLines(props.value)} {...props} />;
}

function LinesFieldInner({ label, value, onChange, rows = 6 }: LinesFieldProps) {
  // Keep the raw text locally so typing a trailing newline isn't swallowed.
  const [text, setText] = useState(toLines(value));
  return (
    <Field label={label}>
      <Textarea
        rows={rows}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onChange(fromLines(text))}
      />
    </Field>
  );
}

function Rows<T>({
  items,
  empty,
  onChange,
  render,
  addLabel,
  header,
}: {
  items: T[];
  empty: T;
  onChange: (items: T[]) => void;
  render: (item: T, update: (next: T) => void) => React.ReactNode;
  addLabel: string;
  header?: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      {header && items.length > 0 && header}
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-2">
          {render(item, (next) => onChange(items.map((it, j) => (j === i ? next : it))))}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Remove"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <div>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...items, empty])}>
          <Plus className="size-4" /> {addLabel}
        </Button>
      </div>
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  max,
  ...rest
}: { value: number | null; onChange: (v: number | null) => void; max?: number; "aria-label": string }) {
  return (
    <Input
      {...rest}
      inputMode="numeric"
      className="tabular-nums"
      value={value ?? ""}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, "");
        if (!digits) return onChange(null);
        const n = Number(digits);
        onChange(max !== undefined ? Math.min(n, max) : n);
      }}
    />
  );
}

function NativeSelect({
  value,
  options,
  onChange,
  ...rest
}: { value: string; options: readonly string[]; onChange: (v: string) => void; "aria-label": string }) {
  return (
    <select
      {...rest}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-md border border-input bg-transparent px-2 text-sm capitalize shadow-xs dark:bg-input/30"
    >
      <option value="">—</option>
      {[...new Set([...options, ...(value ? [value] : [])])].map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}
