"use client";
/* eslint-disable react-doctor/prefer-dynamic-import */
/* eslint-disable react-doctor/rendering-hydration-mismatch-time */
/* eslint-disable react-doctor/react-compiler-destructure-method */
/* eslint-disable react-doctor/nextjs-missing-metadata */
/* eslint-disable react-doctor/js-set-map-lookups */
/* eslint-disable react-doctor/no-tiny-text */

import React, { Suspense, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams, useRouter } from "next/navigation";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { format, parse } from "date-fns";
import { Sankey, Tooltip, ResponsiveContainer } from "recharts";
import {
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ChevronRight,
  Gauge,
  FileText,
  List,
  Receipt,
  Users,
  CalendarIcon,
} from "lucide-react";
import { CLIENT_NAMES } from "@/lib/constants";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// ── Types ──────────────────────────────────────────────────────────

interface StatementData {
  client: string;
  clientName: string;
  statement: {
    periodStart: string;
    periodEnd: string;
    netProceeds: number;
    beginningBalance: number;
    sales: number;
    refunds: number;
    expenses: number;
    accountLevelReserve: number;
    fundTransfer: number;
    // Legacy
    refundedSales: number;
    refundedExpenses: number;
    advertisingFee: number;
    reserveDebit: number;
    reserveCredit: number;
    breakdown: Record<string, number>;
    itemDetail: Record<string, number>;
  } | null;
  budgetPacing: BudgetPacing | null;
  availablePeriods: { start: string; end: string; open?: boolean }[];
  error?: string;
}

interface BudgetPacing {
  budget: number;
  mtdSpend: number;
  projectedSpend: number;
  pacePercent: number;
  dayOfMonth: number;
  daysInMonth: number;
  status: "under" | "on-track" | "over";
}

interface StatementPeriod {
  periodStart: string;
  periodEnd: string;
  downloadDate: string;
  sales: number;
  refunds: number;
  expenses: number;
  advertising: number;
  other: number;
  netProceeds: number;
  breakdown: Record<string, number>;
}

interface StatementsData {
  client: string;
  clientName: string;
  statements: StatementPeriod[];
}

interface Transaction {
  transactionId: string;
  postedDate: string;
  sku: string;
  quantity: number;
  productCharges: number;
  promoRebates: number;
  amazonFees: number;
  other: number;
  total: number;
}

interface TransactionsData {
  client: string;
  clientName: string;
  periodStart: string;
  periodEnd: string;
  transactions: Transaction[];
  transactionCount: number;
}

// ── Helpers ────────────────────────────────────────────────────────

function fmt(n: number, short = false): string {
  const abs = Math.abs(n);
  const prefix = n < 0 ? "-$" : "$";
  if (short && abs >= 1000) {
    return prefix + abs.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
  return prefix + abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function dateLabel(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const FEE_LABELS: Record<string, string> = {
  ProductCharges: "Product charges",
  OurPricePrincipal: "Product price",
  OurPriceTax: "Tax collected",
  "MarketplaceFacilitatorTax-Principal": "Marketplace tax",
  ShippingPrincipal: "Shipping",
  Shipping: "Shipping",
  Commission: "Referral fees",
  FBAPerUnitFulfillmentFee: "FBA fulfillment fees",
  FBAStorageFee: "FBA storage fees",
  StorageBillingFee: "Storage fees",
  FBALongTermStorageFee: "Long-term storage",
  LongTermStorageFee: "Long-term storage",
  AWDStorageFees: "AWD storage",
  FBARemovalFee: "Removal fees",
  FBAInboundTransportationFee: "Inbound shipping",
  InboundTransportationFee: "Inbound shipping",
  AmazonUpstreamStorageTransportationFee: "Upstream transport",
  AmazonUpstreamProcessingFee: "Upstream processing",
  SubscriptionFee: "Subscription",
  Subscription: "Subscription",
  AmazonFees: "Amazon fees",
  FBAFees: "FBA fees",
  AdvertisingFee: "Cost of Advertising",
  PromoRebates: "Promo rebates",
  RefundCommission: "Refund commission",
  ShippingChargeback: "Shipping chargeback",
  ShippingDiscount: "Shipping discount",
  RestockingDeductionPrincipal: "Restocking deduction",
  RestockingDeductionTax: "Restocking tax",
  FBAInventoryReimbursement: "Inventory reimbursements",
  FBAReversedReimbursement: "Reversed reimbursement",
  COMPENSATED_CLAWBACK: "Compensated clawback",
  ReserveDebit: "Reserve hold",
  ReserveCredit: "Reserve release",
  FundTransfer: "Disbursement",
  Sales: "Sales",
  Expenses: "Expenses",
  "Refunded Sales": "Refunded sales",
  "Refunded Expenses": "Refunded expenses",
  Base: "Base",
  Tax: "Tax",
  Other: "Other",
  Promo: "Promotions",
};

function friendlyName(key: string): string {
  return FEE_LABELS[key] || key.replace(/([A-Z])/g, " $1").trim();
}

type Tab = "statement" | "statements" | "transactions";

function DateInput({ value, onChange, label }: { value: string; onChange: (iso: string) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const date = parse(value, "yyyy-MM-dd", new Date());

  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">{label}</label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-sm min-w-[160px] hover:bg-muted/50 transition-colors">
            <CalendarIcon className="size-3.5 text-muted-foreground" />
            <span className="font-mono">{format(date, "MM/dd/yyyy")}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            onSelect={(d) => {
              if (d) {
                onChange(format(d, "yyyy-MM-dd"));
                setOpen(false);
              }
            }}
            defaultMonth={date}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

// Active clients fetched in FinanceContent via useQuery

// ── Waterfall Component ────────────────────────────────────────────

function WaterfallChart({ statement }: { statement: StatementData["statement"] }) {
  if (!statement) return null;

  const {
    beginningBalance,
    sales,
    refunds,
    expenses,
    accountLevelReserve,
    fundTransfer,
    netProceeds,
    itemDetail,
  } = statement;

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
      {/* Header — Net Proceeds banner (matches Amazon) */}
      <div className="px-6 py-5 border-b border-border/40 bg-muted/20">
        <p className="text-lg font-semibold text-foreground mb-1">Net Proceeds</p>
        <div className="flex items-baseline gap-2">
          <span className="text-xs text-muted-foreground">
            {dateLabel(statement.periodStart)}
            {statement.periodStart !== statement.periodEnd && (
              ` – ${statement.periodEnd === new Date().toISOString().slice(0, 10) ? "Present (Open)" : dateLabel(statement.periodEnd)}`
            )}
          </span>
        </div>
        <div className={`text-3xl font-bold tracking-tight mt-1 font-[family-name:var(--font-outfit)] ${netProceeds >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
          {fmt(netProceeds)}
        </div>
      </div>

      {/* Sankey flow chart — source labels rendered inside the chart */}
      <div className="p-4">
        <SankeyFlowChart statement={statement} />
      </div>

      {/* Footer — summary items not in the Sankey */}
      <div className="px-6 py-4 border-t border-border/40 flex flex-wrap items-center gap-6">
        {beginningBalance !== 0 && (
          <div className="flex items-center gap-2">
            <div className="size-2.5 rounded-sm bg-blue-500" />
            <span className="text-xs text-muted-foreground">Beginning Balance</span>
            <span className="text-xs font-mono font-semibold tabular-nums text-blue-600 dark:text-blue-400">
              {fmt(beginningBalance)}
            </span>
          </div>
        )}
        {accountLevelReserve !== 0 && (
          <div className="flex items-center gap-2">
            <div className="size-2.5 rounded-sm bg-slate-400" />
            <span className="text-xs text-muted-foreground">Account Reserve</span>
            <span className="text-xs font-mono font-semibold tabular-nums text-red-500">
              {fmt(accountLevelReserve)}
            </span>
          </div>
        )}
        {fundTransfer !== 0 && (
          <div className="flex items-center gap-2">
            <div className="size-2.5 rounded-sm bg-slate-400" />
            <span className="text-xs text-muted-foreground">Disbursement</span>
            <span className="text-xs font-mono font-semibold tabular-nums text-muted-foreground">
              {fmt(fundTransfer)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Budget Pacing Card ──────────────────────────────────────────

function BudgetPacingCard({ pacing }: { pacing: BudgetPacing }) {
  const progressPct = Math.min((pacing.mtdSpend / pacing.budget) * 100, 100);
  const expectedPct = (pacing.dayOfMonth / pacing.daysInMonth) * 100;

  return (
    <div className="rounded-xl border border-border/60 bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Ad Spend Pacing
        </span>
        <div className="inline-flex items-center justify-center rounded-lg p-2 bg-blue-500/10 text-blue-600 dark:text-blue-400">
          <Gauge className="size-4" />
        </div>
      </div>
      <div className="text-2xl font-bold tracking-tight font-[family-name:var(--font-outfit)]">
        {fmt(pacing.mtdSpend, true)}{" "}
        <span className="text-sm font-normal text-muted-foreground">/ {fmt(pacing.budget, true)}</span>
      </div>
      <div className="mt-3 relative">
        <div className="h-2.5 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              pacing.status === "over" ? "bg-red-500" : pacing.status === "on-track" ? "bg-emerald-500" : "bg-amber-500"
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div
          className="absolute top-0 h-2.5 w-0.5 bg-foreground/30 rounded-full"
          style={{ left: `${expectedPct}%` }}
        />
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-muted-foreground">
          Day {pacing.dayOfMonth}/{pacing.daysInMonth}
        </span>
        <span className={`text-xs font-semibold ${
          pacing.status === "over" ? "text-red-500" : pacing.status === "on-track" ? "text-emerald-500" : "text-amber-500"
        }`}>
          {pacing.status === "over" ? "Over budget" : pacing.status === "on-track" ? "On track" : "Under-pacing"}
          {" "}({pacing.pacePercent}%)
        </span>
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        Projected: {fmt(pacing.projectedSpend, true)} by month-end
      </p>
    </div>
  );
}

// ── Statement View Tab ──────────────────────────────────────────

function StatementView({ clientCode }: { clientCode: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(thirtyDaysAgo);
  const [endDate, setEndDate] = useState(today);

  const { data, isLoading } = useQuery<StatementData>({
    queryKey: ["hub-finance-statement", clientCode, startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams({
        client: clientCode,
        view: "statement",
        periodStart: startDate,
        periodEnd: endDate,
      });
      const res = await fetch(`/api/portal/finance?${params}`);
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const dateControls = (
    <div className="flex flex-wrap items-end gap-4">
      <DateInput label="From" value={startDate} onChange={setStartDate} />
      <DateInput label="To" value={endDate} onChange={setEndDate} />
    </div>
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        {dateControls}
        <div className="h-[300px] rounded-xl border border-border/60 bg-card animate-pulse" />
      </div>
    );
  }

  if (!data?.statement) {
    return (
      <div className="space-y-6">
        {dateControls}
        <div className="rounded-xl border border-border/60 bg-card p-12 text-center">
          <p className="text-muted-foreground">{data?.error || "No financial data available for this date range."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
        {dateControls}

        {data.budgetPacing && (
          <div className="flex-1 max-w-sm ml-auto">
            <BudgetPacingCard pacing={data.budgetPacing} />
          </div>
        )}
      </div>

      <WaterfallChart statement={data.statement} />
    </div>
  );
}

// ── Sankey Flow Chart (Amazon-style: 3 sources → sub-category breakdowns) ──

// Map for right-side labels
const SANKEY_LABELS: Record<string, string> = {
  OurPricePrincipal: "Product charges", OurPriceTax: "Tax collected",
  "MarketplaceFacilitatorTax-Principal": "Marketplace tax",
  ShippingPrincipal: "Shipping", Commission: "Referral fees",
  FBAPerUnitFulfillmentFee: "FBA fulfillment fees",
  PoAPerUnitFulfillmentFee: "FBA fulfillment fees",
  "Po A Per Unit Fulfillment Fee": "FBA fulfillment fees",
  FBAStorageFee: "FBA storage fees",
  StorageBillingFee: "Storage fees", AWDStorageFees: "AWD storage",
  LongTermStorageFee: "Long-term storage",
  InboundTransportationFee: "Inbound shipping",
  FBAInboundTransportationFee: "Inbound shipping",
  AmazonUpstreamStorageTransportationFee: "Upstream transport",
  SubscriptionFee: "Subscription", Subscription: "Subscription",
  AdvertisingFee: "Cost of Advertising", PromoRebates: "Promo rebates",
  ShippingChargeback: "Shipping chargeback", ShippingDiscount: "Shipping discount",
  FBAInventoryReimbursement: "Inventory reimbursements",
  FBAReversedReimbursement: "Reversed reimbursements",
  "Refunded Sales": "Refunded sales", "Refunded Expenses": "Refunded expenses",
  "Our Price Discount": "Our Price Discount", "P O A Service Fee": "POA Service Fee",
  FBARemovalFee: "Removal fees", RefundCommission: "Refund commission",
  RestockingDeductionPrincipal: "Restocking deduction",
  RestockingDeductionTax: "Restocking tax",
  COMPENSATED_CLAWBACK: "Compensated clawback",
  FBAPerOrderFulfillmentFee: "FBA order fees",
  VariableClosingFee: "Variable closing fee",
  GiftWrap: "Gift wrap",
  PromotionalRebates: "Promo rebates",
  ProductCharges: "Product charges",
  ProductChargesTax: "Tax collected",
  ShippingCharges: "Shipping",
  RefundProductCharges: "Refund product charges",
  RefundShippingCharges: "Refund shipping",
};

function sankeyLabel(key: string): string {
  return SANKEY_LABELS[key] || key
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
}

// Classify item detail keys into Sales (positive), Refunds, or Expenses
const SALES_KEYS = new Set([
  "OurPricePrincipal", "OurPriceTax", "MarketplaceFacilitatorTax-Principal",
  "ShippingPrincipal", "FBAInventoryReimbursement",
]);
const REFUND_KEYS = new Set([
  "Refunded Sales", "Refunded Expenses", "RefundCommission",
  "RestockingDeductionPrincipal", "RestockingDeductionTax",
]);
// Everything else negative → Expenses

function SankeyFlowChart({ statement }: { statement: NonNullable<StatementData["statement"]> }) {
  const { sales, refunds, expenses, itemDetail } = statement;

  // Classify items into 3 buckets
  const MAX_PER_GROUP = 5;
  const salesItems: [string, number][] = [];
  const refundItems: [string, number][] = [];
  const expenseItems: [string, number][] = [];

  for (const [key, val] of Object.entries(itemDetail)) {
    if (Math.abs(val) < 1 || ["Base", "Tax"].includes(key)) continue;
    if (SALES_KEYS.has(key) || (val > 0 && !REFUND_KEYS.has(key))) {
      salesItems.push([key, val]);
    } else if (REFUND_KEYS.has(key)) {
      refundItems.push([key, Math.abs(val)]);
    } else {
      expenseItems.push([key, Math.abs(val)]);
    }
  }

  // Sort each by value desc
  salesItems.sort(([, a], [, b]) => b - a);
  refundItems.sort(([, a], [, b]) => b - a);
  expenseItems.sort(([, a], [, b]) => b - a);

  // Need at least Sales and one other group
  if (salesItems.length < 1 || (refundItems.length < 1 && expenseItems.length < 1)) return null;

  // Cap items per group with "Other" rollup
  const capGroup = (items: [string, number][], otherLabel: string) => {
    const top = items.slice(0, MAX_PER_GROUP);
    const rest = items.slice(MAX_PER_GROUP).reduce((s, [, v]) => s + v, 0);
    if (rest > 1) top.push([otherLabel, rest]);
    return top;
  };

  const cappedSales = capGroup(salesItems, "Other income");
  const cappedRefunds = capGroup(refundItems, "Other refunds");
  const cappedExpenses = capGroup(expenseItems, "Other fees");

  // Build Sankey: 3 sources (Sales, Refunds, Expenses) → sub-categories
  const TEAL = "#10b981";   // emerald-500 — matches Sales dot
  const SALMON = "#f59e0b"; // amber-500 — matches Refunds dot
  const RED = "#ef4444";    // red-500 — matches Expenses dot

  const sourceNames = new Set(["Sales", "Refunds", "Expenses"]);
  const nodes: { name: string }[] = [];
  const links: { source: number; target: number; value: number }[] = [];
  const nodeColorMap: string[] = [];

  // Source nodes
  nodes.push({ name: "Sales" }); nodeColorMap.push(TEAL);
  const hasRefunds = cappedRefunds.length > 0;
  const hasExpenses = cappedExpenses.length > 0;
  if (hasRefunds) { nodes.push({ name: "Refunds" }); nodeColorMap.push(SALMON); }
  if (hasExpenses) { nodes.push({ name: "Expenses" }); nodeColorMap.push(RED); }

  const salesIdx = 0;
  const refundsIdx = hasRefunds ? 1 : -1;
  const expensesIdx = hasRefunds && hasExpenses ? 2 : hasExpenses ? 1 : -1;

  // Add target nodes for each group
  for (const [key, value] of cappedSales) {
    const idx = nodes.length;
    nodes.push({ name: sankeyLabel(key) });
    nodeColorMap.push(TEAL);
    links.push({ source: salesIdx, target: idx, value });
  }
  for (const [key, value] of cappedRefunds) {
    const idx = nodes.length;
    nodes.push({ name: sankeyLabel(key) });
    nodeColorMap.push(SALMON);
    links.push({ source: refundsIdx, target: idx, value });
  }
  for (const [key, value] of cappedExpenses) {
    const idx = nodes.length;
    nodes.push({ name: sankeyLabel(key) });
    nodeColorMap.push(RED);
    links.push({ source: expensesIdx, target: idx, value });
  }

  // Remove near-zero links and their orphaned target nodes
  const validLinks = links.filter((l) => l.value >= 1);
  if (validLinks.length < 2) return null;

  // Rebuild nodes to remove orphaned targets
  const usedIndices = new Set<number>();
  for (const l of validLinks) { usedIndices.add(l.source); usedIndices.add(l.target); }
  const indexMap = new Map<number, number>();
  const filteredNodes: { name: string }[] = [];
  const filteredColors: string[] = [];
  for (let i = 0; i < nodes.length; i++) {
    if (usedIndices.has(i)) {
      indexMap.set(i, filteredNodes.length);
      filteredNodes.push(nodes[i]);
      filteredColors.push(nodeColorMap[i]);
    }
  }
  const remappedLinks = validLinks.map((l) => ({
    source: indexMap.get(l.source)!,
    target: indexMap.get(l.target)!,
    value: l.value,
  }));

  // Replace mutable arrays for renderNode closure
  nodeColorMap.length = 0;
  nodeColorMap.push(...filteredColors);

  const data = { nodes: filteredNodes, links: remappedLinks };

  const renderNode = (props: { x: number; y: number; width: number; height: number; index: number; payload: { name: string; value: number } }) => {
      const { x, y, width, height, index, payload } = props;
      const isSource = sourceNames.has(payload.name);
      const color = nodeColorMap[index] || "#94a3b8";
      const h = Math.max(height, 2);
      // Show signed values: positive for sales items, negative for refund/expense items
      const isNegative = color === RED || color === SALMON;
      const displayVal = isSource
        ? (payload.name === "Sales" ? fmt(sales) : payload.name === "Refunds" ? fmt(refunds) : fmt(expenses))
        : fmt(isNegative ? -payload.value : payload.value);
      const valColor = isNegative ? RED : TEAL;
      return (
        <g>
          <rect x={x} y={y} width={width} height={h} fill={color} rx={2} opacity={0.85} />
          {isSource ? (
            /* Left side: source label + value, anchored to the left of the bar */
            <>
              <text
                x={x - 8} y={y + h / 2 - 7}
                textAnchor="end" dominantBaseline="central"
                className="fill-foreground"
                style={{ fontSize: 11, fontWeight: 600 }}
              >
                {payload.name}
              </text>
              <text
                x={x - 8} y={y + h / 2 + 8}
                textAnchor="end" dominantBaseline="central"
                style={{ fontSize: 10, fontFamily: "var(--font-geist-mono, monospace)", fontWeight: 600, fill: valColor }}
              >
                {displayVal}
              </text>
            </>
          ) : (
            /* Right side: label left-aligned, value right-aligned at fixed column */
            <>
              <text
                x={x + width + 6} y={y + h / 2}
                textAnchor="start" dominantBaseline="central"
                className="fill-foreground"
                style={{ fontSize: 10, fontWeight: 500 }}
              >
                {payload.name.length > 24 ? payload.name.slice(0, 22) + "…" : payload.name}
              </text>
              <text
                x={x + width + 250} y={y + h / 2}
                textAnchor="end" dominantBaseline="central"
                style={{ fontSize: 10, fontFamily: "var(--font-geist-mono, monospace)", fontWeight: 600, fill: valColor }}
              >
                {displayVal}
              </text>
            </>
          )}
        </g>
      );
  };

  const renderLink = (props: {
    sourceX: number; targetX: number; sourceY: number; targetY: number;
    sourceControlX: number; targetControlX: number; linkWidth: number;
    payload: { source: { name: string }; target: { name: string } };
  }) => {
    const { sourceX, targetX, sourceY, targetY, sourceControlX, targetControlX, linkWidth, payload } = props;
    const color = payload.source.name === "Sales" ? TEAL : payload.source.name === "Refunds" ? SALMON : RED;
    return (
      <path
        d={`M${sourceX},${sourceY + linkWidth / 2} C${sourceControlX},${sourceY + linkWidth / 2} ${targetControlX},${targetY + linkWidth / 2} ${targetX},${targetY + linkWidth / 2} L${targetX},${targetY - linkWidth / 2} C${targetControlX},${targetY - linkWidth / 2} ${sourceControlX},${sourceY - linkWidth / 2} ${sourceX},${sourceY - linkWidth / 2} Z`}
        fill={color}
        opacity={0.2}
        strokeWidth={0}
      />
    );
  };

  const sourceCount = [salesIdx, refundsIdx, expensesIdx].filter((i) => usedIndices.has(i)).length;
  const rightCount = filteredNodes.length - sourceCount;

  const chartHeight = Math.max(300, rightCount * 36 + 80);

  return (
    <div className="w-full" style={{ height: chartHeight }}>
      <ResponsiveContainer width="100%" height="100%">
          <Sankey
            data={data}
            nodeWidth={8}
            nodePadding={14}
            margin={{ left: 120, right: 280, top: 10, bottom: 10 }}
            link={renderLink as any}
            node={renderNode as any}
          >
            <Tooltip
              content={({ payload }: any) => {
                if (!payload?.length) return null;
                const item = payload[0]?.payload;
                if (!item) return null;
                const name = item.source?.name && item.target?.name
                  ? `${item.source.name} → ${item.target.name}`
                  : item.name || "";
                return (
                  <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
                    <p className="font-medium">{name}</p>
                    <p className="font-mono text-muted-foreground">{fmt(item.value)}</p>
                  </div>
                );
              }}
            />
          </Sankey>
        </ResponsiveContainer>
    </div>
  );
}

// ── All Statements Tab ──────────────────────────────────────────

function AllStatementsView({ clientCode, onViewPeriod }: { clientCode: string; onViewPeriod: (start: string, end: string) => void }) {
  const [months, setMonths] = useState(6);
  const [expandedPeriod, setExpandedPeriod] = useState<string | null>(null);

  const { data, isLoading } = useQuery<StatementsData>({
    queryKey: ["hub-finance-statements", clientCode, months],
    queryFn: async () => {
      const params = new URLSearchParams({ client: clientCode, view: "statements", months: String(months) });
      const res = await fetch(`/api/portal/finance?${params}`);
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return <div className="h-[400px] rounded-xl border border-border/60 bg-card animate-pulse" />;
  }

  const statements = data?.statements || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Settlement periods from Seller Central financial transactions.
        </p>
        <div className="flex items-center gap-1.5">
          {[3, 6, 12].map((m) => (
            <button
              key={m}
              onClick={() => setMonths(m)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                months === m
                  ? "bg-[#2563eb] text-white"
                  : "bg-muted/60 text-muted-foreground hover:text-foreground"
              }`}
            >
              {m}M
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/40 bg-muted/30">
                <th className="py-2.5 px-4 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Settlement Period
                </th>
                <th className="py-2.5 px-4 text-right text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Sales
                </th>
                <th className="py-2.5 px-4 text-right text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Refunds
                </th>
                <th className="py-2.5 px-4 text-right text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Expenses
                </th>
                <th className="py-2.5 px-4 text-right text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Advertising
                </th>
                <th className="py-2.5 px-4 text-right text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Other
                </th>
                <th className="py-2.5 px-4 text-right text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Net Proceeds
                </th>
                <th className="py-2.5 px-4 text-right text-[10px] font-semibold text-muted-foreground uppercase tracking-wider w-28">
                </th>
              </tr>
            </thead>
            <tbody>
              {statements.map((s) => {
                const key = `${s.periodStart}_${s.periodEnd}`;
                const isExpanded = expandedPeriod === key;
                const significantBreakdown = Object.entries(s.breakdown)
                  .filter(([k, v]) => Math.abs(v) > 0.5 && !["Base"].includes(k))
                  .sort(([, a], [, b]) => a - b);

                return (
                  <React.Fragment key={key}>
                    <tr
                      className="group cursor-pointer hover:bg-muted/30 transition-colors border-b border-border/30"
                      onClick={() => setExpandedPeriod(isExpanded ? null : key)}
                    >
                      <td className="py-3 px-4 text-sm font-medium">
                        <div className="flex items-center gap-2">
                          {isExpanded ? (
                            <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
                          ) : (
                            <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
                          )}
                          <span>
                            {dateLabel(s.periodStart)}
                            {s.periodStart !== s.periodEnd && (
                              <span className="text-muted-foreground"> – {dateLabel(s.periodEnd)}</span>
                            )}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm text-right text-emerald-600 dark:text-emerald-400 font-medium">
                        {fmt(s.sales, true)}
                      </td>
                      <td className="py-3 px-4 text-sm text-right text-amber-500 font-medium">
                        {fmt(s.refunds, true)}
                      </td>
                      <td className="py-3 px-4 text-sm text-right text-red-500 font-medium">
                        {fmt(s.expenses, true)}
                      </td>
                      <td className="py-3 px-4 text-sm text-right text-orange-500 font-medium">
                        {fmt(s.advertising, true)}
                      </td>
                      <td className="py-3 px-4 text-sm text-right text-muted-foreground font-medium">
                        {fmt(s.other, true)}
                      </td>
                      <td className={`py-3 px-4 text-sm text-right font-bold ${
                        s.netProceeds >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"
                      }`}>
                        {fmt(s.netProceeds, true)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewPeriod(s.periodStart, s.periodEnd);
                          }}
                          className="text-xs text-[#2563eb] hover:underline font-medium"
                        >
                          View transactions
                        </button>
                      </td>
                    </tr>
                    {isExpanded && significantBreakdown.length > 0 && (
                      <tr className="border-b border-border/20">
                        <td colSpan={8} className="bg-muted/15 px-10 py-3">
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-1.5">
                            {significantBreakdown.map(([bKey, value]) => (
                              <div key={bKey} className="flex items-center justify-between text-xs gap-2">
                                <span className="text-muted-foreground truncate">{friendlyName(bKey)}</span>
                                <span className={`font-mono font-medium tabular-nums shrink-0 ${value < 0 ? "text-red-500" : "text-emerald-600 dark:text-emerald-400"}`}>
                                  {fmt(value)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {statements.length === 0 && (
          <div className="p-12 text-center">
            <p className="text-muted-foreground text-sm">No statements found for this period.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Transaction View Tab ────────────────────────────────────────

function TransactionView({
  clientCode,
  periodStart,
  periodEnd,
}: {
  clientCode: string;
  periodStart: string;
  periodEnd: string;
}) {
  const { data, isLoading } = useQuery<TransactionsData>({
    queryKey: ["hub-finance-transactions", clientCode, periodStart, periodEnd],
    queryFn: async () => {
      const params = new URLSearchParams({
        client: clientCode,
        view: "transactions",
        periodStart,
        periodEnd,
      });
      const res = await fetch(`/api/portal/finance?${params}`);
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return <div className="h-[300px] rounded-xl border border-border/60 bg-card animate-pulse" />;
  }

  const transactions = data?.transactions || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {dateLabel(periodStart)}
          {periodStart !== periodEnd && ` – ${dateLabel(periodEnd)}`}
          {" "}&mdash; {transactions.length} transactions
        </p>
      </div>

      <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/40 bg-muted/30">
                <th className="py-2.5 px-4 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Date
                </th>
                <th className="py-2.5 px-4 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  SKU
                </th>
                <th className="py-2.5 px-4 text-right text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Qty
                </th>
                <th className="py-2.5 px-4 text-right text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Product Charges
                </th>
                <th className="py-2.5 px-4 text-right text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Promo Rebates
                </th>
                <th className="py-2.5 px-4 text-right text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Amazon Fees
                </th>
                <th className="py-2.5 px-4 text-right text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Other
                </th>
                <th className="py-2.5 px-4 text-right text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((txn) => (
                <tr key={txn.transactionId} className="border-b border-border/20 hover:bg-muted/20 transition-colors" title={txn.transactionId}>
                  <td className="py-2.5 px-4 text-xs text-muted-foreground whitespace-nowrap">
                    {txn.postedDate ? dateLabel(txn.postedDate) : "—"}
                  </td>
                  <td className="py-2.5 px-4 text-xs font-mono text-foreground max-w-[200px] truncate" title={txn.sku}>
                    {txn.sku || "—"}
                  </td>
                  <td className="py-2.5 px-4 text-xs text-right font-mono tabular-nums text-muted-foreground">
                    {txn.quantity || "—"}
                  </td>
                  <td className="py-2.5 px-4 text-xs text-right font-mono tabular-nums">
                    <span className={txn.productCharges >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}>
                      {fmt(txn.productCharges)}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-xs text-right font-mono tabular-nums text-muted-foreground">
                    {txn.promoRebates !== 0 ? fmt(txn.promoRebates) : "$0.00"}
                  </td>
                  <td className="py-2.5 px-4 text-xs text-right font-mono tabular-nums text-red-500">
                    {fmt(txn.amazonFees)}
                  </td>
                  <td className="py-2.5 px-4 text-xs text-right font-mono tabular-nums text-muted-foreground">
                    {txn.other !== 0 ? fmt(txn.other) : "$0.00"}
                  </td>
                  <td className={`py-2.5 px-4 text-xs text-right font-mono font-semibold tabular-nums ${txn.total >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
                    {fmt(txn.total)}
                  </td>
                </tr>
              ))}
            </tbody>
            {transactions.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/20">
                  <td className="py-3 px-4 text-xs font-bold" colSpan={3}>
                    Total ({transactions.length})
                  </td>
                  <td className="py-3 px-4 text-xs text-right font-mono font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {fmt(transactions.reduce((s, t) => s + t.productCharges, 0))}
                  </td>
                  <td className="py-3 px-4 text-xs text-right font-mono font-bold tabular-nums">
                    {fmt(transactions.reduce((s, t) => s + t.promoRebates, 0))}
                  </td>
                  <td className="py-3 px-4 text-xs text-right font-mono font-bold tabular-nums text-red-500">
                    {fmt(transactions.reduce((s, t) => s + t.amazonFees, 0))}
                  </td>
                  <td className="py-3 px-4 text-xs text-right font-mono font-bold tabular-nums">
                    {fmt(transactions.reduce((s, t) => s + t.other, 0))}
                  </td>
                  <td className={`py-3 px-4 text-xs text-right font-mono font-bold tabular-nums ${
                    transactions.reduce((s, t) => s + t.total, 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"
                  }`}>
                    {fmt(transactions.reduce((s, t) => s + t.total, 0))}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {transactions.length === 0 && (
          <div className="p-12 text-center">
            <p className="text-muted-foreground text-sm">No transactions found for this period.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Finance Page ───────────────────────────────────────────

function FinanceContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("statement");
  const [txnPeriod, setTxnPeriod] = useState<{ start: string; end: string } | null>(null);

  const { data: activeClients = [] } = useQuery<{ clientIdCode: string; clientName: string }[]>({
    queryKey: ["active-clients"],
    queryFn: async () => {
      const res = await fetch("/api/clients?lite=1");
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
  });

  const clientCode = searchParams.get("client") || "";
  const clientName = clientCode
    ? activeClients.find((c) => c.clientIdCode === clientCode)?.clientName || CLIENT_NAMES[clientCode] || clientCode
    : "";

  function handleClientChange(code: string) {
    setActiveTab("statement");
    setTxnPeriod(null);
    router.push(code ? `/finances?client=${code}` : "/finances");
  }

  function handleViewPeriod(start: string, end: string) {
    setTxnPeriod({ start, end });
    setActiveTab("transactions");
  }

  const tabs: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "statement", label: "Statement View", icon: FileText },
    { id: "statements", label: "All Statements", icon: List },
    { id: "transactions", label: "Transaction View", icon: Receipt },
  ];

  return (
    <div className="space-y-6">
      <PageMetaSlot>
        <h1
          className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
          aria-label="Finance Hub"
        >
          <span className="font-bold text-sidebar-foreground">Finance</span>
          <span className="font-normal text-brand">Hub</span>
        </h1>
      </PageMetaSlot>
      {/* Header */}
      <div className="sticky top-0 z-30 -mx-6 lg:-mx-10 px-6 lg:px-10 py-4 bg-background">
        <p className="text-sm text-muted-foreground">
          {clientName
            ? `${clientName} — Amazon Seller Central financial transactions`
            : "Select a client to view settlement statements and transactions."
          }
        </p>
      </div>

      {/* Client Selector */}
      <div className="flex items-center gap-3">
        <div className="inline-flex items-center justify-center rounded-lg p-2 bg-blue-500/10 text-blue-600 dark:text-blue-400">
          <Users className="size-4" />
        </div>
        <select
          value={clientCode}
          onChange={(e) => handleClientChange(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm min-w-[250px]"
        >
          <option value="">Select a client…</option>
          {activeClients.map((c) => (
            <option key={c.clientIdCode} value={c.clientIdCode}>
              {c.clientName} ({c.clientIdCode})
            </option>
          ))}
        </select>
      </div>

      {!clientCode ? (
        <div className="rounded-xl border border-border/60 bg-card p-12 text-center">
          <Users className="size-12 mx-auto mb-4 text-muted-foreground/30" />
          <p className="text-muted-foreground">Select a client above to view their financial data.</p>
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="flex items-center gap-1 border-b border-border/40 -mx-6 lg:-mx-10 px-6 lg:px-10">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? "border-[#2563eb] text-[#2563eb]"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                }`}
              >
                <tab.icon className="size-4" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          {activeTab === "statement" && <StatementView clientCode={clientCode} />}
          {activeTab === "statements" && (
            <AllStatementsView clientCode={clientCode} onViewPeriod={handleViewPeriod} />
          )}
          {activeTab === "transactions" && txnPeriod && (
            <TransactionView
              clientCode={clientCode}
              periodStart={txnPeriod.start}
              periodEnd={txnPeriod.end}
            />
          )}
          {activeTab === "transactions" && !txnPeriod && (
            <div className="rounded-xl border border-border/60 bg-card p-12 text-center">
              <p className="text-muted-foreground text-sm">
                Select a period from{" "}
                <button
                  onClick={() => setActiveTab("statements")}
                  className="text-[#2563eb] hover:underline font-medium"
                >
                  All Statements
                </button>
                {" "}to view individual transactions.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function FinancesPage() {
  return (
    <Suspense>
      <FinanceContent />
    </Suspense>
  );
}
