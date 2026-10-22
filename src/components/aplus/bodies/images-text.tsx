/* eslint-disable react-doctor/no-derived-state-effect */
/* eslint-disable jsx-a11y/label-has-associated-control */
/* eslint-disable react-doctor/no-tiny-text */
"use client";

import { useState, useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  APLUS_MODULE_SPECS,
  type TextFieldSpec,
} from "@/lib/aplus-module-specs";
import { CharCounter, ModuleTextField, ImagePlaceholder, RichTextToolbar } from "../module-card-shared";
import type { AplusModule, AplusModuleImage } from "../module-card-types";
import { EXCEEDED_BORDER } from "../module-card-types";

interface ImagesTextBodyProps {
  module: AplusModule & { images: AplusModuleImage[] };
  productId: string;
  readOnly: boolean;
  getFieldValue: (key: TextFieldSpec["key"]) => string;
  onSaveField: (key: string, value: string) => Promise<void>;
  getImage: (slotKey: string) => AplusModuleImage | undefined;
}

export function ImagesTextBody({
  module,
  productId,
  readOnly,
  getFieldValue,
  onSaveField,
  getImage,
}: ImagesTextBodyProps) {
  const moduleType = module.moduleType as "dual_images_text" | "four_images_text";
  const spec = APLUS_MODULE_SPECS[moduleType];
  const columns = spec.imageSlots.length; // 2 or 4
  const rg = spec.repeatableGroup!;
  const queryClient = useQueryClient();

  const headlineMax = rg.fields.find(f => f.key === "caption")?.maxLength ?? 50;
  const bodyMax = rg.fields.find(f => f.key === "body")?.maxLength ?? 300;

  // Load initial values from image panelData
  const getInitialValues = useCallback(() => {
    return spec.imageSlots.map((slot, i) => {
      const img = module.images.find(
        (im) => im.customLabel === slot.key || im.imageSlot === i + 1
      );
      const pd = (img?.panelData ?? {}) as Record<string, string>;
      return { caption: pd.caption ?? "", body: pd.body ?? "" };
    });
  }, [module.images, spec.imageSlots]);

  const [fields, setFields] = useState(getInitialValues);
  const [saveStates, setSaveStates] = useState<("idle" | "saving" | "saved" | "error")[]>(
    () => Array(columns).fill("idle")
  );

  // Re-sync when images change (e.g. after upload)
  useEffect(() => {
    setFields(getInitialValues());
  }, [getInitialValues]);

  const updateField = (idx: number, key: "caption" | "body", val: string) => {
    setFields(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [key]: val };
      return next;
    });
  };

  const savePanelData = useCallback(async (idx: number) => {
    const slot = spec.imageSlots[idx];
    const data = fields[idx];
    setSaveStates(prev => { const n = [...prev]; n[idx] = "saving"; return n; });
    try {
      await fetch(`/api/aplus/${productId}/modules/${module.id}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageSlot: idx + 1,
          customLabel: slot.key,
          panelData: { caption: data.caption, body: data.body },
        }),
      });
      setSaveStates(prev => { const n = [...prev]; n[idx] = "saved"; return n; });
      queryClient.invalidateQueries({ queryKey: ["aplus-modules"] });
      setTimeout(() => {
        setSaveStates(prev => { const n = [...prev]; n[idx] = "idle"; return n; });
      }, 2000);
    } catch {
      setSaveStates(prev => { const n = [...prev]; n[idx] = "error"; return n; });
      toast.error(`Failed to save caption for ${slot.label}`);
    }
  }, [fields, spec.imageSlots, productId, module.id, queryClient]);

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

  // Required images: first 3 for four_images_text (4th optional), all for dual
  const isRequired = (idx: number) => moduleType === "four_images_text" ? idx < 3 : true;

  const saveIndicator = (idx: number) => {
    const s = saveStates[idx];
    if (s === "saving") return <span style={{ fontSize: 11, color: "#888c8c", marginLeft: 6 }}>Saving…</span>;
    if (s === "saved") return <span style={{ fontSize: 11, color: "#067D62", marginLeft: 6 }}>Saved</span>;
    if (s === "error") return <span style={{ fontSize: 11, color: "#d13212", marginLeft: 6 }}>Error</span>;
    return null;
  };

  return (
    <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Module headline (full width) */}
      <ModuleTextField
        spec={spec.textFields[0]}
        value={getFieldValue("headlineText")}
        readOnly={readOnly}
        onSave={onSaveField}
      />

      {/* Per-image columns: image + headline + body */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: "16px" }}>
        {spec.imageSlots.map((slot, i) => (
          <div key={slot.key} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {/* Image upload */}
            <div>
              <label style={{ fontSize: "14px", fontWeight: 700, color: "#0F1111", display: "block", marginBottom: "6px" }}>
                {isRequired(i) && <span style={{ color: "#d13212", marginRight: "2px" }}>*</span>}
                {slot.label}
              </label>
              <ImagePlaceholder
                slotSpec={slot}
                image={getImage(slot.key)}
                productId={productId}
                moduleId={module.id}
                readOnly={readOnly}
              />
            </div>

            {/* Headline */}
            <div>
              <label style={{ fontSize: "14px", fontWeight: 700, color: "#0F1111", display: "flex", alignItems: "center", marginBottom: "6px" }}>
                Image Headline {saveIndicator(i)}
              </label>
              <input
                value={fields[i]?.caption ?? ""}
                onChange={(e) => updateField(i, "caption", e.target.value)}
                onBlur={() => savePanelData(i)}
                placeholder="Enter headline text"
                disabled={readOnly}
                style={fieldBorder((fields[i]?.caption ?? "").length, headlineMax)}
              />
              <CharCounter length={(fields[i]?.caption ?? "").length} max={headlineMax} />
            </div>

            {/* Body text */}
            <div>
              <label style={{ fontSize: "14px", fontWeight: 700, color: "#0F1111", display: "block", marginBottom: "6px" }}>
                Body Text
              </label>
              <RichTextToolbar />
              <textarea
                value={fields[i]?.body ?? ""}
                onChange={(e) => updateField(i, "body", e.target.value)}
                onBlur={() => savePanelData(i)}
                placeholder="Enter body text"
                disabled={readOnly}
                rows={3}
                style={{ ...fieldBorder((fields[i]?.body ?? "").length, bodyMax), resize: "vertical" as const }}
              />
              <CharCounter length={(fields[i]?.body ?? "").length} max={bodyMax} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
