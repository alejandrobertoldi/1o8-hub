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
import { APLUS_MODULE_SPECS } from "@/lib/aplus-module-specs";
import { AplusImageSlot } from "../aplus-image-slot";
import { CharCounter } from "../module-card-shared";
import type { AplusModule, AplusModuleImage } from "../module-card-types";
import { EXCEEDED_BORDER } from "../module-card-types";
import { RichTextToolbar } from "../module-card-shared";
import { CreatePanelSlot } from "../module-card-panels";

interface NavCarouselPanel {
  id: string;
  navText: string;
  subheadline: string;
  headline: string;
  body: string;
}

interface NavigationCarouselBodyProps {
  module: AplusModule & { images: AplusModuleImage[] };
  productId: string;
  readOnly: boolean;
  getImage: (slotKey: string) => AplusModuleImage | undefined;
}

export function NavigationCarouselBody({
  module,
  productId,
  readOnly,
  getImage,
}: NavigationCarouselBodyProps) {
  const queryClient = useQueryClient();
  const spec = APLUS_MODULE_SPECS["navigation_carousel"];
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
    const data: Record<number, Omit<NavCarouselPanel, "id">> = {};
    for (let i = 0; i < panelCount; i++) {
      const img = panelImages[i];
      const pd = (img?.panelData ?? {}) as Record<string, string>;
      data[i] = {
        navText: pd.tab_title ?? "",
        subheadline: pd.subheadline ?? "",
        headline: pd.caption ?? "",
        body: pd.body ?? "",
      };
    }
    return data;
  }, [panelImages, panelCount]);

  const [panelData, setPanelData] = useState<Record<number, Omit<NavCarouselPanel, "id">>>(getInitialPanelData);
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

  const updatePanelField = (idx: number, field: keyof Omit<NavCarouselPanel, "id">, value: string) => {
    setPanelData(prev => {
      const cur = prev[idx] ?? { navText: "", subheadline: "", headline: "", body: "" };
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
            tab_title: data.navText,
            subheadline: data.subheadline,
            caption: data.headline,
            body: data.body,
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

  const active = panelData[activeIdx] ?? { navText: "", subheadline: "", headline: "", body: "" };
  const fields = rg.fields;
  const navField = fields.find(f => f.key === "tab_title")!;
  const subField = fields.find(f => f.key === "subheadline")!;
  const headField = fields.find(f => f.key === "caption")!;
  const bodyField = fields.find(f => f.key === "body")!;

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
    <div style={{ display: "flex", minHeight: "500px" }}>
      {/* Left sidebar: panel thumbnails */}
      <div style={{ width: "200px", flexShrink: 0, padding: "16px", borderRight: "1px solid #e7e7e7" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: "#0F1111" }}>
            Panels ({panelCount} / {rg.maxItems})
          </div>
          {!readOnly && (
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <button type="button" onClick={() => removePanelMutation.mutate()} disabled={!canRemovePanel || removePanelMutation.isPending}
                style={{ width: "22px", height: "22px", borderRadius: "3px", border: "1px solid #d5d9d9", backgroundColor: canRemovePanel ? "#ffffff" : "#f7f8f8", display: "flex", alignItems: "center", justifyContent: "center", cursor: canRemovePanel ? "pointer" : "default", opacity: canRemovePanel ? 1 : 0.4 }}
                title={`Remove panel (min ${rg.minItems})`}>
                <Minus style={{ width: "12px", height: "12px", color: "#0F1111" }} />
              </button>
              <button type="button" onClick={() => addPanelMutation.mutate()} disabled={!canAddPanel || addPanelMutation.isPending}
                style={{ width: "22px", height: "22px", borderRadius: "3px", border: "1px solid #d5d9d9", backgroundColor: canAddPanel ? "#ffffff" : "#f7f8f8", display: "flex", alignItems: "center", justifyContent: "center", cursor: canAddPanel ? "pointer" : "default", opacity: canAddPanel ? 1 : 0.4 }}
                title={`Add panel (max ${rg.maxItems})`}>
                <Plus style={{ width: "12px", height: "12px", color: "#0F1111" }} />
              </button>
            </div>
          )}
        </div>
        {panels.map((p, i) => {
          const img = panelImages[i];
          const pd = panelData[i];
          const tabLabel = pd?.navText || `Panel ${i + 1}`;
          return (
            <div key={p.id} style={{ marginBottom: "12px" }}>
              <div style={{ fontSize: "12px", fontWeight: 700, color: "#0F1111", marginBottom: "4px" }}>
                PANEL ({i + 1} / {panelCount})
              </div>
              <button
                type="button"
                onClick={() => setActiveIdx(i)}
                style={{
                  width: "100%",
                  height: "80px",
                  backgroundColor: activeIdx === i ? "#eef6f8" : "#f7f8fa",
                  border: `2px ${img?.driveFileId ? "solid" : "dashed"} ${activeIdx === i ? "#008296" : "#7f9ba6"}`,
                  borderRadius: "2px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  overflow: "hidden",
                  position: "relative",
                }}
              >
                {img?.driveFileId ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={`/api/drive/file/${img.driveFileId}`} alt={tabLabel} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span style={{ fontSize: "28px", color: activeIdx === i ? "#565959" : "#6b8f9e", fontWeight: 300 }}>+</span>
                )}
              </button>
              <div style={{ fontSize: "11px", color: "#565959", marginTop: "2px", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {tabLabel}
              </div>
            </div>
          );
        })}
      </div>

      {/* Right: active panel editor */}
      <div style={{ flex: 1, padding: "16px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{ fontSize: "14px", fontWeight: 700, color: "#0F1111" }}>
            PANEL ({activeIdx + 1} / {panelCount})
          </div>
          {saveState === "saving" && <span style={{ fontSize: 11, color: "#888c8c" }}>Saving…</span>}
          {saveState === "saved" && <span style={{ fontSize: 11, color: "#067D62" }}>Saved</span>}
          {saveState === "error" && <span style={{ fontSize: 11, color: "#d13212" }}>Error</span>}
        </div>

        {/* Navigation Text */}
        <div>
          <label style={{ fontSize: "14px", fontWeight: 700, color: "#0F1111", display: "block", marginBottom: "6px" }}>
            <span style={{ color: "#d13212", marginRight: "2px" }}>*</span>
            Navigation Text
          </label>
          <input
            value={active.navText}
            onChange={(e) => updatePanelField(activeIdx, "navText", e.target.value)}
            onBlur={() => savePanelText(activeIdx)}
            placeholder="Enter navigation text"
            disabled={readOnly}
            style={fieldBorder(active.navText.length, navField.maxLength ?? 25)}
          />
          <CharCounter length={active.navText.length} max={navField.maxLength ?? 25} />
        </div>

        {/* Subheadline */}
        <div>
          <label style={{ fontSize: "14px", fontWeight: 700, color: "#0F1111", display: "block", marginBottom: "6px" }}>
            Subheadline
          </label>
          <input
            value={active.subheadline}
            onChange={(e) => updatePanelField(activeIdx, "subheadline", e.target.value)}
            onBlur={() => savePanelText(activeIdx)}
            placeholder="Enter subheadline text"
            disabled={readOnly}
            style={fieldBorder(active.subheadline.length, subField.maxLength ?? 25)}
          />
          <CharCounter length={active.subheadline.length} max={subField.maxLength ?? 25} />
        </div>

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

        {/* Body text with rich text toolbar */}
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
            style={{ ...fieldBorder(active.body.length, bodyField.maxLength ?? 100), resize: "vertical" as const }}
          />
          <CharCounter length={active.body.length} max={bodyField.maxLength ?? 100} />
        </div>

        {/* Image upload */}
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
      </div>
    </div>
  );
}
