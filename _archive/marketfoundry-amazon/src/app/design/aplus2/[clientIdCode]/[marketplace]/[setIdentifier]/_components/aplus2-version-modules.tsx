"use client";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { aplus2RenameModuleSegment } from "@/lib/aplus2/drive-naming";
import { Aplus2ModuleEditor, type ModuleDto } from "./aplus2-module-editor";

function withPositions(list: ModuleDto[]): ModuleDto[] {
  return list.map((m, i) => {
    const position = i + 1;
    return {
      ...m,
      position,
      assets: m.assets.map((a) => ({
        ...a,
        filename: aplus2RenameModuleSegment(a.filename, position),
      })),
    };
  });
}

export function Aplus2VersionModules({
  versionId,
  modules,
}: {
  versionId: string;
  modules: ModuleDto[];
}) {
  const [order, setOrder] = useState<ModuleDto[]>(() => withPositions(modules));
  const qc = useQueryClient();

  const saveMut = useMutation({
    mutationFn: async (next: ModuleDto[]) => {
      const positions = next.map((m, i) => ({ moduleId: m.id, position: i + 1 }));
      const anchor = positions[0]?.moduleId ?? "00000000-0000-0000-0000-000000000000";
      const r = await fetch(`/api/aplus2/modules/${anchor}/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positions }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Reorder failed");
      return d as { renamed: number; renameErrors?: string[] };
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["aplus2-set"] });
      const extra =
        d.renameErrors && d.renameErrors.length > 0
          ? ` (${d.renameErrors.length} Drive rename failed)`
          : "";
      toast.success(`Module numbers updated · ${d.renamed} Drive files renamed${extra}`);
    },
    onError: (err) => {
      setOrder(withPositions(modules));
      toast.error(err instanceof Error ? err.message : "Reorder failed");
    },
  });

  useEffect(() => {
    if (saveMut.isPending) return;
    setOrder(withPositions(modules));
  }, [modules, saveMut.isPending]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    if (saveMut.isPending) return;
    if (!e.over || e.over.id === e.active.id) return;
    const oldIdx = order.findIndex((m) => m.id === e.active.id);
    const newIdx = order.findIndex((m) => m.id === e.over!.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const next = withPositions(arrayMove(order, oldIdx, newIdx));
    setOrder(next);
    saveMut.mutate(next);
  };

  return (
    <div className="space-y-4">
      {saveMut.isPending && (
        <div className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          Updating module numbers and Drive files…
        </div>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={order.map((m) => m.id)}
          strategy={verticalListSortingStrategy}
        >
          {order.map((m) => (
            <SortableRow
              key={m.id}
              module={m}
              versionId={versionId}
              disabled={saveMut.isPending}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SortableRow({
  module,
  versionId,
  disabled,
}: {
  module: ModuleDto;
  versionId: string;
  disabled?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: module.id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex gap-2 items-stretch">
      <button
        {...attributes}
        {...listeners}
        type="button"
        disabled={disabled}
        className="cursor-grab active:cursor-grabbing px-1 text-muted-foreground hover:text-foreground self-start mt-3 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <GripVertical className="size-4" />
      </button>
      <div className="flex-1">
        {/* ponytail: key on server alt values so the bulk-generate refetch remounts the editor
            (useDebouncedPatch seeds local state once). Normal edits don't refetch → no mid-edit remount. */}
        <Aplus2ModuleEditor
          key={`${module.altText ?? ""}\u0001${module.mobileAltText ?? ""}\u0001${(module.items ?? []).map((it) => (it.data?.altText as string) ?? "").join("\u0001")}`}
          module={module}
          versionId={versionId}
        />
      </div>
    </div>
  );
}
