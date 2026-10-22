"use client";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  X,
  Pencil,
  Plus,
  Eye,
  Users,
  Globe2,
  Download,
  Loader2,
  FileSpreadsheet,
  Sheet as SheetIcon,
  ChevronDown,
} from "lucide-react";

const STATUSES = [
  "Active", "Closed", "Discontinued", "Inactive", "Incomplete", "Out of Stock",
] as const;

const STATUS_COLORS: Record<string, { on: string; off: string }> = {
  Active: { on: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", off: "bg-muted text-muted-foreground border-transparent" },
  Closed: { on: "bg-red-500/15 text-red-400 border-red-500/30", off: "bg-muted text-muted-foreground border-transparent" },
  Discontinued: { on: "bg-orange-500/15 text-orange-400 border-orange-500/30", off: "bg-muted text-muted-foreground border-transparent" },
  Inactive: { on: "bg-muted text-foreground/80 border-border", off: "bg-muted text-muted-foreground border-transparent" },
  Incomplete: { on: "bg-yellow-500/15 text-yellow-400 border-brand/30", off: "bg-muted text-muted-foreground border-transparent" },
  "Out of Stock": { on: "bg-purple-100 text-purple-700 border-purple-300", off: "bg-muted text-muted-foreground border-transparent" },
};

// Shared compact control class — matches row-3 style used by /variations.
const ROW3_CTRL =
  "h-8 rounded-md border border-sidebar-border bg-sidebar-accent/50 text-xs";

// ── Row-3 controls (search + filters + actions) ──────────────────────

type ControlsProps = {
  search: string;
  onSearchChange: (value: string) => void;
  client: string;
  onClientChange: (value: string) => void;
  marketplace: string;
  onMarketplaceChange: (value: string) => void;
  clientCodes: string[];
  isDirty: string;
  onIsDirtyChange: (value: string) => void;
  onClearFilters: () => void;
  bulkMode?: boolean;
  onBulkModeChange?: (enabled: boolean) => void;
  canEdit?: boolean;
  onCreateProduct?: () => void;
  onImportExcel?: () => void;
  includeInactive?: boolean;
  onIncludeInactiveChange?: (value: boolean) => void;
  columnPickerSlot?: React.ReactNode;
  hasStatusFilter?: boolean;
  onExport?: () => void;
  onExportToSheet?: () => void;
  exporting?: boolean;
  exportingSheet?: boolean;
};

export function ProductTableControls({
  search,
  onSearchChange,
  client,
  onClientChange,
  marketplace,
  onMarketplaceChange,
  clientCodes,
  onClearFilters,
  bulkMode,
  onBulkModeChange,
  canEdit,
  onCreateProduct,
  onImportExcel,
  includeInactive,
  onIncludeInactiveChange,
  columnPickerSlot,
  hasStatusFilter,
  onExport,
  onExportToSheet,
  exporting,
  exportingSheet,
}: ControlsProps) {
  const sheetDisabledReason = !client
    ? "Pick a single client first — the sheet is saved under that client's Drive folder."
    : client.includes(",")
    ? "Pick a single client (not multiple) to save to Google Sheets."
    : null;
  const busy = !!exporting || !!exportingSheet;
  const hasFilters =
    !!search || !!client || !!marketplace || !!includeInactive || !!hasStatusFilter;

  return (
    <div className="flex items-center gap-2">
      <div className="relative w-[220px]">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
        <Input
          placeholder="Search ASIN, SKU, brand, title…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className={`${ROW3_CTRL} pl-8`}
        />
      </div>

      <Select value={client || "all"} onValueChange={(v) => onClientChange(v === "all" ? "" : v)}>
        <SelectTrigger className={`${ROW3_CTRL} w-[230px] gap-1.5`}>
          <Users className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="shrink-0 text-muted-foreground">Client</span>
          <span className="shrink-0 text-muted-foreground/40">·</span>
          <span className="text-foreground truncate"><SelectValue placeholder="All" /></span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          {clientCodes.map((c) => (
            <SelectItem key={c} value={c}>{c}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={marketplace || "all"} onValueChange={(v) => onMarketplaceChange(v === "all" ? "" : v)}>
        <SelectTrigger className={`${ROW3_CTRL} w-[200px] gap-1.5`}>
          <Globe2 className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="shrink-0 text-muted-foreground">Marketplace</span>
          <span className="shrink-0 text-muted-foreground/40">·</span>
          <span className="text-foreground truncate"><SelectValue placeholder="All" /></span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          <SelectItem value="amazon.com">amazon.com</SelectItem>
          <SelectItem value="amazon.ca">amazon.ca</SelectItem>
          <SelectItem value="amazon.co.uk">amazon.co.uk</SelectItem>
          <SelectItem value="amazon.de">amazon.de</SelectItem>
          <SelectItem value="amazon.co.jp">amazon.co.jp</SelectItem>
        </SelectContent>
      </Select>

      {onIncludeInactiveChange && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onIncludeInactiveChange(!includeInactive)}
          className={`h-8 rounded-md px-2 text-xs ${
            includeInactive
              ? "bg-muted-foreground/20 text-foreground"
              : "text-muted-foreground"
          }`}
          title={includeInactive ? "Showing all clients (including inactive)" : "Show inactive clients"}
        >
          <Eye className="size-3.5 mr-1" />
          {includeInactive ? "All" : "Inactive"}
        </Button>
      )}

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearFilters}
          className="h-8 rounded-md px-2 text-xs text-muted-foreground"
        >
          <X className="size-3.5 mr-1" />
          Clear
        </Button>
      )}

      {canEdit && onCreateProduct && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="brand"
              size="sm"
              className="h-8 rounded-md px-3 text-xs font-bold"
            >
              <Plus className="size-3.5 mr-1" />
              New Product
              <ChevronDown className="size-3.5 ml-0.5 opacity-80" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuItem onClick={onCreateProduct}>
              <Plus className="size-3.5 mr-2" />
              <div className="flex flex-col">
                <span>Add one product</span>
                <span className="text-[10px] text-muted-foreground">
                  ASIN, SKU, client, marketplace
                </span>
              </div>
            </DropdownMenuItem>
            {onImportExcel && (
              <DropdownMenuItem onClick={onImportExcel}>
                <FileSpreadsheet className="size-3.5 mr-2" />
                <div className="flex flex-col">
                  <span>Upload Excel file</span>
                  <span className="text-[10px] text-muted-foreground">
                    Create many products from a spreadsheet
                  </span>
                </div>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {columnPickerSlot}

      {onExport && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              className="h-8 rounded-md px-3 text-xs"
              title="Export filtered products"
            >
              {busy ? (
                <Loader2 className="size-3.5 mr-1 animate-spin" />
              ) : (
                <Download className="size-3.5 mr-1" />
              )}
              {exporting
                ? "Exporting…"
                : exportingSheet
                ? "Saving to Sheets…"
                : "Export"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuItem onClick={onExport} disabled={busy}>
              <FileSpreadsheet className="size-3.5 mr-2" />
              <div className="flex flex-col">
                <span>Download as Excel</span>
                <span className="text-[10px] text-muted-foreground">
                  .xlsx file, current filters
                </span>
              </div>
            </DropdownMenuItem>
            {onExportToSheet && (
              <DropdownMenuItem
                onClick={onExportToSheet}
                disabled={busy || !!sheetDisabledReason}
                title={sheetDisabledReason || undefined}
              >
                <SheetIcon className="size-3.5 mr-2" />
                <div className="flex flex-col">
                  <span>Save to Google Sheets</span>
                  <span className="text-[10px] text-muted-foreground">
                    {sheetDisabledReason
                      ? sheetDisabledReason
                      : `→ ${client}/Exports in client Drive folder`}
                  </span>
                </div>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {canEdit && onBulkModeChange && (
        <Button
          variant={bulkMode ? "default" : "outline"}
          size="sm"
          onClick={() => onBulkModeChange(!bulkMode)}
          className={`h-8 rounded-md px-3 text-xs ${
            bulkMode ? "bg-brand-solid text-white hover:opacity-90" : ""
          }`}
        >
          <Pencil className="size-3.5 mr-1" />
          {bulkMode ? "Exit Bulk Edit" : "Bulk Edit"}
        </Button>
      )}
    </div>
  );
}

// ── Status toggle chips (rendered in-page above the table) ────────────

type ChipsProps = {
  statuses: Set<string>;
  onStatusToggle: (status: string) => void;
};

export function ProductTableStatusChips({ statuses, onStatusToggle }: ChipsProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-muted-foreground mr-1">Status:</span>
      {STATUSES.map((s) => {
        const isOn = statuses.has(s);
        const colors = STATUS_COLORS[s] || STATUS_COLORS.Active;
        return (
          <button
            type="button"
            key={s}
            onClick={() => onStatusToggle(s)}
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors cursor-pointer select-none ${isOn ? colors.on : colors.off}`}
          >
            {s}
          </button>
        );
      })}
    </div>
  );
}
