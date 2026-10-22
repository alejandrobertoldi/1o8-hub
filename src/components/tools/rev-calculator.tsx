/* eslint-disable react-doctor/no-derived-useState */
/* eslint-disable react-doctor/prefer-useReducer */
/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable jsx-a11y/label-has-associated-control */
/* eslint-disable react-doctor/design-no-bold-heading */
/* eslint-disable react-doctor/design-no-em-dash-in-jsx-text */
"use client";

import { useState, useMemo } from "react";
import {
  PRODUCT_CATEGORIES,
  SERVICE_ADDONS,
  calculate,
  type CalculatorInputs,
  type ProductCategory,
} from "@/lib/amazon-fees";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { ChevronUp, ChevronDown, Sparkles, Info, Calculator } from "lucide-react";

const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtPct = (n: number) => `${(n * 100).toFixed(2)}%`;

// ── Fee explainer definitions ────────────────────────────────────────
const FEE_EXPLAINERS: Record<string, { definition: string; calculation?: (r: ReturnType<typeof calculate>, inputs: CalculatorInputs) => string }> = {
  referral: {
    definition: "The referral fee is a fee that Amazon charges sellers for selling products on Amazon stores. It's calculated based on the fee category and the total sales price, which includes the item price, delivery charges, and gift-wrapping charges.",
    calculation: (r, inputs) => {
      const rate = r.fba.referralFeeRate;
      const price = inputs.itemPrice;
      const threshold = price <= 15 && inputs.category === "Grocery and Gourmet" ? "$15.00" : null;
      return `The referral fee for the ${inputs.category} category in the United States store is ${(rate * 100).toFixed(0)}% of the total sales price${threshold ? ` for items priced above ${threshold}` : ""}. In this transaction, the total sales price of your item was $${price.toFixed(2)}.\n\nTo calculate the referral fee, ${(rate * 100).toFixed(0)}% is applied to the total sales price of $${price.toFixed(2)}, resulting in a fee of ${fmt(r.fba.referralFee)} (${price.toFixed(2)} USD * ${(rate * 100).toFixed(0)}% = ${r.fba.referralFee.toFixed(2)} USD).`;
    },
  },
  fixedClosing: {
    definition: "The fixed closing fee, or per-item selling fee, is a fee that Amazon charges sellers with an Individual selling plan for each item that they sell on Amazon. It's a fixed fee charged per unit sold, regardless of the item's price or other factors.",
  },
  variableClosing: {
    definition: "The variable closing fee is a fee that Amazon charges for each unit sold in certain product categories, such as Books, DVDs, Music, Software & Computer/Video Games, Video Game Consoles, and Video Game Accessories.",
  },
  digitalServices: {
    definition: "The Digital Services fee is charged on top of certain Amazon fees based on varying country tax requirements.",
    calculation: (r) => `0.0% of FBA fees (${fmt(r.fba.fbaFulfillmentFee)})\t= $0.00\n0.0% of SOA fees (${fmt(r.fba.referralFee)})\t= $0.00\n= Subtotal\t= $0.00`,
  },
  storage: {
    definition: "Amazon charges monthly inventory storage fees for the space occupied by inventory in fulfillment centers. Monthly storage fees are calculated based on daily average volume occupied by inventory, time of the year of inventory storage, and sortability.",
  },
};

// ── Collapsible fee section ──────────────────────────────────────────
function FeeSection({
  title,
  total,
  defaultOpen = false,
  children,
}: {
  title: string;
  total: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-1.5 w-full py-2 cursor-pointer hover:bg-muted/30 -mx-1 px-1 rounded">
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-sm font-semibold tabular-nums">{fmt(total)}</span>
        {open ? <ChevronUp className="size-3.5 ml-0.5" /> : <ChevronDown className="size-3.5 ml-0.5" />}
      </CollapsibleTrigger>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  );
}

// ── Fee line with optional explainer ─────────────────────────────────
function FeeLine({
  label,
  value,
  explainerKey,
  result,
  inputs,
  green,
}: {
  label: string;
  value: number;
  explainerKey?: string;
  result?: ReturnType<typeof calculate>;
  inputs?: CalculatorInputs;
  green?: boolean;
}) {
  const explainer = explainerKey ? FEE_EXPLAINERS[explainerKey] : null;
  const isZero = value === 0;
  return (
    <div className="flex items-center justify-between py-0.5 pl-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">
        <span className={cn("text-sm tabular-nums", (green || isZero) && "text-emerald-600 dark:text-emerald-400")}>
          {fmt(value)}
        </span>
        {explainer ? (
          <Popover>
            <PopoverTrigger asChild>
              <button className="text-brand hover:text-brand/80 transition-colors" title={`Learn about ${label}`}>
                {explainerKey === "digitalServices" ? (
                  <Info className="size-3.5" />
                ) : (
                  <Sparkles className="size-3.5" />
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-80 max-h-96 overflow-y-auto" side="left" align="start">
              <div className="space-y-3">
                <h4 className="font-semibold text-sm">Fee explainer — {label}</h4>
                <Collapsible defaultOpen>
                  <CollapsibleTrigger className="flex items-center gap-1 text-sm font-medium cursor-pointer">
                    Fee definition <ChevronUp className="size-3" />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{explainer.definition}</p>
                  </CollapsibleContent>
                </Collapsible>
                {explainer.calculation && result && inputs && (
                  <Collapsible defaultOpen>
                    <CollapsibleTrigger className="flex items-center gap-1 text-sm font-medium cursor-pointer">
                      Fee calculation <ChevronUp className="size-3" />
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="mt-1 p-2 bg-muted/50 rounded text-xs leading-relaxed whitespace-pre-line">
                        {explainer.calculation(result, inputs)}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </div>
            </PopoverContent>
          </Popover>
        ) : (
          <span className="w-3.5" /> // spacer
        )}
      </div>
    </div>
  );
}

// ── Inline field (label left, input right) ───────────────────────────
function InlineField({
  label,
  value,
  onChange,
  prefix,
  readOnly,
  tooltip,
}: {
  label: string;
  value: string | number;
  onChange?: (v: string) => void;
  prefix?: string;
  readOnly?: boolean;
  tooltip?: string;
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm flex items-center gap-1">
        {label}
        {tooltip && (
          <span title={tooltip} className="cursor-help text-muted-foreground">
            <Info className="size-3.5" />
          </span>
        )}
      </span>
      {readOnly ? (
        <span className="text-sm font-medium tabular-nums">{prefix}{typeof value === "number" ? value.toFixed(2) : value}</span>
      ) : (
        <div className="relative w-24">
          {prefix && (
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{prefix}</span>
          )}
          <Input
            type="number"
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            step="0.01"
            min="0"
            className={cn("h-7 text-sm tabular-nums text-right", prefix && "pl-5")}
          />
        </div>
      )}
    </div>
  );
}

// ── Main Calculator Component ────────────────────────────────────────
export function RevCalculator({ variant = "hub" }: { variant?: "hub" | "portal" | "public" }) {
  const [useMetric, setUseMetric] = useState(false);
  const cmToIn = (cm: number) => cm / 2.54;
  const inToCm = (inches: number) => inches * 2.54;
  const kgToLb = (kg: number) => kg * 2.20462;
  const lbToKg = (lb: number) => lb / 2.20462;

  const [inputs, setInputs] = useState<CalculatorInputs>({
    category: "Grocery and Gourmet",
    isApparel: false,
    isDangerousGoods: false,
    sellingPlan: "Professional",
    itemPrice: 34.99,
    shippingCharge: 0,
    lengthIn: 9.96,
    widthIn: 7.56,
    heightIn: 3.03,
    weightLb: 3.261,
    selectedAddons: [],
    peakPeriod: "JAN-SEP",
    storageUtilizationWeeks: 2,
    avgInventoryUnits: 1,
    estimatedMonthlySold: 130,
    unitsToInbound: 1,
    inboundPlacement: "Minimal Shipment Splits",
    inboundRegion: "East",
    removalUnits: 0,
    disposalUnits: 0,
    miscCost: 0,
    cogs: 0,
    promotionsCost: 0,
    feeDiscounts: 0,
    taxesOnFees: 0,
  });

  // Merchant-side editable fulfillment cost breakdown
  const [merchantLabor, setMerchantLabor] = useState(0);
  const [merchantPacking, setMerchantPacking] = useState(0);
  const [merchantShipping, setMerchantShipping] = useState(0);
  const [merchantCustomerService, setMerchantCustomerService] = useState(0);
  const [merchantFulfillmentDirect, setMerchantFulfillmentDirect] = useState(0);
  const merchantFulfillmentCost = merchantLabor + merchantPacking + merchantShipping + merchantCustomerService + merchantFulfillmentDirect;
  const [merchantStorageCost, setMerchantStorageCost] = useState(0);
  const [merchantPromotionsCost, setMerchantPromotionsCost] = useState(0);
  const [merchantMiscCost, setMerchantMiscCost] = useState(0);
  const [merchantCogs, setMerchantCogs] = useState(0);
  const [merchantAvgInvUnits, setMerchantAvgInvUnits] = useState<number | string>("");
  const [merchantMonthlySold, setMerchantMonthlySold] = useState<number | string>("");
  const [estimatedSales30, setEstimatedSales30] = useState(130);
  const [merchantEstimatedSales30, setMerchantEstimatedSales30] = useState(1);

  const update = <K extends keyof CalculatorInputs>(key: K, value: CalculatorInputs[K]) =>
    setInputs((prev) => ({ ...prev, [key]: value }));

  const numUpdate = (key: keyof CalculatorInputs) => (v: string) => {
    const parsed = parseFloat(v);
    update(key, (v === "" ? 0 : isNaN(parsed) ? 0 : parsed) as CalculatorInputs[typeof key]);
  };

  const result = useMemo(() => calculate(inputs), [inputs]);

  const isProfitable = result.fba.netProfit >= 0;
  const fbaNetProfit30 = result.fba.netProfit * estimatedSales30;

  // Merchant calculation
  const merchantTotalCost = result.merchant.totalAmazonFees + merchantFulfillmentCost + merchantStorageCost + merchantPromotionsCost + merchantMiscCost + merchantCogs;
  const merchantNetProceeds = result.merchant.salesPrice - merchantTotalCost;
  const merchantMargin = result.merchant.salesPrice > 0 ? merchantNetProceeds / result.merchant.salesPrice : 0;

  return (
    <div className="space-y-4 pb-28">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            <span>Revenue</span>
            <span className="text-brand">Calculator</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Estimate your fulfillment costs and compare different fulfillment methods.
          </p>
        </div>
        <div className="flex gap-0 border rounded-md overflow-hidden">
          <button
            onClick={() => setUseMetric(false)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium transition-colors",
              !useMetric ? "bg-brand-solid text-white" : "bg-muted/50 hover:bg-muted"
            )}
          >
            Imperial (in/lb)
          </button>
          <button
            onClick={() => setUseMetric(true)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium transition-colors",
              useMetric ? "bg-brand-solid text-white" : "bg-muted/50 hover:bg-muted"
            )}
          >
            Metric (cm/kg)
          </button>
        </div>
      </div>

      {/* ── Product Info Bar ────────────────────────────────────── */}
      <div className="border rounded-lg p-4">
        <p className="text-sm font-medium mb-3">Product information</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Category & flags */}
          <div className="space-y-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Product Category</label>
              <Select value={inputs.category} onValueChange={(v) => update("category", v as ProductCategory)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRODUCT_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat} className="text-sm">{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Apparel</label>
                <Select value={inputs.isApparel ? "Yes" : "No"} onValueChange={(v) => update("isApparel", v === "Yes")}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Yes">Yes</SelectItem>
                    <SelectItem value="No">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Dangerous Goods</label>
                <Select value={inputs.isDangerousGoods ? "Yes" : "No"} onValueChange={(v) => update("isDangerousGoods", v === "Yes")}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Yes">Yes</SelectItem>
                    <SelectItem value="No">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Dimensions */}
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Package dimensions</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: useMetric ? "Length (cm)" : "Length (in)", key: "lengthIn" as const },
                { label: useMetric ? "Width (cm)" : "Width (in)", key: "widthIn" as const },
                { label: useMetric ? "Height (cm)" : "Height (in)", key: "heightIn" as const },
              ].map(({ label, key }) => (
                <div key={key} className="space-y-0.5">
                  <label className="text-[10px] text-muted-foreground">{label}</label>
                  <Input
                    type="number"
                    value={useMetric ? Math.round(inToCm(inputs[key]) * 100) / 100 : inputs[key]}
                    onChange={(e) => {
                      const v = e.target.value === "" ? 0 : parseFloat(e.target.value);
                      update(key, (useMetric ? cmToIn(isNaN(v) ? 0 : v) : (isNaN(v) ? 0 : v)) as number);
                    }}
                    step="0.01"
                    className="h-7 text-xs tabular-nums"
                  />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-0.5">
                <label className="text-[10px] text-muted-foreground">{useMetric ? "Unit Weight (kg)" : "Unit Weight (lb)"}</label>
                <Input
                  type="number"
                  value={useMetric ? Math.round(lbToKg(inputs.weightLb) * 1000) / 1000 : inputs.weightLb}
                  onChange={(e) => {
                    const v = e.target.value === "" ? 0 : parseFloat(e.target.value);
                    update("weightLb", (useMetric ? kgToLb(isNaN(v) ? 0 : v) : (isNaN(v) ? 0 : v)) as number);
                  }}
                  step="0.001"
                  className="h-7 text-xs tabular-nums"
                />
              </div>
              <div className="space-y-0.5">
                <label className="text-[10px] text-muted-foreground">Weight Unit</label>
                <div className="h-7 flex items-center text-xs text-muted-foreground px-2 bg-muted/50 rounded-md border">{useMetric ? "kg" : "lb"}</div>
              </div>
            </div>
          </div>

          {/* Computed info */}
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between"><span className="text-muted-foreground">Size Tier</span><span className="font-medium">{result.sizeTier}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Shipping Weight</span><span className="tabular-nums">{useMetric ? (lbToKg(result.shippingWeightLb)).toFixed(2) + " kg" : result.shippingWeightLb.toFixed(2) + " lb"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Dimensional Weight</span><span className="tabular-nums">{useMetric ? (lbToKg(result.dimensionalWeightLb)).toFixed(2) + " kg" : result.dimensionalWeightLb.toFixed(2) + " lb"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Dimensions (sorted)</span><span className="tabular-nums">{useMetric ? `${(inToCm(result.sortedDims.longest)).toFixed(1)} × ${(inToCm(result.sortedDims.median)).toFixed(1)} × ${(inToCm(result.sortedDims.shortest)).toFixed(1)} cm` : `${result.sortedDims.longest} × ${result.sortedDims.median} × ${result.sortedDims.shortest} in`}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Selling Plan</span>
              <Select value={inputs.sellingPlan} onValueChange={(v) => update("sellingPlan", v as "Professional" | "Individual")}>
                <SelectTrigger className="h-6 text-xs w-auto border-0 p-0 font-medium"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Professional">Professional</SelectItem>
                  <SelectItem value="Individual">Individual</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* ── Two Column Layout ───────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* ── LEFT: Amazon Fulfillment ──────────────────────────── */}
        <div className="border rounded-lg">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h2 className="text-sm font-bold">Amazon Fulfillment</h2>
          </div>
          <div className="px-4 py-2 space-y-0">
            {/* Item price */}
            <InlineField
              label="Item price"
              value={inputs.itemPrice || ""}
              onChange={numUpdate("itemPrice")}
              prefix="$"
            />

            <div className="border-t my-1" />

            {/* Amazon fees */}
            <FeeSection title="Amazon fees" total={result.fba.totalAmazonFees} defaultOpen>
              <FeeLine label="Referral Fee" value={result.fba.referralFee} explainerKey="referral" result={result} inputs={inputs} />
              <FeeLine label="Fixed Closing Fee" value={result.fba.fixedClosingFee} explainerKey="fixedClosing" result={result} inputs={inputs} green />
              <FeeLine label="Variable Closing Fee" value={result.fba.variableClosingFee} explainerKey="variableClosing" result={result} inputs={inputs} green />
              <FeeLine label="Digital Services Fee" value={result.fba.digitalServicesFee} explainerKey="digitalServices" result={result} inputs={inputs} />
            </FeeSection>

            <div className="border-t my-1" />

            {/* Fulfillment cost */}
            <FeeSection title="Fulfillment cost" total={result.fba.totalFulfillmentCost}>
              <FeeLine label="FBA Fulfillment Fee" value={result.fba.fbaFulfillmentFee} />
              {inputs.selectedAddons.length > 0 && (
                <FeeLine label="Service Add-ons" value={result.fba.serviceAddonsCost} />
              )}
              {/* Service add-on checkboxes */}
              <div className="pl-4 pt-2 pb-1">
                <p className="text-xs text-muted-foreground mb-1.5">Service add-ons</p>
                {SERVICE_ADDONS.map((addon) => (
                  <div key={addon.id} className="flex items-center gap-2 py-0.5">
                    <Checkbox
                      id={`fba-${addon.id}`}
                      checked={inputs.selectedAddons.includes(addon.id)}
                      onCheckedChange={(checked) => {
                        update("selectedAddons", checked
                          ? [...inputs.selectedAddons, addon.id]
                          : inputs.selectedAddons.filter((id) => id !== addon.id));
                      }}
                      className="size-3.5"
                    />
                    <label htmlFor={`fba-${addon.id}`} className="text-xs cursor-pointer flex-1">{addon.label}</label>
                    <span className="text-xs text-muted-foreground tabular-nums">${addon.cost.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </FeeSection>

            <div className="border-t my-1" />

            {/* Storage cost */}
            <FeeSection title="Storage cost" total={Math.round(result.fba.monthlyStorageCostPerUnit * inputs.avgInventoryUnits * 100) / 100}>
              {/* Period toggle */}
              <div className="flex gap-0 border rounded-md overflow-hidden w-fit my-2 ml-4">
                <button
                  onClick={() => update("peakPeriod", "JAN-SEP")}
                  className={cn(
                    "px-3 py-1 text-xs font-medium transition-colors",
                    inputs.peakPeriod === "JAN-SEP"
                      ? "bg-brand-solid text-white"
                      : "bg-muted/50 hover:bg-muted"
                  )}
                >
                  January-September
                </button>
                <button
                  onClick={() => update("peakPeriod", "OCT-DEC")}
                  className={cn(
                    "px-3 py-1 text-xs font-medium transition-colors",
                    inputs.peakPeriod === "OCT-DEC"
                      ? "bg-brand-solid text-white"
                      : "bg-muted/50 hover:bg-muted"
                  )}
                >
                  October-December
                </button>
              </div>

              <div className="pl-4 space-y-0">
                <div className="flex items-center justify-between py-0.5">
                  <span className="text-sm text-muted-foreground">Monthly storage cost per unit</span>
                  <div className="flex items-center gap-1">
                    <span className="text-sm tabular-nums">{fmt(result.fba.monthlyStorageCostPerUnit)}</span>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="text-muted-foreground hover:text-brand"><Info className="size-3.5" /></button>
                      </PopoverTrigger>
                      <PopoverContent className="w-72" side="left">
                        <h4 className="font-semibold text-sm mb-2">Fee explainer — Monthly inventory storage fee</h4>
                        <p className="text-xs text-muted-foreground leading-relaxed">{FEE_EXPLAINERS.storage.definition}</p>
                        <div className="mt-2 text-xs space-y-1">
                          <p><strong>Time period:</strong> {inputs.peakPeriod === "JAN-SEP" ? "January - September" : "October - December"}</p>
                          <p><strong>Dimensions:</strong> {inputs.lengthIn} x {inputs.widthIn} x {inputs.heightIn} in</p>
                          <p><strong>Volume:</strong> {((inputs.lengthIn * inputs.widthIn * inputs.heightIn) / 1728).toFixed(3)} cubic_feet</p>
                          <p><strong>Item storage type:</strong> {result.sizeTier.includes("standard") ? "Sortable" : "Non-sortable"}</p>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                <InlineField label="Average inventory units stored" value={inputs.avgInventoryUnits || ""} onChange={numUpdate("avgInventoryUnits")} />
                <InlineField label="Estimated monthly units sold" value={inputs.estimatedMonthlySold || ""} onChange={numUpdate("estimatedMonthlySold")} />

                <div className="flex items-center justify-between py-0.5">
                  <span className="text-sm text-muted-foreground">Storage cost per unit sold</span>
                  <span className="text-sm tabular-nums">
                    {result.fba.storageCostPerUnitSold < 0.01 && result.fba.storageCostPerUnitSold > 0
                      ? "< $0.01"
                      : fmt(result.fba.storageCostPerUnitSold)}
                  </span>
                </div>
              </div>
            </FeeSection>

            <div className="border-t my-1" />

            {/* Inbounding Cost */}
            <FeeSection title="Inbounding Cost" total={result.fba.inboundFeePerUnit}>
              <div className="pl-4 space-y-1 text-xs text-muted-foreground">
                <p>Estimate the FBA inbound placement service fee for this product based on the following inputs.</p>
              </div>
              <div className="pl-4 space-y-0 mt-2">
                <InlineField label="Units to Inbound" value={inputs.unitsToInbound || ""} onChange={numUpdate("unitsToInbound")} />
                <div className="py-1.5">
                  <p className="text-sm mb-1">Inbound placement options</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Select value={inputs.inboundPlacement} onValueChange={(v) => update("inboundPlacement", v as CalculatorInputs["inboundPlacement"])}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Minimal Shipment Splits">Minimal Shipment Splits</SelectItem>
                        <SelectItem value="Partial Shipment Splits">Partial Shipment Splits</SelectItem>
                        <SelectItem value="Amazon Optimized Splits">Amazon Optimized ($0)</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={inputs.inboundRegion} onValueChange={(v) => update("inboundRegion", v as "West" | "Central" | "East")}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="East">East</SelectItem>
                        <SelectItem value="Central">Central</SelectItem>
                        <SelectItem value="West">West</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </FeeSection>

            <div className="border-t my-1" />

            {/* Promotions fees */}
            <FeeSection title="Promotions fees" total={inputs.promotionsCost}>
              <div className="pl-4 space-y-0">
                <InlineField
                  label="Promotions cost"
                  value={inputs.promotionsCost || ""}
                  onChange={numUpdate("promotionsCost")}
                  prefix="$"
                  tooltip="Coupons, Lightning Deals, Subscribe & Save discounts, or other promotional costs"
                />
              </div>
            </FeeSection>

            <div className="border-t my-1" />

            {/* Removal and disposal costs */}
            <FeeSection title="Removal and disposal costs" total={result.fba.removalDisposalCostPerUnitSold}>
              <div className="pl-4 space-y-0">
                <div className="flex items-center justify-between py-0.5">
                  <span className="text-sm text-muted-foreground">Removal fee per unit</span>
                  <span className="text-sm tabular-nums">{fmt(result.fba.removalFeePerUnit)}</span>
                </div>
                <div className="flex items-center justify-between py-0.5">
                  <span className="text-sm text-muted-foreground">Disposal fee per unit</span>
                  <span className="text-sm tabular-nums">{fmt(result.fba.disposalFeePerUnit)}</span>
                </div>
                <InlineField label="Removal units" value={inputs.removalUnits || ""} onChange={numUpdate("removalUnits")} />
                <InlineField label="Disposal units" value={inputs.disposalUnits || ""} onChange={numUpdate("disposalUnits")} />
                <div className="flex items-center justify-between py-0.5">
                  <span className="text-sm text-muted-foreground">Total removal and disposal fee</span>
                  <span className="text-sm tabular-nums">{fmt(result.fba.totalRemovalDisposalFee)}</span>
                </div>
                <div className="flex items-center justify-between py-0.5">
                  <span className="text-sm text-muted-foreground">Removal and disposal cost per unit sold</span>
                  <span className="text-sm tabular-nums">{fmt(result.fba.removalDisposalCostPerUnitSold)}</span>
                </div>
              </div>
            </FeeSection>

            <div className="border-t my-1" />

            {/* Other costs */}
            <FeeSection title="Other costs" total={result.fba.totalOtherCosts}>
              <div className="pl-4 space-y-0">
                <InlineField label="Miscellaneous cost" value={inputs.miscCost || ""} onChange={numUpdate("miscCost")} prefix="$" />
                <InlineField label="Cost of goods sold" value={inputs.cogs || ""} onChange={numUpdate("cogs")} prefix="$" />
                <InlineField label="Fee discounts" value={inputs.feeDiscounts || ""} onChange={numUpdate("feeDiscounts")} prefix="$" />
                <InlineField label="Taxes on fees" value={inputs.taxesOnFees || ""} onChange={numUpdate("taxesOnFees")} prefix="$" />
              </div>
            </FeeSection>
          </div>
        </div>

        {/* ── RIGHT: Your Fulfillment ──────────────────────────── */}
        <div className="border rounded-lg">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h2 className="text-sm font-bold">Your fulfillment</h2>
          </div>
          <div className="px-4 py-2 space-y-0">
            {/* Item price & shipping */}
            <InlineField
              label="Item price"
              value={inputs.itemPrice || ""}
              onChange={numUpdate("itemPrice")}
              prefix="$"
            />
            <InlineField
              label="Shipping charge"
              value={inputs.shippingCharge || ""}
              onChange={numUpdate("shippingCharge")}
              prefix="$"
            />
            <div className="flex items-center justify-between py-1.5 border-t mt-1">
              <span className="text-sm font-medium">Sales price</span>
              <span className="text-sm font-medium tabular-nums">{fmt(result.merchant.salesPrice)}</span>
            </div>

            <div className="border-t my-1" />

            {/* Amazon fees */}
            <FeeSection title="Amazon fees" total={result.merchant.totalAmazonFees} defaultOpen>
              <FeeLine label="Referral Fee" value={result.merchant.referralFee} explainerKey="referral" result={result} inputs={inputs} />
              <FeeLine label="Fixed Closing Fee" value={result.merchant.fixedClosingFee} explainerKey="fixedClosing" result={result} inputs={inputs} green />
              <FeeLine label="Variable Closing Fee" value={result.merchant.variableClosingFee} explainerKey="variableClosing" result={result} inputs={inputs} green />
              <FeeLine label="Digital Services Fee" value={result.merchant.digitalServicesFee} explainerKey="digitalServices" result={result} inputs={inputs} />
            </FeeSection>

            <div className="border-t my-1" />

            {/* Fulfillment cost */}
            <FeeSection title="Fulfillment cost" total={merchantFulfillmentCost}>
              <p className="pl-4 text-xs text-muted-foreground mb-2 leading-relaxed">
                Enter your fulfillment costs for a more accurate comparison. Use the total field or break down by category.
              </p>
              <div className="pl-4 space-y-0">
                <InlineField label="Total fulfillment cost" value={merchantFulfillmentDirect || ""} onChange={(v) => setMerchantFulfillmentDirect(v === "" ? 0 : parseFloat(v))} prefix="$" />
                <InlineField label="Labor" value={merchantLabor || ""} onChange={(v) => setMerchantLabor(v === "" ? 0 : parseFloat(v))} prefix="$" />
                <InlineField label="Packing material" value={merchantPacking || ""} onChange={(v) => setMerchantPacking(v === "" ? 0 : parseFloat(v))} prefix="$" />
                <InlineField label="Shipping to customer" value={merchantShipping || ""} onChange={(v) => setMerchantShipping(v === "" ? 0 : parseFloat(v))} prefix="$" />
                <InlineField label="Customer service" value={merchantCustomerService || ""} onChange={(v) => setMerchantCustomerService(v === "" ? 0 : parseFloat(v))} prefix="$" />
              </div>
            </FeeSection>

            <div className="border-t my-1" />

            {/* Storage cost */}
            <FeeSection title="Storage cost" total={merchantStorageCost}>
              <div className="pl-4 text-xs text-amber-600 dark:text-amber-400 mb-2">
                Enter your storage costs for a more accurate comparison
              </div>
              <div className="pl-4 space-y-0">
                <InlineField
                  label="Monthly storage cost per unit"
                  value={merchantStorageCost || ""}
                  onChange={(v) => setMerchantStorageCost(v === "" ? 0 : parseFloat(v))}
                  prefix="$"
                />
                <InlineField label="Average inventory units stored" value={merchantAvgInvUnits} onChange={(v) => setMerchantAvgInvUnits(v)} />
                <InlineField label="Estimated monthly units sold" value={merchantMonthlySold} onChange={(v) => setMerchantMonthlySold(v)} />
                <div className="flex items-center justify-between py-0.5">
                  <span className="text-sm text-muted-foreground">Storage cost per unit sold</span>
                  <span className="text-sm tabular-nums">{fmt(merchantStorageCost)}</span>
                </div>
              </div>
            </FeeSection>

            <div className="border-t my-1" />

            {/* Promotions fees */}
            <FeeSection title="Promotions fees" total={merchantPromotionsCost}>
              <div className="pl-4 space-y-0">
                <InlineField label="Promotions cost" value={merchantPromotionsCost || ""} onChange={(v) => setMerchantPromotionsCost(v === "" ? 0 : parseFloat(v))} prefix="$" />
              </div>
            </FeeSection>

            <div className="border-t my-1" />

            {/* Other costs */}
            <FeeSection title="Other costs" total={merchantMiscCost + merchantCogs}>
              <div className="pl-4 space-y-0">
                <InlineField label="Miscellaneous cost" value={merchantMiscCost || ""} onChange={(v) => setMerchantMiscCost(v === "" ? 0 : parseFloat(v))} prefix="$" />
                <InlineField label="Cost of goods sold" value={merchantCogs || ""} onChange={(v) => setMerchantCogs(v === "" ? 0 : parseFloat(v))} prefix="$" />
              </div>
            </FeeSection>
          </div>
        </div>
      </div>

      {/* Branding for public variant */}
      {variant === "public" && (
        <div className="text-center text-xs text-muted-foreground pt-2">
          Powered by <span className="font-semibold">1o8</span> · Amazon Marketplace Agency
        </div>
      )}

      {/* ── Sticky Bottom Bar ───────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t shadow-lg">
        <div className="max-w-5xl mx-auto px-4">
          <div className="grid grid-cols-2 gap-0">
            {/* FBA bottom */}
            <table className="border-r w-full">
              <thead>
                <tr>
                  <th className="text-[10px] text-muted-foreground font-normal text-left px-4 pt-2 pb-1"><span className="flex items-center gap-0.5">Cost per unit <Info className="size-3" /></span></th>
                  <th className="text-[10px] text-muted-foreground font-normal text-left px-2 pt-2 pb-1">Estimated sales, 30 days</th>
                  <th className="text-[10px] text-muted-foreground font-normal text-left px-2 pt-2 pb-1">Net profit</th>
                  <th className="text-[10px] text-muted-foreground font-normal text-left px-2 pt-2 pb-1">Net margin</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-4 pb-2 text-base font-bold tabular-nums">{fmt(result.fba.costPerUnit)}</td>
                  <td className="px-2 pb-2">
                    <input
                      type="number"
                      value={estimatedSales30 || ""}
                      onChange={(e) => setEstimatedSales30(e.target.value === "" ? 0 : parseInt(e.target.value))}
                      className="text-base font-bold tabular-nums w-16 bg-white dark:bg-zinc-900 text-black dark:text-zinc-300 rounded px-1.5 py-0.5 border border-border outline-none focus:border-brand [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                  </td>
                  <td className={cn("px-2 pb-2 text-base font-bold tabular-nums", isProfitable ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>{fmt(fbaNetProfit30)}</td>
                  <td className={cn("px-2 pb-2 text-base font-bold tabular-nums", isProfitable ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>{fmtPct(result.fba.netMargin)}</td>
                </tr>
              </tbody>
            </table>
            {/* Merchant bottom */}
            <table className="w-full">
              <thead>
                <tr>
                  <th className="text-[10px] text-muted-foreground font-normal text-left px-4 pt-2 pb-1"><span className="flex items-center gap-0.5">Cost per unit <Info className="size-3" /></span></th>
                  <th className="text-[10px] text-muted-foreground font-normal text-left px-2 pt-2 pb-1">Estimated sales, 30 days</th>
                  <th className="text-[10px] text-muted-foreground font-normal text-left px-2 pt-2 pb-1">Net proceeds</th>
                  <th className="text-[10px] text-muted-foreground font-normal text-left px-2 pt-2 pb-1">Net margin</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-4 pb-2 text-base font-bold tabular-nums">{fmt(merchantTotalCost)}</td>
                  <td className="px-2 pb-2">
                    <input
                      type="number"
                      value={merchantEstimatedSales30 || ""}
                      onChange={(e) => setMerchantEstimatedSales30(e.target.value === "" ? 0 : parseInt(e.target.value))}
                      className="text-base font-bold tabular-nums w-16 bg-white dark:bg-zinc-900 text-black dark:text-zinc-300 rounded px-1.5 py-0.5 border border-border outline-none focus:border-brand [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                  </td>
                  <td className={cn("px-2 pb-2 text-base font-bold tabular-nums", merchantNetProceeds >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>{fmt(merchantNetProceeds * merchantEstimatedSales30)}</td>
                  <td className={cn("px-2 pb-2 text-base font-bold tabular-nums", merchantMargin >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>{fmtPct(merchantMargin)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
