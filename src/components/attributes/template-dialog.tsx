/* eslint-disable react-doctor/prefer-useReducer */
"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ExternalLink, Loader2, FileSpreadsheet, Copy } from "lucide-react";
import { CLIENT_NAMES } from "@/lib/constants";

interface ClientEntry {
  clientIdCode: string;
  clientName: string;
}

interface CategoryDef {
  id: number;
  clientIdCode: string;
  productType: string;
}

interface TemplateDialogProps {
  defaultClient?: string;
  defaultProductType?: string;
  trigger?: React.ReactNode;
}

const SCOPE_OPTIONS = [
  { value: "gaps", label: "With gaps only" },
  { value: "all", label: "All products" },
  { value: "new", label: "New (empty)" },
] as const;

const LEVEL_OPTIONS = [
  { value: "Required", label: "Required" },
  { value: "Conditionally Required", label: "Cond. Required" },
  { value: "Essential", label: "Essential (Hub)" },
  { value: "Key", label: "Key" },
  { value: "Recommended", label: "Recommended" },
  { value: "Optional", label: "Optional" },
] as const;

export function TemplateDialog({
  defaultClient,
  defaultProductType,
  trigger,
}: TemplateDialogProps) {
  const [open, setOpen] = useState(false);
  const [client, setClient] = useState(defaultClient || "");
  const [productType, setProductType] = useState(defaultProductType || "");
  const [scope, setScope] = useState<string>("gaps");
  const [levels, setLevels] = useState<Set<string>>(
    new Set(["Required", "Conditionally Required", "Key"])
  );
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: clients = [] } = useQuery({
    queryKey: ["clients", "active-only"],
    queryFn: async () => {
      const res = await fetch("/api/clients/list?status=Active");
      if (!res.ok) return [];
      return res.json() as Promise<ClientEntry[]>;
    },
    // Re-fetch every time the dialog opens so a freshly flipped client status
    // is reflected without waiting for the default cache window.
    staleTime: 0,
    refetchOnMount: "always",
    enabled: open,
  });

  const { data: definitions = [] } = useQuery({
    queryKey: ["category-definitions-list", client],
    queryFn: async () => {
      const res = await fetch(`/api/category-definitions?clientIdCode=${client}`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.definitions as CategoryDef[];
    },
    enabled: !!client,
  });

  const createSheetMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/attributes/template-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientIdCode: client,
          productType,
          scope,
          levels: [...levels],
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create Sheet");
      }
      return res.json() as Promise<{ request: { id: string; sheetUrl: string } }>;
    },
    onSuccess: (data) => {
      setSheetUrl(data.request.sheetUrl);
      toast.success("Sheet created");
      queryClient.invalidateQueries({ queryKey: ["template-requests"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function toggleLevel(level: string) {
    if (level === "Required") return;
    setLevels((prev) => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });
  }

  async function copyLink() {
    if (!sheetUrl) return;
    await navigator.clipboard.writeText(sheetUrl);
    toast.success("Link copied");
  }

  const canCreate = client && productType && levels.size > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setClient(defaultClient || "");
          setProductType(defaultProductType || "");
          setScope("gaps");
          setLevels(new Set(["Required", "Conditionally Required", "Key"]));
          setSheetUrl(null);
          createSheetMutation.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        {trigger || (
          <Button size="sm" variant="outline">
            <FileSpreadsheet className="size-4 mr-1.5" />
            Create Template Sheet
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Attribute Template Sheet</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Client</Label>
            <Select
              value={client}
              onValueChange={(v) => {
                setClient(v);
                setProductType("");
              }}
            >
              <SelectTrigger><SelectValue placeholder="Select client…" /></SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.clientIdCode} value={c.clientIdCode}>
                    {c.clientName && c.clientName !== c.clientIdCode
                      ? c.clientName
                      : CLIENT_NAMES[c.clientIdCode] || c.clientIdCode}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Category</Label>
            <Select value={productType} onValueChange={setProductType} disabled={!client}>
              <SelectTrigger><SelectValue placeholder="Select category…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {definitions.map((d) => (
                  <SelectItem key={d.productType} value={d.productType}>
                    {d.productType}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Products scope</Label>
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SCOPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Attribute levels</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setScope("new");
                  setLevels(new Set(["Required", "Conditionally Required", "Essential"]));
                }}
              >
                Minimum + Necessary preset
              </Button>
            </div>
            <div className="flex flex-wrap gap-3">
              {LEVEL_OPTIONS.map((l) => (
                <label key={l.value} className="flex items-center gap-1.5 text-xs">
                  <Checkbox
                    checked={levels.has(l.value)}
                    onCheckedChange={() => toggleLevel(l.value)}
                    disabled={l.value === "Required"}
                  />
                  {l.label}
                </label>
              ))}
            </div>
          </div>

          {sheetUrl && (
            <div className="rounded border bg-muted/30 p-3 text-xs flex items-center gap-2">
              <code className="flex-1 min-w-0 text-brand break-all line-clamp-2">{sheetUrl}</code>
              <Button size="sm" variant="ghost" onClick={copyLink}>
                <Copy className="size-3" />
              </Button>
              <Button size="sm" variant="ghost" asChild>
                <a href={sheetUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-3" />
                </a>
              </Button>
            </div>
          )}

          {!sheetUrl && (
            <div className="flex gap-2 pt-2">
              <Button
                onClick={() => createSheetMutation.mutate()}
                disabled={!canCreate || createSheetMutation.isPending}
                className="flex-1"
              >
                {createSheetMutation.isPending ? (
                  <Loader2 className="size-4 mr-1.5 animate-spin" />
                ) : (
                  <FileSpreadsheet className="size-4 mr-1.5" />
                )}
                Create Sheet
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
