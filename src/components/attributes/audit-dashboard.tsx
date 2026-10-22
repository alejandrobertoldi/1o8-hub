/* eslint-disable react-doctor/react-compiler-destructure-method */
"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
} from "lucide-react";
import { CLIENT_NAMES } from "@/lib/constants";
import { TemplateDialog } from "./template-dialog";
import { TemplateRequestsList } from "./template-requests-list";

// ─── Types ──────────────────────────────────────────────────────────

interface AuditGap {
  attributeName: string;
  localLabel: string;
  requirement: string | null;
  isKey: boolean;
  effectiveLevel: "Required" | "Conditionally Required" | "Key";
}

interface ProductAudit {
  productId: string;
  productName: string;
  asin: string;
  gaps: AuditGap[];
}

interface CategoryAudit {
  definitionId: number;
  productType: string;
  totalAuditable: number;
  productCount: number;
  productsWithGaps: number;
  gapBreakdown: { required: number; conditional: number; key: number };
  totalGaps: number;
  products?: ProductAudit[];
}

interface ClientAudit {
  clientIdCode: string;
  categories: CategoryAudit[];
  totalProducts: number;
  totalGaps: number;
  healthPercent: number;
}

interface ClientEntry {
  clientIdCode: string;
  clientName: string;
}

// ─── Component ──────────────────────────────────────────────────────

export function AuditDashboard() {
  const router = useRouter();
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [gapFilter, setGapFilter] = useState<"all" | "gaps">("all");
  const [drillDown, setDrillDown] = useState<{
    clientIdCode: string;
    productType: string;
  } | null>(null);

  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const res = await fetch("/api/clients");
      if (!res.ok) return [];
      return res.json() as Promise<ClientEntry[]>;
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: auditData, isLoading } = useQuery({
    queryKey: ["attribute-audit", clientFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (clientFilter !== "all") params.set("clientIdCode", clientFilter);
      const res = await fetch(`/api/attributes/audit?${params}`);
      if (!res.ok) throw new Error("Failed to fetch audit data");
      return res.json() as Promise<{ clients: ClientAudit[] }>;
    },
  });

  const { data: drillDownData, isLoading: drillDownLoading } = useQuery({
    queryKey: [
      "attribute-audit-drill",
      drillDown?.clientIdCode,
      drillDown?.productType,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        clientIdCode: drillDown!.clientIdCode,
        productType: drillDown!.productType,
        includeProducts: "true",
      });
      const res = await fetch(`/api/attributes/audit?${params}`);
      if (!res.ok) throw new Error("Failed to fetch drill-down data");
      return res.json() as Promise<{ clients: ClientAudit[] }>;
    },
    enabled: !!drillDown,
  });

  const auditClients = auditData?.clients ?? [];
  const filteredClients =
    gapFilter === "gaps"
      ? auditClients.filter((c) => c.totalGaps > 0)
      : auditClients;

  // ─── Drill-down view ───────────────────────────────────────────
  if (drillDown) {
    const clientData = drillDownData?.clients?.[0];
    const category = clientData?.categories?.[0];
    const products = category?.products ?? [];
    const productsWithGaps = products.filter((p) => p.gaps.length > 0);
    const completeProducts = products.filter((p) => p.gaps.length === 0);

    return (
      <div className="space-y-4">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm">
          <button
            onClick={() => setDrillDown(null)}
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-4" />
            Audit
          </button>
          <span className="text-muted-foreground">/</span>
          <span>
            {CLIENT_NAMES[drillDown.clientIdCode] || drillDown.clientIdCode}
          </span>
          <span className="text-muted-foreground">/</span>
          <Badge
            variant="outline"
            className="font-mono text-xs border-brand/30 text-brand"
          >
            {drillDown.productType}
          </Badge>
        </div>

        {/* Summary bar */}
        {category && (
          <div className="flex items-center justify-between px-4 py-3 rounded-lg border bg-card">
            <span className="text-sm text-muted-foreground">
              {category.productCount} products, {category.totalGaps} missing
              fields across {category.productsWithGaps} products
            </span>
          </div>
        )}

        {drillDownLoading ? (
          <p className="text-sm text-muted-foreground">Loading products…</p>
        ) : (
          <div className="space-y-2">
            {productsWithGaps.map((product) => (
              <div
                key={product.productId}
                className="rounded-lg border bg-card p-4 hover:bg-muted/20 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <button
                    onClick={() =>
                      router.push(`/products/${product.productId}`)
                    }
                    className="text-sm font-medium hover:underline text-left"
                  >
                    {product.productName}
                  </button>
                  <span className="text-xs text-muted-foreground font-mono">
                    {product.asin}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {product.gaps.map((gap) => (
                    <Badge
                      key={gap.attributeName}
                      variant="outline"
                      className={`text-[10px] ${
                        gap.effectiveLevel === "Required"
                          ? "border-red-500/50 text-red-400"
                          : gap.effectiveLevel === "Conditionally Required"
                            ? "border-orange-500/50 text-orange-400"
                            : "border-purple-500/50 text-purple-400"
                      }`}
                    >
                      {gap.effectiveLevel === "Required"
                        ? "R"
                        : gap.effectiveLevel === "Conditionally Required"
                          ? "C"
                          : "K"}{" "}
                      {gap.localLabel}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}

            {completeProducts.length > 0 && (
              <div className="rounded-lg border border-dashed border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
                <span className="text-sm text-emerald-400">
                  <CheckCircle2 className="size-4 inline-block mr-1.5" />
                  {completeProducts.length} product
                  {completeProducts.length !== 1 ? "s" : ""} complete
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ─── Main dashboard view ────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Select value={clientFilter} onValueChange={setClientFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter by client" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All clients</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.clientIdCode} value={c.clientIdCode}>
                  {CLIENT_NAMES[c.clientIdCode] || c.clientIdCode}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex rounded-md border overflow-hidden">
            <button
              onClick={() => setGapFilter("all")}
              className={`px-3 py-1.5 text-xs ${
                gapFilter === "all"
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setGapFilter("gaps")}
              className={`px-3 py-1.5 text-xs border-l ${
                gapFilter === "gaps"
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Has gaps
            </button>
          </div>
        </div>
        <TemplateDialog />
      </div>
      <TemplateRequestsList />

      {/* Client cards */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground/70">
          Scanning products…
        </p>
      ) : filteredClients.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {auditClients.length === 0
              ? "No category definitions uploaded yet. Upload XLSM files in Admin \u2192 Attributes."
              : "All clients are complete \u2014 no gaps found."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredClients.map((client) => (
            <ClientCard
              key={client.clientIdCode}
              client={client}
              onDrillDown={(productType) =>
                setDrillDown({
                  clientIdCode: client.clientIdCode,
                  productType,
                })
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Client Card ───────────────────────────────────────────────────

function ClientCard({
  client,
  onDrillDown,
}: {
  client: ClientAudit;
  onDrillDown: (productType: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasGaps = client.totalGaps > 0;

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <div className="rounded-lg border bg-card overflow-hidden">
        <CollapsibleTrigger className="flex items-center justify-between w-full px-4 py-3 hover:bg-muted/20 transition-colors">
          <div className="flex items-center gap-3">
            {expanded ? (
              <ChevronDown className="size-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="size-4 text-muted-foreground" />
            )}
            <div className="text-left">
              <span className="text-sm font-medium">
                {CLIENT_NAMES[client.clientIdCode] || client.clientIdCode}
              </span>
              <span className="ml-2 text-xs text-muted-foreground">
                {client.categories.length} categor
                {client.categories.length !== 1 ? "ies" : "y"},{" "}
                {client.totalProducts} product
                {client.totalProducts !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Health bar */}
            <div className="flex items-center gap-2">
              <div className="w-24 h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    client.healthPercent >= 90
                      ? "bg-emerald-500"
                      : client.healthPercent >= 70
                        ? "bg-yellow-500"
                        : "bg-red-500"
                  }`}
                  style={{ width: `${client.healthPercent}%` }}
                />
              </div>
              <span className="text-xs tabular-nums text-muted-foreground w-8">
                {client.healthPercent}%
              </span>
            </div>
            {hasGaps ? (
              <Badge
                variant="outline"
                className="border-red-500/30 text-red-400 text-xs"
              >
                <AlertCircle className="size-3 mr-1" />
                {client.totalGaps} gaps
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-emerald-500/30 text-emerald-400 text-xs"
              >
                <CheckCircle2 className="size-3 mr-1" />
                Complete
              </Badge>
            )}
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t px-4 py-2 space-y-1">
            {client.categories.map((cat) => (
              <button
                key={cat.productType}
                onClick={() => onDrillDown(cat.productType)}
                className="flex items-center justify-between w-full px-3 py-2 rounded hover:bg-muted/30 transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className="font-mono text-xs border-brand/30 text-brand"
                  >
                    {cat.productType}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {cat.productCount} product
                    {cat.productCount !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {cat.totalGaps > 0 ? (
                    <>
                      <span className="text-xs tabular-nums">
                        {cat.gapBreakdown.required > 0 && (
                          <span className="text-red-400 mr-1.5">
                            {cat.gapBreakdown.required}R
                          </span>
                        )}
                        {cat.gapBreakdown.conditional > 0 && (
                          <span className="text-orange-400 mr-1.5">
                            {cat.gapBreakdown.conditional}C
                          </span>
                        )}
                        {cat.gapBreakdown.key > 0 && (
                          <span className="text-purple-400">
                            {cat.gapBreakdown.key}K
                          </span>
                        )}
                      </span>
                      <Badge
                        variant="outline"
                        className="text-[10px] border-red-500/30 text-red-400"
                      >
                        {cat.totalGaps} missing
                      </Badge>
                    </>
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-[10px] border-emerald-500/30 text-emerald-400"
                    >
                      Complete
                    </Badge>
                  )}
                  <ChevronRight className="size-3 text-muted-foreground" />
                </div>
              </button>
            ))}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
