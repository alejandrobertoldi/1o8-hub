/* eslint-disable react-doctor/rerender-functional-setstate */
/* eslint-disable react-doctor/no-derived-state-effect */
/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable jsx-a11y/label-has-associated-control */
/* eslint-disable react-doctor/no-tiny-text */
/* eslint-disable react-doctor/no-inline-exhaustive-style */
"use client";

import { useState, useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { toast } from "sonner";
import { APLUS_MODULE_SPECS, type TextFieldSpec } from "@/lib/aplus-module-specs";
import { ImagePlaceholder, ModuleTextField, CharCounter, RichTextToolbar } from "../module-card-shared";
import type { AplusModule, AplusModuleImage } from "../module-card-types";
import { EXCEEDED_BORDER } from "../module-card-types";

interface ComparisonTable2BodyProps {
  module: AplusModule & { images: AplusModuleImage[] };
  productId: string;
  readOnly: boolean;
  getFieldValue: (key: TextFieldSpec["key"]) => string;
  onSaveField: (key: string, value: string) => Promise<void>;
  getImage: (slotKey: string) => AplusModuleImage | undefined;
}

interface CT2Feature {
  id: string;
  headlines: [string, string, string];
  bodies: [string, string, string];
}

/** Extract panelData from image row for a given product slot */
function ct2GetPanelData(module: AplusModule & { images: AplusModuleImage[] }, slotKey: string, slotIdx: number): Record<string, string> {
  const img = module.images.find(
    (im) => im.customLabel === slotKey || im.imageSlot === slotIdx + 1
  );
  return (img?.panelData ?? {}) as Record<string, string>;
}

/** Build initial features array from panelData across all 3 product slots */
function ct2LoadFeatures(module: AplusModule & { images: AplusModuleImage[] }, slotKeys: string[]): CT2Feature[] {
  const pd0 = ct2GetPanelData(module, slotKeys[0], 0);
  let featureCount = 2;
  for (let f = 0; f < 5; f++) {
    if (pd0[`feature_${f}_headline`] !== undefined || pd0[`feature_${f}_body`] !== undefined) {
      featureCount = Math.max(featureCount, f + 1);
    }
  }
  const features: CT2Feature[] = [];
  for (let f = 0; f < featureCount; f++) {
    const headlines: [string, string, string] = ["", "", ""];
    const bodies: [string, string, string] = ["", "", ""];
    for (let col = 0; col < 3; col++) {
      const pd = ct2GetPanelData(module, slotKeys[col], col);
      headlines[col] = pd[`feature_${f}_headline`] ?? "";
      bodies[col] = pd[`feature_${f}_body`] ?? "";
    }
    features.push({ id: `f${f}`, headlines, bodies });
  }
  return features.length >= 2 ? features : [
    { id: "f0", headlines: ["", "", ""], bodies: ["", "", ""] },
    { id: "f1", headlines: ["", "", ""], bodies: ["", "", ""] },
  ];
}

export function ComparisonTable2Body({
  module,
  productId,
  readOnly,
  getFieldValue,
  onSaveField,
  getImage,
}: ComparisonTable2BodyProps) {
  const spec = APLUS_MODULE_SPECS["comparison_table_2"];
  const productSlots = spec.imageSlots; // 3 products
  const slotKeys = productSlots.map((s) => s.key);
  const queryClient = useQueryClient();

  // Load per-product fields from panelData
  const getInitialProductFields = useCallback(() => {
    return slotKeys.map((key, i) => {
      const pd = ct2GetPanelData(module, key, i);
      return { imageHeadline: pd.imageHeadline ?? "", asin: pd.asin ?? "" };
    }) as [{ imageHeadline: string; asin: string }, { imageHeadline: string; asin: string }, { imageHeadline: string; asin: string }];
  }, [module, slotKeys]);

  const [productFields, setProductFields] = useState(getInitialProductFields);
  const [features, setFeatures] = useState<CT2Feature[]>(() => ct2LoadFeatures(module, slotKeys));
  const [saveStates, setSaveStates] = useState<("idle" | "saving" | "saved" | "error")[]>(["idle", "idle", "idle"]);

  // Re-sync when images change (e.g. after upload)
  useEffect(() => {
    setProductFields(getInitialProductFields());
    setFeatures(ct2LoadFeatures(module, slotKeys));
  }, [getInitialProductFields, module, slotKeys]);

  /** Save all data for a single product column */
  const saveProductColumn = useCallback(async (colIdx: number) => {
    const slot = productSlots[colIdx];
    const pf = productFields[colIdx];
    const panelData: Record<string, string> = {
      imageHeadline: pf.imageHeadline,
      asin: pf.asin,
    };
    features.forEach((f, fIdx) => {
      panelData[`feature_${fIdx}_headline`] = f.headlines[colIdx];
      panelData[`feature_${fIdx}_body`] = f.bodies[colIdx];
    });

    setSaveStates((prev) => { const n = [...prev]; n[colIdx] = "saving"; return n; });
    try {
      await fetch(`/api/aplus/${productId}/modules/${module.id}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageSlot: colIdx + 1,
          customLabel: slot.key,
          panelData,
        }),
      });
      setSaveStates((prev) => { const n = [...prev]; n[colIdx] = "saved"; return n; });
      queryClient.invalidateQueries({ queryKey: ["aplus-modules"] });
      setTimeout(() => {
        setSaveStates((prev) => { const n = [...prev]; n[colIdx] = "idle"; return n; });
      }, 2000);
    } catch {
      setSaveStates((prev) => { const n = [...prev]; n[colIdx] = "error"; return n; });
      toast.error(`Failed to save ${slot.label} data`);
    }
  }, [productFields, features, productSlots, productId, module.id, queryClient]);

  /** Save all 3 columns (used when adding/removing features) */
  const saveAllColumns = useCallback(async () => {
    await Promise.all([0, 1, 2].map((i) => saveProductColumn(i)));
  }, [saveProductColumn]);

  const addFeature = () => {
    if (features.length >= 5) return;
    setFeatures([...features, {
      id: `f${Date.now()}`,
      headlines: ["", "", ""] as [string, string, string],
      bodies: ["", "", ""] as [string, string, string],
    }]);
  };

  const removeFeature = (idx: number) => {
    if (features.length <= 2) return;
    const next = features.filter((_, i) => i !== idx);
    setFeatures(next);
    // Save all columns since feature indices shifted
    setTimeout(() => saveAllColumns(), 0);
  };

  const updateFeatureHeadline = (fIdx: number, col: number, value: string) => {
    const arr = [...features];
    arr[fIdx] = { ...arr[fIdx], headlines: [...arr[fIdx].headlines] as [string, string, string] };
    arr[fIdx].headlines[col] = value;
    setFeatures(arr);
  };

  const updateFeatureBody = (fIdx: number, col: number, value: string) => {
    const arr = [...features];
    arr[fIdx] = { ...arr[fIdx], bodies: [...arr[fIdx].bodies] as [string, string, string] };
    arr[fIdx].bodies[col] = value;
    setFeatures(arr);
  };

  const inputStyle: React.CSSProperties = {
    backgroundColor: "#ffffff",
    color: "#0F1111",
    border: "1px solid #888c8c",
    borderRadius: "4px",
    fontSize: "13px",
    padding: "5px 8px",
    width: "100%",
    outline: "none",
  };

  const iconBtnSmall: React.CSSProperties = {
    width: "24px",
    height: "24px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid #d5d9d9",
    borderRadius: "4px",
    backgroundColor: "#ffffff",
    color: "#565959",
    cursor: "pointer",
    flexShrink: 0,
    padding: 0,
  };

  const fieldBorder = (len: number, max: number): React.CSSProperties => ({
    ...inputStyle,
    border: `1px solid ${len > max ? EXCEEDED_BORDER : "#888c8c"}`,
  });

  const saveIndicator = (idx: number) => {
    const s = saveStates[idx];
    if (s === "saving") return <span style={{ fontSize: 11, color: "#888c8c", marginLeft: 6 }}>Saving…</span>;
    if (s === "saved") return <span style={{ fontSize: 11, color: "#067D62", marginLeft: 6 }}>Saved</span>;
    if (s === "error") return <span style={{ fontSize: 11, color: "#d13212", marginLeft: 6 }}>Error</span>;
    return null;
  };

  return (
    <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Headline */}
      <ModuleTextField
        spec={spec.textFields[0]}
        value={getFieldValue("headlineText")}
        readOnly={readOnly}
        onSave={onSaveField}
      />

      {/* 3 product columns: Image + Image Headline + ASIN */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" }}>
        {productSlots.map((slot, i) => (
          <div key={slot.key}>
            {/* Image */}
            <div style={{ marginBottom: "12px" }}>
              <label style={{ fontSize: "12px", fontWeight: 700, color: "#0F1111", display: "block", marginBottom: "4px" }}>
                <span style={{ color: "#d13212", marginRight: "2px" }}>*</span>Image
              </label>
              <ImagePlaceholder
                slotSpec={slot}
                image={getImage(slot.key)}
                productId={productId}
                moduleId={module.id}
                readOnly={readOnly}
              />
            </div>

            {/* Image Headline */}
            <div style={{ marginBottom: "8px" }}>
              <label style={{ fontSize: "12px", fontWeight: 700, color: "#0F1111", display: "block", marginBottom: "4px" }}>
                <span style={{ color: "#d13212", marginRight: "2px" }}>*</span>Image Headline
                {saveIndicator(i)}
              </label>
              <input
                value={productFields[i].imageHeadline}
                onChange={(e) => {
                  const next = [...productFields] as typeof productFields;
                  next[i] = { ...next[i], imageHeadline: e.target.value };
                  setProductFields(next);
                }}
                onBlur={() => saveProductColumn(i)}
                placeholder="Enter image headline text"
                disabled={readOnly}
                style={fieldBorder(productFields[i].imageHeadline.length, 30)}
              />
              <CharCounter length={productFields[i].imageHeadline.length} max={30} />
            </div>

            {/* ASIN */}
            <div>
              <label style={{ fontSize: "12px", fontWeight: 700, color: "#0F1111", display: "block", marginBottom: "4px" }}>
                <span style={{ color: "#d13212", marginRight: "2px" }}>*</span>ASIN
              </label>
              <input
                value={productFields[i].asin}
                onChange={(e) => {
                  const next = [...productFields] as typeof productFields;
                  next[i] = { ...next[i], asin: e.target.value };
                  setProductFields(next);
                }}
                onBlur={() => saveProductColumn(i)}
                placeholder="Enter ASIN"
                disabled={readOnly}
                style={fieldBorder(productFields[i].asin.length, 10)}
              />
              <CharCounter length={productFields[i].asin.length} max={10} />
            </div>
          </div>
        ))}
      </div>

      {/* Feature comparison section */}
      <div style={{ borderTop: "1px solid #e7e7e7", paddingTop: "16px" }}>
        <div style={{ fontSize: "14px", fontWeight: 700, color: "#0F1111", marginBottom: "16px" }}>
          Feature comparison ({spec.repeatableGroup!.maxItems} max / <span style={{ color: "#d13212" }}>{spec.repeatableGroup!.minItems} min</span>)
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {features.map((f, fIdx) => (
            <div key={f.id}>
              {/* Delete button */}
              <div style={{ marginBottom: "8px" }}>
                <button
                  type="button"
                  style={{ ...iconBtnSmall, color: features.length <= 2 ? "#d5d9d9" : "#565959" }}
                  onClick={() => removeFeature(fIdx)}
                  disabled={features.length <= 2 || readOnly}
                >
                  <X style={{ width: "12px", height: "12px" }} />
                </button>
              </div>

              {/* 3-column grid: Headline + Body per product */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" }}>
                {[0, 1, 2].map((col) => (
                  <div key={col}>
                    {/* Headline */}
                    <div style={{ marginBottom: "8px" }}>
                      <label style={{ fontSize: "12px", fontWeight: 700, color: "#0F1111", display: "block", marginBottom: "4px" }}>
                        <span style={{ color: "#d13212", marginRight: "2px" }}>*</span>Headline
                      </label>
                      <input
                        value={f.headlines[col]}
                        onChange={(e) => updateFeatureHeadline(fIdx, col, e.target.value)}
                        onBlur={() => saveProductColumn(col)}
                        placeholder="Enter headline text"
                        disabled={readOnly}
                        style={fieldBorder(f.headlines[col].length, 30)}
                      />
                      <CharCounter length={f.headlines[col].length} max={30} />
                    </div>

                    {/* Body text with rich text toolbar */}
                    <div>
                      <label style={{ fontSize: "12px", fontWeight: 700, color: "#0F1111", display: "block", marginBottom: "4px" }}>
                        <span style={{ color: "#d13212", marginRight: "2px" }}>*</span>Body text
                      </label>
                      <RichTextToolbar />
                      <textarea
                        value={f.bodies[col]}
                        onChange={(e) => updateFeatureBody(fIdx, col, e.target.value)}
                        onBlur={() => saveProductColumn(col)}
                        placeholder="Enter body text"
                        disabled={readOnly}
                        rows={2}
                        style={{ ...fieldBorder(f.bodies[col].length, 80), resize: "vertical" as const }}
                      />
                      <CharCounter length={f.bodies[col].length} max={80} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* + Add comparison */}
        <button
          type="button"
          onClick={addFeature}
          disabled={features.length >= 5 || readOnly}
          style={{
            marginTop: "16px",
            padding: "4px 14px",
            fontSize: "13px",
            fontWeight: 500,
            color: features.length >= 5 ? "#888c8c" : "#008296",
            backgroundColor: "#ffffff",
            border: `1px solid ${features.length >= 5 ? "#d5d9d9" : "#008296"}`,
            borderRadius: "4px",
            cursor: features.length >= 5 ? "default" : "pointer",
          }}
        >
          + Add comparison
        </button>
      </div>
    </div>
  );
}
