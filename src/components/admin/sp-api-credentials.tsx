"use client";
/* eslint-disable react-doctor/query-mutation-missing-invalidation */
/* eslint-disable react-doctor/prefer-useReducer */
/* eslint-disable react-doctor/no-giant-component */

import { hasAdminPowers } from "@/lib/roles";
/* eslint-disable react-doctor/rendering-hydration-mismatch-time */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Pencil,
  Trash2,
  Plug,
  Loader2,
  Check,
  X,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────

interface Credential {
  id: number;
  clientIdCode: string;
  marketplaceId: string;
  sellerId: string;
  refreshTokenMasked: string;
  region: string;
  isActive: boolean;
  lastSyncAt: string | null;
  createdAt: string;
}

interface ClientEntry {
  clientIdCode: string;
  clientName: string;
}

const MARKETPLACES = [
  { id: "ATVPDKIKX0DER", label: "US", region: "na" },
  { id: "A2EUQ1WTGCTBG2", label: "CA", region: "na" },
  { id: "A1F83G8C2ARO7P", label: "UK", region: "eu" },
  { id: "A1PA6795UKMFR9", label: "DE", region: "eu" },
  { id: "A13V1IB3VIYZZH", label: "FR", region: "eu" },
  { id: "APJ6JRA9NG5V4", label: "IT", region: "eu" },
  { id: "A1RKKUPIHCS9HS", label: "ES", region: "eu" },
  { id: "A1AM78C64UM0Y8", label: "MX", region: "eu" },
] as const;

const MARKETPLACE_LABELS: Record<string, string> = {};
for (const m of MARKETPLACES) {
  MARKETPLACE_LABELS[m.id] = m.label;
}

function getRegionForMarketplace(marketplaceId: string): string {
  return MARKETPLACES.find((m) => m.id === marketplaceId)?.region ?? "na";
}

// ─── Component ──────────────────────────────────────────────────────

export function SPAPICredentials() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Credential | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Credential | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{
    id: number;
    success: boolean;
    message: string;
  } | null>(null);

  // Form state
  const [formClient, setFormClient] = useState("");
  const [formMarketplace, setFormMarketplace] = useState("");
  const [formSellerId, setFormSellerId] = useState("");
  const [formRefreshToken, setFormRefreshToken] = useState("");

  const isAdmin = hasAdminPowers(session?.user?.role);

  // ─── Queries ────────────────────────────────────────────────────

  const { data: credentials = [], isLoading } = useQuery({
    queryKey: ["sp-api-credentials"],
    queryFn: async () => {
      const res = await fetch("/api/admin/sp-api");
      if (!res.ok) throw new Error("Failed to fetch credentials");
      const data = await res.json();
      return data.credentials as Credential[];
    },
    enabled: isAdmin,
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const res = await fetch("/api/clients");
      if (!res.ok) return [];
      return res.json() as Promise<ClientEntry[]>;
    },
    staleTime: 5 * 60 * 1000,
  });

  // ─── Mutations ──────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch("/api/admin/sp-api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sp-api-credentials"] });
      toast.success("Credentials created");
      closeDialog();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch("/api/admin/sp-api", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sp-api-credentials"] });
      toast.success("Credentials updated");
      closeDialog();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch("/api/admin/sp-api", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sp-api-credentials"] });
      toast.success("Credentials deleted");
    },
    onError: () => toast.error("Failed to delete credentials"),
  });

  const testMutation = useMutation({
    mutationFn: async (id: number) => {
      setTestingId(id);
      setTestResult(null);
      const res = await fetch("/api/admin/sp-api/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error("Request failed");
      return res.json() as Promise<{ success: boolean; message: string }>;
    },
    onSuccess: (data, id) => {
      setTestResult({ id, ...data });
      setTestingId(null);
      if (data.success) {
        toast.success("Connection successful");
      } else {
        toast.error(data.message);
      }
    },
    onError: (_, id) => {
      setTestResult({ id, success: false, message: "Request failed" });
      setTestingId(null);
    },
  });

  // ─── Dialog helpers ─────────────────────────────────────────────

  function openCreate() {
    setEditing(null);
    setFormClient("");
    setFormMarketplace("");
    setFormSellerId("");
    setFormRefreshToken("");
    setDialogOpen(true);
  }

  function openEdit(cred: Credential) {
    setEditing(cred);
    setFormClient(cred.clientIdCode);
    setFormMarketplace(cred.marketplaceId);
    setFormSellerId(cred.sellerId);
    setFormRefreshToken("");
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditing(null);
  }

  function handleSave() {
    if (editing) {
      const body: Record<string, unknown> = { id: editing.id };
      if (formSellerId && formSellerId !== editing.sellerId)
        body.sellerId = formSellerId;
      if (formRefreshToken) body.refreshToken = formRefreshToken;
      updateMutation.mutate(body);
    } else {
      if (!formClient || !formMarketplace || !formSellerId || !formRefreshToken) {
        toast.error("All fields are required");
        return;
      }
      createMutation.mutate({
        clientIdCode: formClient,
        marketplaceId: formMarketplace,
        sellerId: formSellerId,
        refreshToken: formRefreshToken,
        region: getRegionForMarketplace(formMarketplace),
      });
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  // ─── Render ─────────────────────────────────────────────────────

  if (!isAdmin) {
    return <p className="text-sm text-muted-foreground">Admin access required.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground/80">
          {credentials.length} credential{credentials.length !== 1 ? "s" : ""}
        </h3>
        <Button size="sm" onClick={openCreate}>
          <Plus className="size-4 mr-1" />
          Add Credentials
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground/70">Loading…</p>
      ) : credentials.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No SP-API credentials configured yet.
        </p>
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Marketplace</TableHead>
                <TableHead>Seller ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Sync</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {credentials.map((cred) => (
                <TableRow key={cred.id}>
                  <TableCell className="font-medium">
                    {cred.clientIdCode}
                  </TableCell>
                  <TableCell>
                    {MARKETPLACE_LABELS[cred.marketplaceId] ?? cred.marketplaceId}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {cred.sellerId}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={cred.isActive ? "default" : "secondary"}
                      className={
                        cred.isActive
                          ? "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/15"
                          : ""
                      }
                    >
                      {cred.isActive ? "Active" : "Inactive"}
                    </Badge>
                    {testResult?.id === cred.id && (
                      <span className="ml-2 inline-flex items-center gap-1">
                        {testResult.success ? (
                          <Check className="size-3.5 text-emerald-500" />
                        ) : (
                          <X className="size-3.5 text-red-500" />
                        )}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {cred.lastSyncAt
                      ? new Date(cred.lastSyncAt).toLocaleDateString("en-US")
                      : "Never"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => testMutation.mutate(cred.id)}
                        disabled={testingId === cred.id}
                        title="Test Connection"
                      >
                        {testingId === cred.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Plug className="size-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(cred)}
                        title="Edit"
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteTarget(cred)}
                        title="Delete"
                      >
                        <Trash2 className="size-4 text-red-500" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit Credentials" : "Add SP-API Credentials"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Update seller ID or refresh token."
                : "Connect a client's Amazon Seller account."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Client */}
            <div className="space-y-1.5">
              <Label>Client</Label>
              {editing ? (
                <Input value={editing.clientIdCode} disabled />
              ) : (
                <Select value={formClient} onValueChange={setFormClient}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a client" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.clientIdCode} value={c.clientIdCode}>
                        {c.clientName || c.clientIdCode}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Marketplace */}
            <div className="space-y-1.5">
              <Label>Marketplace</Label>
              {editing ? (
                <Input
                  value={
                    MARKETPLACE_LABELS[editing.marketplaceId] ??
                    editing.marketplaceId
                  }
                  disabled
                />
              ) : (
                <Select
                  value={formMarketplace}
                  onValueChange={setFormMarketplace}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select marketplace" />
                  </SelectTrigger>
                  <SelectContent>
                    {MARKETPLACES.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.label} ({m.id})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Region (auto-detected) */}
            {(formMarketplace || editing) && (
              <div className="space-y-1.5">
                <Label>Region (auto-detected)</Label>
                <Input
                  value={
                    editing
                      ? editing.region
                      : getRegionForMarketplace(formMarketplace)
                  }
                  disabled
                />
              </div>
            )}

            {/* Seller ID */}
            <div className="space-y-1.5">
              <Label>Seller ID</Label>
              <Input
                value={formSellerId}
                onChange={(e) => setFormSellerId(e.target.value)}
                placeholder="A3XXXXXXXXX"
              />
            </div>

            {/* Refresh Token */}
            <div className="space-y-1.5">
              <Label>
                Refresh Token
                {editing && (
                  <span className="text-xs text-muted-foreground/70 ml-1">
                    (leave blank to keep existing)
                  </span>
                )}
              </Label>
              <Input
                type="password"
                value={formRefreshToken}
                onChange={(e) => setFormRefreshToken(e.target.value)}
                placeholder="Atzr|xxxxx…"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="size-4 mr-1 animate-spin" />}
              {editing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
        onConfirm={() => {
          if (deleteTarget) {
            deleteMutation.mutate(deleteTarget.id, {
              onSuccess: () => setDeleteTarget(null),
            });
          }
        }}
        title="Delete SP-API credentials?"
        description={deleteTarget ? (
          <>
            This will permanently delete the SP-API credentials for{" "}
            <strong className="text-foreground">{deleteTarget.clientIdCode}</strong>{" "}
            ({deleteTarget.marketplaceId}). This action cannot be undone.
          </>
        ) : null}
        pending={deleteMutation.isPending}
        confirmLabel="Delete credentials"
      />
    </div>
  );
}
