/* eslint-disable jsx-a11y/no-autofocus */
/* eslint-disable react-doctor/query-mutation-missing-invalidation */
/* eslint-disable react-doctor/no-derived-useState */
/* eslint-disable react-doctor/nextjs-missing-metadata */
/* eslint-disable react-doctor/rerender-state-only-in-handlers */
/* eslint-disable react-doctor/react-compiler-destructure-method */
/* eslint-disable react-doctor/prefer-useReducer */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable react-doctor/js-combine-iterations */
/* eslint-disable react-doctor/js-set-map-lookups */
/* eslint-disable react-doctor/design-no-bold-heading */
/* eslint-disable react-doctor/design-no-em-dash-in-jsx-text */
/* eslint-disable react-doctor/async-await-in-loop */
/* eslint-disable react-doctor/no-array-index-as-key */
"use client";

import { useState, useMemo, use, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Plus,
  Minus,
  Trash2,
  Pencil,
  Check,
  X,
  Loader2,
  Sparkles,
  PackageOpen,
  Tag,
  FolderTree,
  MoveRight,
  Tags,
  Monitor,
  Search,
  Lock,
  Unlock,
  FileSearch,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { cn, hiResAmazonImg } from "@/lib/utils";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { AmazonPdpLink } from "@/components/amazon-pdp-link";
import type { ContentGuidelines } from "@/lib/variation-guidelines";
import { isGuidelinesPresent } from "@/lib/variation-guidelines";
import { ChipInput, ContentGuidelinesForm } from "@/components/content/content-guidelines-form";
import {
  fetchAllClientProducts,
  getColValue as poolGetColValue,
  POOL_CAP,
  type PoolProduct,
} from "@/lib/variations/client-product-pool";
import { AacColumnFilterBar, type AacFilters } from "@/components/clients/aac-column-filter";

// ── Types ─────────────────────────────────────────────────────────────

type PackItem = {
  includedProductId: string | null;
  includedAsin: string | null;
  includedTitle: string | null;
  flavor: string | null;
  size: string | null;
  color: string | null;
  style: string | null;
  customLabel: string | null;
  units: number;
};

type Product = {
  id: string;
  asin: string | null;
  title: string | null;
  imageUrl: string | null;
  sku: string | null;
  parentageLevel: string | null;
  variations: Record<string, string | undefined> | null;
  rawColumnValues: Record<string, string> | null;
  tags: { id: string; dimension: string; value: string }[];
  varietyPackItems: PackItem[];
};

type VarietyPackRow = {
  flavor: string;
  size: string;
  color: string;
  style: string;
  units: string;
  customLabel: string;
};

type Group = {
  id: string;
  name: string;
  dimension: string;
  sortOrder: number;
  isVarietyPack: boolean;
  varietyPackDetails: VarietyPackRow[] | null;
  contentGuidelines: ContentGuidelines | null;
  products: Product[];
};

type TagEntry = {
  id: string;
  dimension: string;
  value: string;
  sortOrder: number;
  assignmentCount: number;
};

type VariationDetail = {
  id: string;
  clientId: string;
  name: string;
  code: string;
  primaryDimension: string | null;
  themeAttributes: string[] | null;
  description: string | null;
  contentGuidelines: ContentGuidelines | null;
  status: "draft" | "locked";
  lockedAt: string | null;
  createdAt: string;
  updatedAt: string;
  groups: Group[];
  tags: TagEntry[];
  ungroupedProducts: Product[];
};

// ── Fetchers ──────────────────────────────────────────────────────────

async function fetchVariation(id: string): Promise<VariationDetail> {
  const res = await fetch(`/api/variations/${id}`);
  if (!res.ok) throw new Error("Failed to load variation");
  return res.json();
}

async function updateVariation(
  id: string,
  body: Record<string, unknown>
): Promise<void> {
  const res = await fetch(`/api/variations/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? "Update failed");
  }
}

async function deleteVariation(id: string): Promise<void> {
  const res = await fetch(`/api/variations/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Delete failed");
}

async function createGroup(
  variationId: string,
  body: { name: string; dimension: string }
): Promise<{ id: string }> {
  const res = await fetch(`/api/variations/${variationId}/groups`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? "Failed to create group");
  }
  return res.json();
}

async function renameGroup(
  variationId: string,
  groupId: string,
  name: string
): Promise<void> {
  const res = await fetch(`/api/variations/${variationId}/groups/${groupId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error("Rename failed");
}

async function deleteGroup(
  variationId: string,
  groupId: string
): Promise<void> {
  const res = await fetch(`/api/variations/${variationId}/groups/${groupId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Delete failed");
}

async function createTag(
  variationId: string,
  body: { dimension: string; value: string }
): Promise<{ id: string }> {
  const res = await fetch(`/api/variations/${variationId}/tags`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? "Failed to create tag");
  }
  return res.json();
}

async function deleteTag(
  variationId: string,
  tagId: string
): Promise<void> {
  const res = await fetch(`/api/variations/${variationId}/tags/${tagId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Delete failed");
}

async function bulkAssign(
  variationId: string,
  body: {
    productIds: string[];
    groupId?: string | null;
    tagIds?: string[];
    unassign?: boolean;
  }
): Promise<void> {
  const res = await fetch(`/api/variations/${variationId}/assign`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Assign failed");
}

async function bulkRemoveFromGroup(
  variationId: string,
  groupId: string,
  productIds: string[]
): Promise<void> {
  const res = await fetch(
    `/api/variations/${variationId}/groups/${groupId}/members`,
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productIds }),
    }
  );
  if (!res.ok) throw new Error("Remove from group failed");
}

async function autoDetect(
  variationId: string
): Promise<{ groupsCreated: number; tagsCreated: number }> {
  // Step 1: Get suggestions
  const suggestRes = await fetch(`/api/variations/${variationId}/suggest`);
  if (!suggestRes.ok) throw new Error("Auto-detect failed");
  const data = await suggestRes.json();

  let groupsCreated = 0;
  let tagsCreated = 0;

  // Step 2: Create suggested groups
  for (const group of data.suggestedGroups ?? []) {
    const res = await fetch(`/api/variations/${variationId}/groups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: group.name, dimension: group.dimension }),
    });
    if (res.ok) groupsCreated++;
  }

  // Step 3: Create suggested tags
  for (const tagGroup of data.suggestedTags ?? []) {
    for (const value of tagGroup.values) {
      const res = await fetch(`/api/variations/${variationId}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dimension: tagGroup.dimension, value }),
      });
      if (res.ok) tagsCreated++;
    }
  }

  return { groupsCreated, tagsCreated };
}

// ── Subcomponents ─────────────────────────────────────────────────────

function InlineEdit({
  value,
  onSave,
  className,
}: {
  value: string;
  onSave: (v: string) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function commit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) {
      onSave(trimmed);
    }
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
          className="h-7 rounded-md border border-stone-300 bg-white px-2 py-1 text-sm text-foreground dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
        />
        <button
          onClick={commit}
          className="p-1 text-brand hover:text-brand-hover"
        >
          <Check className="size-3.5" />
        </button>
        <button
          onClick={() => setEditing(false)}
          className="p-1 text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
    );
  }

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        setDraft(value);
        setEditing(true);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.stopPropagation();
          setDraft(value);
          setEditing(true);
        }
      }}
      className={cn(
        "group inline-flex items-center gap-1.5 hover:text-brand transition-colors cursor-pointer",
        className
      )}
    >
      <span className="min-w-0">{value}</span>
      <Pencil className="size-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
    </span>
  );
}

function EditableCell({
  value,
  productId,
  field,
  bqName,
  onSaved,
  className,
}: {
  value: string | null;
  productId: string;
  field: string;
  bqName: string;
  onSaved: () => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    setPending(undefined);
  }, [value]);

  function commit() {
    if (saving) return;
    const trimmed = draft.trim();
    const newVal = trimmed || null;
    setEditing(false);
    if (newVal !== (value ?? null)) {
      setPending(newVal);
      setSaving(true);
      fetch(`/api/products/${productId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field: field || undefined, value: newVal, bqName }),
      }).then((res) => {
        setSaving(false);
        if (res.ok) {
          toast.success("Updated");
          onSaved();
        } else {
          setPending(undefined);
          res.json().then((e) => toast.error(e.error ?? "Update failed")).catch(() => toast.error("Update failed"));
        }
      });
    }
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        className="w-full min-w-[60px] bg-transparent border-b border-brand text-xs text-foreground outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] rounded-sm p-0.5"
      />
    );
  }

  const display = pending !== undefined ? pending : value;

  return (
    <span
      onClick={() => {
        setDraft(display ?? "");
        setEditing(true);
      }}
      className={cn("cursor-pointer hover:text-brand transition-colors", className)}
    >
      {display || "—"}
    </span>
  );
}

const STATUS_OPTIONS = ["Active", "Inactive", "Incomplete", "Out of Stock", "Suppressed"] as const;
const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-400",
  inactive: "bg-zinc-500/10 text-zinc-400",
  incomplete: "bg-amber-500/10 text-amber-400",
  "out of stock": "bg-red-500/10 text-red-400",
  suppressed: "bg-rose-500/10 text-rose-400",
};

const PARENTAGE_STYLES: Record<string, string> = {
  parent: "bg-blue-500/10 text-blue-400",
  child: "bg-purple-500/10 text-purple-400",
  standalone: "bg-muted text-muted-foreground",
};

const PARENTAGE_OPTIONS = ["Parent", "Child", "Standalone"] as const;

function ParentageDropdown({
  productId,
  value,
  onSaved,
}: {
  productId: string;
  value: string | null;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    setPending(undefined);
  }, [value]);

  const display = pending !== undefined ? pending : value;

  const handleChange = (newVal: string) => {
    if (saving || newVal === (display ?? "")) return;
    setPending(newVal || null);
    setSaving(true);
    fetch(`/api/products/${productId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: "parentageLevel", value: newVal || null, bqName: "ParentageLevel" }),
    }).then((res) => {
      setSaving(false);
      if (res.ok) {
        toast.success("Parentage updated");
        onSaved();
      } else {
        setPending(undefined);
        res.json().then((e) => toast.error(e.error ?? "Update failed")).catch(() => toast.error("Update failed"));
      }
    });
  };

  const style = PARENTAGE_STYLES[(display ?? "").toLowerCase()] || "bg-muted text-muted-foreground";

  return (
    <select
      value={display ?? ""}
      onChange={(e) => handleChange(e.target.value)}
      disabled={saving}
      aria-label="Parentage level"
      title="Parentage level"
      className={`text-[10px] font-bold rounded px-1.5 py-0.5 border-0 cursor-pointer outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] appearance-none text-center min-w-[4.75rem] ${style} ${!display ? "ring-1 ring-inset ring-stone-300 dark:ring-zinc-600" : ""} ${saving ? "opacity-50" : ""}`}
    >
      <option value="">Set</option>
      {PARENTAGE_OPTIONS.map((s) => (
        <option key={s} value={s}>{s}</option>
      ))}
    </select>
  );
}

function StatusDropdown({
  productId,
  value,
  onSaved,
}: {
  productId: string;
  value: string | null;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    setPending(undefined);
  }, [value]);

  const display = pending !== undefined ? pending : value;

  const handleChange = (newVal: string) => {
    if (saving || newVal === (display ?? "")) return;
    setPending(newVal || null);
    setSaving(true);
    fetch(`/api/products/${productId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: "status", value: newVal || null, bqName: "Status" }),
    }).then((res) => {
      setSaving(false);
      if (res.ok) {
        toast.success("Status updated");
        onSaved();
      } else {
        setPending(undefined);
        res.json().then((e) => toast.error(e.error ?? "Update failed")).catch(() => toast.error("Update failed"));
      }
    });
  };

  const style = STATUS_STYLES[(display ?? "").toLowerCase()] || "bg-muted text-muted-foreground";

  return (
    <select
      value={display ?? ""}
      onChange={(e) => handleChange(e.target.value)}
      disabled={saving}
      className={`text-[10px] font-bold rounded px-1.5 py-0.5 border-0 cursor-pointer outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] appearance-none text-center ${style} ${saving ? "opacity-50" : ""}`}
    >
      <option value="">—</option>
      {STATUS_OPTIONS.map((s) => (
        <option key={s} value={s}>{s}</option>
      ))}
    </select>
  );
}

function GroupCell({
  productId,
  variationId,
  groups,
  onSaved,
  className,
}: {
  productId: string;
  variationId: string;
  groups: Group[];
  onSaved: () => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  // Which groups this product currently belongs to
  const memberGroups = groups.filter((g) => g.products.some((p) => p.id === productId));

  async function commit() {
    if (saving) return;
    const trimmed = draft.trim();
    setEditing(false);
    setDraft("");
    if (!trimmed) return; // Ignore empty — use X badges to remove

    // Check if already in this group
    if (memberGroups.some((g) => g.name.toLowerCase() === trimmed.toLowerCase())) {
      toast.info("Already in this group");
      return;
    }

    setSaving(true);
    // Find existing group by name or create one
    let groupId: string | null = null;
    const existing = groups.find((g) => g.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      groupId = existing.id;
    } else {
      const dim = groups[0]?.dimension ?? "Group";
      const res = await fetch(`/api/variations/${variationId}/groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, dimension: dim }),
      });
      if (res.ok) {
        const data = await res.json();
        groupId = data.id;
      } else {
        setSaving(false);
        toast.error("Failed to create group");
        return;
      }
    }

    // Assign product to the group (additive — doesn't remove from other groups)
    const assignRes = await fetch(`/api/variations/${variationId}/assign`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productIds: [productId], groupId }),
    });
    if (!assignRes.ok) { setSaving(false); toast.error("Failed to assign"); return; }

    setSaving(false);
    toast.success("Added to group");
    onSaved();
  }

  async function removeFromGroup(groupId: string) {
    setSaving(true);
    const res = await fetch(`/api/variations/${variationId}/groups/${groupId}/members`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productIds: [productId] }),
    });
    setSaving(false);
    if (res.ok) { toast.success("Removed from group"); onSaved(); }
    else toast.error("Failed to remove");
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-1 max-h-[4.5rem] overflow-hidden", className)}>
      {memberGroups.map((g) => (
        <span
          key={g.id}
          className="inline-flex items-center gap-0.5 rounded-md bg-brand-group/10 border border-brand-group/20 px-1.5 py-0.5 text-[10px] text-brand-group"
        >
          {g.name}
          <button
            onClick={(e) => { e.stopPropagation(); removeFromGroup(g.id); }}
            disabled={saving}
            className="ml-0.5 hover:text-red-500 transition-colors"
          >
            <X className="size-2.5" />
          </button>
        </span>
      ))}
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") { setEditing(false); setDraft(""); }
          }}
          placeholder="Group name"
          className="min-w-[60px] max-w-[100px] bg-transparent border-b border-brand text-xs text-foreground outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] rounded-sm p-0.5"
        />
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="text-muted-foreground hover:text-brand transition-colors"
          title="Add to group"
        >
          <Plus className="size-3" />
        </button>
      )}
    </div>
  );
}

function IncludeAllCheckbox({
  products,
  assignedProductIds,
  onToggleAll,
}: {
  products: { id: string }[];
  assignedProductIds: Set<string>;
  onToggleAll: (include: boolean, ids: string[]) => void;
}) {
  const allIncluded = products.length > 0 && products.every((p) => assignedProductIds.has(p.id));
  const someIncluded = products.some((p) => assignedProductIds.has(p.id));

  function toggleAll() {
    if (products.length === 0) return;
    if (allIncluded) {
      onToggleAll(false, products.map((p) => p.id));
    } else {
      onToggleAll(true, products.filter((p) => !assignedProductIds.has(p.id)).map((p) => p.id));
    }
  }

  return (
    <Checkbox
      checked={allIncluded ? true : someIncluded ? "indeterminate" : false}
      onCheckedChange={toggleAll}
      disabled={products.length === 0}
      className={cn(
        allIncluded && "data-[state=checked]:bg-brand data-[state=checked]:border-brand"
      )}
      aria-label="Include all products"
    />
  );
}

function IncludeCheckbox({
  included,
  onToggle,
}: {
  included: boolean;
  onToggle: () => void;
}) {
  return (
    <Checkbox
      checked={included}
      onCheckedChange={onToggle}
      className={cn(
        included && "data-[state=checked]:bg-brand data-[state=checked]:border-brand"
      )}
    />
  );
}

function ProductRow({
  product,
  selected,
  onToggle,
}: {
  product: Product;
  selected: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors",
        selected
          ? "bg-amber-50 border border-amber-300/40 dark:bg-amber-500/10 dark:border-amber-500/20"
          : "hover:bg-stone-50 dark:hover:bg-zinc-800/50"
      )}
    >
      <Checkbox
        checked={selected}
        onCheckedChange={() => onToggle(product.id)}
        className="shrink-0"
      />
      <div className="size-8 rounded border border-stone-200 bg-stone-100 dark:border-zinc-700 dark:bg-zinc-800 overflow-hidden shrink-0">
        {product.imageUrl ? (
          <Image
            src={hiResAmazonImg(product.imageUrl, 100)}
            alt=""
            width={32}
            height={32}
            className="h-full w-full object-cover"
            unoptimized
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-muted-foreground">
            <PackageOpen className="size-4" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-bold text-foreground">{product.asin ?? "—"}</span>
          <AmazonPdpLink asin={product.asin} />
          {product.sku && <span className="text-[10px] font-mono text-muted-foreground truncate">{product.sku}</span>}
        </div>
        <p className="text-[10px] text-muted-foreground truncate">
          {product.title ?? "Untitled product"}
        </p>
        {(product.variations || product.rawColumnValues) && (() => {
          const entries = (["Flavor", "Size", "Color", "Style"] as const)
            .map((k) => [k as string, product.variations?.[k] ?? product.rawColumnValues?.[k] ?? ""] as const)
            .filter((e) => !!e[1] && e[1] !== "Variety Pack");
          if (entries.length === 0) return null;
          return (
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
              {entries.map(([label, val]) => (
                <div key={label} className="flex items-center gap-1">
                  <span className="text-[8px] font-semibold uppercase tracking-wider text-muted-foreground/60">{label}</span>
                  <span className="text-[9px] font-medium text-foreground/80">{val.replace(/\s*\(Pack\s+of\s+\d+\)\s*/gi, " ").trim()}</span>
                </div>
              ))}
            </div>
          );
        })()}
        {product.varietyPackItems.length > 0 && (
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[8px] font-semibold uppercase tracking-wider text-muted-foreground/60">Variety Pack</span>
            <PackageOpen className="size-3 text-brand-vp shrink-0" />
            <span className="text-[9px] text-brand-vp">
              {product.varietyPackItems
                .map((it) => (it.units > 1 ? `${it.units}× ` : "") + (it.flavor || it.includedTitle || "—"))
                .join(", ")}
            </span>
          </div>
        )}
      </div>
      {product.tags.length > 0 && (
        <div className="flex gap-1 shrink-0">
          {product.tags.map((t) => (
            <Badge
              key={t.id}
              variant="secondary"
              className="rounded-md px-2 py-0.5 text-[9px] font-bold"
            >
              {t.value}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────

export default function VariationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const queryKey = ["variation", id];

  // ── State ────────────────────────────────────────────────────────

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [addGroupOpen, setAddGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [groupAttr, setGroupAttr] = useState("");
  const [groupAttrValue, setGroupAttrValue] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [seoDialogOpen, setSeoDialogOpen] = useState(false);
  const [seoAssignee, setSeoAssignee] = useState("");
  const [variationGuidelines, setVariationGuidelines] = useState<ContentGuidelines>({});
  const [guidelinesOpen, setGuidelinesOpen] = useState(false);
  const [groupGuidelinesTabs, setGroupGuidelinesTabs] = useState<Record<string, "products" | "guidelines">>({});
  const [groupGuidelinesState, setGroupGuidelinesState] = useState<Record<string, ContentGuidelines>>({});
  const [seoMode, setSeoMode] = useState<"per-group" | "all">("per-group");
  const [variationDeleteOpen, setVariationDeleteOpen] = useState(false);
  const [groupDeleteTarget, setGroupDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const stickyHeaderRef = useRef<HTMLDivElement>(null);
  const [tableTop, setTableTop] = useState(0);
  const [sortCol, setSortCol] = useState<string | null>("parentage");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [columnFilters, setColumnFilters] = useState<AacFilters>({});
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const [lockError, setLockError] = useState(false);

  // Optimistic membership overlay: productId -> included? (true=added, false=removed)
  // Lets add/remove react instantly without refetching the whole variation.
  const [optimisticMembership, setOptimisticMembership] = useState<Map<string, boolean>>(new Map());
  const reconcileTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconcileSeq = useRef(0);

  useEffect(() => {
    const el = stickyHeaderRef.current;
    if (!el) return;
    // Measure the sticky filter block's bottom edge in the viewport. It pins
    // flush under the TopNav, so its bottom = nav height + filter height — i.e.
    // exactly where the table starts. The table fills from here to the viewport
    // bottom, so it owns the scroll and its sticky thead pins under the filter.
    const measure = () => setTableTop(el.getBoundingClientRect().bottom);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  // ── Query ────────────────────────────────────────────────────────

  const {
    data: variation,
    isLoading,
    isError,
  } = useQuery({
    queryKey,
    queryFn: () => fetchVariation(id),
  });

  // Navigation guard: prevent leaving draft variations
  const canLock = variation?.status === "draft" && 
    (variation.themeAttributes?.length ?? 0) > 0 && 
    variation.name.trim() !== "" && 
    variation.name.trim() !== "New Variation";

  useEffect(() => {
    if (variation?.status !== "draft") return;
    const handlePopState = (e: PopStateEvent) => {
      e.preventDefault();
      setPendingNavigation(window.location.href);
      setLeaveDialogOpen(true);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [variation?.status]);

  useEffect(() => {
    if (variation?.contentGuidelines) {
      setVariationGuidelines(variation.contentGuidelines as ContentGuidelines);
    }
  }, [variation?.id]);

  useEffect(() => {
    if (variation?.groups) {
      const initial: Record<string, ContentGuidelines> = {};
      for (const g of variation.groups) {
        if (g.contentGuidelines) initial[g.id] = g.contentGuidelines as ContentGuidelines;
      }
      setGroupGuidelinesState((prev) => ({ ...initial, ...prev }));
    }
  }, [variation?.id]);

  // Fetch the FULL client product pool (paged until complete, capped at POOL_CAP)
  // so filtering + "select all matching" are correct across the whole catalog.
  const { data: clientProducts } = useQuery({
    queryKey: ["client-products", variation?.clientId, productSearch],
    queryFn: ({ signal }) =>
      fetchAllClientProducts(variation!.clientId, {
        search: productSearch || undefined,
        signal,
      }),
    enabled: !!variation?.clientId,
  });

  // Fetch generalLabel values for theme attr column headers from attributes table
  const { data: themeAttrLabelMap } = useQuery({
    queryKey: ["theme-attr-labels", variation?.clientId],
    queryFn: async () => {
      const res = await fetch(
        `/api/products/theme-values?client=${variation!.clientId}`
      );
      if (!res.ok) return {} as Record<string, string>;
      const data = await res.json() as Record<string, string[]>;
      // Keys are generalLabel values — build a normalized lookup map
      const map: Record<string, string> = {};
      for (const gl of Object.keys(data)) {
        map[gl.toLowerCase()] = gl;
      }
      return map;
    },
    enabled: !!variation?.clientId,
    staleTime: 10 * 60 * 1000,
  });

  // Fetch valid variation theme values from category_attributes
  const { data: themeOptions } = useQuery({
    queryKey: ["variation-theme-options", variation?.clientId],
    queryFn: async () => {
      const res = await fetch(
        `/api/variations/theme-options?clientId=${variation!.clientId}`
      );
      if (!res.ok) return { themes: [] as string[], productTypes: [] as string[] };
      return res.json() as Promise<{ themes: string[]; productTypes: string[] }>;
    },
    enabled: !!variation?.clientId,
  });

  // ── Mutations ────────────────────────────────────────────────────

  const invalidate = () =>
    queryClient.refetchQueries({ queryKey });

  const invalidateProducts = () =>
    queryClient.refetchQueries({ queryKey: ["client-products"] });

  // Debounced background reconcile: refresh real data ~1.2s after the last
  // change, then clear the optimistic overlay — but ONLY if no newer toggle
  // landed during the in-flight refetch (the seq guard prevents a stale
  // reconcile from wiping a still-pending optimistic entry → no flicker).
  const scheduleReconcile = useCallback(() => {
    if (reconcileTimer.current) clearTimeout(reconcileTimer.current);
    const seq = ++reconcileSeq.current;
    reconcileTimer.current = setTimeout(async () => {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ["variation", id] }),
        queryClient.refetchQueries({ queryKey: ["client-products"] }),
      ]);
      if (seq === reconcileSeq.current) setOptimisticMembership(new Map());
    }, 1200);
  }, [queryClient, id]);

  useEffect(() => () => {
    if (reconcileTimer.current) clearTimeout(reconcileTimer.current);
  }, []);

  // Add/remove products to/from the variation. Updates the overlay synchronously,
  // fires one batched request, reverts on error, and schedules a reconcile.
  const toggleMembership = useCallback(async (ids: string[], include: boolean) => {
    if (ids.length === 0) return;
    setOptimisticMembership((prev) => {
      const next = new Map(prev);
      for (const pid of ids) next.set(pid, include);
      return next;
    });
    try {
      await bulkAssign(id, include ? { productIds: ids } : { productIds: ids, unassign: true });
      toast.success(
        include
          ? `Added ${ids.length} to variation`
          : `Removed ${ids.length} from variation`
      );
    } catch {
      setOptimisticMembership((prev) => {
        const next = new Map(prev);
        for (const pid of ids) next.delete(pid);
        return next;
      });
      toast.error("Failed to update");
    }
    scheduleReconcile();
  }, [id, scheduleReconcile]);

  const updateMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => updateVariation(id, body),
    onSuccess: (_, variables) => {
      invalidate();
      if (variables.status === "locked") {
        toast.success("Variation locked");
      } else if (variables.status === "draft") {
        toast.success("Variation unlocked");
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const saveVariationGuidelinesMut = useMutation({
    mutationFn: (gl: ContentGuidelines) =>
      updateVariation(id, { contentGuidelines: gl }),
    onError: () => toast.error("Failed to save guidelines"),
  });

  async function saveGroupGuidelines(groupId: string, gl: ContentGuidelines) {
    try {
      const res = await fetch(`/api/variations/${id}/groups/${groupId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentGuidelines: gl }),
      });
      if (!res.ok) toast.error("Failed to save group guidelines");
    } catch {
      toast.error("Failed to save group guidelines");
    }
  }

  const deleteMut = useMutation({
    mutationFn: () => deleteVariation(id),
    onSuccess: () => {
      toast.success("Variation deleted");
      router.push("/variations");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const createGroupMut = useMutation({
    mutationFn: async (body: { name: string; dimension: string; autoAssignAttr?: string; autoAssignValue?: string }) => {
      const { id: groupId } = await createGroup(id, { name: body.name, dimension: body.dimension });
      // Auto-assign matching products if created from attribute
      if (body.autoAssignAttr && body.autoAssignValue && clientProducts?.products) {
        const matchingIds = clientProducts.products
          .filter((p) => assignedProductIds.has(p.id) && p.parentageLevel !== "Parent" && p.variations?.[body.autoAssignAttr!] === body.autoAssignValue)
          .map((p) => p.id);
        if (matchingIds.length > 0) {
          await bulkAssign(id, { productIds: matchingIds, groupId });
        }
      }
    },
    onSuccess: () => {
      invalidate();
      invalidateProducts();
      toast.success("Group created");
      setAddGroupOpen(false);
      setNewGroupName("");
      setGroupAttr("");
      setGroupAttrValue("");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const renameGroupMut = useMutation({
    mutationFn: ({
      groupId,
      name,
    }: {
      groupId: string;
      name: string;
    }) => renameGroup(id, groupId, name),
    onSuccess: () => {
      invalidate();
      toast.success("Group renamed");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateGroupMut = useMutation({
    mutationFn: async ({ groupId, ...body }: { groupId: string; [key: string]: unknown }) => {
      const res = await fetch(`/api/variations/${id}/groups/${groupId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to update group");
    },
    onSuccess: () => invalidate(),
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteGroupMut = useMutation({
    mutationFn: (groupId: string) => deleteGroup(id, groupId),
    onSuccess: () => {
      invalidate();
      toast.success("Group deleted — products moved to Ungrouped");
    },
    onError: (err: Error) => toast.error(err.message),
  });


  const createSeoMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/variations/${id}/seo-projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedTo: seoAssignee || undefined, mode: seoMode }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to create SEO projects");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setSeoDialogOpen(false);
      setSeoAssignee("");
      toast.success(`Created ${data.projects.length} SEO project${data.projects.length === 1 ? "" : "s"}`);
      router.push("/seo/manager");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const assignMut = useMutation({
    mutationFn: (body: {
      productIds: string[];
      groupId?: string | null;
      tagIds?: string[];
    }) => bulkAssign(id, body),
    onSuccess: () => {
      scheduleReconcile();
      setSelectedIds(new Set());
      toast.success("Products updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const removeFromGroupMut = useMutation({
    mutationFn: ({ groupId, productIds }: { groupId: string; productIds: string[] }) =>
      bulkRemoveFromGroup(id, groupId, productIds),
    onSuccess: () => {
      scheduleReconcile();
      setSelectedIds(new Set());
      toast.success("Removed from group");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const suggestMut = useMutation({
    mutationFn: () => autoDetect(id),
    onSuccess: (data) => {
      invalidate();
      toast.success(
        `Auto-detected ${data.groupsCreated} groups and ${data.tagsCreated} tags`
      );
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // ── Helpers ──────────────────────────────────────────────────────

  function abbreviateGroupName(value: string): string {
    let s = value
      // "Pack of N" → "NPk"
      .replace(/\(Pack\s+of\s+(\d+)\)/gi, "$1Pk")
      .replace(/Pack\s+of\s+(\d+)/gi, "$1Pk")
      // Units → short forms
      .replace(/\bFluid\s+Ounce(?:s)?\b/gi, "FlOz")
      .replace(/\bFl\s+Oz\b/gi, "FlOz")
      .replace(/\bOunce(?:s)?\b/gi, "Oz")
      .replace(/\bPound(?:s)?\b/gi, "Lb")
      .replace(/\bGram(?:s)?\b/gi, "g")
      .replace(/\bKilogram(?:s)?\b/gi, "Kg")
      .replace(/\bMilliliter(?:s)?\b/gi, "mL")
      .replace(/\bLiter(?:s)?\b/gi, "L")
      .replace(/\bGallon(?:s)?\b/gi, "Gal")
      .replace(/\bCount\b/gi, "Ct")
      .replace(/\bPiece(?:s)?\b/gi, "Pc")
      .replace(/\bVariety\b/gi, "Var")
      .replace(/\bChocolate\b/gi, "Choc")
      .replace(/\bStrawberry\b/gi, "Strwb")
      .replace(/\bVanilla\b/gi, "Van")
      .replace(/\bOriginal\b/gi, "Orig")
      .replace(/\bNatural\b/gi, "Nat")
      .replace(/\bOrganic\b/gi, "Org")
      .replace(/\bAssorted\b/gi, "Asstd");

    // Strip parens and extra whitespace
    s = s.trim().replace(/[()]/g, "").replace(/\s{2,}/g, " ").trim();

    // PascalCase abbreviation: first 3 chars of each word
    // e.g. "Persimmon Slices" → "PerSli", "Chili Lime" → "ChiLim"
    // Numbers and already-short words (≤3 chars) kept as-is
    const words = s.split(/[\s-]+/);
    s = words
      .map((w) => {
        if (/^\d/.test(w)) return w; // keep "2Oz", "10Pk" etc.
        if (w.length <= 3) return w.charAt(0).toUpperCase() + w.slice(1);
        return w.charAt(0).toUpperCase() + w.slice(1, 3).toLowerCase();
      })
      .join("");

    return s || value.replace(/\s+/g, "");
  }

  function suggestGroupName(_attr: string, value: string): string {
    return abbreviateGroupName(value);
  }

  function handleCreateGroup() {
    if (!newGroupName.trim()) return;
    createGroupMut.mutate({
      name: newGroupName.trim(),
      dimension: primaryDim,
      autoAssignAttr: groupAttr || undefined,
      autoAssignValue: groupAttrValue || undefined,
    });
  }

  const toggleSelect = useCallback((productId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }, []);

  const toggleGroup = useCallback((groupId: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  // Collect all product IDs already in this variation (grouped + ungrouped)
  const assignedProductIds = useMemo(() => {
    if (!variation) return new Set<string>();
    const ids = new Set<string>();
    for (const g of variation.groups) {
      for (const p of g.products) ids.add(p.id);
    }
    for (const p of variation.ungroupedProducts) ids.add(p.id);
    return ids;
  }, [variation]);

  // Real membership merged with the optimistic overlay — drives the top
  // product table (checkbox state, row highlight, include-first sort).
  const effectiveAssignedIds = useMemo(() => {
    if (optimisticMembership.size === 0) return assignedProductIds;
    const ids = new Set(assignedProductIds);
    for (const [pid, inc] of optimisticMembership) {
      if (inc) ids.add(pid);
      else ids.delete(pid);
    }
    return ids;
  }, [assignedProductIds, optimisticMembership]);

  // Collect unique variation theme attribute keys across all client products
  const themeAttrKeys = useMemo(() => {
    if (!clientProducts?.products) return [];
    const keys = new Set<string>();
    for (const p of clientProducts.products) {
      const themeName = p.variations?.VariationThemeName;
      if (!themeName) continue;
      for (const k of themeName.split(/[-\/]/)) {
        // Normalize: strip _name suffix, then title case to match JSONB keys (e.g. Size_name → Size, FLAVOR → Flavor)
        const stripped = k.replace(/_name$/i, "");
        const normalized = stripped.charAt(0).toUpperCase() + stripped.slice(1).toLowerCase();
        keys.add(normalized);
      }
    }
    return Array.from(keys).sort();
  }, [clientProducts]);

  // Collect unique attribute values for group-from-attribute feature
  const attrOptions = useMemo(() => {
    if (!clientProducts?.products) return new Map<string, Set<string>>();
    const map = new Map<string, Set<string>>();
    // Standard variation attributes
    const attrs = ["Size", "Flavor", "Color", "Style", "Scent", "Material", "Pattern", "Count"];
    for (const p of clientProducts.products) {
      if (!assignedProductIds.has(p.id) || p.parentageLevel === "Parent") continue;
      for (const attr of attrs) {
        const val = p.variations?.[attr];
        if (val) {
          if (!map.has(attr)) map.set(attr, new Set());
          map.get(attr)!.add(val);
        }
      }
      // Also check theme attr keys
      for (const key of themeAttrKeys) {
        if (attrs.includes(key)) continue;
        const val = p.variations?.[key];
        if (val) {
          if (!map.has(key)) map.set(key, new Set());
          map.get(key)!.add(val);
        }
      }
    }
    return map;
  }, [clientProducts, assignedProductIds, themeAttrKeys]);

  // Helper: extract a sortable/filterable value from a product by column key
  // Product type + value extractor now live in the shared pool lib (DRY).
  type ClientProduct = PoolProduct;
  const getColValue = poolGetColValue;

  // Columns offered in the chip filter (standard + dynamic theme attrs).
  const filterColumns = useMemo(
    () => ["status", "varId", "group", "theme", "parentage", ...themeAttrKeys],
    [themeAttrKeys]
  );
  const filterLabels = useMemo<Record<string, string>>(
    () => ({
      status: "Status",
      varId: "Variation ID",
      group: "Variation Group",
      theme: "Variation Theme",
      parentage: "Parentage",
      ...Object.fromEntries(
        themeAttrKeys.map((k) => [k, themeAttrLabelMap?.[k.toLowerCase()] ?? k])
      ),
    }),
    [themeAttrKeys, themeAttrLabelMap]
  );
  // Flatten each product into a {col: value} row for AacColumnFilterBar's
  // distinct-value/count computation. Uses the FULL pool so counts are accurate.
  const filterRows = useMemo(
    () =>
      (clientProducts?.products ?? []).map((p) => {
        const row: Record<string, string> = {};
        for (const c of filterColumns) row[c] = getColValue(p, c);
        return row;
      }),
    [clientProducts, filterColumns, getColValue]
  );

  // Filtered + sorted products
  const displayProducts = useMemo(() => {
    if (!clientProducts?.products) return [];
    let items = [...clientProducts.products];

    // Helper: does this product belong to the current variation?
    const varCode = variation?.code ?? "";
    const belongsToVariation = (p: ClientProduct) =>
      effectiveAssignedIds.has(p.id) || (varCode && p.variationId === varCode);

    // When locked, only show products that belong to this variation
    if (variation?.status === "locked") {
      items = items.filter(belongsToVariation);
    }

    // Apply column filters (OR within a column, AND across columns).
    for (const [col, vals] of Object.entries(columnFilters)) {
      if (!vals?.length) continue;
      const set = new Set(vals);
      items = items.filter((p) => set.has(getColValue(p, col)));
    }

    // Primary sort: included products first, parents before children
    items.sort((a, b) => {
      const aIn = belongsToVariation(a) ? 0 : 1;
      const bIn = belongsToVariation(b) ? 0 : 1;
      if (aIn !== bIn) return aIn - bIn;

      // Within same inclusion group, parents first
      const aParent = a.parentageLevel === "Parent" ? 0 : 1;
      const bParent = b.parentageLevel === "Parent" ? 0 : 1;
      if (aParent !== bParent) return aParent - bParent;

      // Then apply user column sort
      if (sortCol) {
        const va = getColValue(a, sortCol).toLowerCase();
        const vb = getColValue(b, sortCol).toLowerCase();
        if (va < vb) return sortDir === "asc" ? -1 : 1;
        if (va > vb) return sortDir === "asc" ? 1 : -1;
      }
      return 0;
    });

    return items;
  }, [clientProducts, columnFilters, sortCol, sortDir, getColValue, effectiveAssignedIds, variation?.status, variation?.code]);

  const toggleSort = useCallback((col: string) => {
    if (sortCol === col) {
      if (sortDir === "asc") setSortDir("desc");
      else { setSortCol(null); setSortDir("asc"); }
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  }, [sortCol, sortDir]);

  // ── Loading / Error ──────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="p-4">
        <Skeleton className="h-5 w-32 mb-6" />
        <Skeleton className="h-10 w-64 mb-4" />
        <Skeleton className="h-6 w-48 mb-8" />
        <div className="space-y-4">
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (isError || !variation) {
    return (
      <div className="p-4">
        <Link
          href="/variations"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="size-4" />
          Variations
        </Link>
        <p className="text-sm text-muted-foreground">
          Failed to load variation. It may have been deleted.
        </p>
      </div>
    );
  }

  const selectedArr = Array.from(selectedIds);
  const primaryDim = variation.primaryDimension ?? "Group";

  const RENDER_CAP = 100;
  const renderedProducts = displayProducts.slice(0, RENDER_CAP);

  // Reverse-map current themeAttributes to the raw theme string from category data
  const currentThemeRaw = (() => {
    if (!themeOptions?.themes.length || !variation.themeAttributes?.length) return "";
    const curSet = new Set(variation.themeAttributes.map((a) => a.toLowerCase()));
    return (
      themeOptions.themes.find((t) => {
        const parsed = t.split(/[-\/]/).map((k) => {
          const stripped = k.replace(/_name$/i, "");
          return stripped.charAt(0).toUpperCase() + stripped.slice(1).toLowerCase();
        });
        const pSet = new Set(parsed.map((a) => a.toLowerCase()));
        return curSet.size === pSet.size && [...curSet].every((a) => pSet.has(a));
      }) ?? ""
    );
  })();

  // ── Render ───────────────────────────────────────────────────────

  return (
    <div className="-mt-6 lg:-mt-8">
      {/* Mobile guard */}
      <div className="md:hidden flex flex-col items-center justify-center py-20 px-6 text-center">
        <Monitor className="size-10 text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">
          Use a desktop browser for the variation builder.
        </p>
        <Link
          href="/variations"
          className="mt-4 text-sm text-brand hover:underline"
        >
          Back to Variations
        </Link>
      </div>

      <div className="hidden md:block">
        {/* Page heading + controls portaled into TopNav row 3 (page-meta-slot) */}
        <PageMetaSlot>
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <button
              onClick={() => {
                if (variation.status === "draft") {
                  setPendingNavigation("/variations");
                  setLeaveDialogOpen(true);
                } else {
                  router.push("/variations");
                }
              }}
              title="Back to Variations"
              aria-label="Back to Variations"
              className="rounded-md p-1.5 text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors shrink-0"
            >
              <ArrowLeft className="size-4" />
            </button>
            <InlineEdit
              value={variation.name}
              onSave={(name) => updateMut.mutate({ name })}
              className="flex min-w-0 flex-1 text-lg font-bold text-sidebar-foreground tracking-tighter leading-snug font-[family-name:var(--font-outfit)] [&>span:first-child]:line-clamp-2 [&>span:first-child]:flex-1"
            />
            <span className="text-[10px] font-bold text-muted-foreground font-mono shrink-0">
              {variation.code}
            </span>
            {variation.status === "locked" && (
              <Badge className="rounded-md px-2 py-0.5 text-[9px] font-bold bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30 shrink-0">
                <Lock className="size-2.5 mr-1" />
                Locked
              </Badge>
            )}
            {themeOptions && themeOptions.themes.length > 0 ? (
                <Select
                  disabled={variation.status === "locked"}
                  value={currentThemeRaw}
                  onValueChange={(raw) => {
                    // Parse theme: "SIZE_NAME-COLOR_NAME" → ["Size", "Color"]
                    const attrs = raw.split(/[-\/]/).map((k) => {
                      const stripped = k.replace(/_name$/i, "");
                      return stripped.charAt(0).toUpperCase() + stripped.slice(1).toLowerCase();
                    });
                    updateMut.mutate({
                      primaryDimension: attrs[0] ?? "Group",
                      themeAttributes: attrs,
                      variationThemeRaw: raw,
                    }, {
                      onSuccess: () => invalidateProducts(),
                    });
                  }}
                >
                  <SelectTrigger className="h-7 w-auto min-w-[140px] shrink-0 gap-1 rounded-md border border-stone-200 bg-white px-2 text-[10px] font-bold text-foreground dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100">
                    <SelectValue placeholder="Set theme…" />
                  </SelectTrigger>
                  <SelectContent>
                    {themeOptions.themes.map((t) => (
                      <SelectItem key={t} value={t} className="text-xs">
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : variation.themeAttributes &&
                variation.themeAttributes.length > 0 ? (
                <div className="flex gap-1 shrink-0">
                  {variation.themeAttributes.map((attr) => (
                    <Badge
                      key={attr}
                      variant="secondary"
                      className="rounded-md px-2 py-0.5 text-[9px] font-bold"
                    >
                      {attr}
                    </Badge>
                  ))}
                </div>
              ) : null}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {variation.status === "locked" ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => updateMut.mutate({ status: "draft" })}
                disabled={updateMut.isPending}
                className="gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-500/30 dark:text-amber-400 dark:hover:bg-amber-500/10"
              >
                <Lock className="size-3.5" />
                Locked
              </Button>
            ) : (
              <div className="relative">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (!canLock) {
                      setLockError(true);
                      setTimeout(() => setLockError(false), 3000);
                      return;
                    }
                    updateMut.mutate({ status: "locked" });
                  }}
                  disabled={updateMut.isPending}
                  className={cn(
                    "gap-1.5",
                    !canLock && "opacity-60 cursor-not-allowed"
                  )}
                >
                  <Unlock className="size-3.5" />
                  Lock Variation
                </Button>
                {lockError && (
                  <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 z-50 w-64 rounded-xl border border-red-200 bg-red-50 px-3 py-2 shadow-lg dark:border-red-800 dark:bg-red-900/20 animate-in fade-in slide-in-from-top-1">
                    <p className="text-xs font-bold text-red-600 dark:text-red-400">
                      {variation?.name.trim() === "New Variation"
                        ? "Please assign a name to the variation"
                        : "Please choose a Variation Theme and label the variation to proceed"}
                    </p>
                  </div>
                )}
              </div>
            )}

            {variation.status === "locked" && variation.groups.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSeoDialogOpen(true)}
                className="gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
              >
                <FileSearch className="size-3.5" />
                Create SEO Projects
              </Button>
            )}

          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
            onClick={() => setVariationDeleteOpen(true)}
          >
            <Trash2 className="size-4" />
          </Button>
          <DeleteConfirmDialog
            open={variationDeleteOpen}
            onOpenChange={setVariationDeleteOpen}
            onConfirm={() => deleteMut.mutate()}
            title="Delete variation?"
            description={(
              <>
                This will permanently delete{" "}
                <strong className="text-foreground">{variation.name}</strong>{" "}
                and all of its groups and tags. Products will be unlinked but
                not deleted. This action cannot be undone.
              </>
            )}
            pending={deleteMut.isPending}
            confirmLabel="Delete variation"
          />
          </div>
        </PageMetaSlot>

        {/* ── Client Products Pool ──────────────────────────────── */}
        <div ref={stickyHeaderRef} className="sticky -top-6 lg:-top-8 z-30 -mx-6 lg:-mx-10 px-6 lg:px-10 pt-2 lg:pt-3 pb-3 bg-background">
          {/* Heading + filter + counts + search share one row so the sticky
              block stays vertically compact; only the table scrolls under it. */}
          <div className="flex items-center gap-3 flex-wrap [&>div]:mt-0">
            <h2 className="text-xs font-bold uppercase tracking-wider text-brand shrink-0">
              Client Products
            </h2>
            {clientProducts && clientProducts.products.length > 0 && (
              <>
                <AacColumnFilterBar
                  columns={filterColumns}
                  labels={filterLabels}
                  rows={filterRows}
                  numericCols={new Set()}
                  filters={columnFilters}
                  onChange={setColumnFilters}
                />
                {displayProducts.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-brand"
                    onClick={() => setSelectedIds(new Set(displayProducts.map((p) => p.id)))}
                  >
                    Select all {displayProducts.length}
                  </Button>
                )}
                <span className="text-[10px] text-muted-foreground">
                  {displayProducts.length}
                  {displayProducts.length !== clientProducts.products.length
                    ? ` of ${clientProducts.products.length}`
                    : ""}{" "}
                  products
                </span>
              </>
            )}
            <div className="relative w-64 ml-auto shrink-0">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Search ASIN, SKU, title…"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="pl-8 h-8 rounded-md border border-stone-300 bg-white text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              />
            </div>
          </div>

          {clientProducts && clientProducts.products.length > 0 && (
            <>
              {clientProducts.capped && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-2">
                  Showing the first {POOL_CAP} products for this client. Use search to narrow the pool.
                </p>
              )}
              {displayProducts.length > RENDER_CAP && (
                <p className="text-[10px] text-muted-foreground mt-2 mb-1">
                  Showing first {RENDER_CAP} of {displayProducts.length} matching — bulk actions apply to all {displayProducts.length}.
                </p>
              )}
            </>
          )}
        </div>

        <div className="mb-8">

          {clientProducts && clientProducts.products.length > 0 ? (
            <>
              <div className="overflow-auto rounded-xl border border-stone-200 dark:border-zinc-800" style={{ maxHeight: `calc(100dvh - ${tableTop + 16}px)` }}>
                <table className="w-full text-xs" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
                  <thead>
                    <tr className="text-left align-top">
                      <th className="w-14 px-3 py-2.5 font-bold text-brand text-center sticky top-0 z-20 bg-background border-b border-stone-200 dark:border-zinc-800">
                        {/* Header "include all" intentionally scopes to the filtered/visible set (displayProducts), not the whole pool. */}
                        <IncludeAllCheckbox
                          products={displayProducts}
                          assignedProductIds={effectiveAssignedIds}
                          onToggleAll={(include, ids) => toggleMembership(ids, include)}
                        />
                      </th>
                      <th className="px-3 py-2.5 font-bold text-brand sticky top-0 z-20 bg-background border-b border-stone-200 dark:border-zinc-800 whitespace-nowrap" style={{ width: 150 }}>
                        <button onClick={() => toggleSort("asin")} className="flex flex-col items-start gap-0.5 hover:text-foreground transition-colors">
                          <span className="flex items-center gap-1">
                            ASIN
                            {sortCol === "asin" ? (sortDir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />) : <ArrowUpDown className="size-3 opacity-30" />}
                          </span>
                          <span className="!text-[10px] !font-normal !text-muted-foreground normal-case tracking-normal">SKU</span>
                        </button>
                      </th>
                      <th className="px-3 py-2.5 font-bold text-brand sticky top-0 z-20 bg-background border-b border-stone-200 dark:border-zinc-800 whitespace-nowrap">
                        <button onClick={() => toggleSort("status")} className="flex flex-col items-start gap-0.5 hover:text-foreground transition-colors">
                          <span className="flex items-center gap-1">
                            Listing Status
                            {sortCol === "status" ? (sortDir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />) : <ArrowUpDown className="size-3 opacity-30" />}
                          </span>
                          <span className="!text-[10px] !font-normal !text-muted-foreground normal-case tracking-normal">Parentage Level</span>
                        </button>
                      </th>
                      {["title", "varId", "group", "theme"].map((key) => (
                        <th key={key} className="px-3 py-2.5 font-bold text-brand sticky top-0 z-20 bg-background border-b border-stone-200 dark:border-zinc-800 whitespace-nowrap">
                          <button onClick={() => toggleSort(key)} className="flex items-center gap-1 hover:text-foreground transition-colors">
                            {{ title: "Item Name", varId: "Variation ID", group: "Variation Group", theme: "Variation Theme" }[key]}
                            {sortCol === key ? (sortDir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />) : <ArrowUpDown className="size-3 opacity-30" />}
                          </button>
                        </th>
                      ))}
                      <th className="px-3 py-2.5 font-bold text-brand sticky top-0 z-20 bg-background border-b border-stone-200 dark:border-zinc-800 whitespace-nowrap">Variety Pack</th>
                      {themeAttrKeys.map((key) => (
                        <th key={key} className="px-3 py-2.5 font-bold text-brand whitespace-nowrap sticky top-0 z-20 bg-background border-b border-stone-200 dark:border-zinc-800">
                          <button onClick={() => toggleSort(key)} className="flex items-center gap-1 hover:text-foreground transition-colors">
                            {themeAttrLabelMap?.[key.toLowerCase()] ?? key}
                            {sortCol === key ? (sortDir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />) : <ArrowUpDown className="size-3 opacity-30" />}
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {renderedProducts.map((p) => {
                      const isIncluded = effectiveAssignedIds.has(p.id);
                      return (
                        <tr
                          key={p.id}
                          className={cn(
                            "border-b border-stone-50 dark:border-zinc-800/50 transition-colors align-top",
                            isIncluded
                              ? "bg-amber-50 dark:bg-amber-500/10"
                              : "hover:bg-stone-50 dark:hover:bg-zinc-800/50"
                          )}
                        >
                          <td className="px-3 py-2 text-center">
                            <IncludeCheckbox
                              included={isIncluded}
                              onToggle={() => toggleMembership([p.id], !isIncluded)}
                            />
                          </td>
                          <td className="px-3 py-2 align-top" style={{ width: 150 }}>
                            <div className="flex items-start gap-2 min-w-0 w-[150px]">
                              <div className="size-8 rounded border border-stone-200 bg-stone-100 dark:border-zinc-700 dark:bg-zinc-800 overflow-hidden shrink-0">
                                {p.mainImageUrl ? (
                                  <Image src={hiResAmazonImg(p.mainImageUrl, 100)} alt="" width={32} height={32} className="h-full w-full object-cover" unoptimized />
                                ) : (
                                  <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                                    <PackageOpen className="size-4" />
                                  </div>
                                )}
                              </div>
                              <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                                <span className="flex items-center gap-1 min-w-0">
                                  <Link href={`/products/${p.id}?from=variation-builder&variation=${encodeURIComponent(id)}`} className="font-mono font-bold text-xs text-brand hover:underline whitespace-nowrap">
                                    {p.asin ?? "—"}
                                  </Link>
                                  <AmazonPdpLink asin={p.asin} />
                                </span>
                                <EditableCell
                                  productId={p.id}
                                  value={p.sku}
                                  field="sku"
                                  bqName="SKU"
                                  onSaved={invalidateProducts}
                                  className="font-mono !text-[10px] !font-normal text-muted-foreground line-clamp-2 break-words !whitespace-normal"
                                />
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2 align-top whitespace-nowrap">
                            <div className="flex flex-col items-start gap-1 min-w-0">
                              <StatusDropdown productId={p.id} value={p.status} onSaved={invalidateProducts} />
                              <ParentageDropdown productId={p.id} value={p.parentageLevel} onSaved={invalidateProducts} />
                            </div>
                          </td>
                          <td className="px-3 py-2 max-w-[280px]">
                            <EditableCell productId={p.id} value={p.itemName} field="itemName" bqName="ItemName" onSaved={invalidateProducts} className="text-foreground line-clamp-2 break-words" />
                          </td>
                          <td className="px-3 py-2 font-mono whitespace-nowrap">
                            <EditableCell productId={p.id} value={p.variationId} field="" bqName="VariationID" onSaved={invalidateProducts} className="font-mono text-foreground" />
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <GroupCell productId={p.id} variationId={id} groups={variation.groups} onSaved={() => { invalidateProducts(); invalidate(); }} className="text-foreground" />
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                            {p.variations?.VariationThemeName ?? "—"}
                          </td>
                          <td className="px-3 py-2">
                            {(p.varietyPackItemCount ?? 0) > 0 && (
                              <span className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[8px] font-bold bg-brand-vp/15 text-brand-vp border border-brand-vp/30" title={`${p.varietyPackItemCount} pack items`}>
                                <PackageOpen className="size-2.5" />
                              </span>
                            )}
                          </td>
                          {themeAttrKeys.map((key) => {
                            const val = p.variations?.[key] ?? p.rawColumnValues?.[key] ?? null;
                            const isVP = key === "Flavor" && !!p.isVp && p.vpFlavors?.length;
                            return (
                              <td key={key} className="px-3 py-2 whitespace-nowrap">
                                {isVP ? (
                                  <div className="flex flex-col gap-0.5">
                                    {p.vpFlavors!.map((f, i) => (
                                      <span key={i} className="text-[10px] text-brand-vp rounded border border-brand-vp/20 bg-brand-vp/5 px-2 py-0.5">{f}</span>
                                    ))}
                                  </div>
                                ) : (
                                  <EditableCell productId={p.id} value={val} field="" bqName={key} onSaved={invalidateProducts} className="text-foreground" />
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : clientProducts && clientProducts.products.length === 0 ? (
            <div className="text-center py-10">
              <PackageOpen className="size-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                {productSearch ? "No products match your search." : "No products found for this client."}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-lg" />
              ))}
            </div>
          )}
        </div>

        {/* ── Groups Section ──────────────────────────────────────── */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-brand">
              Groups ({primaryDim})
            </h2>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => suggestMut.mutate()}
                disabled={suggestMut.isPending}
                className="rounded-lg border border-stone-300 px-3 py-2 text-xs text-muted-foreground hover:bg-stone-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                {suggestMut.isPending ? (
                  <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Sparkles className="size-3.5 mr-1.5" />
                )}
                Auto-detect from Amazon
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setNewGroupName("");
                  setAddGroupOpen(true);
                }}
                className="rounded-lg bg-brand-group px-3 py-2 text-xs font-bold text-white hover:opacity-90"
              >
                <Plus className="size-3.5 mr-1" />
                Add Group
              </Button>
            </div>
          </div>

          {variation.groups.length === 0 &&
            variation.ungroupedProducts.length === 0 && (
              <div className="text-center py-12">
                <FolderTree className="size-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  No groups yet. Add groups manually or auto-detect from Amazon
                  data.
                </p>
              </div>
            )}

          <div className="space-y-3">
            {/* Named groups */}
            {variation.groups.map((group) => {
              const isOpen = openGroups.has(group.id);
              return (
                <div
                  key={group.id}
                  className={cn(
                    "rounded-xl border border-brand-group/20 bg-brand-group/5 transition-all",
                    isOpen && "shadow-sm"
                  )}
                >
                  <Collapsible
                    open={isOpen}
                    onOpenChange={() => toggleGroup(group.id)}
                  >
                    <div className="w-full flex items-center gap-3 px-5 py-3 text-left">
                      <CollapsibleTrigger asChild>
                        <button className="shrink-0 cursor-pointer">
                          <ChevronRight
                            className={cn(
                              "size-4 text-muted-foreground transition-transform",
                              isOpen && "rotate-90"
                            )}
                          />
                        </button>
                      </CollapsibleTrigger>
                        <div className="flex-1 min-w-0">
                          <InlineEdit
                            value={group.name}
                            onSave={(name) =>
                              renameGroupMut.mutate({
                                groupId: group.id,
                                name,
                              })
                            }
                            className="text-xs font-medium text-brand-group bg-brand-group/10 px-2 py-0.5 rounded-full border border-brand-group/20 inline-block"
                          />
                        </div>
                        {group.isVarietyPack && group.products.length > 0 && (
                          <a
                            href={`/products/${group.products[0].id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="shrink-0"
                          >
                            <Badge className="rounded-md px-2 py-0.5 text-[9px] font-bold bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/30 cursor-pointer hover:bg-amber-200 dark:hover:bg-amber-500/25 transition-colors gap-1">
                              <PackageOpen className="size-3" />
                              Variety Pack
                              <ExternalLink className="size-2.5" />
                            </Badge>
                          </a>
                        )}
                        {group.isVarietyPack && group.products.length === 0 && (
                          <Badge className="rounded-md px-2 py-0.5 text-[9px] font-bold bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/30 shrink-0">
                            Variety Pack
                          </Badge>
                        )}
                        <Badge
                          variant="outline"
                          className="rounded-md px-2 py-0.5 text-[9px] font-bold shrink-0"
                        >
                          {group.products.length} products
                        </Badge>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setGroupDeleteTarget({ id: group.id, name: group.name });
                          }}
                          className="p-1 text-muted-foreground hover:text-red-600 dark:hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                    </div>
                    <CollapsibleContent>
                      {/* Tab row */}
                      <div className="flex gap-0 border-b border-stone-100 dark:border-zinc-800 px-5 pt-3">
                        <button
                          className={cn(
                            "text-[10px] uppercase tracking-wider font-bold px-3 py-1.5 border-b-2 transition-colors",
                            (groupGuidelinesTabs[group.id] ?? "products") === "products"
                              ? "border-brand text-brand"
                              : "border-transparent text-muted-foreground hover:text-foreground"
                          )}
                          onClick={() => setGroupGuidelinesTabs((prev) => ({ ...prev, [group.id]: "products" }))}
                        >
                          Products
                        </button>
                        <button
                          className={cn(
                            "text-[10px] uppercase tracking-wider font-bold px-3 py-1.5 border-b-2 transition-colors",
                            groupGuidelinesTabs[group.id] === "guidelines"
                              ? "border-brand text-brand"
                              : "border-transparent text-muted-foreground hover:text-foreground"
                          )}
                          onClick={() => setGroupGuidelinesTabs((prev) => ({ ...prev, [group.id]: "guidelines" }))}
                        >
                          Guidelines
                        </button>
                      </div>
                      {(groupGuidelinesTabs[group.id] ?? "products") === "products" ? (
                        <div className="px-5 pb-4 space-y-1">
                          {group.products.length === 0 ? (
                            <p className="text-xs text-muted-foreground py-2 text-center">
                              No products in this group yet.
                            </p>
                          ) : (
                            group.products.map((p) => (
                              <div key={p.id} className="space-y-0">
                                <ProductRow
                                  product={p}
                                  selected={selectedIds.has(p.id)}
                                  onToggle={toggleSelect}
                                />
                              </div>
                            ))
                          )}
                        </div>
                      ) : (
                        <ContentGuidelinesForm
                          value={groupGuidelinesState[group.id] ?? {}}
                          inheritedFrom={variationGuidelines}
                          onChange={(gl) => {
                            setGroupGuidelinesState((prev) => ({ ...prev, [group.id]: gl }));
                            saveGroupGuidelines(group.id, gl);
                          }}
                        />
                      )}
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              );
            })}

            {/* Ungrouped children */}
            {variation.ungroupedProducts.filter((p) => p.parentageLevel !== "Parent").length > 0 && (
              <div className="rounded-xl border border-stone-200 bg-card dark:border-zinc-800 shadow-sm">
                <div className="px-5 py-3 flex items-center gap-3 border-b border-stone-100 dark:border-zinc-800">
                  <span className="text-sm font-bold text-muted-foreground">
                    Ungrouped
                  </span>
                  <Badge
                    variant="outline"
                    className="rounded-md px-2 py-0.5 text-[9px] font-bold"
                  >
                    {variation.ungroupedProducts.filter((p) => p.parentageLevel !== "Parent").length} products
                  </Badge>
                </div>
                <div className="px-5 py-3 space-y-1">
                  {variation.ungroupedProducts.filter((p) => p.parentageLevel !== "Parent").map((p) => (
                    <ProductRow
                      key={p.id}
                      product={p}
                      selected={selectedIds.has(p.id)}
                      onToggle={toggleSelect}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>


        {/* ── Bulk Toolbar ────────────────────────────────────────── */}
        {selectedArr.length > 0 && (
          <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-stone-200 bg-white/95 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/95">
            <div className="max-w-5xl mx-auto flex items-center gap-3 px-6 py-3">
              <span className="text-sm font-bold text-foreground">
                {selectedArr.length} selected
              </span>

              <Separator orientation="vertical" className="h-6" />

              <Button
                size="sm"
                variant="ghost"
                className="rounded-lg border border-brand/40 bg-brand/10 px-3 py-2 text-xs text-brand hover:bg-brand/20"
                onClick={() => { toggleMembership(selectedArr, true); setSelectedIds(new Set()); }}
              >
                <Plus className="size-3.5 mr-1.5" />
                Add to variation
              </Button>

              <Button
                size="sm"
                variant="ghost"
                className="rounded-lg border border-stone-300 px-3 py-2 text-xs text-muted-foreground hover:bg-stone-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                onClick={() => { toggleMembership(selectedArr, false); setSelectedIds(new Set()); }}
              >
                <Minus className="size-3.5 mr-1.5" />
                Remove from variation
              </Button>

              {/* Move to Group */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="rounded-lg border border-stone-300 px-3 py-2 text-xs text-muted-foreground hover:bg-stone-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    <MoveRight className="size-3.5 mr-1.5" />
                    Move to Group
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {variation.groups.map((g) => (
                    <DropdownMenuItem
                      key={g.id}
                      onClick={() =>
                        assignMut.mutate({
                          productIds: selectedArr,
                          groupId: g.id,
                        })
                      }
                    >
                      {g.name}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuItem
                    onClick={() =>
                      assignMut.mutate({
                        productIds: selectedArr,
                        groupId: null,
                      })
                    }
                  >
                    <span className="text-muted-foreground">Ungrouped</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Remove from Group */}
              {variation.groups.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="rounded-lg border border-stone-300 px-3 py-2 text-xs text-muted-foreground hover:bg-stone-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                    >
                      <Minus className="size-3.5 mr-1.5" />
                      Remove from Group
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {variation.groups.map((g) => (
                      <DropdownMenuItem
                        key={g.id}
                        onClick={() =>
                          removeFromGroupMut.mutate({ groupId: g.id, productIds: selectedArr })
                        }
                      >
                        {g.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}


              <div className="ml-auto">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelectedIds(new Set())}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear selection
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── Variation Content Guidelines (defaults) ────────────────── */}
        <div className="mb-8 mt-2 rounded-xl border border-stone-200 dark:border-zinc-800 bg-card">
          <div className="flex items-center justify-between px-5 py-3 border-b border-stone-200 dark:border-zinc-800">
            <span className="text-xs font-bold uppercase tracking-wider text-brand">
              Content Guidelines — Variation Defaults
            </span>
            {saveVariationGuidelinesMut.isPending && (
              <Loader2 className="size-3.5 animate-spin text-muted-foreground shrink-0" />
            )}
          </div>
          <ContentGuidelinesForm
            value={variationGuidelines}
            onChange={(gl) => {
              setVariationGuidelines(gl);
              saveVariationGuidelinesMut.mutate(gl);
            }}
          />
        </div>

        {/* ── Add Group Dialog ────────────────────────────────────── */}
        <Dialog open={addGroupOpen} onOpenChange={(open) => {
          setAddGroupOpen(open);
          if (!open) { setGroupAttr(""); setGroupAttrValue(""); setNewGroupName(""); }
        }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add Group</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {/* Attribute selector */}
              {attrOptions.size > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">Group by Attribute</Label>
                  <Select value={groupAttr} onValueChange={(v) => { setGroupAttr(v); setGroupAttrValue(""); setNewGroupName(""); }}>
                    <SelectTrigger className="rounded-md border border-stone-300 bg-white text-sm dark:border-zinc-700 dark:bg-zinc-900">
                      <SelectValue placeholder="Select attribute…" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from(attrOptions.keys()).sort().map((attr) => (
                        <SelectItem key={attr} value={attr}>{attr}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Value selector (shown after attribute is picked) */}
              {groupAttr && attrOptions.get(groupAttr) && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">Value</Label>
                  <div className="flex flex-wrap gap-2">
                    {Array.from(attrOptions.get(groupAttr)!).sort().map((val) => {
                      const abbrev = abbreviateGroupName(val).toLowerCase();
                      const alreadyExists = variation.groups.some(
                        (g) => g.name.toLowerCase() === val.toLowerCase() || g.name.toLowerCase() === abbrev
                      );
                      return (
                        <button
                          key={val}
                          onClick={() => { setGroupAttrValue(val); setNewGroupName(suggestGroupName(groupAttr, val)); }}
                          className={cn(
                            "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                            groupAttrValue === val
                              ? "border-brand bg-brand/10 text-brand"
                              : alreadyExists
                                ? "border-stone-200 bg-stone-50 text-muted-foreground/40 dark:border-zinc-800 dark:bg-zinc-900 opacity-50"
                                : "border-stone-300 bg-white hover:border-brand/50 hover:bg-brand/5 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-brand/50"
                          )}
                        >
                          {val}
                        </button>
                      );
                    })}
                  </div>
                  {groupAttrValue && (
                    <p className="text-[10px] text-muted-foreground">
                      {clientProducts?.products.filter(
                        (p) => assignedProductIds.has(p.id) && p.parentageLevel !== "Parent" && p.variations?.[groupAttr] === groupAttrValue
                      ).length ?? 0} products will be auto-assigned
                    </p>
                  )}
                </div>
              )}

              {/* Separator or manual name */}
              {attrOptions.size > 0 && (
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-[10px] text-muted-foreground">or enter manually</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Group Name</Label>
                <Input
                  autoFocus={attrOptions.size === 0}
                  placeholder="e.g. Chocolate Flavors"
                  value={newGroupName}
                  onChange={(e) => { setNewGroupName(e.target.value); setGroupAttr(""); setGroupAttrValue(""); }}
                  className="rounded-md border border-stone-300 bg-white text-sm text-foreground dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newGroupName.trim()) {
                      handleCreateGroup();
                    }
                  }}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setAddGroupOpen(false)}
                className="rounded-lg border border-stone-300 px-3 py-2 text-xs text-muted-foreground hover:bg-stone-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateGroup}
                disabled={!newGroupName.trim() || createGroupMut.isPending}
                className="rounded-lg bg-brand-solid px-4 py-2 text-sm font-bold text-white hover:bg-brand-solid-hover shadow-[0_0_16px_-4px_var(--brand-glow)]"
              >
                {createGroupMut.isPending && (
                  <Loader2 className="size-4 mr-1.5 animate-spin" />
                )}
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      {/* SEO Projects Confirmation Dialog */}
      <Dialog open={seoDialogOpen} onOpenChange={setSeoDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create SEO Projects</DialogTitle>
          </DialogHeader>

          {/* Mode toggle */}
          <div className="flex rounded-lg border border-stone-200 dark:border-zinc-700 overflow-hidden text-xs">
            <button
              onClick={() => setSeoMode("per-group")}
              className={cn(
                "flex-1 px-3 py-2 font-medium transition-colors",
                seoMode === "per-group"
                  ? "bg-violet-600 text-white dark:bg-violet-500"
                  : "text-muted-foreground hover:bg-stone-50 dark:hover:bg-zinc-800"
              )}
            >
              One per group
            </button>
            <button
              onClick={() => setSeoMode("all")}
              className={cn(
                "flex-1 px-3 py-2 font-medium transition-colors",
                seoMode === "all"
                  ? "bg-violet-600 text-white dark:bg-violet-500"
                  : "text-muted-foreground hover:bg-stone-50 dark:hover:bg-zinc-800"
              )}
            >
              Whole variation
            </button>
          </div>

          {seoMode === "per-group" ? (
            <>
              <p className="text-xs text-muted-foreground mb-2">
                Creates one SEO project per group from <span className="font-bold text-foreground">{variation?.name}</span>:
              </p>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {variation?.groups
                  .filter((g) => g.products.length > 0)
                  .map((g) => (
                    <div
                      key={g.id}
                      className="flex items-center justify-between rounded-md border border-stone-200 px-3 py-2 text-xs dark:border-zinc-700"
                    >
                      <span className="font-medium text-foreground">
                        {variation.code}_{g.name}
                      </span>
                      <span className="text-muted-foreground">
                        {g.products.length} product{g.products.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                  ))}
              </div>
              {variation?.groups.filter((g) => g.products.length === 0).length ? (
                <p className="text-[10px] text-muted-foreground mt-1">
                  {variation.groups.filter((g) => g.products.length === 0).length} empty group{variation.groups.filter((g) => g.products.length === 0).length !== 1 ? "s" : ""} will be skipped.
                </p>
              ) : null}
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground mb-2">
                Creates a single SEO project with all products from <span className="font-bold text-foreground">{variation?.name}</span>:
              </p>
              <div className="rounded-md border border-stone-200 px-3 py-2 text-xs dark:border-zinc-700 flex items-center justify-between">
                <span className="font-medium text-foreground">{variation?.code}</span>
                <span className="text-muted-foreground">
                  {variation?.groups.reduce((sum, g) => sum + g.products.length, 0)} product{(variation?.groups.reduce((sum, g) => sum + g.products.length, 0) ?? 0) !== 1 ? "s" : ""} across {variation?.groups.filter((g) => g.products.length > 0).length} group{(variation?.groups.filter((g) => g.products.length > 0).length ?? 0) !== 1 ? "s" : ""}
                </span>
              </div>
            </>
          )}

          <DialogFooter className="mt-4">
            <Button
              variant="ghost"
              onClick={() => setSeoDialogOpen(false)}
              className="rounded-lg border border-stone-300 px-3 py-2 text-xs text-muted-foreground hover:bg-stone-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Cancel
            </Button>
            <Button
              onClick={() => createSeoMut.mutate()}
              disabled={createSeoMut.isPending}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-500 dark:bg-violet-500 dark:hover:bg-violet-400"
            >
              {createSeoMut.isPending && (
                <Loader2 className="size-4 mr-1.5 animate-spin" />
              )}
              {seoMode === "all"
                ? "Create 1 Project"
                : `Create ${variation?.groups.filter((g) => g.products.length > 0).length} Project${(variation?.groups.filter((g) => g.products.length > 0).length ?? 0) !== 1 ? "s" : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Leave warning dialog */}
      <Dialog open={leaveDialogOpen} onOpenChange={(open) => {
        setLeaveDialogOpen(open);
        if (!open) setPendingNavigation(null);
      }}>
        <DialogContent className="rounded-xl p-5 font-[family-name:var(--font-outfit)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xs font-bold text-foreground">
              Warning
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Please choose a Variation Theme and label the variation to proceed
          </p>
          <DialogFooter className="gap-2 mt-4">
            <Button
              variant="ghost"
              onClick={() => setLeaveDialogOpen(false)}
              className="rounded-lg border border-stone-300 px-3 py-2 text-xs text-muted-foreground hover:bg-stone-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Stay
            </Button>
            <Button
              onClick={async () => {
                setLeaveDialogOpen(false);
                await deleteMut.mutateAsync();
                if (pendingNavigation) {
                  window.location.href = pendingNavigation;
                } else {
                  router.push("/variations");
                }
              }}
              className="rounded-lg px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700"
            >
              Leave Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={!!groupDeleteTarget}
        onOpenChange={(o) => { if (!o) setGroupDeleteTarget(null); }}
        onConfirm={() => {
          if (groupDeleteTarget) {
            deleteGroupMut.mutate(groupDeleteTarget.id, {
              onSuccess: () => setGroupDeleteTarget(null),
            });
          }
        }}
        title="Delete group?"
        description={groupDeleteTarget ? (
          <>
            This will permanently delete group{" "}
            <strong className="text-foreground">{groupDeleteTarget.name}</strong>.
            Products in this group will be moved to Ungrouped. This action cannot be undone.
          </>
        ) : null}
        pending={deleteGroupMut.isPending}
        confirmLabel="Delete group"
      />
      </div>
    </div>
  );
}
