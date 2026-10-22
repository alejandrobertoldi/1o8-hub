"use client";
import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Aplus2ImageSlot } from "./aplus2-image-slot";
import { Aplus2TextField } from "./aplus2-text-field";
import type { Aplus2ModuleSpec } from "@/lib/aplus2/module-specs";

type ItemDto = { id: string; position: number; data: Record<string, unknown> };
type AssetDto = { id: string; slotKey: string; variant: "desktop" | "mobile"; driveFileId: string; filename: string; moduleId: string | null; moduleItemId: string | null };

export function Aplus2RepeatableItems({
  spec, items, assets, versionId, moduleId,
}: {
  spec: Aplus2ModuleSpec;
  items: ItemDto[];
  assets: AssetDto[];
  versionId: string;
  moduleId: string;
}) {
  const group = spec.repeatableGroup;
  const qc = useQueryClient();

  const addMut = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/aplus2/modules/${moduleId}/items`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed");
      return d;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["aplus2-set"] }),
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed"),
  });

  if (!group) return null;

  const sorted = [...items].sort((a, b) => a.position - b.position);

  return (
    <div className="space-y-3 mt-3">
      <div className="flex items-center justify-between">
        <div className="inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-brand/10 px-3 text-[13px] font-medium leading-none text-brand">
          {group.label} ({sorted.length}/{group.maxItems})
        </div>
        {sorted.length < group.maxItems && (
          <Button size="sm" variant="outline" className="h-9 rounded-full px-3 text-[13px] font-medium" onClick={() => addMut.mutate()} disabled={addMut.isPending}>
            <Plus className="size-3.5 mr-1" strokeWidth={1.75} /> Add {group.itemLabel}
          </Button>
        )}
      </div>
      {sorted.map((item) => (
        <RepeatableItemCard
          key={item.id}
          spec={spec}
          item={item}
          assets={assets.filter((a) => a.moduleItemId === item.id)}
          versionId={versionId}
          moduleId={moduleId}
          canRemove={sorted.length > group.minItems}
        />
      ))}
    </div>
  );
}

function RepeatableItemCard({
  spec, item, assets, versionId, moduleId, canRemove,
}: {
  spec: Aplus2ModuleSpec;
  item: ItemDto;
  assets: AssetDto[];
  versionId: string;
  moduleId: string;
  canRemove: boolean;
}) {
  const group = spec.repeatableGroup!;
  const [local, setLocal] = useState<Record<string, unknown>>(item.data);
  const localRef = useRef(local);
  localRef.current = local;
  const lastPersisted = useRef(item.data);
  const qc = useQueryClient();

  const deleteMut = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/aplus2/items/${item.id}`, { method: "DELETE" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as {error?:string}).error ?? "Failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["aplus2-set"] }),
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed"),
  });

  const patchMut = useMutation({
    mutationFn: async (next: Record<string, unknown>) => {
      const payload = { type: group.itemDataType, ...next };
      const r = await fetch(`/api/aplus2/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: payload }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Failed");
      return d;
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["aplus2-set"] }),
  });

  const persist = (next: Record<string, unknown>) => {
    localRef.current = next;
    lastPersisted.current = next;
    setLocal(next);
    patchMut.mutate(next);
  };

  const onBlur = (key: string, value: string) => {
    persist({ ...localRef.current, [key]: value });
  };

  const onAltChange = (value: string) => {
    const next = { ...localRef.current, altText: value, mobileAltText: value };
    localRef.current = next;
    setLocal(next);
  };

  const onAltCommit = (value: string) => {
    if (lastPersisted.current.altText === value && lastPersisted.current.mobileAltText === value) return;
    persist({ ...localRef.current, altText: value, mobileAltText: value });
  };

  return (
    <div className="rounded-[23px] border border-stone-200 dark:border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between p-[5px]">
        <div className="inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-brand/10 px-3 text-[13px] font-mono font-bold leading-none text-brand">{group.itemLabel} {item.position}</div>
        {canRemove && (
          <Button size="sm" className="h-9 w-9 p-0 rounded-full border-0 bg-brand-red text-white hover:bg-brand-red/90" onClick={() => deleteMut.mutate()} disabled={deleteMut.isPending} aria-label={`Remove ${group.itemLabel} ${item.position}`}>
            <Trash2 className="size-3.5" strokeWidth={1.75} />
          </Button>
        )}
      </div>
      <div className="p-3 pt-0">
      {group.image ? (
        <div className="grid grid-cols-2 gap-6">
          {/* Left: image + per-variant alt text below each thumbnail */}
          <div>
            <Aplus2ImageSlot
              spec={{
                key: group.image.key,
                label: group.image.label,
                desktopSize: group.image.desktopSize,
                mobileSize: group.image.mobileSize,
              }}
              assets={assets}
              versionId={versionId}
              moduleId={moduleId}
              moduleItemId={item.id}
              altText={(local["altText"] as string | undefined) ?? ""}
              onAltTextChange={onAltChange}
              onAltTextCommit={onAltCommit}
            />
          </div>
          {/* Right: text fields (excluding alt text fields — rendered with images) */}
          <div className="space-y-3">
            {group.fields.filter((f) => f.key !== "altText" && f.key !== "mobileAltText").map((f) => (
              <Aplus2TextField
                key={f.key}
                label={f.label}
                initialValue={(local[f.key] as string | undefined) ?? ""}
                onCommit={(value) => onBlur(f.key, value)}
                maxLength={f.maxLength}
                multiline={f.multiline}
                rows={f.rows}
                placeholder={f.hint}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {group.fields.map((f) => (
            <Aplus2TextField
              key={f.key}
              label={f.label}
              initialValue={(local[f.key] as string | undefined) ?? ""}
              onCommit={(value) => onBlur(f.key, value)}
              maxLength={f.maxLength}
              multiline={f.multiline}
              rows={f.rows}
              placeholder={f.hint}
            />
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
