/* eslint-disable jsx-a11y/label-has-associated-control */
/* eslint-disable react-doctor/no-inline-exhaustive-style */
"use client";

import { useState } from "react";
import { ImageIcon } from "lucide-react";
import { APLUS_MODULE_SPECS, type TextFieldSpec } from "@/lib/aplus-module-specs";
import { AplusImageSlot } from "../aplus-image-slot";
import { ModuleTextField } from "../module-card-shared";
import type { AplusModule, AplusModuleImage } from "../module-card-types";
import { RichTextToolbar } from "../module-card-shared";
import { BackgroundImageDialog } from "./background-image-text";

interface SingleImageTextBodyProps {
  module: AplusModule & { images: AplusModuleImage[] };
  productId: string;
  readOnly: boolean;
  getFieldValue: (key: TextFieldSpec["key"]) => string;
  onSaveField: (key: string, value: string) => Promise<void>;
  onSaveOption: (key: string, value: string) => Promise<void>;
  getImage: (slotKey: string) => AplusModuleImage | undefined;
}

export function SingleImageTextBody({
  module,
  productId,
  readOnly,
  getFieldValue,
  onSaveField,
  onSaveOption,
  getImage,
}: SingleImageTextBodyProps) {
  const spec = APLUS_MODULE_SPECS["single_image_text"];
  const imgSlot = spec.imageSlots[0];
  const image = getImage(imgSlot.key);
  // textPosition = where text goes; imageLayout = where image goes (opposite)
  const [imageLayout, setImageLayout] = useState<"right" | "left">(
    (module.textPosition as "left" | "right") === "right" ? "left" : "right"
  );
  const [imageDialogOpen, setImageDialogOpen] = useState(false);

  const textColumn = (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", justifyContent: "center" }}>
      {/* Subheadline */}
      <ModuleTextField
        spec={spec.textFields[0]}
        value={getFieldValue("subheadlineText")}
        readOnly={readOnly}
        onSave={onSaveField}
      />
      {/* Headline (required) */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
          <label style={{ fontSize: "14px", fontWeight: 700, color: "#0F1111" }}>
            <span style={{ color: "#d13212", marginRight: "2px" }}>*</span>
            Headline
          </label>
        </div>
        <ModuleTextField
          spec={{ ...spec.textFields[1], label: "" }}
          value={getFieldValue("headlineText")}
          readOnly={readOnly}
          onSave={onSaveField}
        />
      </div>
      {/* Body text (rich text) */}
      <div>
        <label style={{ fontSize: "14px", fontWeight: 700, color: "#0F1111", display: "block", marginBottom: "6px" }}>
          Body text
        </label>
        <RichTextToolbar />
        <ModuleTextField
          spec={{ ...spec.textFields[2], label: "" }}
          value={getFieldValue("bodyText")}
          readOnly={readOnly}
          onSave={onSaveField}
        />
      </div>
    </div>
  );

  const imageColumn = (
    <div>
      <label style={{ fontSize: "14px", fontWeight: 700, color: "#0F1111", display: "block", marginBottom: "6px" }}>
        <span style={{ color: "#d13212", marginRight: "2px" }}>*</span>
        Image
      </label>
      {image ? (
        <AplusImageSlot
          image={image}
          productId={productId}
          moduleId={module.id}
          readOnly={readOnly}
          slotSpec={imgSlot}
        />
      ) : (
        <button
          type="button"
          onClick={() => setImageDialogOpen(true)}
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
            padding: "100px 0",
            cursor: "pointer",
          }}
        >
          <ImageIcon style={{ width: "28px", height: "28px", color: "#6b8f9e" }} />
          <span style={{ fontSize: "13px", fontWeight: 600, color: "#6b8f9e" }}>
            {imgSlot.desktopSize.width}:{imgSlot.desktopSize.height}
          </span>
          <span style={{ fontSize: "13px", color: "#6b8f9e" }}>Click to add image</span>
        </button>
      )}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* 2-column layout */}
      <div style={{ padding: "20px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", alignItems: "start" }}>
        {imageLayout === "right" ? (
          <>{textColumn}{imageColumn}</>
        ) : (
          <>{imageColumn}{textColumn}</>
        )}
      </div>

      {/* Bottom toolbar: layout toggle */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 20px", borderTop: "1px solid #e7e7e7" }}>
        {/* Text left / Image right */}
        <button
          type="button"
          onClick={() => { setImageLayout("right"); onSaveOption("textPosition", "left"); }}
          style={{
            width: "48px",
            height: "32px",
            border: imageLayout === "right" ? "2px solid #008296" : "1px solid #d5d9d9",
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
          <div style={{ display: "flex", flexDirection: "column", gap: "2px", flex: 1 }}>
            <div style={{ height: "2px", backgroundColor: "#565959", borderRadius: "1px" }} />
            <div style={{ height: "2px", backgroundColor: "#565959", borderRadius: "1px", width: "80%" }} />
            <div style={{ height: "2px", backgroundColor: "#565959", borderRadius: "1px" }} />
          </div>
          <div style={{ width: "14px", height: "18px", backgroundColor: "#3d4f5f", borderRadius: "2px", flexShrink: 0 }} />
        </button>

        {/* Image left / Text right */}
        <button
          type="button"
          onClick={() => { setImageLayout("left"); onSaveOption("textPosition", "right"); }}
          style={{
            width: "48px",
            height: "32px",
            border: imageLayout === "left" ? "2px solid #008296" : "1px solid #d5d9d9",
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
      </div>

      {/* Add Image dialog (single zone — no mobile) */}
      {imageDialogOpen && (
        <BackgroundImageDialog
          open={imageDialogOpen}
          onClose={() => setImageDialogOpen(false)}
          slotSpec={imgSlot}
          readOnly={readOnly}
        />
      )}
    </div>
  );
}
