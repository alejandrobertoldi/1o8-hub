/* eslint-disable jsx-a11y/label-has-associated-control */
"use client";

import { APLUS_MODULE_SPECS, type TextFieldSpec } from "@/lib/aplus-module-specs";
import { ModuleTextField, RichTextToolbar } from "../module-card-shared";

interface PremiumTextBodyProps {
  readOnly: boolean;
  getFieldValue: (key: TextFieldSpec["key"]) => string;
  onSaveField: (key: string, value: string) => Promise<void>;
}

export function PremiumTextBody({
  readOnly,
  getFieldValue,
  onSaveField,
}: PremiumTextBodyProps) {
  const spec = APLUS_MODULE_SPECS["text"];

  return (
    <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Headline */}
      <ModuleTextField
        spec={spec.textFields[0]}
        value={getFieldValue("headlineText")}
        readOnly={readOnly}
        onSave={onSaveField}
      />
      {/* Body text (required, with rich text toolbar) */}
      <div>
        <label style={{ fontSize: "14px", fontWeight: 700, color: "#0F1111", display: "block", marginBottom: "6px" }}>
          <span style={{ color: "#d13212", marginRight: "2px" }}>*</span>
          Body text
        </label>
        <RichTextToolbar />
        <ModuleTextField
          spec={{ ...spec.textFields[1], label: "" }}
          value={getFieldValue("bodyText")}
          readOnly={readOnly}
          onSave={onSaveField}
        />
      </div>
    </div>
  );
}
