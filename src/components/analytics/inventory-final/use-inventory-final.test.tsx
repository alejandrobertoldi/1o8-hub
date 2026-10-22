import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
const sessionRole = { value: "editor" };
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { role: sessionRole.value } }, status: "authenticated" }) }));

import { useInventoryFinal } from "./use-inventory-final";

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
);

function mockFetch(routes: Record<string, unknown>) {
  return vi.fn(async (url: string) => {
    const key = Object.keys(routes).find((k) => url.startsWith(k));
    return new Response(JSON.stringify(key ? routes[key] : {}), { status: 200 });
  });
}

afterEach(() => { vi.unstubAllGlobals(); sessionRole.value = "editor"; });

describe("useInventoryFinal", () => {
  it("loads settings then windows with the settings' params", async () => {
    const f = mockFetch({
      "/api/inventory-rec-settings": { method: "seasonal", recentDays: 120, seasonalStart: "2024-10-01", seasonalEnd: "2025-01-31", upliftPct: 30 },
      "/api/sales-summary/inventory/windows": { recent: { start: "a", end: "b" }, seasonal: { start: "c", end: "d" }, units: {} },
      "/api/inventory-rec-overrides": { overrides: [{ asin: "B0", sku: "S", qty: 5, note: "", setBy: "x", setAt: "2026-10-07T00:00:00.000Z" }] },
      "/api/inventory-rec-snapshots": { snapshots: [] },
    });
    vi.stubGlobal("fetch", f);
    const { result } = renderHook(() => useInventoryFinal({ clientIdCode: "POO_SC_US", accountIds: "12", enabled: true }), { wrapper });
    await waitFor(() => expect(result.current.windowsStatus).toBe("ready"));
    const windowsUrl = f.mock.calls.map((c) => c[0] as string).find((u) => u.includes("/windows"))!;
    expect(windowsUrl).toContain("recentDays=120");
    expect(windowsUrl).toContain("seasonalStart=2024-10-01");
    await waitFor(() => expect(result.current.overrides.get("S")?.qty).toBe(5));
  });

  it("does nothing when disabled (portal read-only)", async () => {
    const f = mockFetch({});
    vi.stubGlobal("fetch", f);
    const { result } = renderHook(() => useInventoryFinal({ clientIdCode: "POO_SC_US", accountIds: "12", enabled: false }), { wrapper });
    await act(async () => {});
    expect(f).not.toHaveBeenCalled();
    expect(result.current.windowsStatus).toBe("idle");
  });

  it("reports overridesStatus error when the overrides fetch fails", async () => {
    const f = vi.fn(async (url: string) => {
      if (url.startsWith("/api/inventory-rec-overrides")) return new Response(JSON.stringify({ error: "boom" }), { status: 500 });
      if (url.startsWith("/api/inventory-rec-settings")) return new Response(JSON.stringify({ method: "recent", recentDays: 90, seasonalStart: null, seasonalEnd: null, upliftPct: 0 }), { status: 200 });
      if (url.startsWith("/api/sales-summary/inventory/windows")) return new Response(JSON.stringify({ recent: { start: "a", end: "b" }, seasonal: { start: "c", end: "d" }, units: {} }), { status: 200 });
      return new Response(JSON.stringify({ snapshots: [] }), { status: 200 });
    });
    vi.stubGlobal("fetch", f);
    const { result } = renderHook(() => useInventoryFinal({ clientIdCode: "POO_SC_US", accountIds: "12", enabled: true }), { wrapper });
    await waitFor(() => expect(result.current.overridesStatus).toBe("error"));
    expect(result.current.overrides.size).toBe(0);
  });

  it("overridesStatus is ready on success and idle when disabled", async () => {
    vi.stubGlobal("fetch", mockFetch({ "/api/inventory-rec-overrides": { overrides: [] } }));
    const on = renderHook(() => useInventoryFinal({ clientIdCode: "POO_SC_US", accountIds: "12", enabled: true }), { wrapper });
    await waitFor(() => expect(on.result.current.overridesStatus).toBe("ready"));
    const off = renderHook(() => useInventoryFinal({ clientIdCode: "POO_SC_US", accountIds: "12", enabled: false }), { wrapper });
    expect(off.result.current.overridesStatus).toBe("idle");
  });

  it("canEdit follows the session role", () => {
    vi.stubGlobal("fetch", mockFetch({}));
    sessionRole.value = "viewer";
    const { result } = renderHook(() => useInventoryFinal({ clientIdCode: "POO_SC_US", accountIds: "12", enabled: false }), { wrapper });
    expect(result.current.canEdit).toBe(false);
  });
});
