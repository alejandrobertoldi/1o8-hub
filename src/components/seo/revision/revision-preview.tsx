"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import type { Product } from "@/lib/db/schema";
import { ProductPdp } from "@/components/products/product-pdp";
import { CommentAnchor } from "./comment-anchor";
import { FieldEditor } from "./field-editor";

// Same limits as S6 (bytes for backend terms)
const EDIT_LIMITS: Record<string, { max: number; bytes?: boolean; hard?: boolean }> = {
  Title: { max: 75 }, ItemHighlight: { max: 125 }, ProductDescription: { max: 1200 }, BackendSearchTerms: { max: 249, bytes: true }, // Amazon's hard limit: one byte over de-indexes every term
  ...Object.fromEntries([1, 2, 3, 4, 5].map((i) => [`DetailedBulletPoint_${i}`, { max: 200, hard: true }])),
};
import { currentValue, FIELD_LABELS, overlayProduct, PDP_HIDDEN_KEYS, type RevisionContent } from "@/lib/seo/revision-fields";

interface Props {
  products: Product[];
  content: RevisionContent;
  familyEnabled: boolean;
  selectedField: { asin: string; key: string } | null;
  onSelectField: (asin: string, key: string) => void;
  /** Close the open comment thread (Esc, ✕, click outside). */
  onCloseField?: () => void;
  /** The comment thread for a field — shown in place, under that field on the preview. */
  renderThread?: (asin: string, key: string) => ReactNode;
  /** Highlight the project's keywords in the previewed text (Hub review). */
  highlightText?: (text: string) => ReactNode;
  /** Staff may edit the proposed text on the spot (PM / AM review). */
  canEdit?: boolean;
  onEditField?: (asin: string, key: string, value: string) => Promise<void>;
  /** "suggest" (client portal): the edit becomes a suggestion for the team to accept or decline. */
  editMode?: "edit" | "suggest";
  commentCounts: Record<string, number>;
  tone: "hub" | "portal";
  /** Client name shown on the PDP's "Visit the … Store" line. */
  storeName?: string | null;
  /** productId → Hub Listing Images for the PDP gallery; they win over Amazon image URLs (Hub only). */
  listingImages?: Record<string, Record<string, string>>;
}

export function RevisionPreview({ products, content, familyEnabled, selectedField, onSelectField, onCloseField, renderThread, highlightText, canEdit = false, onEditField, editMode = "edit", commentCounts, tone, storeName, listingImages }: Props) {
  const asins = Object.keys(content);
  const [asin, setAsin] = useState(asins[0] ?? "");
  const activeAsin = asins.includes(asin) ? asin : (asins[0] ?? "");
  const [mode, setMode] = useState<"proposed" | "current">("proposed");
  const product = products.find((p) => p.asin === activeAsin) ?? null;
  const fields = useMemo(() => content[activeAsin] ?? {}, [content, activeAsin]);
  const shown = useMemo(() => (product && mode === "proposed" ? overlayProduct(product, fields) : product), [product, fields, mode]);
  const accent = tone === "portal" ? "border-portal-accent text-portal-accent" : "border-brand text-brand";
  const enc = new TextEncoder();
  const close = useCallback(() => onCloseField?.(), [onCloseField]);
  // Comment in place: every field in the revision is clickable on the preview itself
  const annotate = (key: string, node: ReactNode) => {
    if (!(key in fields)) return node;
    const active = selectedField?.asin === activeAsin && selectedField.key === key;
    return (
      <CommentAnchor label={FIELD_LABELS[key] ?? key} count={commentCounts[`${activeAsin}::${key}`] ?? 0} active={active}
        onOpen={() => onSelectField(activeAsin, key)} onClose={close}
        thread={active ? (
          <>
            {canEdit && onEditField && mode === "proposed" && (
              <FieldEditor value={fields[key] ?? ""} max={EDIT_LIMITS[key]?.max} bytes={EDIT_LIMITS[key]?.bytes} hard={EDIT_LIMITS[key]?.hard} mode={editMode}
                onSave={(v) => onEditField(activeAsin, key, v)} />
            )}
            {renderThread?.(activeAsin, key)}
          </>
        ) : null}>
        {node}
      </CommentAnchor>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {asins.map((a) => (
          <button key={a} type="button" onClick={() => setAsin(a)}
            className={`rounded-full border px-3 py-1 font-mono text-xs ${a === activeAsin ? accent : "border-border text-muted-foreground"}`}>{a}</button>
        ))}
        <div className="ml-auto inline-flex rounded-full border border-border p-0.5 text-xs">
          {(["proposed", "current"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} className={`rounded-full px-3 py-1 ${mode === m ? accent : "text-muted-foreground"}`}>
              {m === "proposed" ? "Proposed" : "Current"}
            </button>
          ))}
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">Click any title, highlight, bullet or description on the preview to comment on it.</p>
      {/* No dark frame: the white PDP card sits at the same width as the cards below it */}
      <div>
        {shown ? <ProductPdp product={shown} productId={shown.id} readOnly familyEnabled={familyEnabled} defaultExpanded storeName={storeName} listingImages={listingImages?.[shown.id]}
          variationAsins={asins} onSelectAsin={setAsin} seoOnly annotate={annotate} highlightText={highlightText} /> : <p className="text-sm text-muted-foreground">This ASIN is not in the catalog.</p>}
      </div>

      {/* Backend terms / content bullets matter to us, not the client — Hub only */}
      {tone !== "portal" && PDP_HIDDEN_KEYS.some((k) => fields[k]) && (
        <div className="rounded-xl border border-neutral-200 bg-white p-4 text-neutral-900">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-neutral-600">
            Not shown on the PDP
          </p>
          {PDP_HIDDEN_KEYS.filter((k) => fields[k]).map((k) => {
            const value = mode === "proposed" ? fields[k] : (product ? currentValue(product, k) : null) ?? "";
            return (
              <div key={k} className="mb-2">
                {annotate(k, (
                  <div>
                    <p className="text-xs font-semibold">{FIELD_LABELS[k]}</p>
                    <p className="text-sm">{highlightText ? highlightText(value) : value}</p>
                    <p className="text-[10px] text-neutral-600 tabular-nums">{value.length} chars · {enc.encode(value).length} bytes</p>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
