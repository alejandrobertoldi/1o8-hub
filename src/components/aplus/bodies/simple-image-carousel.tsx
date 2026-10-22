/* eslint-disable react-doctor/no-derived-state-effect */
/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable jsx-a11y/label-has-associated-control */
/* eslint-disable react-doctor/no-tiny-text */
/* eslint-disable react-doctor/no-inline-exhaustive-style */
"use client";
/* eslint-disable react-doctor/nextjs-no-img-element */

import { useState, useCallback, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Minus } from "lucide-react";
import { toast } from "sonner";
import { APLUS_MODULE_SPECS, type TextFieldSpec } from "@/lib/aplus-module-specs";
import { AplusImageSlot } from "../aplus-image-slot";
import { ModuleTextField, CharCounter } from "../module-card-shared";
import type { AplusModule, AplusModuleImage } from "../module-card-types";
import { EXCEEDED_BORDER } from "../module-card-types";
import { RichTextToolbar } from "../module-card-shared";
import { CreatePanelSlot } from "../module-card-panels";

interface SimpleCarouselPanel {
  id: string;
  headline: string;
  body: string;
  ctaText: string;
  asin: string;
}

interface SimpleImageCarouselBodyProps {
  module: AplusModule & { images: AplusModuleImage[] };
  productId: string;
  readOnly: boolean;
  getFieldValue: (key: TextFieldSpec["key"]) => string;
  onSaveField: (key: string, value: string) => Promise<void>;
  getImage: (slotKey: string) => AplusModuleImage | undefined;
}

export function SimpleImageCarouselBody({
  module,
  productId,
  readOnly,
  getFieldValue,
  onSaveField,
  getImage,
}: SimpleImageCarouselBodyProps) {
  const queryClient = useQueryClient();
  const spec = APLUS_MODULE_SPECS["simple_image_carousel"];
  const rg = spec.repeatableGroup!;
  const imageSpec = rg.image!;

  // Derive panels from DB images
  const panelImages = module.images
    .filter((img) => img.customLabel?.startsWith("panel_"))
    .sort((a, b) => a.imageSlot - b.imageSlot);
  const panelCount = Math.max(panelImages.length, rg.minItems);
  const panels = Array.from({ length: panelCount }, (_, i) => ({
    id: panelImages[i]?.id ?? `empty-${i}`,
  }));

  // Load initial panel text from DB panelData
  const getInitialPanelData = useCallback(() => {
    const data: Record<number, Omit<SimpleCarouselPanel, "id">> = {};
    for (let i = 0; i < panelCount; i++) {
      const img = panelImages[i];
      const pd = (img?.panelData ?? {}) as Record<string, string>;
      data[i] = {
        headline: pd.headline ?? "",
        body: pd.body ?? "",
        ctaText: pd.cta_text ?? "",
        asin: pd.asin ?? "",
      };
    }
    return data;
  }, [panelImages, panelCount]);

  const [panelData, setPanelData] = useState<Record<number, Omit<SimpleCarouselPanel, "id">>>(getInitialPanelData);
  const [activeIdx, setActiveIdx] = useState(0);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // Re-sync when images change
  useEffect(() => {
    setPanelData(getInitialPanelData());
  }, [getInitialPanelData]);

  const canAddPanel = panelCount < rg.maxItems;
  const canRemovePanel = panelCount > rg.minItems;

  const addPanelMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/aplus/${productId}/modules/${module.id}/panels`, { method: "POST" });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Failed to add panel"); }
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["aplus-modules", productId] }); },
    onError: (err: Error) => toast.error(err.message),
  });
  const removePanelMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/aplus/${productId}/modules/${module.id}/panels`, { method: "DELETE" });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Failed to remove panel"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["aplus-modules", productId] });
      setActiveIdx(prev => Math.min(prev, panelCount - 2));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updatePanelField = (idx: number, field: keyof Omit<SimpleCarouselPanel, "id">, value: string) => {
    setPanelData(prev => {
      const cur = prev[idx] ?? { headline: "", body: "", ctaText: "", asin: "" };
      return { ...prev, [idx]: { ...cur, [field]: value } };
    });
  };

  // Save panel text to DB (on blur)
  const savePanelText = useCallback(async (idx: number) => {
    const data = panelData[idx];
    if (!data) return;
    const img = panelImages[idx];
    if (!img) return;
    setSaveState("saving");
    try {
      await fetch(`/api/aplus/${productId}/modules/${module.id}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageSlot: idx + 1,
          customLabel: `panel_${idx + 1}_${imageSpec.key}`,
          panelData: {
            headline: data.headline,
            body: data.body,
            cta_text: data.ctaText,
            asin: data.asin,
          },
        }),
      });
      setSaveState("saved");
      queryClient.invalidateQueries({ queryKey: ["aplus-modules"] });
      setTimeout(() => setSaveState("idle"), 2000);
    } catch {
      setSaveState("error");
      toast.error("Failed to save panel text");
    }
  }, [panelData, panelImages, productId, module.id, imageSpec.key, queryClient]);

  const active = panelData[activeIdx] ?? { headline: "", body: "", ctaText: "", asin: "" };
  const fields = rg.fields;
  const headField = fields.find(f => f.key === "headline")!;
  const bodyField = fields.find(f => f.key === "body")!;
  const ctaField = fields.find(f => f.key === "cta_text")!;
  const asinField = fields.find(f => f.key === "asin")!;

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

  const fieldBorder = (len: number, max: number): React.CSSProperties => ({
    ...inputStyle,
    border: `1px solid ${len > max ? EXCEEDED_BORDER : "#888c8c"}`,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* Module headline (full width) */}
      <div style={{ padding: "20px 20px 0" }}>
        <ModuleTextField
          spec={spec.textFields[0]}
          value={getFieldValue("headlineText")}
          readOnly={readOnly}
          onSave={onSaveField}
        />
      </div>

      {/* Panel thumbnails row */}
      <div style={{ padding: "16px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: "#0F1111" }}>
            Panels ({rg.maxItems} max / {rg.minItems} min)
          </div>
          {!readOnly && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <button type="button" onClick={() => removePanelMutation.mutate()} disabled={!canRemovePanel || removePanelMutation.isPending}
                style={{ width: "24px", height: "24px", borderRadius: "3px", border: "1px solid #d5d9d9", backgroundColor: canRemovePanel ? "#ffffff" : "#f7f8f8", display: "flex", alignItems: "center", justifyContent: "center", cursor: canRemovePanel ? "pointer" : "default", opacity: canRemovePanel ? 1 : 0.4 }}
                title={`Remove panel (min ${rg.minItems})`}>
                <Minus style={{ width: "14px", height: "14px", color: "#0F1111" }} />
              </button>
              <button type="button" onClick={() => addPanelMutation.mutate()} disabled={!canAddPanel || addPanelMutation.isPending}
                style={{ width: "24px", height: "24px", borderRadius: "3px", border: "1px solid #d5d9d9", backgroundColor: canAddPanel ? "#ffffff" : "#f7f8f8", display: "flex", alignItems: "center", justifyContent: "center", cursor: canAddPanel ? "pointer" : "default", opacity: canAddPanel ? 1 : 0.4 }}
                title={`Add panel (max ${rg.maxItems})`}>
                <Plus style={{ width: "14px", height: "14px", color: "#0F1111" }} />
              </button>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: "16px" }}>
          {Array.from({ length: rg.maxItems }, (_, i) => {
            const img = panelImages[i];
            const isCreated = i < panelCount;
            const isActive = i === activeIdx;
            return (
              <div key={img?.id ?? `slot-${i}`} style={{ flex: 1 }}>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "#0F1111", marginBottom: "4px" }}>
                  PANEL ({i + 1} / {rg.maxItems})
                </div>
                <button
                  type="button"
                  onClick={() => { if (isCreated) setActiveIdx(i); }}
                  style={{
                    width: "100%",
                    height: "80px",
                    backgroundColor: isActive ? "#eef6f8" : "#f7f8fa",
                    border: isActive
                      ? "2px solid #008296"
                      : isCreated ? "2px solid #d5d9d9" : "2px dashed #c6c6c6",
                    borderRadius: "2px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: isCreated ? "pointer" : "default",
                    overflow: "hidden",
                    padding: 0,
                    opacity: isCreated ? 1 : 0.5,
                  }}
                >
                  {img?.driveFileId ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={`/api/drive/file/${img.driveFileId}`}
                      alt={`Panel ${i + 1}`}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <span style={{ fontSize: "28px", color: isActive ? "#565959" : "#6b8f9e", fontWeight: 300 }}>+</span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ borderTop: "1px solid #e7e7e7" }} />

      {/* Active panel editor: 2-column — Image (left) | Fields (right) */}
      <div style={{ padding: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
          <div style={{ fontSize: "14px", fontWeight: 700, color: "#0F1111" }}>
            PANEL ({activeIdx + 1} / {rg.maxItems})
          </div>
          {saveState === "saving" && <span style={{ fontSize: 11, color: "#888c8c" }}>Saving…</span>}
          {saveState === "saved" && <span style={{ fontSize: 11, color: "#067D62" }}>Saved</span>}
          {saveState === "error" && <span style={{ fontSize: 11, color: "#d13212" }}>Error</span>}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: "24px", alignItems: "start" }}>
          {/* Left: Image */}
          <div>
            <label style={{ fontSize: "14px", fontWeight: 700, color: "#0F1111", display: "block", marginBottom: "6px" }}>
              <span style={{ color: "#d13212", marginRight: "2px" }}>*</span>
              Image
            </label>
            {(() => {
              const panelImage = module.images.find(
                (img) => img.customLabel === `panel_${activeIdx + 1}_${imageSpec.key}`
              );
              if (panelImage) {
                return (
                  <AplusImageSlot
                    image={panelImage}
                    productId={productId}
                    moduleId={module.id}
                    readOnly={readOnly}
                    slotSpec={{
                      key: imageSpec.key,
                      label: imageSpec.label,
                      desktopSize: imageSpec.desktopSize,
                      mobileSize: imageSpec.mobileSize,
                    }}
                    panelNumber={activeIdx + 1}
                  />
                );
              }
              return (
                <CreatePanelSlot
                  productId={productId}
                  moduleId={module.id}
                  imageSpec={imageSpec}
                />
              );
            })()}
          </div>

          {/* Right: Headline, Body text, Button Text, ASIN */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Headline */}
            <div>
              <label style={{ fontSize: "14px", fontWeight: 700, color: "#0F1111", display: "block", marginBottom: "6px" }}>
                Headline
              </label>
              <input
                value={active.headline}
                onChange={(e) => updatePanelField(activeIdx, "headline", e.target.value)}
                onBlur={() => savePanelText(activeIdx)}
                placeholder="Enter headline text"
                disabled={readOnly}
                style={fieldBorder(active.headline.length, headField.maxLength ?? 50)}
              />
              <CharCounter length={active.headline.length} max={headField.maxLength ?? 50} />
            </div>

            {/* Body text (rich text) */}
            <div>
              <label style={{ fontSize: "14px", fontWeight: 700, color: "#0F1111", display: "block", marginBottom: "6px" }}>
                Body text
              </label>
              <RichTextToolbar />
              <textarea
                value={active.body}
                onChange={(e) => updatePanelField(activeIdx, "body", e.target.value)}
                onBlur={() => savePanelText(activeIdx)}
                placeholder="Enter body text"
                disabled={readOnly}
                rows={3}
                style={{ ...fieldBorder(active.body.length, bodyField.maxLength ?? 200), resize: "vertical" as const }}
              />
              <CharCounter length={active.body.length} max={bodyField.maxLength ?? 200} />
            </div>

            {/* Button Text */}
            <div>
              <label style={{ fontSize: "14px", fontWeight: 700, color: "#0F1111", display: "block", marginBottom: "6px" }}>
                Button Text
              </label>
              <input
                value={active.ctaText}
                onChange={(e) => updatePanelField(activeIdx, "ctaText", e.target.value)}
                onBlur={() => savePanelText(activeIdx)}
                placeholder="Enter button text"
                disabled={readOnly}
                style={fieldBorder(active.ctaText.length, ctaField.maxLength ?? 12)}
              />
              <CharCounter length={active.ctaText.length} max={ctaField.maxLength ?? 12} />
            </div>

            {/* ASIN */}
            <div>
              <label style={{ fontSize: "14px", fontWeight: 700, color: "#0F1111", display: "block", marginBottom: "6px" }}>
                ASIN
              </label>
              <input
                value={active.asin}
                onChange={(e) => updatePanelField(activeIdx, "asin", e.target.value)}
                onBlur={() => savePanelText(activeIdx)}
                placeholder="Enter ASIN"
                disabled={readOnly}
                style={fieldBorder(active.asin.length, asinField.maxLength ?? 10)}
              />
              <CharCounter length={active.asin.length} max={asinField.maxLength ?? 10} />
            </div>
          </div>
        </div>
      </div>

      {/* Module-level Body text (full width, below panels) */}
      <div style={{ padding: "0 20px 20px" }}>
        <ModuleTextField
          spec={spec.textFields[1]}
          value={getFieldValue("bodyText")}
          readOnly={readOnly}
          onSave={onSaveField}
        />
      </div>

    </div>
  );
}
