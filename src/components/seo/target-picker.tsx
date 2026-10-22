"use client";

// ASIN picker shared by the New SEO Project wizard (step 2) and the project's
// S0.2 "Target ASINs" edit: scope toggle (ASIN / VARIATION / GROUP), search,
// and A+-style rows. Selection state lives with the caller.

import type { ReactNode } from "react";
import { AmazonPdpLink } from "@/components/amazon-pdp-link";
import { AsinLink, PARENTAGE_STYLES } from "@/components/seo/target-display";

// Unified group color for sub-headers and badges
const GROUP_COLOR = { text: "text-brand-group", bg: "bg-brand-group/10", border: "border-brand-group/20" };

export interface CatalogChild {
  id: string;
  asin: string;
  sku: string;
  title: string;
  summarizedTitle: string | null;
  parentageLevel: string;
  flavor: string | null;
  style: string | null;
  color: string | null;
  size: string | null;
  status: string | null;
  mainImageUrl: string | null;
  variationId: string | null;
  variationGroup: string | null;
}

export interface CatalogFamily {
  parentAsin: string;
  parentSku: string;
  parentTitle: string;
  variationTheme: string;
  themeAttributes: string[];
  variationId: string | null;
  parentStatus: string | null;
  parentId: string | null;
  mainImageUrl: string | null;
  children: CatalogChild[];
  groups: string[];
}


export type TargetScope = "ASIN" | "VARIATION" | "GROUP";

export const SCOPE_HELP: Record<TargetScope, string> = {
  ASIN: "Pick any ASINs, across families and standalone products.",
  VARIATION: "Parent ASINs only. The parent and every child in that variation are targeted.",
  GROUP: "Pick a parent, then at least two of its children.",
};

// Listing-status palette — same tokens as the A+ New Set dialog.
const STATUS_STYLES: Record<string, string> = {
  active: "bg-status-active/15 text-status-active border-status-active/30",
  inactive: "bg-status-inactive/15 text-status-inactive border-status-inactive/30",
  closed: "bg-status-closed/15 text-status-closed border-status-closed/30",
  discontinued: "bg-status-discontinued/15 text-status-discontinued border-status-discontinued/30",
  incomplete: "bg-status-incomplete/15 text-status-incomplete border-status-incomplete/30",
  "out of stock": "bg-status-oos/15 text-status-oos border-status-oos/30",
  suppressed: "bg-rose-500/15 text-rose-400 border-rose-500/30",
};

/** Readable variation id (e.g. BNU_SC_US_01). `family.variationId` is the internal UUID. */
export function familyVariationLabel(f: CatalogFamily): string {
  return f.children.find((c) => c.variationId)?.variationId ?? f.parentAsin;
}


/** One product row in the A+ New Set style: ASIN + Amazon link, SKU, title, badges on the right. */
export function TargetRow({
  asin, productId, from, sku, title, status, parentage, variationId, group, meta, isChild, selected, checkbox, onClick,
}: {
  asin: string;
  productId?: string | null;
  from?: "seo-new" | "seo-project";
  sku: string | null;
  title: string | null;
  status?: string | null;
  parentage?: string | null;
  variationId?: string | null;
  group?: string | null;
  meta?: string;
  isChild?: boolean;
  selected: boolean;
  checkbox?: boolean;
  onClick: () => void;
}) {
  return (
    <div
      role="option"
      aria-selected={selected}
      onClick={onClick}
      className={`flex w-full cursor-pointer items-start gap-2.5 px-3 py-2 text-left transition-colors ${
        selected ? "bg-brand/10" : "hover:bg-stone-50 dark:hover:bg-zinc-800/50"
      }`}
    >
      {checkbox && (
        <div
          className={`mt-1 size-3.5 rounded border-2 flex items-center justify-center shrink-0 ${
            selected ? "bg-brand border-brand" : "border-muted-foreground/30"
          }`}
        >
          {selected && (
            <svg className="size-2.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          )}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 font-mono text-sm font-bold text-brand">
          {isChild && <span className="mr-1 font-normal text-muted-foreground">↳</span>}
          {asin ? (
            <>
              <AsinLink asin={asin} productId={productId} from={from} />
              <span onClick={(e) => e.stopPropagation()}>
                <AmazonPdpLink asin={asin} />
              </span>
            </>
          ) : (
            <span className="font-sans text-xs font-normal text-muted-foreground">No parent ASIN</span>
          )}
        </div>
        {sku && <div className="font-mono text-xs text-foreground/70">{sku}</div>}
        <div className="truncate text-[11px] text-muted-foreground">{title ?? ""}</div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        {status && (
          <span
            className={`mt-0.5 inline-flex shrink-0 items-center rounded-full border px-1.5 py-0 text-[10px] font-medium whitespace-nowrap ${
              STATUS_STYLES[status.toLowerCase()] ?? "bg-muted text-muted-foreground border-border"
            }`}
          >
            {status}
          </span>
        )}
        {parentage && (
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${
              PARENTAGE_STYLES[parentage.toLowerCase()] ?? "bg-muted text-muted-foreground"
            }`}
          >
            {parentage}
          </span>
        )}
        {group && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold border ${GROUP_COLOR.bg} ${GROUP_COLOR.text} ${GROUP_COLOR.border}`}>
            {group}
          </span>
        )}
        {variationId && <span className="font-mono text-[10px] text-muted-foreground">{variationId}</span>}
        {meta && <span className="text-[10px] text-muted-foreground">{meta}</span>}
      </div>
    </div>
  );
}

export function TargetPicker({
  families, standalone, loading, scope, onScopeChange, selectedIds, onSelectedIdsChange,
  groupFamily, onGroupFamilyChange, search, onSearchChange, toolbarExtra, productFrom = "seo-new",
}: {
  families: CatalogFamily[];
  standalone: CatalogChild[];
  loading: boolean;
  scope: TargetScope;
  onScopeChange: (s: TargetScope) => void;
  selectedIds: Set<string>;
  onSelectedIdsChange: (ids: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  groupFamily: CatalogFamily | null;
  onGroupFamilyChange: (f: CatalogFamily | null) => void;
  search: string;
  onSearchChange: (s: string) => void;
  /** Rendered next to the search box (the wizard's "Save as named group"). */
  toolbarExtra?: ReactNode;
  productFrom?: "seo-new" | "seo-project";
}) {
  // Updates derive from the latest selection (functional form) so quick
  // successive clicks never overwrite each other.
  // VARIATION scope: exactly one parent + all its children (click again to clear)
  const pickVariation = (family: CatalogFamily) => {
    const ids = [...(family.parentId ? [family.parentId] : []), ...family.children.map((c) => c.id)];
    onSelectedIdsChange((prev) => {
      const alreadyPicked = ids.length > 0 && prev.size === ids.length && ids.every((id) => prev.has(id));
      return alreadyPicked ? new Set() : new Set(ids);
    });
  };

  const toggleChild = (id: string) => {
    onSelectedIdsChange((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectGroup = (family: CatalogFamily, groupName: string) => {
    const groupChildren = family.children.filter((c) =>
      c.variationGroup?.split(",").map((t) => t.trim()).includes(groupName)
    );
    onSelectedIdsChange((prev) => {
      const next = new Set(prev);
      const allSelected = groupChildren.every((c) => next.has(c.id));
      groupChildren.forEach((c) => (allSelected ? next.delete(c.id) : next.add(c.id)));
      return next;
    });
  };

  // Search is client-side over the full catalog: a server-side filter runs
  // before grouping, so a family could come back partial (or childless) and
  // VARIATION/GROUP would silently target only part of a variation.
  const searchQ = search.trim().toLowerCase();
  const matches = (...values: (string | null | undefined)[]) =>
    !searchQ || values.some((v) => v?.toLowerCase().includes(searchQ));
  const childMatches = (c: CatalogChild) => matches(c.asin, c.sku, c.title);
  const visibleFamilies = families.filter(
    (f) => matches(f.parentAsin, f.parentSku, f.parentTitle) || f.children.some(childMatches)
  );

  return (
    <>
      {/* Scope toggle — mirrors the A+ New Set dialog */}
      <div className="flex gap-2 mb-3">
        {(["ASIN", "VARIATION", "GROUP"] as const).map((v) => {
          const on = scope === v;
          const tone =
            v === "GROUP"
              ? on ? "border-teal-500/40 bg-teal-500/10 text-teal-400 font-bold" : "border-teal-500/25 text-teal-400/80"
              : v === "VARIATION"
              ? on ? "border-blue-500/40 bg-blue-500/10 text-blue-400 font-bold" : "border-blue-500/25 text-blue-400/80"
              : on ? "border-brand bg-brand/10 text-brand font-bold" : "border-stone-200 dark:border-zinc-700 text-muted-foreground";
          return (
            <button
              key={v}
              type="button"
              onClick={() => onScopeChange(v)}
              className={`inline-flex h-9 items-center rounded-full px-3 text-[13px] font-medium leading-none border transition-colors ${tone}`}
            >
              {v}
            </button>
          );
        })}
      </div>

      {/* Search + Group toolbar */}
      <div className="flex items-center gap-2 mb-4">
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={
            scope === "ASIN" || groupFamily ? "Search by ASIN, SKU, or title…" : "Search parent ASINs (or any child ASIN, SKU, title)…"
          }
          className="flex-1 h-9 rounded-full border border-stone-300 bg-white px-4 text-xs text-foreground focus:border-amber-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
        />
        {toolbarExtra}
      </div>

      {loading ? (
        <div className="text-center py-10 text-sm text-muted-foreground">Loading catalog…</div>
      ) : families.length === 0 && standalone.length === 0 ? (
        <div className="text-center py-10 text-sm text-muted-foreground">
          No products found for this client
        </div>
      ) : scope === "ASIN" ? (
        <div className="max-h-[500px] overflow-y-auto rounded-md border border-border divide-y divide-border/50">
          {[
            ...families.flatMap((f) => f.children.map((c) => ({ child: c, family: f as CatalogFamily | null }))),
            ...standalone.map((c) => ({ child: c, family: null as CatalogFamily | null })),
          ].filter(({ child }) => childMatches(child)).map(({ child, family }) => (
            <TargetRow
 from={productFrom}
              key={child.id}
              asin={child.asin}
              productId={child.id}
              sku={child.sku}
              title={child.summarizedTitle || child.title}
              status={child.status}
              parentage={child.parentageLevel}
              variationId={child.variationId ?? (family ? familyVariationLabel(family) : null)}
              isChild={!!family}
              selected={selectedIds.has(child.id)}
              checkbox
              onClick={() => toggleChild(child.id)}
            />
          ))}
        </div>
      ) : scope === "VARIATION" ? (
        visibleFamilies.length === 0 ? (
          <div className="text-center py-10 text-sm text-muted-foreground">No parent ASINs match.</div>
        ) : (
          <div className="max-h-[500px] overflow-y-auto rounded-md border border-border divide-y divide-border/50">
            {visibleFamilies.map((family) => (
              <TargetRow
 from={productFrom}
                key={family.parentAsin || family.parentSku}
                asin={family.parentAsin}
                productId={family.parentId}
                sku={family.parentSku}
                title={family.parentTitle}
                status={family.parentStatus}
                parentage="Parent"
                variationId={familyVariationLabel(family)}
                meta={`${family.children.length} child${family.children.length !== 1 ? "ren" : ""}`}
                selected={family.children.length > 0 && family.children.every((c) => selectedIds.has(c.id))}
                onClick={() => pickVariation(family)}
              />
            ))}
          </div>
        )
      ) : !groupFamily ? (
        visibleFamilies.length === 0 ? (
          <div className="text-center py-10 text-sm text-muted-foreground">No parent ASINs match.</div>
        ) : (
          <div className="max-h-[500px] overflow-y-auto rounded-md border border-border divide-y divide-border/50">
            {visibleFamilies.map((family) => (
              <TargetRow
 from={productFrom}
                key={family.parentAsin || family.parentSku}
                asin={family.parentAsin}
                productId={family.parentId}
                sku={family.parentSku}
                title={family.parentTitle}
                status={family.parentStatus}
                parentage="Parent"
                variationId={familyVariationLabel(family)}
                meta={`${family.children.length} child${family.children.length !== 1 ? "ren" : ""}`}
                selected={false}
                onClick={() => {
                  onGroupFamilyChange(family);
                  onSelectedIdsChange(new Set());
                }}
              />
            ))}
          </div>
        )
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-medium text-foreground truncate">{groupFamily.parentTitle}</div>
              <div className="text-[10px] font-mono text-muted-foreground">
                {familyVariationLabel(groupFamily)}
              </div>
            </div>
            <button
              onClick={() => {
                onGroupFamilyChange(null);
                onSelectedIdsChange(new Set());
              }}
              className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full border border-stone-300 px-3 text-[13px] font-medium leading-none text-muted-foreground transition-colors hover:bg-stone-50 active:scale-[0.97] dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Change parent
            </button>
          </div>
          {groupFamily.groups.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground">Named groups:</span>
              {groupFamily.groups.map((g) => (
                <button
                  key={g}
                  onClick={() => selectGroup(groupFamily, g)}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${GROUP_COLOR.bg} ${GROUP_COLOR.text} ${GROUP_COLOR.border} hover:opacity-80`}
                >
                  {g}
                </button>
              ))}
            </div>
          )}
          <div className="max-h-[440px] overflow-y-auto rounded-md border border-border divide-y divide-border/50">
            {groupFamily.children.map((child) => (
              <TargetRow
 from={productFrom}
                key={child.id}
                asin={child.asin}
                productId={child.id}
                sku={child.sku}
                title={child.summarizedTitle || child.title}
                status={child.status}
                parentage={child.parentageLevel}
                variationId={child.variationId ?? familyVariationLabel(groupFamily)}
                group={child.variationGroup}
                selected={selectedIds.has(child.id)}
                checkbox
                onClick={() => toggleChild(child.id)}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
