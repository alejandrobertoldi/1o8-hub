"use client";
/* eslint-disable @next/next/no-img-element */

import { useState, useRef, useEffect, useCallback } from "react";
import { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import Image from "next/image";
import { ArrowUpDown, Circle, PackageOpen, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { EnrichedAttribute } from "@/hooks/use-column-attributes";
import type { RequirementLevel } from "@/lib/constants";
import { inferFieldType } from "@/lib/column-utils";
import { hiResAmazonImg } from "@/lib/utils";
import { allowsFreeTextWithOptions } from "@/hooks/use-category-filter";
import { SuggestableTextInput } from "@/components/products/suggestable-text-input";

const STATUS_STYLES: Record<string, string> = {
  active: "bg-status-active/15 text-status-active border-status-active/30",
  inactive: "bg-status-inactive/15 text-status-inactive border-status-inactive/30",
  closed: "bg-status-closed/15 text-status-closed border-status-closed/30",
  discontinued: "bg-status-discontinued/15 text-status-discontinued border-status-discontinued/30",
  incomplete: "bg-status-incomplete/15 text-status-incomplete border-status-incomplete/30",
  "out of stock": "bg-status-oos/15 text-status-oos border-status-oos/30",
  suppressed: "bg-rose-500/15 text-rose-400 border-rose-500/30",
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status.toLowerCase()] ?? "bg-muted text-muted-foreground border-border";
  return (
    <span className={`inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-medium whitespace-nowrap ${style}`}>
      {status}
    </span>
  );
}

const PARENTAGE_STYLES: Record<string, string> = {
  parent: "bg-blue-500/10 text-blue-400",
  child: "bg-purple-500/10 text-purple-400",
  standalone: "bg-muted text-muted-foreground",
};

function ParentageBadge({ value }: { value: string }) {
  const style = PARENTAGE_STYLES[value.toLowerCase()] ?? "bg-muted text-muted-foreground";
  return (
    <span
      className={`px-1.5 py-0.5 rounded text-[10px] font-bold whitespace-nowrap ${style}`}
      style={{ fontStretch: "condensed" }}
    >
      {value}
    </span>
  );
}

export type ProductRow = {
  id: string;
  asin: string | null;
  sku: string | null;
  clientIdCode: string | null;
  marketplace: string | null;
  country: string | null;
  status: string | null;
  brandName: string | null;
  itemName: string | null;
  summarizedTitle: string | null;
  listPrice: string | null;
  mainImageUrl: string | null;
  /** Drive GID for listing-image MAIN (preferred catalog thumb). */
  listingImageDriveFileId?: string | null;
  parentageLevel: string | null;
  parentSku: string | null;
  parentAsin: string | null;
  variationId: string | null;
  variationGroup: string | null;
  variationName?: string | null;
  variations: Record<string, string | undefined> | null;
  otherAttributes: Record<string, string | undefined> | null;
  isDirty: boolean;
  updatedAt: string;
  varietyPackItemCount?: number;
  vpFlavors?: string[] | null;
  _completenessScore?: number | null;
  _amazonMatch?: number | null;
  _amazonFetchedAt?: string | null;
  _raw?: Record<string, string>;
};

export type SaveFieldFn = (
  productId: string,
  field: string | null,
  bqName: string,
  value: string | null
) => void;

// Field mapping: accessor key → { field (core DB column or null for JSONB), bqName }
const FIELD_MAP: Record<string, { field: string | null; bqName: string }> = {
  sku: { field: "sku", bqName: "SKU" },
  clientIdCode: { field: "clientIdCode", bqName: "ClientIDCode" },
  brandName: { field: "brandName", bqName: "BrandName" },
  itemName: { field: "itemName", bqName: "ItemName" },
  status: { field: "status", bqName: "Status" },
  variationId: { field: null, bqName: "VariationID" },
  variationGroup: { field: "variationGroup", bqName: "VariationGroup" },
  variationTheme: { field: null, bqName: "VariationThemeName" },
  parentageLevel: { field: "parentageLevel", bqName: "ParentageLevel" },
};

function SortableHeader({
  column,
  label,
}: {
  column: { getToggleSortingHandler: () => ((event: unknown) => void) | undefined };
  label: string;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-3 h-auto py-0 text-xs font-bold hover:bg-transparent"
      onClick={column.getToggleSortingHandler()}
    >
      {label}
      <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
    </Button>
  );
}

const STATUS_OPTIONS = ["Active", "Inactive", "Incomplete", "Out of Stock", "Closed", "Discontinued"];
const PARENTAGE_OPTIONS = ["Parent", "Child", "Standalone"];

function SelectCell({
  value,
  productId,
  accessorKey,
  onSave,
  options,
  renderValue,
}: {
  value: string | null;
  productId: string;
  accessorKey: string;
  onSave: SaveFieldFn;
  options: string[];
  renderValue?: (v: string) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleOpen = useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 2, left: rect.left });
    }
    setOpen(true);
  }, []);

  const commit = useCallback(
    (newVal: string | null) => {
      setOpen(false);
      if (newVal !== (value ?? null)) {
        const mapping = FIELD_MAP[accessorKey];
        if (mapping) {
          onSave(productId, mapping.field, mapping.bqName, newVal);
        }
      }
    },
    [value, accessorKey, productId, onSave]
  );

  return (
    <>
      <span
        ref={triggerRef}
        className="cursor-pointer hover:opacity-80"
        onClick={handleOpen}
      >
        {value ? (renderValue ? renderValue(value) : value) : "—"}
      </span>
      {open && (
        <div
          ref={menuRef}
          className="fixed z-[9999] min-w-[130px] bg-popover border border-border rounded-md shadow-lg py-1 text-xs"
          style={{ top: pos.top, left: pos.left }}
        >
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              className={`block w-full text-left px-2.5 py-1.5 hover:bg-muted cursor-pointer ${opt === value ? "bg-muted font-medium" : ""}`}
              onClick={() => commit(opt)}
            >
              {renderValue ? renderValue(opt) : opt}
            </button>
          ))}
          <button
            type="button"
            className="block w-full text-left px-2.5 py-1.5 hover:bg-muted cursor-pointer text-muted-foreground"
            onClick={() => commit(null)}
          >
            None
          </button>
        </div>
      )}
    </>
  );
}

function EditableCell({
  value,
  productId,
  accessorKey,
  onSave,
  className,
}: {
  value: string | null;
  productId: string;
  accessorKey: string;
  onSave: SaveFieldFn;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = useCallback(() => {
    setEditing(false);
    const newVal = editValue.trim() || null;
    if (newVal !== (value ?? null)) {
      const mapping = FIELD_MAP[accessorKey];
      if (mapping) {
        onSave(productId, mapping.field, mapping.bqName, newVal);
      }
    }
  }, [editValue, value, accessorKey, productId, onSave]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="font-mono text-xs w-full bg-field-bg text-field-text border border-field-border rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-brand"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setEditValue(value ?? "");
            setEditing(false);
          }
        }}
      />
    );
  }

  const hasWrap = className?.includes("line-clamp") || className?.includes("break-words");

  return (
    <span
      className={`font-mono text-xs block cursor-pointer hover:bg-muted rounded px-1 py-0.5 -mx-1 -my-0.5 ${hasWrap ? "" : "truncate"} ${className ?? ""}`}
      onClick={() => {
        setEditValue(value ?? "");
        setEditing(true);
      }}
    >
      {value || "—"}
    </span>
  );
}

function VariationEditableCell({
  value,
  productId,
  bqName,
  onSave,
  validValues,
}: {
  value: string | null;
  productId: string;
  bqName: string;
  onSave: SaveFieldFn;
  validValues?: string[];
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value ?? "");
  const inputRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (editing && !allowsFreeTextWithOptions(bqName)) {
      if (validValues?.length) selectRef.current?.focus();
      else { inputRef.current?.focus(); inputRef.current?.select(); }
    }
  }, [editing, validValues, bqName]);

  const commit = useCallback((newVal?: string) => {
    setEditing(false);
    const final = (newVal ?? editValue).trim() || null;
    if (final !== (value ?? null)) {
      onSave(productId, null, bqName, final);
    }
  }, [editValue, value, bqName, productId, onSave]);

  const allowCustomWithOptions = allowsFreeTextWithOptions(bqName);
  const suggestionOptions = validValues ?? [];

  if (editing && allowCustomWithOptions) {
    return (
      <SuggestableTextInput
        id={`cell-${productId}-${bqName}`}
        value={editValue}
        options={suggestionOptions}
        placeholder={suggestionOptions.length > 0 ? "Type or choose" : undefined}
        onChange={setEditValue}
        onCommit={(next) => {
          setEditValue(next);
          commit(next);
        }}
        onEscape={() => {
          setEditValue(value ?? "");
          setEditing(false);
        }}
        className="font-mono text-xs w-full bg-field-bg text-field-text border border-field-border rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-brand"
        autoFocus
      />
    );
  }

  if (editing && validValues?.length) {
    return (
      <select
        ref={selectRef}
        className="text-xs w-full bg-field-bg text-field-text border border-field-border rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-brand"
        value={editValue}
        onChange={(e) => { setEditValue(e.target.value); commit(e.target.value); }}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => { if (e.key === "Escape") { setEditValue(value ?? ""); setEditing(false); } }}
      >
        <option value="">— select unit —</option>
        {validValues.map((v) => (
          <option key={v} value={v}>{v}</option>
        ))}
      </select>
    );
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="font-mono text-xs w-full bg-field-bg text-field-text border border-field-border rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-brand"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={() => commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setEditValue(value ?? "");
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <span
      className="text-xs text-foreground cursor-pointer hover:text-brand transition-colors break-words whitespace-normal"
      onClick={() => {
        setEditValue(value ?? "");
        setEditing(true);
      }}
    >
      {value || "—"}
    </span>
  );
}

export function getColumns(
  canEdit: boolean,
  onSave?: SaveFieldFn,
  onDelete?: (id: string) => void,
  activeThemeAttrs?: Set<string>,
  themeValidValues?: Map<string, string[]>
): ColumnDef<ProductRow>[] {
  return [
    {
      id: "isDirty",
      accessorKey: "isDirty",
      header: "",
      meta: { width: "20px" },
      cell: ({ row }) =>
        row.original.isDirty ? (
          <Circle className="h-2 w-2 fill-orange-500 text-orange-500" />
        ) : null,
    },
    {
      accessorKey: "asin",
      header: ({ column }) => (
        <div className="flex flex-col items-start gap-0.5">
          <SortableHeader column={column} label="ASIN" />
          <span className="text-[10px] font-normal text-muted-foreground normal-case tracking-normal">
            SKU
          </span>
        </div>
      ),
      meta: { width: "150px" },
      cell: ({ row }) => (
        <div className="flex items-start gap-2 min-w-0 w-[150px]">
          <div className="h-8 w-8 rounded border border-stone-200 bg-stone-100 dark:border-zinc-700 dark:bg-zinc-800 overflow-hidden shrink-0">
            {row.original.listingImageDriveFileId ? (
              <img
                src={`/api/design/listing-images/image?driveFileId=${encodeURIComponent(row.original.listingImageDriveFileId)}&thumb=1`}
                alt=""
                width={32}
                height={32}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : row.original.mainImageUrl ? (
              <Image
                src={hiResAmazonImg(row.original.mainImageUrl, 100)}
                alt=""
                width={32}
                height={32}
                className="h-full w-full object-cover"
                unoptimized
              />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                <PackageOpen className="h-4 w-4" />
              </div>
            )}
          </div>
          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
            <Link
              href={`/products/${row.original.id}`}
              className="font-mono font-bold text-xs text-brand hover:underline whitespace-nowrap"
            >
              {row.original.asin || "—"}
            </Link>
            {canEdit && onSave ? (
              <EditableCell
                value={row.original.sku}
                productId={row.original.id}
                accessorKey="sku"
                onSave={onSave}
                className="!text-[10px] !font-normal text-muted-foreground line-clamp-2 break-words !whitespace-normal"
              />
            ) : (
              <span className="font-mono text-[10px] text-muted-foreground line-clamp-2 break-words block">
                {row.original.sku || "—"}
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: () => (
        <div className="flex flex-col items-start gap-0.5">
          <span>Status</span>
          <span className="text-[10px] font-normal text-muted-foreground normal-case tracking-normal">
            Parentage Level
          </span>
        </div>
      ),
      meta: { width: "100px" },
      cell: ({ row }) => (
        <div className="flex flex-col items-start gap-1 min-w-0">
          {canEdit && onSave ? (
            <SelectCell
              value={row.original.status}
              productId={row.original.id}
              accessorKey="status"
              onSave={onSave}
              options={STATUS_OPTIONS}
              renderValue={(v) => <StatusBadge status={v} />}
            />
          ) : row.original.status ? (
            <StatusBadge status={row.original.status} />
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
          {canEdit && onSave ? (
            <SelectCell
              value={row.original.parentageLevel}
              productId={row.original.id}
              accessorKey="parentageLevel"
              onSave={onSave}
              options={PARENTAGE_OPTIONS}
              renderValue={(v) => <ParentageBadge value={v} />}
            />
          ) : row.original.parentageLevel ? (
            <ParentageBadge value={row.original.parentageLevel} />
          ) : (
            <span className="text-[10px] text-muted-foreground">—</span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "itemName",
      header: "Item Name",
      meta: { width: "280px", maxWidth: "280px" },
      cell: ({ row }) =>
        canEdit && onSave ? (
          <EditableCell
            value={row.original.itemName || row.original.summarizedTitle}
            productId={row.original.id}
            accessorKey="itemName"
            onSave={onSave}
            className="text-foreground !whitespace-normal line-clamp-3 break-words"
          />
        ) : (
          <span className="text-xs text-foreground line-clamp-3 break-words">
            {row.original.itemName || row.original.summarizedTitle || "—"}
          </span>
        ),
    },
    {
      accessorKey: "variationId",
      header: ({ column }) => <SortableHeader column={column} label="Variation ID" />,
      meta: { width: "90px" },
      cell: ({ row }) =>
        canEdit && onSave ? (
          <EditableCell
            value={row.original.variationId}
            productId={row.original.id}
            accessorKey="variationId"
            onSave={onSave}
            className="text-foreground"
          />
        ) : (
          <span className="font-mono text-xs truncate block text-foreground">{row.original.variationId || "—"}</span>
        ),
    },
    {
      accessorKey: "variationGroup",
      header: "Variation Group",
      meta: { width: "100px" },
      cell: ({ row }) => {
        const val = row.original.variationGroup;
        if (!val) return <span className="text-foreground">—</span>;
        if (canEdit && onSave) {
          return (
            <EditableCell
              value={val}
              productId={row.original.id}
              accessorKey="variationGroup"
              onSave={onSave}
              className="text-brand-group"
            />
          );
        }
        return (
          <span className="text-xs font-mono text-brand-group">{val}</span>
        );
      },
    },
    {
      id: "variationTheme",
      header: "Variation Theme",
      meta: { width: "80px" },
      cell: ({ row }) => {
        const themeValue = row.original.variations?.VariationThemeName ?? row.original.otherAttributes?.VariationThemeName ?? null;
        return canEdit && onSave ? (
          <EditableCell
            value={themeValue}
            productId={row.original.id}
            accessorKey="variationTheme"
            onSave={onSave}
            className="text-foreground"
          />
        ) : (
          <span className="font-mono text-xs truncate block text-foreground">{themeValue || "—"}</span>
        );
      },
    },
    {
      id: "vp",
      header: () => <span title="Variety Pack">Variety Pack</span>,
      meta: { width: "40px" },
      cell: ({ row }) =>
        (row.original.varietyPackItemCount ?? 0) > 0 ? (
          <span className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[8px] font-bold bg-brand-vp/15 text-brand-vp border border-brand-vp/30" title={`${row.original.varietyPackItemCount} pack items`}>
            <PackageOpen className="h-2.5 w-2.5" />
          </span>
        ) : null,
      enableSorting: false,
    },
    ...(!activeThemeAttrs || activeThemeAttrs.has("Flavor") ? [{
      id: "flavor",
      header: "Flavor",
      meta: { width: "120px" },
      cell: ({ row }) => {
        const isParent = (row.original.parentageLevel || "").toLowerCase() === "parent";
        if (isParent) return <ParentageBadge value="Parent" />;
        const isVP = (row.original.varietyPackItemCount ?? 0) > 0;
        const vpFlavors = row.original.vpFlavors;
        if (isVP && vpFlavors?.length) {
          return (
            <div className="flex flex-col gap-0.5">
              {vpFlavors.map((f, i) => (
                <span key={i} className="px-1.5 py-0.5 rounded text-[9px] bg-brand-vp/10 text-brand-vp whitespace-nowrap">{f}</span>
              ))}
            </div>
          );
        }
        const value = row.original.variations?.Flavor ?? row.original.otherAttributes?.Flavor ?? null;
        if (canEdit && onSave) {
          return (
            <VariationEditableCell
              value={value}
              productId={row.original.id}
              bqName="Flavor"
              onSave={onSave}
              validValues={themeValidValues?.get("Flavor")}
            />
          );
        }
        return <span className="text-xs text-foreground">{value || "—"}</span>;
      },
      enableSorting: false,
    }] as ColumnDef<ProductRow>[] : []),
    ...((activeThemeAttrs ? Array.from(activeThemeAttrs).filter((a) => a !== "Flavor") : []).sort().map<ColumnDef<ProductRow>>((attr) => ({
      id: attr.toLowerCase(),
      header: attr,
      meta: { width: "120px" },
      cell: ({ row }) => {
        const isParent = (row.original.parentageLevel || "").toLowerCase() === "parent";
        if (isParent) return <ParentageBadge value="Parent" />;
        const value = row.original.variations?.[attr] ?? row.original.otherAttributes?.[attr] ?? null;
        if (canEdit && onSave) {
          return (
            <VariationEditableCell
              value={value}
              productId={row.original.id}
              bqName={attr}
              onSave={onSave}
              validValues={themeValidValues?.get(attr)}
            />
          );
        }
        return <span className="text-xs text-foreground break-words whitespace-normal">{value || "—"}</span>;
      },
      enableSorting: false,
    }))),
    ...(onDelete
      ? [
          {
            id: "actions",
            header: "",
            meta: { width: "40px" },
            cell: ({ row }: { row: { original: ProductRow } }) => (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onDelete(row.original.id);
                }}
                className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                title="Delete product"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            ),
          } satisfies ColumnDef<ProductRow>,
        ]
      : []),
  ];
}

// Keep a static export for backward compat (read-only)
export const columns: ColumnDef<ProductRow>[] = getColumns(false);

// ── Requirement dot colors (hex for inline styles in headers) ──────
const REQ_DOT_COLORS: Record<RequirementLevel, string> = {
  Required: "#ef4444",
  "Conditionally Required": "#f97316",
  Key: "#a855f7",
  Recommended: "#3b82f6",
  Optional: "#a1a1aa",
  "Not Required": "#71717a",
  "": "transparent",
};

/**
 * Build dynamic columns from user-selected column attributes.
 * Each reads its value from `row.original._raw?.[attr.bqLabel]`.
 */
export function getDynamicColumns(
  selectedAttrs: EnrichedAttribute[],
  canEdit?: boolean,
  onSave?: SaveFieldFn,
): ColumnDef<ProductRow>[] {
  return selectedAttrs.map((attr) => {
    const bqLabel = attr.bqLabel || attr.generalLabel;
    const fieldType = inferFieldType(attr);
    const isWide = fieldType === "textarea";
    const req = (attr.isEssential ? "Required" : "") as RequirementLevel;
    const dotColor = REQ_DOT_COLORS[req] || "transparent";

    return {
      id: `dyn_${bqLabel}`,
      accessorFn: (row: ProductRow) => row._raw?.[bqLabel] ?? null,
      header: () => (
        <span className="flex items-center gap-1 whitespace-nowrap text-xs font-medium">
          {dotColor !== "transparent" && (
            <span
              className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: dotColor }}
              title={req}
            />
          )}
          {attr.generalLabel}
        </span>
      ),
      meta: { width: isWide ? "200px" : "120px" },
      enableSorting: false,
      cell: ({ row }: { row: { original: ProductRow } }) => {
        const value = row.original._raw?.[bqLabel] ?? null;
        if (canEdit && onSave) {
          return (
            <DynamicEditableCell
              value={value}
              productId={row.original.id}
              bqName={bqLabel}
              onSave={onSave}
            />
          );
        }
        return (
          <span className="font-mono text-xs truncate block">
            {value || "\u2014"}
          </span>
        );
      },
    } satisfies ColumnDef<ProductRow>;
  });
}

/** Inline editable cell for dynamic (rawColumnValues) columns. */
function DynamicEditableCell({
  value,
  productId,
  bqName,
  onSave,
}: {
  value: string | null;
  productId: string;
  bqName: string;
  onSave: SaveFieldFn;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = useCallback(() => {
    setEditing(false);
    const newVal = editValue.trim() || null;
    if (newVal !== (value ?? null)) {
      // field=null tells the PUT handler this is a JSONB/rawColumnValues field
      onSave(productId, null, bqName, newVal);
    }
  }, [editValue, value, bqName, productId, onSave]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="font-mono text-xs w-full bg-field-bg text-field-text border border-field-border rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-brand"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setEditValue(value ?? "");
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <span
      className="font-mono text-xs truncate block cursor-pointer hover:bg-muted rounded px-1 py-0.5 -mx-1 -my-0.5"
      onClick={() => {
        setEditValue(value ?? "");
        setEditing(true);
      }}
    >
      {value || "\u2014"}
    </span>
  );
}

export const selectColumn: ColumnDef<ProductRow> = {
  id: "select",
  header: ({ table }) => (
    <Checkbox
      checked={table.getIsAllPageRowsSelected()}
      onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
      aria-label="Select all"
    />
  ),
  cell: ({ row }) => (
    <Checkbox
      checked={row.getIsSelected()}
      onCheckedChange={(value) => row.toggleSelected(!!value)}
      aria-label="Select row"
    />
  ),
  enableSorting: false,
  enableHiding: false,
  meta: { width: "40px" },
};
