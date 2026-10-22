"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AplusModuleCard, SetConfigCtx } from "./aplus-module-card";
import { ModuleTypePicker } from "./module-type-picker";
import { AplusSetConfig, type SetConfig } from "./aplus-set-config";
import type { AplusModuleWithImages, AplusStatus } from "./module-card-types";
import { STATUS_OPTIONS } from "./module-card-types";
import type { AplusModuleType } from "@/lib/aplus-module-specs";

interface AplusEditorProps {
  productId: string;
  userRole: string;
}

interface AplusApiResponse {
  product: {
    id: string;
    name: string;
    asin: string;
    clientIdCode: string;
    marketplace?: string | null;
  };
  modules: AplusModuleWithImages[];
  setConfig?: SetConfig;
}

const MAX_SLOTS = 7;

// ─── Sortable wrapper ───────────────────────────────────────────────────────
function SortableModuleCard({
  module,
  productId,
  readOnly,
  onDelete,
  productClientIdCode,
  productAsin,
  productName,
  productMarketplace,
}: {
  module: AplusModuleWithImages;
  productId: string;
  readOnly: boolean;
  onDelete: () => void;
  productClientIdCode?: string | null;
  productAsin?: string | null;
  productName?: string | null;
  productMarketplace?: string | null;
}) {

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: module.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <AplusModuleCard
      module={module}
      productId={productId}
      readOnly={readOnly}
      onDelete={onDelete}
      productClientIdCode={productClientIdCode}
      productAsin={productAsin}
      productName={productName}
      productMarketplace={productMarketplace}
      sortableProps={{
        attributes: attributes as unknown as Record<string, unknown>,
        listeners: listeners as unknown as Record<string, unknown>,
        setNodeRef,
        style,
      }}
    />
  );
}

// ─── Empty slot placeholder ─────────────────────────────────────────────────
function EmptySlot({
  slotNumber,
  readOnly,
  onAdd,
}: {
  slotNumber: number;
  readOnly: boolean;
  onAdd: (slotNumber: number) => void;
}) {
  return (
    <div className="rounded-lg border-2 border-dashed border-border/50 bg-muted/10 p-6 flex flex-col items-center justify-center gap-3 min-h-[100px]">
      <span className="text-sm text-muted-foreground/60 font-medium">
        Module {slotNumber}
      </span>
      {!readOnly && (
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => onAdd(slotNumber)}
        >
          <Plus className="size-4" />
          Add Module
        </Button>
      )}
      {readOnly && (
        <span className="text-xs text-muted-foreground/40 italic">Empty slot</span>
      )}
    </div>
  );
}

// ─── Main editor ─────────────────────────────────────────────────────────────
export function AplusEditor({ productId, userRole }: AplusEditorProps) {
  const queryClient = useQueryClient();
  const readOnly = userRole === "viewer";

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSlot, setPickerSlot] = useState<number>(1);

  const { data, isLoading, isError } = useQuery<AplusApiResponse>({
    queryKey: ["aplus-modules", productId],
    queryFn: async () => {
      const res = await fetch(`/api/aplus/${productId}`);
      if (!res.ok) throw new Error("Failed to load A+ modules");
      return res.json();
    },
    refetchOnWindowFocus: true,
  });

  const modules = data?.modules ?? [];
  const product = data?.product;

  // ── Sensors ──────────────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // ── Reorder mutation ──────────────────────────────────────────────────────
  const reorderMutation = useMutation({
    mutationFn: async (order: Array<{ id: string; moduleNumber: number }>) => {
      const res = await fetch(`/api/aplus/${productId}/reorder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order }),
      });
      if (!res.ok) throw new Error("Failed to reorder modules");
      return res.json();
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ["aplus-modules", productId] });
      toast.error("Reorder failed — reverted to previous order");
    },
  });

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = modules.findIndex((m) => m.id === active.id);
      const newIndex = modules.findIndex((m) => m.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(modules, oldIndex, newIndex).map((m, i) => ({
        ...m,
        moduleNumber: i + 1,
      }));

      // Optimistic update
      queryClient.setQueryData<AplusApiResponse>(
        ["aplus-modules", productId],
        (prev) => prev ? { ...prev, modules: reordered } : prev
      );

      // Persist
      reorderMutation.mutate(
        reordered.map((m) => ({ id: m.id, moduleNumber: m.moduleNumber }))
      );
    },
    [modules, productId, queryClient, reorderMutation]
  );

  // ── Create module mutation ────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async ({
      moduleType,
      moduleNumber,
    }: {
      moduleType: AplusModuleType;
      moduleNumber: number;
    }) => {
      const res = await fetch(`/api/aplus/${productId}/modules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleType, moduleNumber }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create module");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["aplus-modules", productId] });
      toast.success("Module created");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to create module");
    },
  });

  // ── Bulk status mutation ─────────────────────────────────────────────────
  const bulkStatusMutation = useMutation({
    mutationFn: async (status: AplusStatus) => {
      const res = await fetch(`/api/aplus/${productId}/bulk-status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to bulk update status");
      return res.json();
    },
    onSuccess: (_data, status) => {
      queryClient.invalidateQueries({ queryKey: ["aplus-modules", productId] });
      toast.success(`All modules set to ${status.replace(/_/g, " ")}`);
    },
    onError: () => {
      toast.error("Failed to update module statuses");
    },
  });

  const handleOpenPicker = (slotNumber: number) => {
    setPickerSlot(slotNumber);
    setPickerOpen(true);
  };

  const handleTypeSelect = (type: AplusModuleType) => {
    createMutation.mutate({ moduleType: type, moduleNumber: pickerSlot });
  };

  // ── Rollup counts ──────────────────────────────────────────────────────────
  const approvedCount = modules.filter((m) => m.status === "approved").length;
  const filledCount = modules.length;

  // ── 7-slot layout ─────────────────────────────────────────────────────────
  const slots = Array.from({ length: MAX_SLOTS }, (_, i) => i + 1);
  // Build a map: moduleNumber -> module
  const moduleByNumber = new Map<number, AplusModuleWithImages>();
  for (const m of modules) {
    moduleByNumber.set(m.moduleNumber, m);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <p className="text-sm text-red-500">Failed to load A+ modules. Please refresh.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Note: product header, status badge, bulk status, and set config
          are now in the workspace top bar (aplus-workspace.tsx). */}

      {/* 7-slot list with DnD for filled modules */}
      <SetConfigCtx.Provider value={{
        scopeType: data?.setConfig?.scopeType,
        scopeIdentifier: data?.setConfig?.scopeIdentifier,
        platform: data?.setConfig?.platform,
        version: data?.setConfig?.version,
        groupNumber: data?.setConfig?.groupNumber ?? undefined,
        parentAsin: data?.setConfig?.parentAsin ?? undefined,
        coveredAsins: data?.setConfig?.coveredAsins ?? undefined,
        clientIdCode: data?.product?.clientIdCode ?? undefined,
        asin: data?.product?.asin ?? undefined,
      }}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={modules.map((m) => m.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-4">
              {slots.map((slotNumber) => {
                const module = moduleByNumber.get(slotNumber);
                if (module) {
                  return (
                    <SortableModuleCard
                      key={module.id}
                      module={module}
                      productId={productId}
                      readOnly={readOnly}
                      productClientIdCode={product?.clientIdCode}
                      productAsin={product?.asin}
                      productName={product?.name}
                      productMarketplace={product?.marketplace}
                      onDelete={() => {
                        queryClient.invalidateQueries({
                          queryKey: ["aplus-modules", productId],
                        });
                      }}
                    />
                  );
                }
                return (
                  <EmptySlot
                    key={`empty-${slotNumber}`}
                    slotNumber={slotNumber}
                    readOnly={readOnly}
                    onAdd={handleOpenPicker}
                  />
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      </SetConfigCtx.Provider>

      {/* Module type picker dialog */}
      <ModuleTypePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={handleTypeSelect}
        slotNumber={pickerSlot}
      />
    </div>
  );
}
