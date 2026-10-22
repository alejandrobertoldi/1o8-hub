import { createContext } from "react";
import type { aplusModules, aplusModuleImages } from "@/lib/db/schema";
import type { AplusModuleType } from "@/lib/aplus-module-specs";

// ─── Shared types ────────────────────────────────────────────────

export type AplusModule = typeof aplusModules.$inferSelect;
export type AplusModuleImage = typeof aplusModuleImages.$inferSelect;
export type AplusStatus = "draft" | "in_review" | "approved" | "uploaded";
export type FieldSaveState = "idle" | "saving" | "saved" | "error";

// ─── Contexts ────────────────────────────────────────────────────

export const ProductFallbackCtx = createContext<{
  clientIdCode?: string | null;
  asin?: string | null;
  productName?: string | null;
}>({});

export const ModuleNamingCtx = createContext<{
  moduleType?: AplusModuleType;
  modulePosition?: number;
  marketplace?: string | null;
}>({});

export const SetConfigCtx = createContext<{
  scopeType?: string;
  scopeIdentifier?: string;
  platform?: string;
  version?: number;
  groupNumber?: number;
  parentAsin?: string;
  coveredAsins?: string[];
  clientIdCode?: string;
  asin?: string;
}>({});

// ─── Composite types ────────────────────────────────────────────

export type AplusModuleWithImages = AplusModule & { images: AplusModuleImage[] };

export type CommentPin = {
  id: string;
  moduleId: string | null;
  pinX: number;
  pinY: number;
  commentNumber: number | null;
  status: "active" | "resolved";
  isClient: boolean;
};

export type PendingPin = {
  moduleId: string;
  moduleNumber: number;
  pinX: number;
  pinY: number;
};

// ─── Props ───────────────────────────────────────────────────────

export interface AplusModuleCardProps {
  module: AplusModule & { images: AplusModuleImage[] };
  productId: string;
  readOnly: boolean;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  isFirst?: boolean;
  isLast?: boolean;
  productClientIdCode?: string | null;
  productAsin?: string | null;
  productName?: string | null;
  productMarketplace?: string | null;
  sortableProps?: {
    attributes: Record<string, unknown>;
    listeners: Record<string, unknown> | undefined;
    setNodeRef: (node: HTMLElement | null) => void;
    style: React.CSSProperties;
  };
}

// ─── Constants ───────────────────────────────────────────────────

export const STATUS_OPTIONS: { value: AplusStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "in_review", label: "In Review" },
  { value: "approved", label: "Approved" },
  { value: "uploaded", label: "Uploaded" },
];

export const STATUS_COLORS: Record<AplusStatus, { bg: string; text: string; border: string }> = {
  draft: { bg: "#f0f2f4", text: "#565959", border: "#d5d9d9" },
  in_review: { bg: "#fff8e1", text: "#b45309", border: "#f59e0b" },
  approved: { bg: "#ecfdf5", text: "#047857", border: "#10b981" },
  uploaded: { bg: "#eff6ff", text: "#1d4ed8", border: "#3b82f6" },
};

export const EXCEEDED_BORDER = "#c45500";

// ─── API helpers ─────────────────────────────────────────────────

export async function patchModule(
  productId: string,
  moduleId: string,
  data: Record<string, unknown>
) {
  const res = await fetch(`/api/aplus/${productId}/modules/${moduleId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to save");
  }
  return res.json();
}

export async function deleteModule(productId: string, moduleId: string) {
  const res = await fetch(`/api/aplus/${productId}/modules/${moduleId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete module");
  return res.json();
}
