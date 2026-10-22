/* eslint-disable react-doctor/nextjs-missing-metadata */
"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { ArrowLeft } from "lucide-react";
import { StorefrontPageEditor } from "@/components/storefront/storefront-page-editor";

type CategoryStatus = {
  category: string;
  status: string;
  notes: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

type ClientDesign = {
  clientIdCode: string;
  clientName: string;
  categories: CategoryStatus[];
};

async function fetchDesignStatus(): Promise<ClientDesign[]> {
  const res = await fetch("/api/design-status");
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
}

// ── Page ───────────────────────────────────────────────────────────────

export default function StorefrontEditorPage() {
  const params = useParams();
  const router = useRouter();
  const clientIdCode =
    typeof params.clientIdCode === "string" ? params.clientIdCode : "";

  const { data: clients } = useQuery<ClientDesign[]>({
    queryKey: ["design-status"],
    queryFn: fetchDesignStatus,
    staleTime: 60_000,
  });

  const clientName = useMemo(
    () =>
      clients?.find((c) => c.clientIdCode === clientIdCode)?.clientName ??
      clientIdCode,
    [clients, clientIdCode]
  );

  return (
    <div>
      <PageMetaSlot>
        <div className="flex items-center justify-between gap-4 w-full min-w-0">
          <div className="flex items-center gap-3 shrink-0 min-w-0">
            <button
              type="button"
              onClick={() => router.push("/design/storefront")}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
              aria-label="Back to Store Front"
            >
              <ArrowLeft className="size-3.5" />
              Back
            </button>
            <div className="flex items-baseline gap-3 shrink-0 min-w-0">
              <h1
                className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
                aria-label="Store Front"
              >
                <span className="font-bold text-sidebar-foreground">Store</span>
                <span className="font-normal text-brand">Front</span>
              </h1>
              <div className="flex items-baseline gap-2 text-xs whitespace-nowrap min-w-0">
                <span className="text-brand font-bold truncate">{clientName}</span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {clientIdCode}
                </span>
              </div>
            </div>
          </div>
        </div>
      </PageMetaSlot>

      {clientIdCode && <StorefrontPageEditor clientIdCode={clientIdCode} />}
    </div>
  );
}
