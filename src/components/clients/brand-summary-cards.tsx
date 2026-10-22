/* eslint-disable react-doctor/no-side-tab-border */
/* eslint-disable react-doctor/design-no-em-dash-in-jsx-text */
/* eslint-disable react-doctor/no-array-index-as-key */
"use client";

import { useState } from "react";

interface Props {
  clientIdCode: string;
  canEdit: boolean;
  bg: any | null;
  onChange: () => Promise<void>;
}

type FieldKey = "colors" | "typography" | "voice";

const TITLES: Record<FieldKey, string> = {
  colors: "Colors",
  typography: "Typography",
  voice: "Voice & tone",
};

function getFieldValue(bg: any | null, key: FieldKey): any {
  if (!bg) return null;
  if (key === "colors") return bg.summary?.colors ?? bg.summaryColors ?? [];
  if (key === "typography") return bg.summary?.typography ?? bg.summaryTypography ?? null;
  return bg.summary?.voice ?? bg.summaryVoice ?? null;
}

export default function BrandSummaryCards({ clientIdCode, canEdit, bg, onChange }: Props) {
  const [editing, setEditing] = useState<FieldKey | null>(null);
  const [draft, setDraft] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function startEdit(key: FieldKey) {
    setEditing(key);
    setDraft(JSON.stringify(getFieldValue(bg, key), null, 2));
    setErr(null);
  }

  async function save() {
    if (!editing) return;
    setBusy(true);
    setErr(null);
    try {
      const parsed = JSON.parse(draft);
      const r = await fetch(`/api/clients/${clientIdCode}/brand-guidelines/summary`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [editing]: parsed }),
      });
      if (!r.ok) throw new Error(`save failed: ${r.status}`);
      await onChange();
      setEditing(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {(Object.keys(TITLES) as FieldKey[]).map((key) => {
        const value = getFieldValue(bg, key);
        const isEditing = editing === key;
        return (
          <section key={key} className="border rounded p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="font-medium">{TITLES[key]}</h2>
              {canEdit && !isEditing && (
                <button className="text-xs underline" onClick={() => startEdit(key)}>Edit JSON</button>
              )}
            </div>
            {isEditing ? (
              <>
                <textarea
                  className="border rounded p-2 text-xs font-mono h-64"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <div className="flex gap-2">
                  <button className="border px-2 py-1 rounded text-xs disabled:opacity-50" disabled={busy} onClick={save}>Save</button>
                  <button className="border px-2 py-1 rounded text-xs" onClick={() => setEditing(null)}>Cancel</button>
                </div>
                {err && <div className="text-xs text-red-600">{err}</div>}
              </>
            ) : (
              <>
                {key === "colors" && <ColorsView value={value} />}
                {key === "typography" && <TypographyView value={value} />}
                {key === "voice" && <VoiceView value={value} />}
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}

interface ColorRow {
  role: string;
  tier?: string | null;
  name: string;
  hex: string;
  rgb: string | null;
  cmyk: string | null;
}

function ColorsView({ value }: { value: any }) {
  const colors: ColorRow[] = Array.isArray(value) ? value : [];
  if (!colors.length) return <div className="text-sm text-muted-foreground">—</div>;

  // Group by tier preserving first-seen order; null/undefined tiers fall under "Ungrouped".
  const groups: Array<{ tier: string | null; rows: ColorRow[] }> = [];
  const indexByTier = new Map<string, number>();
  for (const c of colors) {
    const key = (c.tier && c.tier.trim()) || "__none__";
    let idx = indexByTier.get(key);
    if (idx === undefined) {
      idx = groups.length;
      indexByTier.set(key, idx);
      groups.push({ tier: key === "__none__" ? null : (c.tier as string), rows: [] });
    }
    groups[idx].rows.push(c);
  }

  const hasMultipleGroups = groups.length > 1 || (groups.length === 1 && groups[0].tier !== null);

  return (
    <div className="flex flex-col gap-4">
      {groups.map((g, gi) => (
        <div key={gi} className="flex flex-col gap-2">
          {hasMultipleGroups && (
            <div className="flex items-center gap-2 border-l-4 pl-3 py-1" style={{ borderColor: g.rows[0]?.hex ?? "#888" }}>
              <span className="font-medium text-sm uppercase tracking-wide">
                {g.tier ?? "Ungrouped"}
              </span>
              <span className="text-xs text-muted-foreground">
                {g.rows.length} color{g.rows.length === 1 ? "" : "s"}
              </span>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b">
                  <th className="py-2 pr-3 w-16"></th>
                  <th className="py-2 pr-3">Role</th>
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Hex</th>
                  <th className="py-2 pr-3">RGB</th>
                  <th className="py-2 pr-3">CMYK</th>
                </tr>
              </thead>
              <tbody>
                {g.rows.map((c, i) => (
                  <tr key={i} className="border-b last:border-b-0">
                    <td className="py-2 pr-3">
                      <div
                        className="size-10 rounded border"
                        style={{ backgroundColor: c.hex }}
                        aria-label={c.hex}
                      />
                    </td>
                    <td className="py-2 pr-3 capitalize">{c.role}</td>
                    <td className="py-2 pr-3 font-medium">{c.name}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{c.hex}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{c.rgb ?? "—"}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{c.cmyk ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

interface FontDef {
  family: string;
  weights: string[];
  fallback: string | null;
}

function TypographyView({ value }: { value: any }) {
  const typo = (value as { primary: FontDef | null; secondary: FontDef | null } | null) ?? null;
  if (!typo) return <div className="text-sm text-muted-foreground">—</div>;
  const slots: Array<"primary" | "secondary"> = ["primary", "secondary"];
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {slots.map((slot) => {
        const f = typo[slot];
        return (
          <div key={slot} className="border rounded p-3 flex flex-col gap-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{slot}</div>
            {f ? (
              <>
                <div
                  className="text-2xl"
                  style={{ fontFamily: `'${f.family}', ${f.fallback ?? "sans-serif"}` }}
                >
                  {f.family}
                </div>
                {f.weights?.length ? (
                  <div className="flex flex-wrap gap-1">
                    {f.weights.map((w) => (
                      <span key={w} className="border rounded-full px-2 py-0.5 text-xs">{w}</span>
                    ))}
                  </div>
                ) : null}
                <div className="text-xs text-muted-foreground">
                  Fallback: {f.fallback ?? "—"}
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">—</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface VoiceShape {
  attributes: string[];
  dos: string[];
  donts: string[];
  sample_copy: string | null;
}

function VoiceView({ value }: { value: any }) {
  const voice = (value as VoiceShape | null) ?? null;
  if (!voice) return <div className="text-sm text-muted-foreground">—</div>;
  return (
    <div className="flex flex-col gap-4">
      {voice.attributes?.length ? (
        <div className="flex flex-wrap gap-2">
          {voice.attributes.map((a) => (
            <span
              key={a}
              className="border rounded-full px-3 py-1 text-xs uppercase tracking-wide"
            >
              {a}
            </span>
          ))}
        </div>
      ) : null}

      {(voice.dos?.length || voice.donts?.length) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-green-700 mb-1">Do</div>
            <ul className="list-disc ml-5 text-sm flex flex-col gap-1">
              {(voice.dos ?? []).map((d, i) => <li key={i}>{d}</li>)}
            </ul>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-red-700 mb-1">Don't</div>
            <ul className="list-disc ml-5 text-sm flex flex-col gap-1">
              {(voice.donts ?? []).map((d, i) => <li key={i}>{d}</li>)}
            </ul>
          </div>
        </div>
      )}

      {voice.sample_copy && (
        <blockquote className="border-l-2 pl-3 italic text-sm text-muted-foreground">
          {voice.sample_copy}
        </blockquote>
      )}
    </div>
  );
}
