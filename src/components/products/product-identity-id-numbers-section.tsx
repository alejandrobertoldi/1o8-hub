"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown, ChevronRight, Loader2, Check, X, MessageSquare, HelpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";
import { getProductFieldValue } from "@/lib/product-mapper";
import type { Product } from "@/lib/db/schema";
import type { AmazonFieldMeta } from "./product-field";

const FIELDS: {
  bqName: string;
  label: string;
  labelDetails?: string;
}[] = [
  { 
    bqName: "unspsc_code_marketplace_id=ATVPDKIKX0DER_#1_value", 
    label: "UNSPSC Code",
    labelDetails: "The UNSPSC (United Nations Standard Products and Services Code) is a hierarchical code that classifies products and services."
  },
  { 
    bqName: "national_stock_number_marketplace_id=ATVPDKIKX0DER_#1_value", 
    label: "National Stock Number",
    labelDetails: "The National Stock Number (NSN) is a 13-digit numeric identifier for NATO-managed inventory items."
  },
];

type Props = {
  product: Product;
  readOnly: boolean;
  onSave: (bqName: string, value: string | null) => Promise<void>;
  onFieldSaved?: (
    bqName: string,
    label: string,
    oldValue: string,
    newValue: string
  ) => void;
  amazonMetaByField?: Map<string, AmazonFieldMeta>;
  commentCount?: Record<string, { total: number; open: number }>;
};

export function ProductIdentityIdNumbersSection({
  product,
  readOnly,
  onSave,
  onFieldSaved,
  amazonMetaByField,
  commentCount,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  const populatedCount = FIELDS.filter((f) => {
    const val = getProductFieldValue(product, f.bqName);
    return val != null && val !== "";
  }).length;

  return (
    <div className="rounded-xl border border-border bg-card text-card-foreground overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between gap-3 w-full px-4 py-2.5 text-left hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <span className="text-xs font-bold text-foreground">
            Product Identity
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] leading-none font-medium border bg-zinc-500/15 text-zinc-400 border-zinc-500/30 tabular-nums">
            {FIELDS.length}O
          </span>
          <Badge variant="secondary" className="text-xs shrink-0 tabular-nums">
            {populatedCount}/{FIELDS.length}
          </Badge>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border px-4 py-3 grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-6">
          {FIELDS.map((field) => {
            const value = getProductFieldValue(product, field.bqName) ?? "";
            const amzMeta = amazonMetaByField?.get(field.bqName);
            const comments = commentCount?.[field.bqName];
            
            return (
              <IdNumberField
                key={field.bqName}
                label={field.label}
                bqName={field.bqName}
                value={value}
                readOnly={readOnly}
                onSave={onSave}
                onFieldSaved={onFieldSaved}
                amazonMeta={amzMeta}
                labelDetails={field.labelDetails}
                commentCount={comments?.open}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function IdNumberField({
  label,
  bqName,
  value,
  readOnly,
  onSave,
  onFieldSaved,
  amazonMeta,
  labelDetails,
  commentCount,
}: {
  label: string;
  bqName: string;
  value: string;
  readOnly: boolean;
  onSave: (bqName: string, value: string | null) => Promise<void>;
  onFieldSaved?: (bqName: string, label: string, oldValue: string, newValue: string) => void;
  amazonMeta?: AmazonFieldMeta;
  labelDetails?: string;
  commentCount?: number;
}) {
  const [localValue, setLocalValue] = useState(value);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setLocalValue(value); }, [value]);

  const doSave = useCallback(
    async (newVal: string) => {
      if (newVal === value) return;
      setSaveState("saving");
      try {
        await onSave(bqName, newVal || null);
        onFieldSaved?.(bqName, label, value, newVal);
        setSaveState("saved");
        setTimeout(() => setSaveState("idle"), 1500);
      } catch {
        setSaveState("error");
        toast.error(`Failed to save ${label}`);
        setTimeout(() => setSaveState("idle"), 2000);
      }
    },
    [bqName, label, value, onSave, onFieldSaved]
  );

  const handleChange = (newVal: string) => {
    setLocalValue(newVal);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSave(newVal), 600);
  };

  return (
    <div className="flex flex-col gap-1 min-h-[80px]" id={`field-${bqName}`}>
      {/* Field name row with metadata */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-foreground shrink-0">
          {label}
        </span>

        {/* Optional badge */}
        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-medium bg-zinc-800/50 text-zinc-400 shrink-0">
          Opt
        </span>

        {/* Help icon with tooltip */}
        {labelDetails && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
              >
                <HelpCircle className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="start"
              className="max-w-[280px] text-xs text-muted-foreground bg-popover"
            >
              {labelDetails}
            </PopoverContent>
          </Popover>
        )}

        {/* Comment icon */}
        <button
          type="button"
          className={`shrink-0 transition-colors ${commentCount && commentCount > 0 ? "text-brand" : "text-muted-foreground hover:text-foreground"}`}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          {commentCount && commentCount > 0 && (
            <span className="ml-0.5 text-[10px] font-medium">{commentCount}</span>
          )}
        </button>
      </div>

      {/* AMZ label - aligned left with accent color */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono font-medium" style={{ color: "#F7BF1D" }}>
          AMZ: {label}
        </span>
      </div>

      {/* Input row - aligned left */}
      <div className="flex items-center gap-2">
        {readOnly ? (
          <span className="text-xs text-foreground/80">
            {value || <span className="text-muted-foreground/50">—</span>}
          </span>
        ) : (
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <input
              type="text"
              data-field-bq={bqName}
              value={localValue}
              onChange={(e) => handleChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (debounceRef.current) clearTimeout(debounceRef.current);
                  doSave(localValue);
                }
              }}
              className="h-7 px-2.5 text-xs rounded border border-border bg-field-bg text-field-text focus:outline-none focus:ring-1 focus:ring-brand flex-1 min-w-0"
            />
            {saveState === "saving" && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />}
            {saveState === "saved" && <Check className="h-3 w-3 text-emerald-500 shrink-0" />}
            {saveState === "error" && <X className="h-3 w-3 text-destructive shrink-0" />}
          </div>
        )}
      </div>
    </div>
  );
}