"use client";

import { useState, useCallback, useRef, useEffect, memo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Star, HelpCircle, Loader2, Check, X } from "lucide-react";
import { toast } from "sonner";
import type { FieldType } from "@/lib/column-registry";
import type { RequirementLevel } from "@/lib/constants";
import { REQUIREMENT_COLORS, REQUIREMENT_SHORT_LABELS } from "@/lib/constants";
import { FieldComments } from "./field-comments";

type FieldSaveState = "idle" | "saving" | "saved" | "error";

export type AmazonFieldMeta = {
  amazonFieldName: string;
  localLabel: string;
  requirement: string;
  description: string | null;
  example: string | null;
  validValues: string[] | null;
};

type Props = {
  bqName: string;
  label: string;
  value: string | null;
  fieldType: FieldType;
  readOnly: boolean;
  onSave: (bqName: string, value: string | null) => Promise<void>;
  onFieldSaved?: (
    bqName: string,
    label: string,
    oldValue: string,
    newValue: string
  ) => void;
  isEssential?: boolean;
  labelDetails?: string | null;
  requirementLevel?: RequirementLevel;
  maxLength?: number | null;
  options?: string[] | null;
  productId?: string;
  commentCount?: { total: number; open: number };
  amazonMeta?: AmazonFieldMeta | null;
  computed?: boolean;
};

export const ProductField = memo(function ProductField({
  bqName,
  label,
  value,
  fieldType: fieldTypeProp,
  readOnly: readOnlyProp,
  onSave,
  onFieldSaved,
  isEssential,
  labelDetails,
  requirementLevel,
  maxLength,
  options: optionsProp,
  productId,
  commentCount,
  amazonMeta,
  computed,
}: Props) {
  const readOnly = readOnlyProp || !!computed;
  // Amazon valid values override field options when present
  const amazonHasValues = amazonMeta?.validValues && amazonMeta.validValues.length > 0;
  const options = amazonHasValues ? amazonMeta!.validValues : optionsProp;
  const fieldType = amazonHasValues && !optionsProp ? "select" as FieldType : fieldTypeProp;
  const savedValue = value ?? "";
  const [localValue, setLocalValue] = useState(savedValue);
  const [saveState, setSaveState] = useState<FieldSaveState>("idle");
  const [previousValue, setPreviousValue] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoRef = useRef<(() => void) | null>(null);
  const focusedRef = useRef(false);

  // Sync local value when the prop changes from outside (e.g. query refetch)
  // but only if the field is not currently focused (user is typing)
  useEffect(() => {
    if (!focusedRef.current) {
      setLocalValue(value ?? "");
    }
  }, [value]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
    };
  }, []);

  const doSave = useCallback(
    async (newValue: string) => {
      const trimmed = newValue.trim() || null;
      const currentSaved = value ?? null;
      if (trimmed === currentSaved) return;

      setSaveState("saving");
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);

      try {
        const oldVal = currentSaved ?? "";
        setPreviousValue(oldVal);
        await onSave(bqName, trimmed);
        setSaveState("saved");
        onFieldSaved?.(bqName, label, oldVal, trimmed ?? "");

        // Show undo toast
        const undoFn = async () => {
          setLocalValue(oldVal);
          setSaveState("saving");
          try {
            await onSave(bqName, oldVal || null);
            setSaveState("saved");
            onFieldSaved?.(bqName, label, trimmed ?? "", oldVal);
            savedTimeoutRef.current = setTimeout(
              () => setSaveState("idle"),
              2000
            );
            toast.info(`Reverted ${label}`);
          } catch {
            setSaveState("error");
          }
        };
        undoRef.current = undoFn;

        toast.success(`Saved ${label}`, {
          action: { label: "Undo", onClick: () => undoRef.current?.() },
          duration: 5000,
        });

        savedTimeoutRef.current = setTimeout(
          () => setSaveState("idle"),
          2000
        );
      } catch {
        setSaveState("error");
        toast.error(`Failed to save ${label}`);
      }
    },
    [bqName, label, value, onSave, onFieldSaved]
  );

  const handleRetry = useCallback(() => {
    doSave(localValue);
  }, [doSave, localValue]);

  const handleChange = useCallback(
    (newVal: string) => {
      setLocalValue(newVal);
    },
    []
  );

  const handleFocus = useCallback(() => {
    focusedRef.current = true;
  }, []);

  const handleBlur = useCallback(() => {
    focusedRef.current = false;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const trimmed = localValue.trim() || null;
    if (trimmed !== (value ?? null)) {
      doSave(localValue);
    }
  }, [localValue, value, doSave]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && fieldType !== "textarea") {
        e.preventDefault();
        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
          debounceRef.current = null;
        }
        doSave(localValue);
        // Move focus to next field
        const inputs = document.querySelectorAll<
          HTMLInputElement | HTMLTextAreaElement
        >("[data-field-input]");
        const arr = Array.from(inputs);
        const idx = arr.indexOf(e.currentTarget as HTMLInputElement);
        if (idx >= 0 && idx < arr.length - 1) {
          arr[idx + 1].focus();
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setLocalValue(savedValue);
        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
          debounceRef.current = null;
        }
        (e.currentTarget as HTMLElement).blur();
      }
    },
    [fieldType, localValue, savedValue, doSave]
  );

  const isTextarea = fieldType === "textarea";
  const isSelect = fieldType === "select" && options && options.length > 0;
  const showRequirement =
    requirementLevel && requirementLevel !== "Not Required";
  // Amazon requirement shown when no Hub requirement exists
  const amazonReq = amazonMeta?.requirement;
  const showAmazonReq = amazonReq && !showRequirement && amazonReq !== "Optional";
  const isDirty = localValue !== savedValue;
  const isOverLimit = maxLength != null && localValue.length > maxLength;
  const showCharCount =
    fieldType === "text" || fieldType === "textarea";
  // Tooltip content: Amazon description takes priority, falls back to labelDetails
  const tooltipText = amazonMeta?.description || labelDetails;

  // Save state indicator
  const saveIndicator = (
    <div className="absolute right-2 top-1/2 -translate-y-1/2 z-10">
      {saveState === "saving" && (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground/70" />
      )}
      {saveState === "saved" && (
        <Check className="h-3.5 w-3.5 text-emerald-500" />
      )}
      {saveState === "error" && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleRetry}
                className="cursor-pointer"
              >
                <X className="h-3.5 w-3.5 text-red-500" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">
              Save failed. Click to retry.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );

  return (
    <div id={`field-${bqName}`} className="grid gap-1.5 min-w-0">
      {/* Label row */}
      <div className="flex items-center gap-1.5 min-w-0">
        <Label
          htmlFor={bqName}
          className="text-xs text-muted-foreground truncate min-w-0 shrink"
          title={label}
        >
          {label}
        </Label>
        {computed && (
          <span className="inline-flex items-center rounded px-1 py-0.5 text-[10px] leading-none font-medium border whitespace-nowrap shrink-0 bg-violet-500/15 text-violet-400 border-violet-500/30">
            Auto
          </span>
        )}
        {isEssential && (
          <Star className="h-3 w-3 text-amber-500 fill-amber-500 shrink-0" />
        )}
        {showRequirement && (
          <span
            className={`inline-flex items-center rounded px-1 py-0.5 text-[10px] leading-none font-medium border whitespace-nowrap shrink-0 ${REQUIREMENT_COLORS[requirementLevel]}`}
          >
            {REQUIREMENT_SHORT_LABELS[requirementLevel]}
          </span>
        )}
        {showAmazonReq && (
          <span
            className={`inline-flex items-center rounded px-1 py-0.5 text-[10px] leading-none font-medium border whitespace-nowrap shrink-0 ${
              amazonReq === "Required"
                ? "bg-red-500/15 text-red-400 border-red-500/30"
                : amazonReq === "Conditionally Required"
                  ? "bg-orange-500/15 text-orange-400 border-orange-500/30"
                  : "bg-blue-500/15 text-blue-400 border-blue-500/30"
            }`}
          >
            {amazonReq === "Required"
              ? "AMZ Req"
              : amazonReq === "Conditionally Required"
                ? "AMZ Cond"
                : "AMZ Rec"}
          </span>
        )}
        {tooltipText && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-3 w-3 text-muted-foreground/70 cursor-help shrink-0" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-sm">
                <p>{tooltipText}</p>
                {amazonMeta?.example && (
                  <p className="mt-1 text-muted-foreground">
                    Example: <span className="font-mono">{amazonMeta.example}</span>
                  </p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {productId && (
          <FieldComments
            productId={productId}
            bqName={bqName}
            fieldLabel={label}
            commentCount={commentCount}
          />
        )}
      </div>
      {/* Secondary label row: Amazon field name */}
      {amazonMeta && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 -mt-0.5">
          <span className="text-[10px] text-orange-400/60 font-mono truncate max-w-full" title={amazonMeta.amazonFieldName}>
            AMZ: {amazonMeta.localLabel}
          </span>
        </div>
      )}

      {readOnly ? (
        <p className="text-sm min-h-[36px] py-2 px-3 rounded-md bg-muted text-muted-foreground border border-border break-words overflow-hidden">
          {value || <span className="text-muted-foreground/70">&mdash;</span>}
        </p>
      ) : isSelect ? (
        <div className="relative">
          <Select
            value={localValue || "__empty__"}
            onValueChange={(v) => {
              const newVal = v === "__empty__" ? "" : v;
              setLocalValue(newVal);
              if (debounceRef.current) clearTimeout(debounceRef.current);
              doSave(newVal);
            }}
          >
            <SelectTrigger className="bg-field-bg text-field-text border-field-border focus:ring-brand">
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__empty__">
                <span className="text-muted-foreground">None</span>
              </SelectItem>
              {options!.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {saveIndicator}
        </div>
      ) : isTextarea ? (
        <div
          className={`relative${isDirty ? " border-l-2 border-brand pl-2" : ""}`}
        >
          <textarea
            id={bqName}
            data-field-input
            data-field-bq={bqName}
            value={localValue}
            onChange={(e) => handleChange(e.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            rows={3}
            className="flex min-h-[80px] w-full rounded-md border border-field-border bg-field-bg text-field-text px-3 py-2 pr-8 text-sm ring-offset-background placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          />
          {saveIndicator}
        </div>
      ) : (
        <div
          className={`relative${isDirty ? " border-l-2 border-brand pl-2" : ""}`}
        >
          <Input
            id={bqName}
            data-field-input
            data-field-bq={bqName}
            type={
              fieldType === "url"
                ? "url"
                : fieldType === "number"
                  ? "number"
                  : "text"
            }
            value={localValue}
            onChange={(e) => handleChange(e.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className="bg-field-bg text-field-text border-field-border pr-8 focus-visible:ring-brand"
          />
          {saveIndicator}
        </div>
      )}

      {/* Character count */}
      {!readOnly && showCharCount && (
        <div className="flex justify-between">
          <span className="text-[11px] text-muted-foreground/70">
            {localValue.length} chars
          </span>
          {maxLength != null && (
            <span
              className={`text-[11px] ${isOverLimit ? "text-red-400 font-medium" : "text-muted-foreground/70"}`}
            >
              {maxLength - localValue.length} remaining
            </span>
          )}
        </div>
      )}
    </div>
  );
});
