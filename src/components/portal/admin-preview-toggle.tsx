"use client";
import { hasAdminPowers } from "@/lib/roles";

import { useSession } from "next-auth/react";
import { usePathname, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { CLIENT_NAMES } from "@/lib/constants";

type ClientUser = {
  id: string;
  role: string;
  allowedSections: string[];
  clientIdCode: string | null;
};

// Map first /portal/<segment> → canonical permission ID. Falls back to the
// segment itself; bottom of file resolves whether the section is togglable.
const PATH_PERMISSION: Record<string, string> = {
  timeline: "timeline",
  sales: "sales",
  "sales-monitor": "sales",
  products: "products",
  attributes: "products",
  reviews: "reviews",
  seo: "seo",
  design: "design",
  aplus: "aplus",
  brandstory: "brandstory",
  "listing-images": "listing-images",
  storefront: "storefront",
  reports: "reports",
  finance: "finances",
};

export function AdminPreviewToggle() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const queryClient = useQueryClient();

  const isAdmin = hasAdminPowers(session?.user?.role);
  const previewClient = isAdmin ? searchParams?.get("client") : null;

  const { data: allUsers = [] } = useQuery<ClientUser[]>({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const res = await fetch("/api/admin/users");
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!(isAdmin && previewClient),
    staleTime: 5 * 60 * 1000,
  });

  const previewBulkMutation = useMutation({
    mutationFn: async (updates: { userId: string; allowedSections: string[] }[]) => {
      const results = await Promise.allSettled(
        updates.map((u) =>
          fetch("/api/admin/users", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(u),
          }).then((res) => {
            if (!res.ok) throw new Error("Failed");
          }),
        ),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) throw new Error(`${failed} update(s) failed`);
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success(`Updated ${vars.length} user(s)`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isAdmin || !previewClient) return null;
  // Dashboard already has per-card toggles — skip banner toggle there.
  if (pathname === "/portal") return null;

  const segments = (pathname ?? "").split("/").filter(Boolean); // ["portal", "<section>", ...]
  const firstSeg = segments[1];
  const permission = firstSeg ? PATH_PERMISSION[firstSeg] ?? null : null;

  const previewGroup = allUsers.filter(
    (u) =>
      (u.role === "client" || u.role === "prospect") &&
      (u.clientIdCode ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .includes(previewClient),
  );

  let state: "all" | "none" | "mixed" = "all";
  if (permission && previewGroup.length > 0) {
    const have = previewGroup.filter((u) => (u.allowedSections ?? []).includes(permission)).length;
    if (have === previewGroup.length) state = "all";
    else if (have === 0) state = "none";
    else state = "mixed";
  }

  function togglePermission() {
    if (!permission) return;
    const enable = state === "none";
    const updates = previewGroup
      .map((u) => {
        const current = u.allowedSections ?? [];
        const has = current.includes(permission);
        if (enable && has) return null;
        if (!enable && !has) return null;
        const next = enable
          ? [...current, permission]
          : current.filter((s) => s !== permission);
        return { userId: u.id, allowedSections: next };
      })
      .filter((x): x is { userId: string; allowedSections: string[] } => x !== null);
    if (updates.length === 0) return;
    previewBulkMutation.mutate(updates);
  }

  const clientLabel = CLIENT_NAMES[previewClient] || previewClient;

  return (
    /* mf-no-print: src/app/portal/layout.tsx renders this above LayoutRouter's
       print-route exclusion (a route-segment layout is outside its control), so
       without this marker the banner appears inside every portal print document.
       The class is defined only in src/components/reports/print/print.css, which
       loads only on print routes, so it is inert everywhere else. */
    <div className="mf-no-print rounded-lg border border-portal-accent/30 bg-portal-accent/10 px-4 py-2.5 text-sm text-portal-accent flex items-center justify-between gap-2 mb-4">
      <div className="flex items-center gap-2 min-w-0">
        <Eye className="size-4 shrink-0" />
        <span className="truncate">
          <strong>Admin preview</strong> — viewing portal as <strong>{clientLabel}</strong>
        </span>
        {previewGroup.length === 0 && (
          <span className="ml-2 text-[11px] text-amber-500 bg-amber-500/10 border border-amber-500/30 rounded-md px-1.5 py-0.5">
            No users — toggle inactive
          </span>
        )}
        {permission && previewGroup.length > 0 && (
          <button
            type="button"
            onClick={togglePermission}
            disabled={previewBulkMutation.isPending}
            title={
              state === "all"
                ? `Disable this section for all ${previewGroup.length} user(s)`
                : state === "mixed"
                  ? `Mixed access — enable for all ${previewGroup.length} user(s)`
                  : `Enable this section for all ${previewGroup.length} user(s)`
            }
            className="ml-2 inline-flex items-center gap-1.5 rounded-md border border-portal-accent/40 bg-background/40 px-2 py-1 text-xs hover:bg-background/70 transition-colors disabled:opacity-50"
          >
            {state === "all" ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
            <span>
              {state === "all" ? "Enabled" : state === "mixed" ? "Partial" : "Disabled"}
            </span>
            <span className="text-portal-accent/70">· {previewGroup.length} user{previewGroup.length === 1 ? "" : "s"}</span>
          </button>
        )}
      </div>
      <Link href="/portal" className="text-xs hover:underline shrink-0">
        Exit preview →
      </Link>
    </div>
  );
}
