/* eslint-disable react-doctor/no-derived-state-effect */
/* eslint-disable react-doctor/no-derived-useState */
/* eslint-disable react-doctor/rerender-state-only-in-handlers */
/* eslint-disable react-doctor/no-cascading-set-state */
/* eslint-disable react-doctor/prefer-useReducer */
/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable jsx-a11y/label-has-associated-control */
/* eslint-disable react-doctor/js-flatmap-filter */
/* eslint-disable react-doctor/no-tiny-text */
/* eslint-disable react-doctor/no-inline-exhaustive-style */
"use client";

import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Settings, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { toast } from "sonner";

export interface SetConfig {
  id: string;
  scopeType: string;
  scopeIdentifier: string;
  platform: string;
  contentType: string;
  version: number;
  groupNumber: number | null;
  parentAsin: string | null;
  coveredAsins: string[] | null;
}

interface AplusSetConfigProps {
  productId: string;
  productAsin: string;
  productClientIdCode: string;
  config: SetConfig;
  readOnly: boolean;
}

const SCOPE_OPTIONS = [
  { value: "VAR", label: "Full Variation", desc: "All ASINs share this content" },
  { value: "GRP", label: "ASIN Group", desc: "Selected ASINs share this content" },
  { value: "ASIN", label: "Single ASIN", desc: "Unique content for this ASIN only" },
];

const PLATFORM_OPTIONS = [
  { value: "SC", label: "Seller Central" },
  { value: "VC", label: "Vendor Central" },
];

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

/** Build the scope segment label for display: V01, V01G01, V01_B0DCLWMB4Y */
function buildScopeLabel(
  version: number,
  scopeType: string,
  asin?: string,
  groupNumber?: number,
): string {
  const v = `V${pad2(version)}`;
  switch (scopeType) {
    case "VAR":
      return v;
    case "GRP":
      return `${v}G${pad2(groupNumber ?? 1)}`;
    case "ASIN":
      return `${v}_${asin ?? "???"}`;
    default:
      return v;
  }
}

/** Build the folder name that will be created in Drive */
function buildFolderPreview(
  clientIdCode: string,
  version: number,
  scopeType: string,
  asin?: string,
  groupNumber?: number,
): string {
  const scopeSeg = buildScopeLabel(version, scopeType, asin, groupNumber);
  return `${clientIdCode}-Graphics/${clientIdCode}-A+/PA+/${scopeSeg}/`;
}

const chipBase: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "4px",
  fontSize: "12px",
  fontWeight: 600,
  padding: "3px 10px",
  borderRadius: "3px",
  cursor: "default",
};

interface SiblingAsin {
  id: string;
  asin: string;
  itemName: string | null;
}

export function AplusSetConfig({ productId, productAsin, productClientIdCode, config, readOnly }: AplusSetConfigProps) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  const [scopeType, setScopeType] = useState(config.scopeType);
  const [scopeIdentifier, setScopeIdentifier] = useState(config.scopeIdentifier);
  const [platform, setPlatform] = useState(config.platform);
  const [version, setVersion] = useState(config.version);
  const [groupNumber, setGroupNumber] = useState(config.groupNumber ?? 1);
  const [coveredAsins, setCoveredAsins] = useState<string[]>(config.coveredAsins ?? []);
  const [parentAsin, setParentAsin] = useState(config.parentAsin ?? "");

  // Sync from props when config changes externally
  useEffect(() => {
    setScopeType(config.scopeType);
    setScopeIdentifier(config.scopeIdentifier);
    setPlatform(config.platform);
    setVersion(config.version);
    setGroupNumber(config.groupNumber ?? 1);
    setCoveredAsins(config.coveredAsins ?? []);
    setParentAsin(config.parentAsin ?? "");
  }, [config]);

  // Fetch sibling ASINs (same parentAsin) for GRP/VAR scope selection
  const { data: siblingsData } = useQuery<{ siblings: SiblingAsin[] }>({
    queryKey: ["aplus-siblings", productId],
    queryFn: async () => {
      const res = await fetch(`/api/aplus/${productId}/siblings`);
      if (!res.ok) return { siblings: [] };
      return res.json();
    },
    enabled: expanded && (scopeType === "GRP" || scopeType === "VAR"),
  });
  const siblings = siblingsData?.siblings ?? [];

  const mutation = useMutation({
    mutationFn: async (data: Partial<SetConfig>) => {
      const res = await fetch(`/api/aplus/${productId}/set-config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["aplus-modules", productId] });
      toast.success("Set config saved");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    },
  });

  function computeScopeIdentifier(
    type: string,
    ver: number,
    asin?: string,
    grpNum?: number,
  ): string {
    return buildScopeLabel(ver, type, asin, grpNum);
  }

  function handleScopeTypeChange(newScope: string) {
    setScopeType(newScope);
    let newIdentifier: string;

    if (newScope === "ASIN") {
      newIdentifier = computeScopeIdentifier(newScope, version, productAsin);
      mutation.mutate({
        scopeType: newScope,
        scopeIdentifier: newIdentifier,
        coveredAsins: [productAsin],
      });
    } else if (newScope === "GRP") {
      newIdentifier = computeScopeIdentifier(newScope, version, undefined, groupNumber);
      setScopeIdentifier(newIdentifier);
      // Don't save yet — user needs to select covered ASINs
    } else {
      // VAR — covers all siblings
      const allAsins = siblings.map((s) => s.asin).filter(Boolean);
      if (!allAsins.includes(productAsin)) allAsins.push(productAsin);
      newIdentifier = computeScopeIdentifier(newScope, version);
      setCoveredAsins(allAsins);
      mutation.mutate({
        scopeType: newScope,
        scopeIdentifier: newIdentifier,
        coveredAsins: allAsins,
        parentAsin: parentAsin || null,
      });
    }

    setScopeIdentifier(newIdentifier!);
  }

  function handlePlatformChange(newPlatform: string) {
    setPlatform(newPlatform);
    mutation.mutate({ platform: newPlatform });
  }

  function handleVersionChange(newVersion: number) {
    if (newVersion < 1 || newVersion > 99) return;
    setVersion(newVersion);
    // Recompute scope identifier with new version
    const newIdentifier = computeScopeIdentifier(
      scopeType,
      newVersion,
      scopeType === "ASIN" ? productAsin : undefined,
      scopeType === "GRP" ? groupNumber : undefined,
    );
    setScopeIdentifier(newIdentifier);
    mutation.mutate({ version: newVersion, scopeIdentifier: newIdentifier });
  }

  function handleGroupNumberChange(newGrpNum: number) {
    if (newGrpNum < 1 || newGrpNum > 99) return;
    setGroupNumber(newGrpNum);
    const newIdentifier = computeScopeIdentifier("GRP", version, undefined, newGrpNum);
    setScopeIdentifier(newIdentifier);
    mutation.mutate({
      scopeType: "GRP",
      groupNumber: newGrpNum,
      scopeIdentifier: newIdentifier,
    });
  }

  function toggleCoveredAsin(asin: string) {
    const next = coveredAsins.includes(asin)
      ? coveredAsins.filter((a) => a !== asin)
      : [...coveredAsins, asin];
    setCoveredAsins(next);
    mutation.mutate({ coveredAsins: next });
  }

  // Computed display
  const scopeLabel = buildScopeLabel(
    version,
    scopeType,
    scopeType === "ASIN" ? productAsin : undefined,
    scopeType === "GRP" ? groupNumber : undefined,
  );
  const folderPreview = buildFolderPreview(
    productClientIdCode,
    version,
    scopeType,
    scopeType === "ASIN" ? productAsin : undefined,
    scopeType === "GRP" ? groupNumber : undefined,
  );

  const inputStyle: React.CSSProperties = {
    backgroundColor: "#ffffff",
    color: "#0F1111",
    border: "1px solid #888c8c",
    borderRadius: "4px",
    fontSize: "13px",
    padding: "4px 8px",
    outline: "none",
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    cursor: "pointer",
  };

  return (
    <div style={{
      backgroundColor: "#f0f2f4",
      border: "1px solid #e7e7e7",
      borderRadius: "4px",
      overflow: "hidden",
    }}>
      {/* Collapsed summary bar */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          width: "100%",
          padding: "8px 12px",
          backgroundColor: "transparent",
          border: "none",
          cursor: "pointer",
          color: "#0F1111",
          fontSize: "13px",
        }}
      >
        <Settings style={{ width: "14px", height: "14px", color: "#565959" }} />
        <span style={{ fontWeight: 600, color: "#565959" }}>Set Config</span>

        {/* Summary chips */}
        <span style={{ ...chipBase, backgroundColor: "#e3f1e6", color: "#067d20" }}>
          {platform}
        </span>
        <span style={{ ...chipBase, backgroundColor: "#e8eef6", color: "#1a5276" }}>
          {scopeType === "VAR" ? "Variation" : scopeType === "GRP" ? "Group" : "ASIN"}
        </span>
        <span style={{ ...chipBase, backgroundColor: "#fef3e2", color: "#8a6d3b", fontFamily: "monospace" }}>
          {scopeLabel}
        </span>
        <span style={{ ...chipBase, backgroundColor: "#f0e6f6", color: "#6c3483" }}>
          {config.contentType}
        </span>
        {coveredAsins.length > 1 && (
          <span style={{ ...chipBase, backgroundColor: "#fce4ec", color: "#b71c1c", fontSize: "11px" }}>
            {coveredAsins.length} ASINs
          </span>
        )}

        {mutation.isPending && (
          <Loader2 style={{ width: "12px", height: "12px", color: "#888c8c", animation: "spin 1s linear infinite" }} />
        )}

        <span style={{ marginLeft: "auto" }}>
          {expanded ? (
            <ChevronUp style={{ width: "16px", height: "16px", color: "#888c8c" }} />
          ) : (
            <ChevronDown style={{ width: "16px", height: "16px", color: "#888c8c" }} />
          )}
        </span>
      </button>

      {/* Expanded config panel */}
      {expanded && (
        <div style={{
          padding: "12px 16px",
          borderTop: "1px solid #e7e7e7",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          backgroundColor: "#ffffff",
        }}>
          {/* Row 1: Scope type selector (prominent) */}
          <div>
            <label style={{ fontSize: "12px", fontWeight: 700, color: "#565959", display: "block", marginBottom: "6px" }}>
              Content Scope
            </label>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {SCOPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => !readOnly && handleScopeTypeChange(opt.value)}
                  disabled={readOnly}
                  style={{
                    flex: "1 1 0",
                    minWidth: "140px",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: scopeType === opt.value
                      ? "2px solid #008296"
                      : "1px solid #d5d9d9",
                    backgroundColor: scopeType === opt.value
                      ? "#e0f4f7"
                      : "#ffffff",
                    cursor: readOnly ? "default" : "pointer",
                    textAlign: "left",
                    opacity: readOnly ? 0.6 : 1,
                  }}
                >
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "#0F1111" }}>
                    {opt.label}
                  </div>
                  <div style={{ fontSize: "11px", color: "#565959", marginTop: "2px" }}>
                    {opt.desc}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Row 2: Platform + Version + Group Number (for GRP) */}
          <div style={{
            display: "grid",
            gridTemplateColumns: scopeType === "GRP" ? "1fr 1fr 1fr" : "1fr 1fr",
            gap: "16px",
          }}>
            {/* Platform */}
            <div>
              <label style={{ fontSize: "12px", fontWeight: 700, color: "#565959", display: "block", marginBottom: "4px" }}>
                Platform
              </label>
              <select
                value={platform}
                onChange={(e) => handlePlatformChange(e.target.value)}
                disabled={readOnly}
                style={selectStyle}
              >
                {PLATFORM_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Version */}
            <div>
              <label style={{ fontSize: "12px", fontWeight: 700, color: "#565959", display: "block", marginBottom: "4px" }}>
                Version
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <button
                  type="button"
                  onClick={() => handleVersionChange(version - 1)}
                  disabled={readOnly || version <= 1}
                  style={{
                    ...inputStyle,
                    width: "28px",
                    height: "28px",
                    padding: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: readOnly || version <= 1 ? "default" : "pointer",
                    opacity: readOnly || version <= 1 ? 0.4 : 1,
                  }}
                >
                  −
                </button>
                <span style={{ fontSize: "14px", fontWeight: 600, fontFamily: "monospace", color: "#0F1111", minWidth: "28px", textAlign: "center" }}>
                  V{pad2(version)}
                </span>
                <button
                  type="button"
                  onClick={() => handleVersionChange(version + 1)}
                  disabled={readOnly || version >= 99}
                  style={{
                    ...inputStyle,
                    width: "28px",
                    height: "28px",
                    padding: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: readOnly || version >= 99 ? "default" : "pointer",
                    opacity: readOnly || version >= 99 ? 0.4 : 1,
                  }}
                >
                  +
                </button>
              </div>
            </div>

            {/* Group Number (only for GRP scope) */}
            {scopeType === "GRP" && (
              <div>
                <label style={{ fontSize: "12px", fontWeight: 700, color: "#565959", display: "block", marginBottom: "4px" }}>
                  Group #
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <button
                    type="button"
                    onClick={() => handleGroupNumberChange(groupNumber - 1)}
                    disabled={readOnly || groupNumber <= 1}
                    style={{
                      ...inputStyle,
                      width: "28px",
                      height: "28px",
                      padding: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: readOnly || groupNumber <= 1 ? "default" : "pointer",
                      opacity: readOnly || groupNumber <= 1 ? 0.4 : 1,
                    }}
                  >
                    −
                  </button>
                  <span style={{ fontSize: "14px", fontWeight: 600, fontFamily: "monospace", color: "#0F1111", minWidth: "28px", textAlign: "center" }}>
                    G{pad2(groupNumber)}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleGroupNumberChange(groupNumber + 1)}
                    disabled={readOnly || groupNumber >= 99}
                    style={{
                      ...inputStyle,
                      width: "28px",
                      height: "28px",
                      padding: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: readOnly || groupNumber >= 99 ? "default" : "pointer",
                      opacity: readOnly || groupNumber >= 99 ? 0.4 : 1,
                    }}
                  >
                    +
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Row 3: ASIN selection (for GRP/VAR scope) */}
          {(scopeType === "GRP" || scopeType === "VAR") && (
            <div>
              <label style={{ fontSize: "12px", fontWeight: 700, color: "#565959", display: "block", marginBottom: "6px" }}>
                {scopeType === "VAR" ? "Covered ASINs (all in variation)" : "Select ASINs in this group"}
              </label>
              {siblings.length === 0 ? (
                <p style={{ fontSize: "12px", color: "#888c8c", fontStyle: "italic" }}>
                  No sibling ASINs found. This product may not be part of a variation family.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "4px", maxHeight: "200px", overflowY: "auto" }}>
                  {siblings.map((sib) => {
                    const isChecked = scopeType === "VAR" || coveredAsins.includes(sib.asin);
                    return (
                      <label
                        key={sib.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          padding: "4px 8px",
                          borderRadius: "4px",
                          backgroundColor: isChecked ? "#e0f4f7" : "#f7f8fa",
                          border: isChecked ? "1px solid #008296" : "1px solid #e7e7e7",
                          cursor: scopeType === "VAR" || readOnly ? "default" : "pointer",
                          opacity: readOnly ? 0.6 : 1,
                          fontSize: "12px",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={scopeType === "VAR" || readOnly}
                          onChange={() => toggleCoveredAsin(sib.asin)}
                          style={{ accentColor: "#008296" }}
                        />
                        <span style={{ fontFamily: "monospace", fontWeight: 600, color: "#0F1111", minWidth: "100px" }}>
                          {sib.asin}
                        </span>
                        <span style={{ color: "#565959", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {sib.itemName ?? "—"}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Row 4: Folder + file preview */}
          <div style={{
            backgroundColor: "#f7f8fa",
            borderRadius: "4px",
            padding: "8px 12px",
            fontSize: "12px",
            fontFamily: "monospace",
            color: "#565959",
          }}>
            <div style={{ fontWeight: 700, marginBottom: "4px", fontFamily: "inherit", color: "#0F1111" }}>
              Drive folder path:
            </div>
            <div>{folderPreview}</div>
            <div style={{ fontWeight: 700, marginTop: "8px", marginBottom: "4px", fontFamily: "inherit", color: "#0F1111" }}>
              File naming example:
            </div>
            <div>
              {productClientIdCode}_{scopeLabel}_M1_PFI_MAIN_DV_IMG.png
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
