/* eslint-disable react-doctor/design-no-vague-button-label */
/* eslint-disable react-doctor/no-z-index-9999 */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable jsx-a11y/label-has-associated-control */
/* eslint-disable react-doctor/design-no-bold-heading */
/* eslint-disable react-doctor/no-inline-exhaustive-style */
"use client";
/* eslint-disable react-doctor/nextjs-no-img-element */
/* eslint-disable react-doctor/rendering-hydration-mismatch-time */

import { useState } from "react";
import { createPortal } from "react-dom";
import { X, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { APLUS_MODULE_SPECS, type TextFieldSpec } from "@/lib/aplus-module-specs";
import { ImagePlaceholder, ModuleTextField, CharCounter } from "../module-card-shared";
import type { AplusModule, AplusModuleImage } from "../module-card-types";
import { EXCEEDED_BORDER } from "../module-card-types";
import { RichTextToolbar } from "../module-card-shared";

interface HotspotItem {
  id: string;
  headline: string;
  body: string;
  /** Position on the background image (percentage 0-100) */
  x: number;
  y: number;
}

interface HotspotsBodyProps {
  module: AplusModule & { images: AplusModuleImage[] };
  productId: string;
  readOnly: boolean;
  getFieldValue: (key: TextFieldSpec["key"]) => string;
  onSaveField: (key: string, value: string) => Promise<void>;
  getImage: (slotKey: string) => AplusModuleImage | undefined;
}

export function HotspotsBody({
  module,
  productId,
  readOnly,
  getFieldValue,
  onSaveField,
  getImage,
}: HotspotsBodyProps) {
  const moduleType = module.moduleType as "hotspots_1" | "hotspots_2";
  const spec = APLUS_MODULE_SPECS[moduleType];
  const bgSlot = spec.imageSlots[0]; // main_image 1464x600
  const rg = spec.repeatableGroup!;
  const bgImage = getImage(bgSlot.key);
  const isType2 = moduleType === "hotspots_2";

  // Hotspots 1: only headline (50) + body (200) per hotspot
  // Hotspots 2: only headline (50) per hotspot (no body)
  const headlineField = rg.fields.find(f => f.key === "title")!;
  const bodyField = rg.fields.find(f => f.key === "description");
  const hasBodyPerHotspot = !!bodyField;

  const [hotspots, setHotspots] = useState<HotspotItem[]>([]);
  const [editIdx, setEditIdx] = useState<number | null>(null);

  // Auto-detect if background image has been uploaded
  const imageAdded = !!bgImage?.driveFileId;

  const addHotspot = () => {
    if (hotspots.length >= rg.maxItems) return;
    const offset = hotspots.length * 8;
    const newHotspot: HotspotItem = {
      id: `hs-${Date.now()}`,
      headline: "",
      body: "",
      x: 20 + (offset % 60),
      y: 30 + ((offset * 1.3) % 40),
    };
    setHotspots(prev => [...prev, newHotspot]);
    setEditIdx(hotspots.length);
  };

  const removeHotspot = (idx: number) => {
    setHotspots(hotspots.filter((_, i) => i !== idx));
    setEditIdx(null);
  };

  const updateHotspot = (idx: number, field: "headline" | "body", value: string) => {
    const arr = [...hotspots];
    arr[idx] = { ...arr[idx], [field]: value };
    setHotspots(arr);
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

  const hotspotImageSpec = rg.image!;

  return (
    <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Module-level text fields (Hotspots 2 has Headline + Body text) */}
      {spec.textFields.map((tf) => (
        <div key={tf.key}>
          {tf.multiline ? (
            <>
              <label style={{ fontSize: "14px", fontWeight: 700, color: "#0F1111", display: "block", marginBottom: "6px" }}>
                {tf.label}
              </label>
              <RichTextToolbar />
              <ModuleTextField
                spec={tf}
                value={getFieldValue(tf.key)}
                readOnly={readOnly}
                onSave={onSaveField}
              />
            </>
          ) : (
            <ModuleTextField
              spec={{ ...tf, label: `* ${tf.label}` }}
              value={getFieldValue(tf.key)}
              readOnly={readOnly}
              onSave={onSaveField}
            />
          )}
        </div>
      ))}

      {/* Instruction text */}
      <p style={{ textAlign: "center", fontSize: "14px", fontWeight: 700, color: "#0F1111", margin: 0 }}>
        {imageAdded ? "Click anywhere to add a hotspot" : "Add image to start adding hotspots"}
      </p>

      {/* Background image area */}
      <div>
        <label style={{ fontSize: "14px", fontWeight: 700, color: "#0F1111", display: "block", marginBottom: "6px" }}>
          <span style={{ color: "#d13212", marginRight: "2px" }}>*</span>
          Image
        </label>

        {imageAdded ? (
          <div
            style={{
              position: "relative",
              borderRadius: "2px",
              minHeight: "300px",
              aspectRatio: `${bgSlot.desktopSize.width} / ${bgSlot.desktopSize.height}`,
              cursor: "crosshair",
              overflow: "hidden",
            }}
            onClick={(e) => {
              if (readOnly || hotspots.length >= rg.maxItems) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const x = ((e.clientX - rect.left) / rect.width) * 100;
              const y = ((e.clientY - rect.top) / rect.height) * 100;
              const newHotspot: HotspotItem = {
                id: `hs-${Date.now()}`,
                headline: "",
                body: "",
                x,
                y,
              };
              setHotspots(prev => [...prev, newHotspot]);
              setEditIdx(hotspots.length);
            }}
          >
            {/* Show actual uploaded background image */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/drive/file/${bgImage!.driveFileId}`}
              alt={bgImage!.altText || "Background image"}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
                pointerEvents: "none",
              }}
            />

            {hotspots.map((hs, i) => (
              <button
                key={hs.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditIdx(i);
                }}
                style={{
                  position: "absolute",
                  left: `${hs.x}%`,
                  top: `${hs.y}%`,
                  transform: "translate(-50%, -50%)",
                  width: "28px",
                  height: "28px",
                  borderRadius: "50%",
                  backgroundColor: editIdx === i ? "#008296" : "#232f3e",
                  color: "#ffffff",
                  border: "2px solid #ffffff",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
                  fontSize: "12px",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  zIndex: 2,
                }}
              >
                {i + 1}
              </button>
            ))}

            {hotspots.length === 0 && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: "14px", color: "#565959", backgroundColor: "rgba(255,255,255,0.8)", padding: "8px 16px", borderRadius: "4px" }}>
                  Click on the image to place hotspots
                </span>
              </div>
            )}
          </div>
        ) : (
          <ImagePlaceholder
            slotSpec={bgSlot}
            image={bgImage}
            productId={productId}
            moduleId={module.id}
            readOnly={readOnly}
          />
        )}
      </div>

      {/* Controls — only show when background image is uploaded */}
      {imageAdded && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "#d13212" }}>
              Hotspots: {hotspots.length} / {rg.maxItems}
            </span>
            {hotspots.length > 0 && !readOnly && (
              <button
                type="button"
                onClick={() => { setHotspots([]); setEditIdx(null); }}
                style={{
                  padding: "4px 12px",
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "#565959",
                  backgroundColor: "#ffffff",
                  border: "1px solid #d5d9d9",
                  borderRadius: "3px",
                  cursor: "pointer",
                }}
              >
                X Remove all hotspots
              </button>
            )}
          </div>
          {!readOnly && (
            <button
              type="button"
              onClick={() => {
                // TODO: implement actual image removal via API
                toast.error("Remove background image not yet implemented");
              }}
              style={{
                padding: "4px 12px",
                fontSize: "12px",
                fontWeight: 500,
                color: "#d13212",
                backgroundColor: "#ffffff",
                border: "1px solid #d5d9d9",
                borderRadius: "3px",
                cursor: "pointer",
              }}
            >
              X Remove background image
            </button>
          )}
        </div>
      )}

      {/* Edit Hotspot dialog */}
      {editIdx !== null && hotspots[editIdx] && createPortal(
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div
            style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.4)" }}
            onClick={() => setEditIdx(null)}
          />
          <div
            style={{
              position: "relative",
              backgroundColor: "#ffffff",
              color: "#0F1111",
              borderRadius: "4px",
              boxShadow: "0 2px 16px rgba(0,0,0,0.2)",
              width: "100%",
              maxWidth: "520px",
              maxHeight: "90vh",
              overflowY: "auto",
              padding: "24px",
              zIndex: 101,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
              <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#0F1111", margin: 0 }}>Edit Hotspot</h2>
              <button
                type="button"
                onClick={() => setEditIdx(null)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#565959", padding: "4px" }}
              >
                <X style={{ width: "20px", height: "20px" }} />
              </button>
            </div>

            {/* Headline */}
            <div style={{ marginBottom: "16px" }}>
              <label style={{ fontSize: "14px", fontWeight: 700, color: "#0F1111", display: "block", marginBottom: "6px" }}>
                <span style={{ color: "#d13212", marginRight: "2px" }}>*</span>
                Headline
              </label>
              <input
                value={hotspots[editIdx].headline}
                onChange={(e) => updateHotspot(editIdx, "headline", e.target.value)}
                placeholder="Enter headline text"
                disabled={readOnly}
                style={{
                  ...inputStyle,
                  border: `1px solid ${hotspots[editIdx].headline.length > (headlineField.maxLength ?? 50) ? EXCEEDED_BORDER : "#888c8c"}`,
                }}
              />
              <CharCounter length={hotspots[editIdx].headline.length} max={headlineField.maxLength ?? 50} />
            </div>

            {/* Body text (Hotspots 1 only) */}
            {hasBodyPerHotspot && (
              <div style={{ marginBottom: "16px" }}>
                <label style={{ fontSize: "14px", fontWeight: 700, color: "#0F1111", display: "block", marginBottom: "6px" }}>
                  Body text
                </label>
                <input
                  value={hotspots[editIdx].body}
                  onChange={(e) => updateHotspot(editIdx, "body", e.target.value)}
                  placeholder="Enter body text"
                  disabled={readOnly}
                  style={{
                    ...inputStyle,
                    border: `1px solid ${hotspots[editIdx].body.length > (bodyField!.maxLength ?? 200) ? EXCEEDED_BORDER : "#888c8c"}`,
                  }}
                />
                <CharCounter length={hotspots[editIdx].body.length} max={bodyField!.maxLength ?? 200} />
              </div>
            )}

            {/* Image */}
            <div style={{ marginBottom: "20px" }}>
              <label style={{ fontSize: "14px", fontWeight: 700, color: "#0F1111", display: "block", marginBottom: "6px" }}>
                <span style={{ color: "#d13212", marginRight: "2px" }}>*</span>
                Image
              </label>
              <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
                <div style={{ flex: "0 0 auto", width: "200px" }}>
                  <div
                    style={{
                      backgroundColor: "#f7f8fa",
                      border: "2px dashed #7f9ba6",
                      borderRadius: "2px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                      padding: "32px 0",
                      cursor: "pointer",
                    }}
                  >
                    <ImageIcon style={{ width: "24px", height: "24px", color: "#6b8f9e" }} />
                    <span style={{ fontSize: "12px", fontWeight: 600, color: "#6b8f9e" }}>
                      {hotspotImageSpec.desktopSize.width}:{hotspotImageSpec.desktopSize.height}
                    </span>
                    <span style={{ fontSize: "12px", color: "#6b8f9e" }}>Click to add image</span>
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: "14px", fontWeight: 700, color: "#0F1111", margin: "0 0 4px 0" }}>
                    Add mobile image
                  </p>
                  <p style={{ fontSize: "13px", color: "#565959", margin: 0 }}>
                    Each hotspot requires an image for proper display on mobile device
                  </p>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button
                type="button"
                onClick={() => removeHotspot(editIdx)}
                style={{
                  padding: "6px 18px",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "#0F1111",
                  backgroundColor: "#ffffff",
                  border: "1px solid #888c8c",
                  borderRadius: "3px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <X style={{ width: "14px", height: "14px" }} /> Remove
              </button>
              <button
                type="button"
                onClick={() => setEditIdx(null)}
                style={{
                  padding: "6px 18px",
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "#ffffff",
                  backgroundColor: "#008296",
                  border: "1px solid #008296",
                  borderRadius: "3px",
                  cursor: "pointer",
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  );
}
