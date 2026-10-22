"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useCallback, useMemo } from "react";
import { isEditorOrAbove } from "@/lib/roles";
import { DEFAULT_REC_SETTINGS, type RecSettings } from "@/lib/inventory/rec-settings";
import type { OverrideRow } from "@/lib/inventory/overrides";
import type { BufferRow } from "@/lib/inventory/buffers";
import type { SnapshotHeader, SnapshotRowInput } from "@/lib/inventory/snapshot";
import type { WindowsResponse } from "@/app/api/sales-summary/inventory/windows/route";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json() as Promise<T>;
}

async function send(url: string, method: string, body?: unknown): Promise<{ ok: boolean; json: Record<string, unknown> }> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, json };
}

export function useInventoryFinal({ clientIdCode, accountIds, enabled }: { clientIdCode?: string; accountIds?: string; enabled: boolean }) {
  const qc = useQueryClient();
  const { data: session } = useSession();
  const canEdit = isEditorOrAbove(session?.user?.role);
  const on = enabled && !!clientIdCode;
  const code = clientIdCode ?? "";

  const settingsQ = useQuery({
    queryKey: ["inv-rec-settings", code],
    queryFn: () => getJson<RecSettings>(`/api/inventory-rec-settings?clientIdCode=${encodeURIComponent(code)}`),
    enabled: on,
  });
  const settings = settingsQ.data ?? DEFAULT_REC_SETTINGS;

  const windowsParams = useMemo(() => {
    const p = new URLSearchParams({ accountIds: accountIds ?? "", recentDays: String(settings.recentDays) });
    if (settings.seasonalStart && settings.seasonalEnd) {
      p.set("seasonalStart", settings.seasonalStart);
      p.set("seasonalEnd", settings.seasonalEnd);
    }
    return p.toString();
  }, [accountIds, settings.recentDays, settings.seasonalStart, settings.seasonalEnd]);

  const windowsQ = useQuery({
    queryKey: ["inv-rec-windows", windowsParams],
    queryFn: () => getJson<WindowsResponse>(`/api/sales-summary/inventory/windows?${windowsParams}`),
    enabled: on && !!accountIds && settingsQ.isSuccess,
    staleTime: 5 * 60_000,
  });

  const overridesQ = useQuery({
    queryKey: ["inv-rec-overrides", code],
    queryFn: () => getJson<{ overrides: OverrideRow[] }>(`/api/inventory-rec-overrides?client=${encodeURIComponent(code)}`),
    enabled: on,
  });
  const overrides = useMemo(
    () => new Map((overridesQ.data?.overrides ?? []).map((o) => [o.sku, o])),
    [overridesQ.data],
  );

  const buffersQ = useQuery({
    queryKey: ["inv-rec-buffers", code],
    queryFn: () => getJson<{ buffers: BufferRow[] }>(`/api/inventory-rec-buffers?client=${encodeURIComponent(code)}`),
    enabled: on,
  });
  const buffers = useMemo(
    () => new Map((buffersQ.data?.buffers ?? []).map((b) => [b.sku, b.bufferPct])),
    [buffersQ.data],
  );

  const snapshotsQ = useQuery({
    queryKey: ["inv-rec-snapshots", code],
    queryFn: () => getJson<{ snapshots: SnapshotHeader[] }>(`/api/inventory-rec-snapshots?client=${encodeURIComponent(code)}`),
    enabled: on,
  });

  const saveSettings = useCallback(async (s: RecSettings) => {
    const r = await send("/api/inventory-rec-settings", "POST", { clientIdCode: code, ...s });
    if (!r.ok) return String(r.json.error ?? "Could not save settings");
    await qc.invalidateQueries({ queryKey: ["inv-rec-settings", code] });
    return null;
  }, [code, qc]);

  const saveOverride = useCallback(async (o: { asin: string; sku: string; qty: number; note: string }) => {
    const r = await send("/api/inventory-rec-overrides", "PUT", { clientIdCode: code, ...o });
    if (!r.ok) return String(r.json.error ?? "Could not save override");
    await qc.invalidateQueries({ queryKey: ["inv-rec-overrides", code] });
    return null;
  }, [code, qc]);

  const clearOverride = useCallback(async (sku: string) => {
    const r = await send(`/api/inventory-rec-overrides?client=${encodeURIComponent(code)}&sku=${encodeURIComponent(sku)}`, "DELETE");
    if (!r.ok) return String(r.json.error ?? "Could not clear override");
    await qc.invalidateQueries({ queryKey: ["inv-rec-overrides", code] });
    return null;
  }, [code, qc]);

  const saveBuffer = useCallback(async (sku: string, bufferPct: number) => {
    const r = await send("/api/inventory-rec-buffers", "PUT", { clientIdCode: code, sku, bufferPct });
    if (!r.ok) return String(r.json.error ?? "Could not save buffer");
    await qc.invalidateQueries({ queryKey: ["inv-rec-buffers", code] });
    return null;
  }, [code, qc]);

  const clearBuffer = useCallback(async (sku: string) => {
    const r = await send(`/api/inventory-rec-buffers?client=${encodeURIComponent(code)}&sku=${encodeURIComponent(sku)}`, "DELETE");
    if (!r.ok) return String(r.json.error ?? "Could not reset buffer");
    await qc.invalidateQueries({ queryKey: ["inv-rec-buffers", code] });
    return null;
  }, [code, qc]);

  const createSnapshot = useCallback(async (rows: SnapshotRowInput[]) => {
    const r = await send("/api/inventory-rec-snapshots", "POST", { clientIdCode: code, settings, rows });
    if (!r.ok) return { error: String(r.json.error ?? "Could not save the snapshot") };
    await qc.invalidateQueries({ queryKey: ["inv-rec-snapshots", code] });
    return { snapshot: r.json.snapshot as SnapshotHeader };
  }, [code, settings, qc]);

  const loadSnapshotRows = useCallback(async (id: string) => {
    const r = await getJson<{ rows: SnapshotRowInput[] }>(`/api/inventory-rec-snapshots/${id}`);
    return r.rows;
  }, []);

  const windowsStatus: "idle" | "loading" | "error" | "ready" = !on
    ? "idle"
    : windowsQ.isError || settingsQ.isError
      ? "error"
      : windowsQ.isSuccess
        ? "ready"
        : "loading";

  // Send must wait for overrides AND buffers: an empty Map while loading or
  // after an error would publish every Final with no override / the default
  // buffer, silently. Both gate the same "overrides" status.
  const overridesStatus: "idle" | "loading" | "error" | "ready" = !on
    ? "idle"
    : overridesQ.isError || buffersQ.isError
      ? "error"
      : overridesQ.isSuccess && buffersQ.isSuccess
        ? "ready"
        : "loading";

  return {
    settings,
    settingsReady: settingsQ.isSuccess,
    saveSettings,
    windows: windowsQ.data,
    windowsStatus,
    overrides,
    overridesStatus,
    saveOverride,
    clearOverride,
    buffers,
    saveBuffer,
    clearBuffer,
    snapshots: snapshotsQ.data?.snapshots ?? [],
    createSnapshot,
    loadSnapshotRows,
    canEdit,
  };
}
