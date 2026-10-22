"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ClientEntry = { clientIdCode: string; count: number; activeCount: number };

const MARKETPLACES = [
  "amazon.com",
  "amazon.ca",
  "amazon.co.uk",
  "amazon.de",
  "amazon.co.jp",
] as const;

interface CreateProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateProductDialog({
  open,
  onOpenChange,
}: CreateProductDialogProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [clientIdCode, setClientIdCode] = useState("");
  const [asin, setAsin] = useState("");
  const [sku, setSku] = useState("");
  const [title, setTitle] = useState("");
  const [marketplace, setMarketplace] = useState("");

  const { data: clients = [] } = useQuery<ClientEntry[]>({
    queryKey: ["clients"],
    queryFn: async () => {
      const res = await fetch("/api/clients");
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asin,
          sku,
          clientIdCode,
          marketplace,
          itemName: title.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create product");
      }
      return res.json() as Promise<{ id: string }>;
    },
    onSuccess: (data) => {
      toast.success("Product created");
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      resetState();
      onOpenChange(false);
      router.push(`/products/${data.id}`);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  function resetState() {
    setClientIdCode("");
    setAsin("");
    setSku("");
    setTitle("");
    setMarketplace("");
  }

  function handleOpenChange(open: boolean) {
    if (!open) resetState();
    onOpenChange(open);
  }

  const asinValid = asin.trim().length === 10;
  const canSubmit =
    asinValid &&
    sku.trim() &&
    title.trim() &&
    clientIdCode &&
    marketplace &&
    !mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Product</DialogTitle>
          <DialogDescription>
            Enter the minimum fields to create a product. You can fill in the
            rest on the detail page.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Client</label>
            <Select value={clientIdCode} onValueChange={setClientIdCode}>
              <SelectTrigger>
                <SelectValue placeholder="Select a client..." />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.clientIdCode} value={c.clientIdCode}>
                    {c.clientIdCode}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">ASIN</label>
            <Input
              placeholder="e.g. B0XXXXXXXXX"
              value={asin}
              maxLength={10}
              onChange={(e) => setAsin(e.target.value.toUpperCase())}
            />
            {asin && asin.trim().length !== 10 && (
              <p className="text-xs text-red-500">ASIN must be exactly 10 characters ({asin.trim().length}/10)</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">SKU</label>
            <Input
              placeholder="e.g. MY-SKU-001"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Title</label>
            <Input
              placeholder="e.g. Organic Green Tea 16oz"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Marketplace</label>
            <Select value={marketplace} onValueChange={setMarketplace}>
              <SelectTrigger>
                <SelectValue placeholder="Select marketplace..." />
              </SelectTrigger>
              <SelectContent>
                {MARKETPLACES.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Product"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
