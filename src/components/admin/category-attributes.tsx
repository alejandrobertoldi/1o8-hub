"use client";
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */

import { hasAdminPowers } from "@/lib/roles";
/* eslint-disable react-doctor/rendering-hydration-mismatch-time */

import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Upload,
  Loader2,
  Trash2,
  ChevronDown,
  ChevronRight,
  Package,
  Info,
  Star,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────

interface CategoryDefinition {
  id: number;
  clientIdCode: string;
  productType: string;
  marketplaceId: string;
  totalAttributes: number;
  requiredCount: number;
  conditionalCount: number;
  optionalCount: number;
  uploadedBy: string;
  uploadedAt: string;
}

interface CategoryAttributeData {
  id: number;
  generalLabel: string;
  description: string | null;
  example: string | null;
  requirement: string | null;
  validValues: string[] | null;
  currentValue: string | null;
  isKey: boolean;
}

interface CategoryGroup {
  name: string;
  attributes: CategoryAttributeData[];
}

interface ClientEntry {
  clientIdCode: string;
  clientName: string;
}

// ─── Component ──────────────────────────────────────────────────────

export function CategoryAttributesAdmin() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const isAdmin = hasAdminPowers(session?.user?.role);
  const [selectedClient, setSelectedClient] = useState<string>("all");
  const [expandedDef, setExpandedDef] = useState<number | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);

  // ─── Queries ────────────────────────────────────────────────────

  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const res = await fetch("/api/clients");
      if (!res.ok) return [];
      return res.json() as Promise<ClientEntry[]>;
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: definitions = [], isLoading } = useQuery({
    queryKey: ["category-definitions", selectedClient],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedClient !== "all") params.set("clientIdCode", selectedClient);
      const res = await fetch(`/api/category-definitions?${params}`);
      if (!res.ok) throw new Error("Failed to fetch definitions");
      const data = await res.json();
      return data.definitions as CategoryDefinition[];
    },
    enabled: isAdmin,
  });

  // Map clientIdCode to clientName for display
  const clientNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of clients) {
      map.set(c.clientIdCode, c.clientName || c.clientIdCode);
    }
    return map;
  }, [clients]);

  // Group definitions by client
  const byClient = useMemo(() => {
    const map = new Map<string, CategoryDefinition[]>();
    for (const def of definitions) {
      const arr = map.get(def.clientIdCode) || [];
      arr.push(def);
      map.set(def.clientIdCode, arr);
    }
    return map;
  }, [definitions]);

  // ─── Upload mutation ──────────────────────────────────────────────

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadClient, setUploadClient] = useState<string>("");

  const uploadMutation = useMutation({
    mutationFn: async ({
      file,
      clientIdCode,
    }: {
      file: File;
      clientIdCode: string;
    }) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("clientIdCode", clientIdCode);
      const res = await fetch("/api/category-definitions", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      const types = data.productTypes ?? [data.productType];
      toast.success(
        `${types.join(", ")}: ${data.summary.total} attributes parsed, ${data.matchCount} matched to Hub`
      );
      queryClient.invalidateQueries({ queryKey: ["category-definitions"] });
      queryClient.invalidateQueries({ queryKey: ["category-definition"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // ─── Delete mutation ──────────────────────────────────────────────

  const deleteMutation = useMutation({
    mutationFn: async (defId: number) => {
      const res = await fetch(`/api/category-definitions/${defId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      toast.success("Category definition deleted");
      queryClient.invalidateQueries({ queryKey: ["category-definitions"] });
      queryClient.invalidateQueries({ queryKey: ["category-definition"] });
      setExpandedDef(null);
    },
    onError: () => toast.error("Failed to delete"),
  });

  function handleUploadClick(clientCode: string) {
    setUploadClient(clientCode);
    fileInputRef.current?.click();
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file && uploadClient) {
      uploadMutation.mutate({ file, clientIdCode: uploadClient });
    }
    e.target.value = "";
  }

  if (!isAdmin) {
    return (
      <p className="text-sm text-muted-foreground">Admin access required.</p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar — rendered into TopNav row 3 */}
      <PageMetaSlot>
        <div className="flex items-center justify-between gap-4 w-full">
          <h1
            className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none shrink-0"
            aria-label="Attribute Manager"
          >
            <span className="font-bold text-sidebar-foreground">Attribute</span>
            <span className="font-normal text-brand">Manager</span>
          </h1>
          <div className="flex items-center gap-2">
            <Select value={selectedClient} onValueChange={setSelectedClient}>
              <SelectTrigger className="h-8 w-[180px] text-xs">
                <SelectValue placeholder="Filter by client" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All clients</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.clientIdCode} value={c.clientIdCode}>
                    {clientNameMap.get(c.clientIdCode) || c.clientIdCode}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {definitions.length} def{definitions.length !== 1 ? "s" : ""}
            </span>
            <div className="w-px h-5 bg-sidebar-border/60 mx-1" />
            <Select
              value={uploadClient}
              onValueChange={(v) => setUploadClient(v)}
            >
              <SelectTrigger className="h-8 w-[180px] text-xs">
                <SelectValue placeholder="Select client…" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.clientIdCode} value={c.clientIdCode}>
                    {clientNameMap.get(c.clientIdCode) || c.clientIdCode}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="h-8"
              disabled={!uploadClient || uploadMutation.isPending}
              onClick={() => uploadClient && handleUploadClick(uploadClient)}
            >
              {uploadMutation.isPending ? (
                <Loader2 className="size-3.5 mr-1 animate-spin" />
              ) : (
                <Upload className="size-3.5 mr-1" />
              )}
              Upload XLSM
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsm,.xlsx"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
        </div>
      </PageMetaSlot>

      {/* Definitions list */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground/70">Loading…</p>
      ) : definitions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <Package className="size-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            No category definitions uploaded yet.
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Select a client and upload a Category Listing Report (.xlsm) from
            Amazon Seller Central.
          </p>
        </div>
      ) : selectedClient !== "all" ? (
        // Single client view — show as a flat table
        <DefinitionsTable
          definitions={definitions}
          expandedDef={expandedDef}
          onToggle={(id) => setExpandedDef(expandedDef === id ? null : id)}
          onDelete={(id) => setDeleteTargetId(id)}
          onReupload={handleUploadClick}
          isDeleting={deleteMutation.isPending}
        />
      ) : (
        // All clients view — group by client
        <div className="space-y-4">
          {[...byClient.entries()].map(([clientCode, defs]) => (
            <div key={clientCode} className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-foreground/80">
                  {clientNameMap.get(clientCode) || clientCode}
                  <span className="ml-2 text-xs text-muted-foreground font-normal">
                    {defs.length} product type{defs.length !== 1 ? "s" : ""}
                  </span>
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => handleUploadClick(clientCode)}
                  disabled={uploadMutation.isPending}
                >
                  <Upload className="size-3 mr-1" />
                  Upload
                </Button>
              </div>
              <DefinitionsTable
                definitions={defs}
                expandedDef={expandedDef}
                onToggle={(id) =>
                  setExpandedDef(expandedDef === id ? null : id)
                }
                onDelete={(id) => setDeleteTargetId(id)}
                onReupload={handleUploadClick}
                isDeleting={deleteMutation.isPending}
              />
            </div>
          ))}
        </div>
      )}

      <DeleteConfirmDialog
        open={deleteTargetId !== null}
        onOpenChange={(o) => { if (!o) setDeleteTargetId(null); }}
        onConfirm={() => {
          if (deleteTargetId !== null) {
            deleteMutation.mutate(deleteTargetId, {
              onSuccess: () => setDeleteTargetId(null),
            });
          }
        }}
        title="Delete category definition?"
        description="This will permanently delete this category definition and all of its attributes. This action cannot be undone."
        pending={deleteMutation.isPending}
        confirmLabel="Delete definition"
      />
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────

function DefinitionsTable({
  definitions,
  expandedDef,
  onToggle,
  onDelete,
  onReupload,
  isDeleting,
}: {
  definitions: CategoryDefinition[];
  expandedDef: number | null;
  onToggle: (id: number) => void;
  onDelete: (id: number) => void;
  onReupload: (clientCode: string) => void;
  isDeleting: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8" />
            <TableHead>Product Type</TableHead>
            <TableHead>Marketplace</TableHead>
            <TableHead className="text-center">Total</TableHead>
            <TableHead className="text-center">Required</TableHead>
            <TableHead className="text-center">Conditional</TableHead>
            <TableHead className="text-center">Optional</TableHead>
            <TableHead>Uploaded</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {definitions.map((def) => (
            <DefinitionRow
              key={def.id}
              def={def}
              isExpanded={expandedDef === def.id}
              onToggle={() => onToggle(def.id)}
              onDelete={() => onDelete(def.id)}
              onReupload={() => onReupload(def.clientIdCode)}
              isDeleting={isDeleting}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function DefinitionRow({
  def,
  isExpanded,
  onToggle,
  onDelete,
  onReupload,
  isDeleting,
}: {
  def: CategoryDefinition;
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onReupload: () => void;
  isDeleting: boolean;
}) {
  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-muted/30"
        onClick={onToggle}
      >
        <TableCell className="w-8 px-2">
          {isExpanded ? (
            <ChevronDown className="size-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-4 text-muted-foreground" />
          )}
        </TableCell>
        <TableCell className="font-medium">
          <Badge
            variant="outline"
            className="font-mono text-xs border-brand/30 text-brand"
          >
            {def.productType}
          </Badge>
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">
          {def.marketplaceId === "ATVPDKIKX0DER"
            ? "US"
            : def.marketplaceId}
        </TableCell>
        <TableCell className="text-center tabular-nums">
          {def.totalAttributes}
        </TableCell>
        <TableCell className="text-center">
          <span className="text-red-400 tabular-nums">
            {def.requiredCount}
          </span>
        </TableCell>
        <TableCell className="text-center">
          <span className="text-amber-400 tabular-nums">
            {def.conditionalCount}
          </span>
        </TableCell>
        <TableCell className="text-center">
          <span className="text-muted-foreground tabular-nums">
            {def.optionalCount}
          </span>
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">
          <div>{new Date(def.uploadedAt).toLocaleDateString("en-US")}</div>
          <div className="text-muted-foreground/60">{def.uploadedBy}</div>
        </TableCell>
        <TableCell className="text-right">
          <div
            className="flex items-center justify-end gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              variant="ghost"
              size="sm"
              onClick={onReupload}
              title="Re-upload"
            >
              <Upload className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              disabled={isDeleting}
              title="Delete"
            >
              <Trash2 className="size-4 text-red-500" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
      {isExpanded && (
        <TableRow>
          <TableCell colSpan={9} className="p-0">
            <ExpandedAttributes defId={def.id} def={def} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function ExpandedAttributes({
  defId,
  def,
}: {
  defId: number;
  def: CategoryDefinition;
}) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: [
      "category-definition",
      def.productType,
      def.clientIdCode,
      undefined,
      def.marketplaceId,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        clientIdCode: def.clientIdCode,
        marketplaceId: def.marketplaceId,
      });
      const res = await fetch(
        `/api/category-definitions/${encodeURIComponent(def.productType)}?${params}`
      );
      if (!res.ok) throw new Error("Failed to load attributes");
      return res.json() as Promise<{
        definition: CategoryDefinition;
        groups: CategoryGroup[];
      }>;
    },
    staleTime: 10 * 60 * 1000,
  });

  const keyToggleMutation = useMutation({
    mutationFn: async ({ attrId, isKey }: { attrId: number; isKey: boolean }) => {
      const res = await fetch(
        `/api/category-definitions/${encodeURIComponent(def.productType)}/attributes/${attrId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isKey }),
        }
      );
      if (!res.ok) throw new Error("Failed to toggle key");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["category-definition", def.productType, def.clientIdCode],
      });
    },
    onError: () => toast.error("Failed to toggle key status"),
  });

  const groups = data?.groups ?? [];
  const totalCount = useMemo(
    () => groups.reduce((sum, g) => sum + g.attributes.length, 0),
    [groups]
  );

  const keyCount = useMemo(
    () =>
      groups.reduce(
        (sum, g) => sum + g.attributes.filter((a) => a.isKey).length,
        0
      ),
    [groups]
  );

  if (isLoading) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Loading attributes…
      </div>
    );
  }

  return (
    <div className="bg-muted/10 border-t border-border p-4 space-y-3">
      {/* Summary */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="text-emerald-400">
          {totalCount} / {def.totalAttributes} canonical attributes
        </span>
        <span>
          {groups.length} groups
        </span>
        {keyCount > 0 && (
          <span className="text-purple-400">
            {keyCount} marked as Key
          </span>
        )}
      </div>

      {/* Attribute groups */}
      <div className="space-y-1">
        {groups.map((group) => (
          <AttributeGroupRow
            key={group.name}
            group={group}
            onToggleKey={(attrId, isKey) =>
              keyToggleMutation.mutate({ attrId, isKey })
            }
          />
        ))}
      </div>
    </div>
  );
}

function AttributeGroupRow({
  group,
  onToggleKey,
}: {
  group: CategoryGroup;
  onToggleKey: (attrId: number, isKey: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const keyCount = group.attributes.filter((a) => a.isKey).length;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-1.5 rounded hover:bg-muted/30 transition-colors text-left">
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="size-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3 text-muted-foreground" />
          )}
          <span className="text-sm font-medium">{group.name}</span>
          <span className="text-xs text-muted-foreground">
            ({group.attributes.length})
          </span>
          {keyCount > 0 && (
            <span className="text-xs text-purple-400">{keyCount} key</span>
          )}
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-5 border-l border-border/40 pl-3 py-1 space-y-0.5">
          {group.attributes.map((attr) => (
            <AttributeRow
              key={attr.id}
              attr={attr}
              onToggleKey={onToggleKey}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function AttributeRow({
  attr,
  onToggleKey,
}: {
  attr: CategoryAttributeData;
  onToggleKey: (attrId: number, isKey: boolean) => void;
}) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="text-xs">
      <div className="flex items-center gap-2 w-full px-2 py-1 rounded hover:bg-muted/20 transition-colors">
        <button
          type="button"
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center gap-2 flex-1 min-w-0 text-left"
        >
          <span className="flex-1 min-w-0 truncate text-foreground/80">
            {attr.generalLabel}
          </span>

          <RequirementBadge requirement={attr.requirement} />

          <Info className="size-3 text-muted-foreground/30 shrink-0" />
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleKey(attr.id, !attr.isKey);
          }}
          className={`shrink-0 p-1 rounded transition-all ${
            attr.isKey
              ? "text-purple-400 hover:text-purple-300"
              : "text-muted-foreground/20 hover:text-purple-400/50"
          }`}
          title={attr.isKey ? "Remove Key flag" : "Mark as Key"}
        >
          <Star className={`size-3 ${attr.isKey ? "fill-current" : ""}`} />
        </button>
      </div>

      {showDetails && (
        <div className="ml-4 p-2 space-y-1.5 text-muted-foreground bg-muted/10 rounded mb-1">
          {attr.description && (
            <p>
              <span className="font-medium text-foreground/60">Desc: </span>
              {attr.description}
            </p>
          )}
          {attr.example && (
            <p>
              <span className="font-medium text-foreground/60">Example: </span>
              <span className="font-mono">{attr.example}</span>
            </p>
          )}
          {attr.validValues && attr.validValues.length > 0 && (
            <div>
              <span className="font-medium text-foreground/60">
                Valid values ({attr.validValues.length}):
              </span>
              <div className="mt-1 max-h-24 overflow-y-auto flex flex-wrap gap-1">
                {attr.validValues.map((v) => (
                  <span
                    key={v}
                    className="inline-block px-1.5 py-0.5 bg-muted rounded text-[10px]"
                  >
                    {v}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RequirementBadge({ requirement }: { requirement: string | null }) {
  switch (requirement) {
    case "Required":
      return (
        <Badge
          variant="outline"
          className="text-[10px] px-1.5 py-0 border-red-500/50 text-red-400 shrink-0"
        >
          Required
        </Badge>
      );
    case "Conditionally Required":
      return (
        <Badge
          variant="outline"
          className="text-[10px] px-1.5 py-0 border-amber-500/50 text-amber-400 shrink-0"
        >
          Conditional
        </Badge>
      );
    case "Recommended":
      return (
        <Badge
          variant="outline"
          className="text-[10px] px-1.5 py-0 border-blue-500/50 text-blue-400 shrink-0"
        >
          Recommended
        </Badge>
      );
    default:
      return (
        <Badge
          variant="outline"
          className="text-[10px] px-1.5 py-0 border-border text-muted-foreground shrink-0"
        >
          Optional
        </Badge>
      );
  }
}
