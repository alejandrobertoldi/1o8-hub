"use client";

import { useCallback, useEffect, useState } from "react";

export type GroupId = "stock" | "sales" | "health" | "methods";

export const GROUPS: { id: GroupId; label: string }[] = [
  { id: "stock", label: "Stock detail" },
  { id: "sales", label: "Sales" },
  { id: "health", label: "Health" },
  { id: "methods", label: "All methods" },
];

const KEY = "mfhub.inventory.openGroups";
const IDS = new Set<string>(GROUPS.map((g) => g.id));

export function parseOpenGroups(raw: string | null): GroupId[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? (v.filter((x) => typeof x === "string" && IDS.has(x)) as GroupId[]) : [];
  } catch {
    return [];
  }
}

export function useCollapsedGroups() {
  const [open, setOpen] = useState<GroupId[]>([]);
  useEffect(() => {
    try { setOpen(parseOpenGroups(window.localStorage.getItem(KEY))); } catch { /* storage blocked */ }
  }, []);
  const toggle = useCallback((g: GroupId) => {
    setOpen((prev) => {
      const next = prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g];
      try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
      return next;
    });
  }, []);
  const isOpen = useCallback((g: GroupId) => open.includes(g), [open]);
  return { isOpen, toggle };
}
