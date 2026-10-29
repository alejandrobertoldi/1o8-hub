/* eslint-disable react-doctor/react-compiler-destructure-method */
/* eslint-disable react-doctor/no-cascading-set-state */
/* eslint-disable react-doctor/prefer-useReducer */
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KpiSelect } from "./main-kpis";
import { MAIN_KPI_SHEET_FIELD, MAIN_KPIS_FIELD, kpiLabel, kpisSheetText, serializeClientKpis, type ClientKpi } from "@/lib/clients/kpis";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, X } from "lucide-react";

export interface ClientEditData {
  clientIdCode: string;
  clientName: string;
  clientStatus: string;
  clientType: "AIA" | "NTA" | null;
  offboardingDate?: string;
}

/**
 * Read an error message from a failed Response without assuming a JSON body.
 * A crashed route (e.g. 500) often returns an empty or non-JSON body; calling
 * res.json() on that throws "Unexpected end of JSON input" and masks the real
 * status. Fall back to the JSON `error` field, then raw text, then status.
 */
async function errorMessage(res: Response, fallback: string): Promise<string> {
  const text = await res.text().catch(() => "");
  if (text) {
    try {
      const data = JSON.parse(text);
      if (data?.error) return data.error;
    } catch {
      return `${fallback} (${res.status} ${res.statusText}): ${text.slice(0, 200)}`;
    }
  }
  return `${fallback} (${res.status} ${res.statusText || "server error"})`;
}

interface NewClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided, dialog opens in edit mode */
  editData?: ClientEditData;
}

export function NewClientDialog({ open, onOpenChange, editData }: NewClientDialogProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isEditMode = !!editData;

  const [clientIdCode, setClientIdCode] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientStatus, setClientStatus] = useState("Active");
  const [clientType, setClientType] = useState<"AIA" | "NTA">("AIA");
  const [offboardingDate, setOffboardingDate] = useState("");
  const [kpis, setKpis] = useState<ClientKpi[]>([]);
  const [shopifyStore, setShopifyStore] = useState("");
  const [error, setError] = useState("");

  // Populate form when editData changes
  useEffect(() => {
    if (editData && open) {
      setClientIdCode(editData.clientIdCode);
      setClientName(editData.clientName || "");
      setClientStatus(editData.clientStatus || "Active");
      setClientType(editData.clientType ?? "AIA");
      setOffboardingDate(editData.offboardingDate || "");
      setError("");
    }
  }, [editData, open]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (isEditMode) {
        const res = await fetch(`/api/clients/${encodeURIComponent(editData.clientIdCode)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientName,
            clientStatus,
            clientType,
            ...(clientStatus === "Inactive" ? { offboardingDate } : {}),
          }),
        });
        if (!res.ok) {
          throw new Error(await errorMessage(res, "Failed to update client"));
        }
        return res.json();
      }
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientIdCode,
          clientName,
          clientStatus,
          clientType,
          ...(clientStatus === "Inactive" ? { offboardingDate } : {}),
        }),
      });
      if (!res.ok) {
        throw new Error(await errorMessage(res, "Failed to create client"));
      }
      const created = await res.json();
      // Main KPIs and the Shopify store go through the regular field save, so
      // the AAC sheet gets the KPI list like any other edit.
      const fields: [string, string][] = [];
      if (kpis.length) fields.push([MAIN_KPIS_FIELD, serializeClientKpis(kpis)], [MAIN_KPI_SHEET_FIELD, kpisSheetText(kpis)]);
      if (shopifyStore.trim()) fields.push(["ShopifyStore", shopifyStore.trim()]);
      for (const [field, value] of fields) {
        await fetch(`/api/clients/${encodeURIComponent(created.clientIdCode ?? clientIdCode)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ field, value }),
        });
      }
      return created;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      if (isEditMode) {
        queryClient.invalidateQueries({ queryKey: ["onboarding", editData.clientIdCode] });
      }
      onOpenChange(false);
      resetForm();
      if (!isEditMode) {
        router.push(`/clients/${data.clientIdCode}/onboarding`);
      }
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  function resetForm() {
    setClientIdCode("");
    setClientName("");
    setClientStatus("Active");
    setClientType("AIA");
    setKpis([]);
    setShopifyStore("");
    setOffboardingDate("");
    setError("");
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetForm();
    onOpenChange(next);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!clientIdCode.trim()) {
      setError("Client ID Code is required");
      return;
    }
    if (clientStatus === "Inactive" && !offboardingDate.trim()) {
      setError("An offboarding date is required to mark a client Inactive.");
      return;
    }
    mutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Edit Client" : "New Client"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="clientIdCode">
              Client ID Code <span className="text-destructive">*</span>
            </Label>
            <Input
              id="clientIdCode"
              placeholder="e.g. BRA_SC_US"
              value={clientIdCode}
              onChange={(e) => setClientIdCode(e.target.value)}
              disabled={mutation.isPending || isEditMode}
              className={isEditMode ? "opacity-60" : ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="clientName">Client Name</Label>
            <Input
              id="clientName"
              placeholder="e.g. Brand Name"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              disabled={mutation.isPending}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={clientStatus}
                onValueChange={setClientStatus}
                disabled={mutation.isPending}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">
                    <span className="text-emerald-500 font-medium">Active</span>
                  </SelectItem>
                  <SelectItem value="Prospect">
                    <span className="text-brand font-medium">Prospect</span>
                  </SelectItem>
                  <SelectItem value="Inactive">
                    <span className="text-red-500 font-medium">Inactive</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Template</Label>
              <Select
                value={clientType}
                onValueChange={(v) => setClientType(v as "AIA" | "NTA")}
                disabled={mutation.isPending}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AIA">AIA</SelectItem>
                  <SelectItem value="NTA">NTA</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {clientStatus === "Inactive" && (
            <div className="space-y-2">
              <Label>
                Offboarding date <span className="text-destructive">*</span>
              </Label>
              <DatePicker
                value={offboardingDate}
                onChange={setOffboardingDate}
                placeholder="Select a date"
                className={`h-9 w-full max-w-[180px] text-sm ${
                  offboardingDate
                    ? ""
                    : "border-amber-500/60 text-amber-500 hover:border-amber-500"
                }`}
              />
            </div>
          )}
          {!isEditMode && (
            <div className="space-y-2">
              <Label>Main KPIs</Label>
              {kpis.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {kpis.map((k, i) => (
                    <span key={k.key} className="inline-flex items-center gap-1 rounded-full border border-brand/30 bg-brand/10 px-2 py-0.5 text-xs">
                      {i + 1}. {kpiLabel(k)}
                      <button type="button" aria-label={`Remove ${kpiLabel(k)}`} onClick={() => setKpis(kpis.filter((_, j) => j !== i))}>
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <KpiSelect exclude={kpis.map((k) => k.key)} onPick={(key) => key !== "custom" && setKpis([...kpis, { key }])} />
              <p className="text-xs text-muted-foreground">Targets and notes can be added on the client&apos;s profile.</p>
            </div>
          )}
          {!isEditMode && (
            <div className="space-y-2">
              <Label htmlFor="shopifyStore">Shopify store</Label>
              <Input id="shopifyStore" value={shopifyStore} onChange={(e) => setShopifyStore(e.target.value)} placeholder="brand.myshopify.com" />
            </div>
          )}
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={mutation.isPending || (clientStatus === "Inactive" && !offboardingDate.trim())}
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="size-4 mr-1 animate-spin" />
                  {isEditMode ? "Saving…" : "Creating…"}
                </>
              ) : isEditMode ? (
                "Save Changes"
              ) : (
                "Create Client"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
