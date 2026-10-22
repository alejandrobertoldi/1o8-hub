/* eslint-disable react-doctor/no-react19-deprecated-apis */
/* eslint-disable react-doctor/no-generic-handler-names */
/* eslint-disable react-doctor/no-derived-useState */
/* eslint-disable react-doctor/no-tiny-text */
/* eslint-disable react-doctor/no-inline-exhaustive-style */
"use client";

import { useState, useContext } from "react";
import { Loader2, Check, X, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { AplusImageSlot } from "./aplus-image-slot";
import type { TextFieldSpec, ImageSlotSpec } from "@/lib/aplus-module-specs";
import {
  ProductFallbackCtx,
  ModuleNamingCtx,
  EXCEEDED_BORDER,
} from "./module-card-types";
import type { AplusModuleImage, FieldSaveState } from "./module-card-types";

// ─── Save indicator ───────────────────────────────────────────────

export function SaveIndicator({ state }: { state: FieldSaveState }) {
  if (state === "saving")
    return <Loader2 className="size-3 animate-spin shrink-0" style={{ color: "#888c8c" }} />;
  if (state === "saved")
    return <Check className="size-3 shrink-0" style={{ color: "#047857" }} />;
  if (state === "error")
    return <X className="size-3 shrink-0" style={{ color: "#d13212" }} />;
  return null;
}

// ─── Char counter ─────────────────────────────────────────────────

export function CharCounter({ length, max }: { length: number; max: number }) {
  const exceeded = length > max;
  return (
    <div style={{
      display: "flex",
      justifyContent: exceeded ? "space-between" : "flex-end",
      alignItems: "baseline",
      fontSize: "11px",
      fontWeight: 400,
      marginTop: "4px",
    }}>
      {exceeded && (
        <span style={{ color: "#d13212" }}>Exceeded character limit</span>
      )}
      <span style={{ color: exceeded ? "#d13212" : "#0F1111", fontFamily: "monospace" }}>
        {exceeded ? `${max - length}` : `${length} / ${max}`}
      </span>
    </div>
  );
}

// ─── Text field (Amazon SC style) ─────────────────────────────────

interface ModuleTextFieldProps {
  spec: TextFieldSpec;
  value: string;
  readOnly: boolean;
  onSave: (key: string, value: string) => Promise<void>;
  labelColor?: string;
  inputBgColor?: string;
}

export function ModuleTextField({ spec, value: initialValue, readOnly, onSave, labelColor, inputBgColor }: ModuleTextFieldProps) {
  const [localValue, setLocalValue] = useState(initialValue);
  const [saveState, setSaveState] = useState<FieldSaveState>("idle");

  const handleBlur = async () => {
    const trimmed = localValue.trim();
    if (trimmed === initialValue.trim()) return;
    if (spec.maxLength && trimmed.length > spec.maxLength) {
      setSaveState("error");
      toast.error(`${spec.label} exceeds ${spec.maxLength} character limit`);
      return;
    }
    setSaveState("saving");
    try {
      await onSave(spec.key, trimmed);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1500);
    } catch {
      setSaveState("error");
      toast.error(`Failed to save ${spec.label}`);
    }
  };

  const exceeded = spec.maxLength ? localValue.length > spec.maxLength : false;

  const inputStyle: React.CSSProperties = {
    backgroundColor: inputBgColor ?? "#ffffff",
    color: "#0F1111",
    border: `1px solid ${exceeded ? EXCEEDED_BORDER : "#888c8c"}`,
    borderRadius: "4px",
    fontSize: "14px",
    padding: "6px 10px",
    width: "100%",
    outline: "none",
  };

  return (
    <div style={{ marginBottom: "4px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
        <label style={{ fontSize: "14px", fontWeight: 700, color: labelColor ?? "#0F1111" }}>
          {spec.label}
        </label>
        <SaveIndicator state={saveState} />
      </div>
      {spec.multiline ? (
        <textarea
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onBlur={handleBlur}
          disabled={readOnly}
          rows={spec.rows ?? 3}
          placeholder={`Enter ${spec.label.toLowerCase()}`}
          style={{ ...inputStyle, resize: "none" }}
        />
      ) : (
        <input
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onBlur={handleBlur}
          disabled={readOnly}
          placeholder={`Enter ${spec.label.toLowerCase()}`}
          style={inputStyle}
        />
      )}
      {spec.maxLength != null && (
        <CharCounter length={localValue.length} max={spec.maxLength} />
      )}
    </div>
  );
}

// ─── Rich text toolbar (placeholder B/I/U) ─────────────────────

export function RichTextToolbar() {
  const btnStyle: React.CSSProperties = {
    width: "28px",
    height: "24px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid #d5d9d9",
    borderRadius: "3px",
    backgroundColor: "#ffffff",
    color: "#565959",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: 700,
    padding: 0,
  };
  return (
    <div style={{ display: "flex", gap: "2px", marginBottom: "4px" }}>
      <button type="button" style={btnStyle}><span style={{ fontWeight: 700 }}>B</span></button>
      <button type="button" style={{ ...btnStyle, fontStyle: "italic", fontWeight: 400 }}>I</button>
      <button type="button" style={{ ...btnStyle, fontWeight: 400, textDecoration: "underline" }}>U</button>
      <button type="button" style={{ ...btnStyle, fontWeight: 400, fontSize: "11px" }}>≡</button>
      <button type="button" style={{ ...btnStyle, fontWeight: 400, fontSize: "11px" }}>≡</button>
    </div>
  );
}

// ─── Image placeholder (Amazon SC teal dashed) ───────────────────

interface ImagePlaceholderProps {
  slotSpec: ImageSlotSpec;
  image: AplusModuleImage | undefined;
  productId: string;
  moduleId: string;
  readOnly: boolean;
}

export function ImagePlaceholder({ slotSpec, image, productId, moduleId, readOnly }: ImagePlaceholderProps) {
  const productFallback = useContext(ProductFallbackCtx);
  const moduleNaming = useContext(ModuleNamingCtx);
  const dimText = `${slotSpec.desktopSize.width}:${slotSpec.desktopSize.height}`;

  return (
    <div>
      <label style={{ fontSize: "14px", fontWeight: 700, color: "#0F1111", display: "block", marginBottom: "6px" }}>
        <span style={{ color: "#d13212", marginRight: "2px" }}>*</span>
        {slotSpec.label}
      </label>

      {image ? (
        <AplusImageSlot
          image={image}
          productId={productId}
          moduleId={moduleId}
          readOnly={readOnly}
          slotSpec={slotSpec}
          fallbackClientIdCode={productFallback.clientIdCode}
          fallbackAsin={productFallback.asin}
          moduleType={moduleNaming.moduleType}
          modulePosition={moduleNaming.modulePosition}
          marketplace={moduleNaming.marketplace}
        />
      ) : (
        <div
          style={{
            width: "100%",
            backgroundColor: "#f7f8fa",
            border: "2px dashed #7f9ba6",
            borderRadius: "2px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            padding: "48px 0",
            cursor: "pointer",
          }}
        >
          <ImageIcon style={{ width: "28px", height: "28px", color: "#6b8f9e" }} />
          <span style={{ fontSize: "13px", fontWeight: 600, color: "#6b8f9e" }}>{dimText}</span>
          <span style={{ fontSize: "13px", color: "#6b8f9e" }}>Click to add image</span>
        </div>
      )}
    </div>
  );
}
