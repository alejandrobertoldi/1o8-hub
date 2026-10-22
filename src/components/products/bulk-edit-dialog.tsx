"use client";

import { useState, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronsUpDown, Check, Loader2, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useColumnAttributes } from "@/hooks/use-column-attributes";
import { inferFieldType } from "@/lib/column-utils";
import type { ColumnAttribute } from "@/lib/db/schema";

interface BulkEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIds: Set<string>;
  onSuccess: () => void;
  clientFilter?: string;
}

export function BulkEditDialog({
  open,
  onOpenChange,
  selectedIds,
  onSuccess,
  clientFilter,
}: BulkEditDialogProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedAttr, setSelectedAttr] = useState<ColumnAttribute | null>(
    null
  );
  const [newValue, setNewValue] = useState("");
  const fieldListId = "bulk-edit-field-list";

  const { groups, isLoading: attrsLoading } = useColumnAttributes(
    clientFilter || undefined
  );

  // Flatten groups into a structure for the picker
  const fieldOptions = useMemo(() => {
    const result: { group: string; attrs: ColumnAttribute[] }[] = [];
    for (const group of groups) {
      const attrs: ColumnAttribute[] = [];
      for (const subgroup of group.subgroups) {
        attrs.push(...subgroup.attributes);
      }
      if (attrs.length > 0) {
        result.push({ group: group.name, attrs });
      }
    }
    return result;
  }, [groups]);

  const fieldType = selectedAttr ? inferFieldType(selectedAttr) : "text";
  const count = selectedIds.size;

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/products/bulk", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productIds: Array.from(selectedIds),
          field: selectedAttr!.generalLabel,
          bqName: selectedAttr!.bqLabel,
          value: newValue,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Bulk edit failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(`Updated ${data.updated} products`);
      if (data.failed > 0) {
        toast.warning(`${data.failed} products failed to update`);
      }
      resetState();
      onSuccess();
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  function resetState() {
    setSelectedAttr(null);
    setNewValue("");
    setPickerOpen(false);
  }

  function handleOpenChange(open: boolean) {
    if (!open) resetState();
    onOpenChange(open);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Bulk Edit &mdash; {count} product{count !== 1 ? "s" : ""}
          </DialogTitle>
          <DialogDescription>
            Select a field and enter the new value to apply to all selected
            products.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Field Picker */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Field</label>
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={pickerOpen}
                  aria-controls={fieldListId}
                  className="w-full justify-between font-normal"
                >
                  {selectedAttr
                    ? selectedAttr.generalLabel
                    : "Select a field..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0" align="start">
                <Command>
                  <CommandInput
                    placeholder="Search fields..."
                  />
                  <CommandList id={fieldListId}>
                    <CommandEmpty>
                      {attrsLoading ? "Loading..." : "No fields found."}
                    </CommandEmpty>
                    {fieldOptions.map((group) => (
                      <CommandGroup key={group.group} heading={group.group}>
                        {group.attrs.map((attr) => (
                          <CommandItem
                            key={attr.id}
                            value={attr.generalLabel}
                            onSelect={() => {
                              setSelectedAttr(attr);
                              setNewValue("");
                              setPickerOpen(false);
                            }}
                          >
                            <Check
                              className={`mr-2 h-4 w-4 ${
                                selectedAttr?.id === attr.id
                                  ? "opacity-100"
                                  : "opacity-0"
                              }`}
                            />
                            <span className="truncate">
                              {attr.generalLabel}
                            </span>
                            {attr.bqLabel &&
                              attr.bqLabel !== attr.generalLabel && (
                                <span className="ml-auto text-xs text-muted-foreground truncate">
                                  {attr.bqLabel}
                                </span>
                              )}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Value Input */}
          {selectedAttr && (
            <div className="space-y-2">
              <label className="text-sm font-medium">New Value</label>
              {fieldType === "textarea" ? (
                <Textarea
                  placeholder={`Enter new ${selectedAttr.generalLabel}...`}
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  rows={3}
                />
              ) : (
                <Input
                  type={fieldType === "url" ? "url" : fieldType === "number" ? "number" : "text"}
                  placeholder={`Enter new ${selectedAttr.generalLabel}...`}
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                />
              )}
            </div>
          )}

          {/* Warning */}
          {selectedAttr && (
            <div className="flex items-start gap-2 rounded-md border border-brand/30 bg-brand/10 p-3 text-sm text-brand">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                This will overwrite the current value of{" "}
                <strong>{selectedAttr.generalLabel}</strong> on{" "}
                <strong>{count}</strong> product{count !== 1 ? "s" : ""}. This
                cannot be undone.
              </span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!selectedAttr || mutation.isPending}
            onClick={() => mutation.mutate()}
            className="bg-brand-solid text-white hover:bg-brand-solid-hover"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Applying...
              </>
            ) : (
              `Apply to ${count} Product${count !== 1 ? "s" : ""}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
