/* eslint-disable react-doctor/prefer-useReducer */
/* eslint-disable jsx-a11y/label-has-associated-control */
"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface SubmitProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientParam?: string;
  onSubmitted?: () => void;
}

export function SubmitProductDialog({
  open,
  onOpenChange,
  clientParam,
  onSubmitted,
}: SubmitProductDialogProps) {
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [sku, setSku] = useState("");
  const [upc, setUpc] = useState("");
  const [flavor, setFlavor] = useState("");
  const [size, setSize] = useState("");
  const [ingredients, setIngredients] = useState("");
  const [notes, setNotes] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const params = clientParam ? `?${clientParam}` : "";
      const res = await fetch(`/api/portal/products${params}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          sku: sku.trim(),
          upc: upc.trim() || undefined,
          flavor: flavor.trim() || undefined,
          size: size.trim() || undefined,
          ingredients: ingredients.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to submit product");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Product submitted! Our team will review it shortly.");
      queryClient.invalidateQueries({ queryKey: ["portal-products"] });
      resetState();
      onOpenChange(false);
      onSubmitted?.();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  function resetState() {
    setTitle("");
    setSku("");
    setUpc("");
    setFlavor("");
    setSize("");
    setIngredients("");
    setNotes("");
  }

  function handleOpenChange(open: boolean) {
    if (!open) resetState();
    onOpenChange(open);
  }

  const canSubmit = title.trim() && sku.trim() && !mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Submit New Product</DialogTitle>
          <DialogDescription>
            Enter your product details. Our team will review and complete the
            listing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Product Title <span className="text-red-500">*</span>
            </label>
            <Input
              placeholder="e.g. Organic Green Tea 16oz"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              SKU <span className="text-red-500">*</span>
            </label>
            <Input
              placeholder="e.g. OGT-16OZ-001"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">UPC / EAN</label>
            <Input
              placeholder="e.g. 012345678901"
              value={upc}
              onChange={(e) => setUpc(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Flavor / Color / Style</label>
              <Input
                placeholder="e.g. Mint"
                value={flavor}
                onChange={(e) => setFlavor(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Size</label>
              <Input
                placeholder="e.g. 16 oz"
                value={size}
                onChange={(e) => setSize(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Ingredients</label>
            <Textarea
              placeholder="List key ingredients…"
              value={ingredients}
              onChange={(e) => setIngredients(e.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Notes to Team</label>
            <Textarea
              placeholder="Anything else we should know…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!canSubmit}
            onClick={() => mutation.mutate()}
            className="bg-brand-solid text-white hover:bg-brand-solid-hover"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="size-4 mr-1 animate-spin" />
                Submitting…
              </>
            ) : (
              "Submit Product"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
