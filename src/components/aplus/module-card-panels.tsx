/* eslint-disable react-doctor/design-no-em-dash-in-jsx-text */
/* eslint-disable react-doctor/no-tiny-text */
/* eslint-disable react-doctor/no-inline-exhaustive-style */
"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Check, X, Plus, Minus } from "lucide-react";
import { toast } from "sonner";
import { AplusImageSlot } from "./aplus-image-slot";
import {
  APLUS_MODULE_SPECS,
  type ImageSlotSpec,
} from "@/lib/aplus-module-specs";
import type { AplusModule, AplusModuleImage } from "./module-card-types";

// ─── Per-panel text fields editor ─────────────────────────────────

export function PanelFieldsEditor({
  image,
  productId,
  moduleId,
  fields,
  readOnly,
}: {
  image: AplusModuleImage;
  productId: string;
  moduleId: string;
  fields: { key: string; label: string; multiline?: boolean; rows?: number; maxLength?: number; hint?: string }[];
  readOnly: boolean;
}) {
  const queryClient = useQueryClient();
  const panelData = (image as Record<string, unknown>).panelData as Record<string, string> | null | undefined;

  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of fields) {
      init[f.key] = panelData?.[f.key] ?? "";
    }
    return init;
  });

  const [saveStates, setSaveStates] = useState<Record<string, "idle" | "saving" | "saved" | "error">>(() => {
    const init: Record<string, "idle" | "saving" | "saved" | "error"> = {};
    for (const f of fields) init[f.key] = "idle";
    return init;
  });

  async function handleBlur(fieldKey: string) {
    const trimmed = values[fieldKey]?.trim() ?? "";
    const saved = panelData?.[fieldKey]?.trim() ?? "";
    if (trimmed === saved) return;

    setSaveStates((s) => ({ ...s, [fieldKey]: "saving" }));
    try {
      const newPanelData = { ...(panelData ?? {}), [fieldKey]: trimmed };
      const res = await fetch(
        `/api/aplus/${productId}/modules/${moduleId}/images/${image.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ panelData: newPanelData }),
        }
      );
      if (!res.ok) throw new Error("Failed to save");
      setSaveStates((s) => ({ ...s, [fieldKey]: "saved" }));
      queryClient.invalidateQueries({ queryKey: ["aplus-modules", productId] });
      setTimeout(() => setSaveStates((s) => ({ ...s, [fieldKey]: "idle" })), 1500);
    } catch {
      setSaveStates((s) => ({ ...s, [fieldKey]: "error" }));
      toast.error("Failed to save field");
    }
  }

  const inputStyle: React.CSSProperties = {
    backgroundColor: "#ffffff",
    color: "#0F1111",
    border: "1px solid #888c8c",
    borderRadius: "4px",
    fontSize: "13px",
    padding: "6px 10px",
    width: "100%",
    outline: "none",
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: fields.length <= 2 ? "1fr" : "1fr 1fr", gap: "10px", marginTop: "10px" }}>
      {fields.map((field) => (
        <div key={field.key}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
            <label style={{ fontSize: "13px", fontWeight: 600, color: "#0F1111" }}>{field.label}</label>
            {saveStates[field.key] === "saving" && (
              <Loader2 style={{ width: "11px", height: "11px", color: "#888c8c", animation: "spin 1s linear infinite" }} />
            )}
            {saveStates[field.key] === "saved" && (
              <Check style={{ width: "11px", height: "11px", color: "#047857" }} />
            )}
            {saveStates[field.key] === "error" && (
              <X style={{ width: "11px", height: "11px", color: "#d13212" }} />
            )}
          </div>
          {field.multiline ? (
            <textarea
              value={values[field.key] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
              onBlur={() => handleBlur(field.key)}
              disabled={readOnly}
              rows={field.rows ?? 2}
              maxLength={field.maxLength}
              placeholder={`Enter ${field.label.toLowerCase()}`}
              style={{ ...inputStyle, resize: "none" }}
            />
          ) : (
            <input
              value={values[field.key] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
              onBlur={() => handleBlur(field.key)}
              disabled={readOnly}
              maxLength={field.maxLength}
              placeholder={`Enter ${field.label.toLowerCase()}`}
              style={inputStyle}
            />
          )}
          {field.maxLength && (
            <div style={{ textAlign: "right", fontSize: "11px", color: (values[field.key]?.length ?? 0) > field.maxLength ? "#d13212" : "#0F1111", marginTop: "2px" }}>
              {values[field.key]?.length ?? 0} / {field.maxLength}
            </div>
          )}
          {field.hint && (
            <div style={{ fontSize: "11px", color: "#888c8c", marginTop: "2px" }}>{field.hint}</div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Repeatable group with panel image upload ─────────────────────

export function RepeatableGroupSection({
  spec,
  module,
  productId,
  readOnly,
}: {
  spec: NonNullable<(typeof APLUS_MODULE_SPECS)["qa"]["repeatableGroup"]>;
  module: AplusModule & { images: AplusModuleImage[] };
  productId: string;
  readOnly: boolean;
}) {
  const queryClient = useQueryClient();

  // Panel images are those with customLabel starting with "panel_"
  const panelImages = module.images
    .filter((img) => img.customLabel?.startsWith("panel_"))
    .sort((a, b) => a.imageSlot - b.imageSlot);

  const panelCount = panelImages.length;
  const canAdd = panelCount < spec.maxItems;
  const canRemove = panelCount > spec.minItems;

  const addPanelMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/api/aplus/${productId}/modules/${module.id}/panels`,
        { method: "POST" }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to add panel");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["aplus-modules", productId] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to add panel"),
  });

  const removePanelMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/api/aplus/${productId}/modules/${module.id}/panels`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to remove panel");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["aplus-modules", productId] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to remove panel"),
  });

  // Build image slot spec from repeatable group image spec
  const imageSlotSpec: ImageSlotSpec | null = spec.image
    ? {
        key: spec.image.key,
        label: spec.image.label,
        desktopSize: spec.image.desktopSize,
        mobileSize: spec.image.mobileSize,
      }
    : null;

  return (
    <div>
      {/* Header: label + count + add/remove */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <label style={{ fontSize: "14px", fontWeight: 700, color: "#0F1111" }}>
          {spec.label}
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "12px", color: "#565959" }}>
            {panelCount} / {spec.maxItems}
          </span>
          {!readOnly && (
            <>
              <button
                type="button"
                onClick={() => removePanelMutation.mutate()}
                disabled={!canRemove || removePanelMutation.isPending}
                style={{
                  width: "24px",
                  height: "24px",
                  borderRadius: "3px",
                  border: "1px solid #d5d9d9",
                  backgroundColor: canRemove ? "#ffffff" : "#f7f8f8",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: canRemove ? "pointer" : "default",
                  opacity: canRemove ? 1 : 0.4,
                }}
                title={`Remove panel (min ${spec.minItems})`}
              >
                <Minus style={{ width: "14px", height: "14px", color: "#0F1111" }} />
              </button>
              <button
                type="button"
                onClick={() => addPanelMutation.mutate()}
                disabled={!canAdd || addPanelMutation.isPending}
                style={{
                  width: "24px",
                  height: "24px",
                  borderRadius: "3px",
                  border: "1px solid #d5d9d9",
                  backgroundColor: canAdd ? "#ffffff" : "#f7f8f8",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: canAdd ? "pointer" : "default",
                  opacity: canAdd ? 1 : 0.4,
                }}
                title={`Add panel (max ${spec.maxItems})`}
              >
                <Plus style={{ width: "14px", height: "14px", color: "#0F1111" }} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Panel grid */}
      {imageSlotSpec && panelImages.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {panelImages.map((img, idx) => (
            <div key={img.id} style={{ border: "1px solid #e7e7e7", borderRadius: "4px", padding: "12px", backgroundColor: "#fafbfc" }}>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#0F1111", marginBottom: "8px", textTransform: "uppercase" }}>
                {spec.itemLabel} ({idx + 1} / {spec.maxItems})
              </div>
              <AplusImageSlot
                image={img}
                productId={productId}
                moduleId={module.id}
                readOnly={readOnly}
                slotSpec={imageSlotSpec}
                panelNumber={idx + 1}
              />
              {spec.fields.length > 0 && (
                <PanelFieldsEditor
                  image={img}
                  productId={productId}
                  moduleId={module.id}
                  fields={spec.fields}
                  readOnly={readOnly}
                />
              )}
            </div>
          ))}
        </div>
      ) : !imageSlotSpec ? (
        /* No-image repeatable group (Q&A, tech specs, etc.) — keep field list */
        <div
          style={{
            border: "1px dashed #d5d9d9",
            borderRadius: "4px",
            backgroundColor: "#fafafa",
            padding: "16px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {spec.fields.map((field) => (
              <div key={field.key} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "#888c8c" }}>
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#d5d9d9", flexShrink: 0 }} />
                <span>{field.label}</span>
                {field.maxLength && (
                  <span style={{ fontSize: "10px", color: "#aab7b8", fontFamily: "monospace" }}>
                    max {field.maxLength}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ textAlign: "center", padding: "24px", color: "#888c8c", fontSize: "13px" }}>
          No panels yet — click + to add
        </div>
      )}
    </div>
  );
}

// ─── Create single panel slot (auto-creates missing panel image row) ──

export function CreatePanelSlot({
  productId,
  moduleId,
  imageSpec,
}: {
  productId: string;
  moduleId: string;
  imageSpec: { key: string; label: string; desktopSize: { width: number; height: number }; mobileSize?: { width: number; height: number } };
}) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/aplus/${productId}/modules/${moduleId}/panels`,
        { method: "POST" }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create panel");
      }
      queryClient.invalidateQueries({ queryKey: ["aplus-modules", productId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create panel");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCreate}
      disabled={loading}
      style={{
        width: "100%",
        backgroundColor: "#f7f8fa",
        border: "2px dashed #008296",
        borderRadius: "4px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "6px",
        padding: "40px 0",
        cursor: loading ? "wait" : "pointer",
        color: "#008296",
        fontSize: "13px",
      }}
    >
      {loading ? (
        <Loader2 style={{ width: "20px", height: "20px", animation: "spin 1s linear infinite" }} />
      ) : (
        <>
          <Plus style={{ width: "20px", height: "20px" }} />
          <span style={{ fontWeight: 600 }}>Create panel image slot</span>
          <span style={{ fontSize: "11px", color: "#565959" }}>
            {imageSpec.desktopSize.width} x {imageSpec.desktopSize.height}px
          </span>
        </>
      )}
    </button>
  );
}
