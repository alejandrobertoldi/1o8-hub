/* eslint-disable react-doctor/no-uncontrolled-input */
/* eslint-disable react-doctor/no-layout-transition-inline */
/* eslint-disable react-doctor/no-z-index-9999 */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable jsx-a11y/label-has-associated-control */
/* eslint-disable react-doctor/design-no-bold-heading */
/* eslint-disable react-doctor/no-inline-exhaustive-style */
"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { X, ImageIcon } from "lucide-react";
import { AplusImageSlot } from "../aplus-image-slot";
import { APLUS_MODULE_SPECS, type TextFieldSpec, type ImageSlotSpec } from "@/lib/aplus-module-specs";
import { ModuleTextField, CharCounter } from "../module-card-shared";
import type { AplusModule, AplusModuleImage } from "../module-card-types";

interface BackgroundImageTextBodyProps {
  spec: (typeof APLUS_MODULE_SPECS)["background_image_text"];
  module: AplusModule & { images: AplusModuleImage[] };
  productId: string;
  readOnly: boolean;
  getFieldValue: (key: TextFieldSpec["key"]) => string;
  onSaveField: (key: string, value: string) => Promise<void>;
  onSaveOption: (key: string, value: string) => Promise<void>;
  getImage: (slotKey: string) => AplusModuleImage | undefined;
}

export function BackgroundImageTextBody({
  spec,
  module,
  productId,
  readOnly,
  getFieldValue,
  onSaveField,
  onSaveOption,
  getImage,
}: BackgroundImageTextBodyProps) {
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [textAlign, setTextAlign] = useState<"left" | "right">((module.textPosition as "left" | "right") || "left");
  const [fontColor, setFontColor] = useState<"light" | "dark">((module.fontColor as "light" | "dark") || "light");
  const bgSlot = spec.imageSlots[0];
  const bgImage = getImage(bgSlot.key);

  const labelColor = fontColor === "light" ? "#ffffff" : "#0F1111";
  const inputBgColor = fontColor === "light" ? "rgba(255,255,255,0.9)" : "#ffffff";

  return (
    <div>
      {/* Gray background preview with overlaid text fields */}
      <div
        style={{
          backgroundColor: "#9e9e9e",
          padding: "48px 32px",
          display: "flex",
          justifyContent: textAlign === "left" ? "flex-start" : "flex-end",
          minHeight: "280px",
        }}
      >
        <div style={{ width: "50%", display: "flex", flexDirection: "column", gap: "16px" }}>
          {spec.textFields.map((fieldSpec) => (
            <ModuleTextField
              key={`bg-tf-${fieldSpec.key}`}
              spec={{ ...fieldSpec, label: fieldSpec.label }}
              value={getFieldValue(fieldSpec.key)}
              readOnly={readOnly}
              onSave={onSaveField}
              labelColor={labelColor}
              inputBgColor={inputBgColor}
            />
          ))}
        </div>
      </div>

      {/* Bottom toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "12px 16px",
          borderTop: "1px solid #e7e7e7",
          backgroundColor: "#ffffff",
        }}
      >
        {/* Layout toggle: text-left / text-right */}
        <button
          type="button"
          onClick={() => { setTextAlign("left"); onSaveOption("textPosition", "left"); }}
          style={{
            width: "48px",
            height: "32px",
            border: textAlign === "left" ? "2px solid #008296" : "1px solid #d5d9d9",
            borderRadius: "4px",
            backgroundColor: "#ffffff",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "3px",
            padding: "4px",
          }}
        >
          {/* Text lines left + image block right */}
          <div style={{ display: "flex", flexDirection: "column", gap: "2px", flex: 1 }}>
            <div style={{ height: "2px", backgroundColor: "#565959", borderRadius: "1px" }} />
            <div style={{ height: "2px", backgroundColor: "#565959", borderRadius: "1px", width: "80%" }} />
            <div style={{ height: "2px", backgroundColor: "#565959", borderRadius: "1px" }} />
          </div>
          <div style={{ width: "14px", height: "18px", backgroundColor: "#3d4f5f", borderRadius: "2px", flexShrink: 0 }} />
        </button>

        <button
          type="button"
          onClick={() => { setTextAlign("right"); onSaveOption("textPosition", "right"); }}
          style={{
            width: "48px",
            height: "32px",
            border: textAlign === "right" ? "2px solid #008296" : "1px solid #d5d9d9",
            borderRadius: "4px",
            backgroundColor: "#ffffff",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "3px",
            padding: "4px",
          }}
        >
          <div style={{ width: "14px", height: "18px", backgroundColor: "#3d4f5f", borderRadius: "2px", flexShrink: 0 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: "2px", flex: 1 }}>
            <div style={{ height: "2px", backgroundColor: "#565959", borderRadius: "1px" }} />
            <div style={{ height: "2px", backgroundColor: "#565959", borderRadius: "1px", width: "80%", marginLeft: "auto" }} />
            <div style={{ height: "2px", backgroundColor: "#565959", borderRadius: "1px" }} />
          </div>
        </button>

        <span style={{ fontSize: "13px", fontWeight: 500, color: "#0F1111", marginLeft: "8px" }}>
          Font color
        </span>

        {/* Font color: light */}
        <button
          type="button"
          onClick={() => { setFontColor("light"); onSaveOption("fontColor", "light"); }}
          style={{
            width: "32px",
            height: "32px",
            border: fontColor === "light" ? "2px solid #008296" : "1px solid #d5d9d9",
            borderRadius: "4px",
            backgroundColor: "#ffffff",
            cursor: "pointer",
          }}
        />

        {/* Font color: dark */}
        <button
          type="button"
          onClick={() => { setFontColor("dark"); onSaveOption("fontColor", "dark"); }}
          style={{
            width: "32px",
            height: "32px",
            border: fontColor === "dark" ? "2px solid #008296" : "1px solid #d5d9d9",
            borderRadius: "4px",
            backgroundColor: "#0F1111",
            cursor: "pointer",
          }}
        />

        <div style={{ flex: 1 }} />

        {/* Background image button */}
        <div style={{ textAlign: "right" }}>
          <span style={{ fontSize: "13px", fontWeight: 700, color: "#0F1111", display: "block", marginBottom: "4px" }}>
            <span style={{ color: "#d13212", marginRight: "2px" }}>*</span>
            Background image
          </span>
          <button
            type="button"
            onClick={() => setImageDialogOpen(true)}
            style={{
              padding: "4px 12px",
              fontSize: "13px",
              fontWeight: 500,
              color: "#008296",
              backgroundColor: "#ffffff",
              border: "1px solid #008296",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            + Add background image
          </button>
        </div>
      </div>

      {/* Reuse AplusImageSlot dialog for background image */}
      {bgImage ? (
        <div style={{ display: "none" }}>
          <AplusImageSlot
            image={bgImage}
            productId={productId}
            moduleId={module.id}
            readOnly={readOnly}
            slotSpec={bgSlot}
          />
        </div>
      ) : null}

      {imageDialogOpen && (
        <BackgroundImageDialog
          open={imageDialogOpen}
          onClose={() => setImageDialogOpen(false)}
          slotSpec={bgSlot}
          readOnly={readOnly}
        />
      )}
    </div>
  );
}

// ─── Background Image dialog (reuses Add Image pattern) ─────────

export function BackgroundImageDialog({
  open,
  onClose,
  slotSpec,
  readOnly,
}: {
  open: boolean;
  onClose: () => void;
  slotSpec: ImageSlotSpec;
  readOnly: boolean;
}) {
  const [altText, setAltText] = useState("");

  if (!open) return null;

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

  const dropZoneStyle: React.CSSProperties = {
    backgroundColor: "#f7f8fa",
    border: "2px dashed #008296",
    borderRadius: "4px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    padding: "60px 0",
    cursor: "pointer",
  };

  return createPortal(
    <div
      style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <div
        style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.5)" }}
        onClick={onClose}
      />
      <div
        style={{
          position: "relative",
          backgroundColor: "#ffffff",
          color: "#0F1111",
          borderRadius: "8px",
          boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
          width: "100%",
          maxWidth: "900px",
          maxHeight: "90vh",
          overflowY: "auto",
          padding: "24px",
          zIndex: 101,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px", paddingBottom: "12px", borderBottom: "1px solid #e7e7e7" }}>
          <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#0F1111", margin: 0 }}>Add Image</h2>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#565959", padding: "4px" }}
          >
            <X style={{ width: "20px", height: "20px" }} />
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginBottom: "24px" }}>
          <div>
            <label style={{ fontSize: "14px", fontWeight: 700, color: "#0F1111", display: "block", marginBottom: "8px" }}>
              <span style={{ color: "#d13212", marginRight: "2px" }}>*</span>
              Add desktop image [{slotSpec.desktopSize.width}px x {slotSpec.desktopSize.height}px min]
            </label>
            <div style={dropZoneStyle}>
              <ImageIcon style={{ width: "40px", height: "40px", color: "#008296" }} />
              <div style={{ textAlign: "center" }}>
                <span style={{ fontSize: "14px", color: "#008296", fontWeight: 500 }}>Drag image here</span>
                <br />
                <span style={{ fontSize: "14px", color: "#008296" }}><strong>or</strong> click to select</span>
              </div>
            </div>
          </div>
          {slotSpec.mobileSize && (
            <div>
              <label style={{ fontSize: "14px", fontWeight: 700, color: "#0F1111", display: "block", marginBottom: "8px" }}>
                <span style={{ color: "#d13212", marginRight: "2px" }}>*</span>
                Add mobile image [{slotSpec.mobileSize.width}px x {slotSpec.mobileSize.height}px min]
              </label>
              <div style={dropZoneStyle}>
                <ImageIcon style={{ width: "40px", height: "40px", color: "#008296" }} />
                <div style={{ textAlign: "center" }}>
                  <span style={{ fontSize: "14px", color: "#008296", fontWeight: 500 }}>Drag image here</span>
                  <br />
                  <span style={{ fontSize: "14px", color: "#008296" }}><strong>or</strong> click to select</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginBottom: "24px" }}>
          <div>
            <label style={{ fontSize: "14px", fontWeight: 700, color: "#0F1111", display: "block", marginBottom: "6px" }}>
              <span style={{ color: "#d13212", marginRight: "2px" }}>*</span>
              Alt text
            </label>
            <input
              value={altText}
              onChange={(e) => setAltText(e.target.value)}
              disabled={readOnly}
              placeholder="Enter alt text"
              maxLength={100}
              style={inputStyle}
            />
            <CharCounter length={altText.length} max={100} />
          </div>
          {slotSpec.mobileSize && (
            <div>
              <label style={{ fontSize: "14px", fontWeight: 700, color: "#0F1111", display: "block", marginBottom: "6px" }}>
                <span style={{ color: "#d13212", marginRight: "2px" }}>*</span>
                Alt text
              </label>
              <input
                value={altText}
                disabled
                placeholder="Same as desktop"
                style={{ ...inputStyle, backgroundColor: "#f7f8fa", color: "#888c8c" }}
              />
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", paddingTop: "12px", borderTop: "1px solid #e7e7e7" }}>
          <button type="button" onClick={onClose} style={{ padding: "8px 20px", fontSize: "14px", fontWeight: 500, color: "#0F1111", backgroundColor: "#ffffff", border: "1px solid #888c8c", borderRadius: "4px", cursor: "pointer" }}>
            Cancel
          </button>
          <button type="button" style={{ padding: "8px 20px", fontSize: "14px", fontWeight: 500, color: "#0F1111", backgroundColor: "#ffffff", border: "1px solid #888c8c", borderRadius: "4px", cursor: "pointer" }}>
            Remove
          </button>
          <button type="button" onClick={onClose} style={{ padding: "8px 20px", fontSize: "14px", fontWeight: 600, color: "#ffffff", backgroundColor: "#008296", border: "1px solid #008296", borderRadius: "4px", cursor: "pointer" }}>
            Add
          </button>
        </div>
      </div>
    </div>
    , document.body);
}
