/* eslint-disable react-doctor/rerender-functional-setstate */
/* eslint-disable react-doctor/no-derived-state-effect */
/* eslint-disable jsx-a11y/label-has-associated-control */
/* eslint-disable react-doctor/no-tiny-text */
/* eslint-disable react-doctor/no-inline-exhaustive-style */
"use client";

import { useState, useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { APLUS_MODULE_SPECS, type TextFieldSpec } from "@/lib/aplus-module-specs";
import { ModuleTextField, CharCounter } from "../module-card-shared";
import type { AplusModule, AplusModuleImage } from "../module-card-types";
import { EXCEEDED_BORDER } from "../module-card-types";

interface TechSpecRow {
  id: string;
  specName: string;
  definition: string;
}

interface TechSpecsBodyProps {
  module: AplusModule & { images: AplusModuleImage[] };
  productId: string;
  readOnly: boolean;
  getFieldValue: (key: TextFieldSpec["key"]) => string;
  onSaveField: (key: string, value: string) => Promise<void>;
}

export function TechSpecsBody({
  module,
  productId,
  readOnly,
  getFieldValue,
  onSaveField,
}: TechSpecsBodyProps) {
  const queryClient = useQueryClient();
  const spec = APLUS_MODULE_SPECS["technical_specifications"];
  const rg = spec.repeatableGroup!;
  const specField = rg.fields.find(f => f.key === "spec_label")!;
  const defField = rg.fields.find(f => f.key === "spec_value")!;
  const [tableLayout, setTableLayout] = useState<"full" | "split">(
    (module as Record<string, unknown>).textPosition === "split" ? "split" : "full"
  );
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const saveTableLayout = useCallback(async (layout: "full" | "split") => {
    setTableLayout(layout);
    try {
      await fetch(`/api/aplus/${productId}/modules/${module.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ textPosition: layout }),
      });
    } catch { /* ignore */ }
  }, [productId, module.id]);

  // Load spec rows from DB (stored as image records with panelData)
  const specImages = module.images
    .filter((img) => img.customLabel?.startsWith("spec_"))
    .sort((a, b) => a.imageSlot - b.imageSlot);

  const getInitialRows = useCallback((): TechSpecRow[] => {
    if (specImages.length > 0) {
      return specImages.map((img, i) => {
        const pd = (img.panelData ?? {}) as Record<string, string>;
        return {
          id: img.id ?? `spec-${i}`,
          specName: pd.spec_label ?? "",
          definition: pd.spec_value ?? "",
        };
      });
    }
    return Array.from({ length: rg.minItems }, (_, i) => ({
      id: `spec-${i}`,
      specName: "",
      definition: "",
    }));
  }, [specImages, rg.minItems]);

  const [rows, setRows] = useState<TechSpecRow[]>(getInitialRows);

  // Re-sync when images change
  useEffect(() => {
    setRows(getInitialRows());
  }, [getInitialRows]);

  // Save a spec row to DB on blur
  const saveSpecRow = useCallback(async (idx: number) => {
    const row = rows[idx];
    if (!row || (!row.specName && !row.definition)) return;
    setSaveState("saving");
    try {
      await fetch(`/api/aplus/${productId}/modules/${module.id}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageSlot: idx + 1,
          customLabel: `spec_${idx + 1}`,
          panelData: { spec_label: row.specName, spec_value: row.definition },
        }),
      });
      setSaveState("saved");
      queryClient.invalidateQueries({ queryKey: ["aplus-modules", productId] });
      setTimeout(() => setSaveState("idle"), 1500);
    } catch {
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 2000);
    }
  }, [rows, productId, module.id, queryClient]);

  const addRow = () => {
    if (rows.length >= rg.maxItems) return;
    setRows([...rows, { id: `spec-${Date.now()}`, specName: "", definition: "" }]);
  };

  const removeRow = (idx: number) => {
    if (rows.length <= rg.minItems) return;
    setRows(rows.filter((_, i) => i !== idx));
  };

  const updateRow = (idx: number, field: "specName" | "definition", value: string) => {
    const arr = [...rows];
    arr[idx] = { ...arr[idx], [field]: value };
    setRows(arr);
  };

  const inputStyle: React.CSSProperties = {
    backgroundColor: "#ffffff",
    color: "#0F1111",
    border: "1px solid #888c8c",
    borderRadius: "4px",
    fontSize: "14px",
    padding: "6px 10px",
    width: "100%",
    outline: "none",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* Headline */}
      <div style={{ padding: "20px 20px 0" }}>
        <ModuleTextField
          spec={spec.textFields[0]}
          value={getFieldValue("headlineText")}
          readOnly={readOnly}
          onSave={onSaveField}
        />
      </div>

      {/* Specification rows */}
      <div style={{ padding: "16px 20px 20px", display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "14px", fontWeight: 700, color: "#0F1111" }}>
            Specification ({rg.maxItems} max / {rg.minItems} min)
          </span>
          {saveState === "saving" && <span style={{ fontSize: 11, color: "#888c8c" }}>Saving…</span>}
          {saveState === "saved" && <span style={{ fontSize: 11, color: "#047857" }}>Saved</span>}
          {saveState === "error" && <span style={{ fontSize: 11, color: "#d13212" }}>Error</span>}
        </div>

        {rows.map((row, i) => (
          <div key={row.id} style={{ display: "flex", gap: "8px", alignItems: "start" }}>
            {/* X delete */}
            <button
              type="button"
              onClick={() => removeRow(i)}
              disabled={rows.length <= rg.minItems || readOnly}
              style={{
                width: "24px",
                height: "24px",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                border: "1px solid #d5d9d9",
                borderRadius: "4px",
                backgroundColor: "#ffffff",
                color: rows.length <= rg.minItems ? "#d5d9d9" : "#565959",
                cursor: rows.length <= rg.minItems ? "default" : "pointer",
                flexShrink: 0,
                marginTop: "24px",
                padding: 0,
              }}
            >
              <X style={{ width: "12px", height: "12px" }} />
            </button>

            {/* Specification (narrow) */}
            <div style={{ width: "200px", flexShrink: 0 }}>
              <label style={{ fontSize: "14px", fontWeight: 700, color: "#0F1111", display: "block", marginBottom: "6px" }}>
                <span style={{ color: "#d13212", marginRight: "2px" }}>*</span>
                Specification
              </label>
              <input
                value={row.specName}
                onChange={(e) => updateRow(i, "specName", e.target.value)}
                onBlur={() => saveSpecRow(i)}
                placeholder="Enter specification"
                disabled={readOnly}
                style={{
                  ...inputStyle,
                  border: `1px solid ${row.specName.length > (specField.maxLength ?? 30) ? EXCEEDED_BORDER : "#888c8c"}`,
                }}
              />
              <CharCounter length={row.specName.length} max={specField.maxLength ?? 30} />
            </div>

            {/* Definition (wide) */}
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: "14px", fontWeight: 700, color: "#0F1111", display: "block", marginBottom: "6px" }}>
                <span style={{ color: "#d13212", marginRight: "2px" }}>*</span>
                Definition
              </label>
              <input
                value={row.definition}
                onChange={(e) => updateRow(i, "definition", e.target.value)}
                onBlur={() => saveSpecRow(i)}
                placeholder="Enter definition"
                disabled={readOnly}
                style={{
                  ...inputStyle,
                  border: `1px solid ${row.definition.length > (defField.maxLength ?? 500) ? EXCEEDED_BORDER : "#888c8c"}`,
                }}
              />
              <CharCounter length={row.definition.length} max={defField.maxLength ?? 500} />
            </div>
          </div>
        ))}

        {/* Add specification */}
        <button
          type="button"
          onClick={addRow}
          disabled={rows.length >= rg.maxItems || readOnly}
          style={{
            alignSelf: "flex-start",
            padding: "4px 14px",
            fontSize: "13px",
            fontWeight: 500,
            color: rows.length >= rg.maxItems ? "#888c8c" : "#008296",
            backgroundColor: "#ffffff",
            border: `1px solid ${rows.length >= rg.maxItems ? "#d5d9d9" : "#008296"}`,
            borderRadius: "3px",
            cursor: rows.length >= rg.maxItems ? "default" : "pointer",
          }}
        >
          Add specification
        </button>
      </div>

      {/* Layout toggle (full-width vs 2-column) */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 20px", borderTop: "1px solid #e7e7e7" }}>
        {/* Full-width table */}
        <button
          type="button"
          onClick={() => saveTableLayout("full")}
          style={{
            width: "48px",
            height: "32px",
            border: tableLayout === "full" ? "2px solid #008296" : "1px solid #d5d9d9",
            borderRadius: "4px",
            backgroundColor: "#ffffff",
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "3px",
            padding: "6px 4px",
          }}
        >
          <div style={{ width: "100%", height: "2px", backgroundColor: "#565959", borderRadius: "1px" }} />
          <div style={{ width: "100%", height: "2px", backgroundColor: "#565959", borderRadius: "1px" }} />
          <div style={{ width: "100%", height: "2px", backgroundColor: "#565959", borderRadius: "1px" }} />
          <div style={{ width: "100%", height: "2px", backgroundColor: "#565959", borderRadius: "1px" }} />
        </button>

        {/* 2-column split */}
        <button
          type="button"
          onClick={() => saveTableLayout("split")}
          style={{
            width: "48px",
            height: "32px",
            border: tableLayout === "split" ? "2px solid #008296" : "1px solid #d5d9d9",
            borderRadius: "4px",
            backgroundColor: "#ffffff",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "4px",
            padding: "6px 4px",
          }}
        >
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "3px" }}>
            <div style={{ height: "2px", backgroundColor: "#565959", borderRadius: "1px" }} />
            <div style={{ height: "2px", backgroundColor: "#565959", borderRadius: "1px" }} />
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "3px" }}>
            <div style={{ height: "2px", backgroundColor: "#565959", borderRadius: "1px" }} />
            <div style={{ height: "2px", backgroundColor: "#565959", borderRadius: "1px" }} />
          </div>
        </button>
      </div>
    </div>
  );
}
