/* eslint-disable react-doctor/prefer-useReducer */
/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable react-doctor/no-array-index-as-key */
"use client";

import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { hasAdminPowers } from "@/lib/roles";

// ── Types ───────────────────────────────────────────────────────────────

type ProductsApiResponse = {
  products: unknown[];
  clients: string[];
  role: string;
};

type ImportResult = {
  imported: number;
  skipped: number;
  errors: string[];
};

// ── Step indicator ──────────────────────────────────────────────────────

function StepIndicator({ step }: { step: 1 | 2 | 3 }) {
  return (
    <p className="text-xs text-muted-foreground mb-6">
      Step {step} of 3
    </p>
  );
}

// ── Main wizard ─────────────────────────────────────────────────────────

export function AplusImportWizard() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [availableAsins, setAvailableAsins] = useState<string[]>([]);
  const [selectedAsins, setSelectedAsins] = useState<Set<string>>(new Set());
  const [asinsLoading, setAsinsLoading] = useState(false);
  const [asinsError, setAsinsError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // Fetch client list
  const { data, isLoading: clientsLoading } = useQuery<ProductsApiResponse>({
    queryKey: ["aplus-products-wizard"],
    queryFn: async () => {
      const res = await fetch("/api/aplus/products");
      if (!res.ok) throw new Error("Failed to fetch clients");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const clients = data?.clients ?? [];
  const userRole = data?.role ?? "viewer";

  // Admin guard
  if (!clientsLoading && !hasAdminPowers(userRole)) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="size-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground">Admin access required</p>
            <p className="text-xs text-muted-foreground mt-1">
              Only administrators can access the A+ import tool.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Step 2: fetch ASINs ─────────────────────────────────────────────

  async function loadAsins(clientIdCode: string) {
    setAsinsLoading(true);
    setAsinsError(null);
    setAvailableAsins([]);
    setSelectedAsins(new Set());

    try {
      const res = await fetch(
        `/api/aplus/asins?clientIdCode=${encodeURIComponent(clientIdCode)}`
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to fetch ASINs");
      }
      const json = await res.json();
      setAvailableAsins(json.asins ?? []);
    } catch (err) {
      setAsinsError(
        err instanceof Error ? err.message : "Failed to load ASINs"
      );
    } finally {
      setAsinsLoading(false);
    }
  }

  function goToStep2() {
    setStep(2);
    loadAsins(selectedClient);
  }

  function handleSelectAll() {
    setSelectedAsins(new Set(availableAsins));
  }

  function handleDeselectAll() {
    setSelectedAsins(new Set());
  }

  function toggleAsin(asin: string) {
    setSelectedAsins((prev) => {
      const next = new Set(prev);
      if (next.has(asin)) {
        next.delete(asin);
      } else {
        next.add(asin);
      }
      return next;
    });
  }

  // ── Step 3: run import ──────────────────────────────────────────────

  async function runImport() {
    setImporting(true);
    setStep(3);
    setImportResult(null);

    try {
      const res = await fetch("/api/aplus/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientIdCode: selectedClient,
          asins: Array.from(selectedAsins),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Import failed");
      }

      const result: ImportResult = await res.json();
      setImportResult(result);
      toast.success(`Imported ${result.imported} ASIN${result.imported !== 1 ? "s" : ""}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Import failed";
      setImportResult({ imported: 0, skipped: 0, errors: [message] });
      toast.error(message);
    } finally {
      setImporting(false);
    }
  }

  function resetWizard() {
    setStep(1);
    setSelectedClient("");
    setAvailableAsins([]);
    setSelectedAsins(new Set());
    setAsinsError(null);
    setImportResult(null);
  }

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto">

      {/* Step 1: Select Client */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Select Client</CardTitle>
            <CardDescription>
              Choose a client to browse available ASINs in BigQuery.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <StepIndicator step={1} />
            {clientsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading clients…
              </div>
            ) : (
              <Select
                value={selectedClient}
                onValueChange={setSelectedClient}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a client…" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client} value={client}>
                      {client}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <div className="flex justify-end">
              <Button
                onClick={goToStep2}
                disabled={!selectedClient || clientsLoading}
              >
                Next
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Select ASINs */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Select ASINs</CardTitle>
            <CardDescription>
              Choose ASINs to import from client{" "}
              <span className="font-medium text-foreground">{selectedClient}</span>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <StepIndicator step={2} />

            {asinsLoading && (
              <div className="flex items-center gap-2 py-8 justify-center text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Fetching ASINs from BigQuery…
              </div>
            )}

            {asinsError && !asinsLoading && (
              <div className="rounded-lg border border-red-400/20 bg-red-400/10 px-4 py-3 space-y-2">
                <p className="text-sm text-red-400">{asinsError}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadAsins(selectedClient)}
                >
                  <RefreshCw className="size-3.5 mr-1.5" />
                  Retry
                </Button>
              </div>
            )}

            {!asinsLoading && !asinsError && availableAsins.length === 0 && (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No ASINs found for {selectedClient} in BigQuery.
              </p>
            )}

            {!asinsLoading && !asinsError && availableAsins.length > 0 && (
              <>
                {/* Select all / deselect all + count */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {selectedAsins.size} of {availableAsins.length} selected
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleSelectAll}
                      disabled={selectedAsins.size === availableAsins.length}
                    >
                      Select All
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleDeselectAll}
                      disabled={selectedAsins.size === 0}
                    >
                      Deselect All
                    </Button>
                  </div>
                </div>

                {/* ASIN checkbox list */}
                <div className="rounded-lg border border-border/50 divide-y divide-border/30 max-h-80 overflow-y-auto">
                  {availableAsins.map((asin) => (
                    <label
                      key={asin}
                      className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors"
                    >
                      <Checkbox
                        checked={selectedAsins.has(asin)}
                        onCheckedChange={() => toggleAsin(asin)}
                        id={`asin-${asin}`}
                      />
                      <span className="font-mono text-xs text-foreground">
                        {asin}
                      </span>
                    </label>
                  ))}
                </div>
              </>
            )}

            <div className="flex items-center justify-between pt-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button
                onClick={runImport}
                disabled={
                  selectedAsins.size === 0 || asinsLoading || !!asinsError
                }
              >
                Import Selected ({selectedAsins.size})
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Results */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Import Results</CardTitle>
            <CardDescription>
              {importing
                ? "Importing A+ data from BigQuery…"
                : "Import complete."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <StepIndicator step={3} />

            {importing && (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <Loader2 className="size-8 animate-spin text-brand" />
                <p className="text-sm text-muted-foreground">Importing…</p>
              </div>
            )}

            {!importing && importResult && (
              <div className="space-y-4">
                {/* Summary row */}
                <div className="rounded-lg border border-border/50 bg-muted/10 p-4 flex items-center gap-6 flex-wrap">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
                    <span className="text-sm font-medium text-foreground">
                      Imported
                    </span>
                    <Badge
                      variant="outline"
                      className="border-emerald-500/40 bg-emerald-500/10 text-emerald-500 tabular-nums"
                    >
                      {importResult.imported}
                    </Badge>
                  </div>

                  {importResult.skipped > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">
                        Skipped
                      </span>
                      <Badge
                        variant="outline"
                        className="border-amber-500/40 bg-amber-500/10 text-amber-500 tabular-nums"
                      >
                        {importResult.skipped}
                      </Badge>
                    </div>
                  )}
                </div>

                {/* Error list */}
                {importResult.errors.length > 0 && (
                  <div className="rounded-lg border border-red-400/20 bg-red-400/5 px-4 py-3 space-y-1.5">
                    <p className="text-xs font-semibold text-red-400 uppercase tracking-wide">
                      Errors
                    </p>
                    <ul className="space-y-1">
                      {importResult.errors.map((err, i) => (
                        <li
                          key={i}
                          className="text-xs text-red-400 font-mono leading-relaxed"
                        >
                          {err}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex justify-end pt-2">
                  <Button variant="outline" onClick={resetWizard}>
                    Import More
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
