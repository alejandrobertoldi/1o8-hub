/* eslint-disable react-doctor/no-effect-event-handler */
/* eslint-disable react-doctor/no-fetch-in-effect */
/* eslint-disable react-doctor/no-cascading-set-state */
/* eslint-disable react-doctor/design-no-em-dash-in-jsx-text */
/* eslint-disable react-doctor/no-array-index-as-key */
"use client";
/* eslint-disable react-doctor/nextjs-no-img-element */

import { useEffect, useState } from "react";

interface InventoryItem {
  asin: string;
  product_name: string;
  link: string | null;
  status: string;
  alert: string;
  available: number;
  inbound: number;
  fc_transfer: number;
  fc_processing: number;
  customer_order: number;
  unfulfillable: number;
  total_units: number;
  units_sold_30: number;
  sales_30: number;
  days_of_supply: number;
  total_days_of_supply: number;
  days_of_supply_at_amazon: number;
  recommended_replenishment_qty: number;
  recommended_ship_date: string | null;
  utilization: number;
  maximum_shipment_qty: number;
  working: number;
  shipped: number;
  receiving: number;
  unit_storage_size: number;
}

interface ApiResponse {
  items: InventoryItem[];
  maxDate: string | null;
}

function fmtCurrency(n: number) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtNum(n: number) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function StatusBadge({ status }: { status: string }) {
  const s = (status || "").toLowerCase();
  const bg =
    s === "active"
      ? "#35c759"
      : s === "inactive"
      ? "#ff5c60"
      : s === "incomplete"
      ? "#Fac800"
      : "#6b7280";

  return (
    <span
      className="px-2.5 py-1 rounded-md text-xs font-semibold text-white whitespace-nowrap"
      style={{ backgroundColor: bg }}
    >
      {status || "—"}
    </span>
  );
}

function AlertBadge({ alert }: { alert: string }) {
  const a = (alert || "").toLowerCase();
  const bg =
    a === ""
      ? "#35c759"
      : a.includes("low")
      ? "#Fac800"
      : a.includes("out")
      ? "#ff5c60"
      : a === "excess"
      ? "#00D4FF"
      : "#6b7280";

  const textColor = a === "excess" ? "#000" : "#fff";
  const label = alert === "" ? "Healthy" : alert;

  return (
    <span
      className="px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap"
      style={{ backgroundColor: bg, color: textColor }}
    >
      {label}
    </span>
  );
}

interface ColDef {
  key: keyof InventoryItem;
  label: string;
  currency?: boolean;
  noTotal?: boolean;
}

function InventoryBaseTable({
  title,
  items,
  cols,
}: {
  title: string;
  items: InventoryItem[];
  cols: ColDef[];
}) {
  const [search, setSearch] = useState("");

  const filtered = items.filter(
    (r) =>
      r.asin.toLowerCase().includes(search.toLowerCase()) ||
      r.product_name.toLowerCase().includes(search.toLowerCase())
  );

  const totals = cols.reduce((acc, col) => {
    if (!col.noTotal) {
      acc[col.key as string] = filtered.reduce(
        (sum, r) => sum + (Number(r[col.key]) || 0),
        0
      );
    }
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="rounded-xl border border-[#F7BF1D] bg-white overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-[#3C4043] flex items-center justify-between gap-4">
        <h3 className="text-sm font-semibold text-[#F7BF1D] flex-1 text-center">
          {title}
        </h3>

        <input
          type="text"
          placeholder="Search ASIN or product…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="text-xs rounded-lg border border-[#F7BF1D] bg-white text-black
                     placeholder:text-gray-400 px-3 py-1.5 w-56 outline-none
                     focus:ring-1 focus:ring-[#F7BF1D]"
        />
      </div>

      {/* Table */}
      <div className="overflow-auto max-h-[500px] custom-scroll">
        <table
          className="text-xs border-collapse"
          style={{ minWidth: "max-content", width: "100%" }}
        >
          <thead className="sticky top-0 z-20">
            <tr className="bg-[#3C4043] border-b border-[#F7BF1D]">
              <th
                className="sticky left-0 z-30 text-left px-4 py-2.5 font-semibold text-[#F7BF1D] whitespace-nowrap border-r border-white/10"
                style={{ minWidth: "110px" }}
              >
                ASIN
              </th>

              <th
                className="text-left px-4 py-2.5 font-semibold text-[#F7BF1D] whitespace-nowrap border-r border-white/10"
                style={{ minWidth: "400px", maxWidth: "400px" }}
              >
                Item Name
              </th>

              <th
                className="text-center px-4 py-2.5 font-semibold text-[#F7BF1D] whitespace-nowrap border-r border-white/10"
                style={{ minWidth: "90px" }}
              >
                Image
              </th>

              <th
                className="text-center px-4 py-2.5 font-semibold text-[#F7BF1D] whitespace-nowrap border-r border-white/10"
                style={{ minWidth: "100px" }}
              >
                Status
              </th>

              <th
                className="text-center px-4 py-2.5 font-semibold text-[#F7BF1D] whitespace-nowrap border-r border-white/10"
                style={{ minWidth: "120px" }}
              >
                Alert
              </th>

              {cols.map((col) => (
                <th
                  key={col.key as string}
                  className="text-right px-4 py-2.5 font-semibold text-[#F7BF1D] whitespace-nowrap border-r border-white/10"
                  style={{ minWidth: "130px" }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {filtered.map((row, i) => (
              <tr
                key={`${row.asin}-${i}`}
                className={`border-b border-gray-200 hover:bg-gray-50 transition-colors ${
                  i % 2 === 0 ? "bg-white" : "bg-gray-50/40"
                }`}
              >
                <td
                  className="sticky left-0 z-10 px-4 py-2 font-bold text-[#F7BF1D] whitespace-nowrap border-r border-gray-200"
                  style={{ backgroundColor: i % 2 === 0 ? "#fff" : "#f9fafb" }}
                >
                  {row.asin}
                </td>

                <td
                  className="px-4 py-2 text-black"
                  style={{ minWidth: "220px", maxWidth: "220px" }}
                >
                  <span className="line-clamp-3 leading-tight text-[11px]">
                    {row.product_name || "—"}
                  </span>
                </td>

                <td className="px-4 py-2 text-center">
                  {row.link ? (
                    <img
                      src={row.link}
                      alt={row.asin}
                      className="size-16 object-contain mx-auto rounded"
                    />
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>

                <td className="px-4 py-2 text-center">
                  <StatusBadge status={row.status} />
                </td>

                <td className="px-4 py-2 text-center">
                  <AlertBadge alert={row.alert} />
                </td>

                {cols.map((col) => (
                  <td
                    key={col.key as string}
                    className="px-4 py-2 text-right text-black tabular-nums whitespace-nowrap"
                  >
                    {col.key === "recommended_ship_date"
                      ? row.recommended_ship_date ?? "—"
                      : col.currency
                      ? fmtCurrency(row[col.key] as number)
                      : fmtNum(row[col.key] as number)}
                  </td>
                ))}
              </tr>
            ))}

            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={5 + cols.length}
                  className="px-4 py-8 text-center text-black"
                >
                  No items found
                </td>
              </tr>
            )}
          </tbody>

          <tfoot className="sticky bottom-0 z-20">
            <tr className="bg-[#3C4043] border-t border-[#F7BF1D] font-bold">
              <td className="sticky left-0 z-30 px-4 py-2.5 text-[#F7BF1D] font-bold whitespace-nowrap border-r border-white/10 bg-[#3C4043]">
                Total
              </td>

              <td className="px-4 py-2.5 bg-[#3C4043]" />
              <td className="px-4 py-2.5 bg-[#3C4043]" />
              <td className="px-4 py-2.5 bg-[#3C4043]" />
              <td className="px-4 py-2.5 bg-[#3C4043]" />

              {cols.map((col) => (
                <td
                  key={col.key as string}
                  className="px-4 py-2.5 text-right text-[#F7BF1D] tabular-nums whitespace-nowrap bg-[#3C4043]"
                >
                  {col.noTotal
                    ? ""
                    : col.currency
                    ? fmtCurrency(totals[col.key as string])
                    : fmtNum(totals[col.key as string])}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="px-4 py-2 border-t border-gray-200 bg-white">
        <span className="text-xs text-black">{filtered.length} items</span>
      </div>
    </div>
  );
}

export function InventoryTable({ accountId, refreshKey = 0 }: { accountId: string; refreshKey?: number }) {
  const requestKey = accountId ? `${accountId}:${refreshKey}` : "";
  const [result, setResult] = useState<{ key: string; data: ApiResponse | null } | null>(null);

  useEffect(() => {
    if (!accountId) return;

    let ignore = false;
    fetch(`/api/reports/inventory?accountId=${accountId}`)
      .then((r) => r.json())
      .then((d) => {
        if (!ignore) setResult({ key: requestKey, data: d });
      })
      .catch(() => {
        if (!ignore) setResult({ key: requestKey, data: null });
      });
    return () => {
      ignore = true;
    };
  }, [accountId, requestKey]);

  const loading = Boolean(requestKey) && result?.key !== requestKey;
  const data = result?.key === requestKey ? result.data : null;

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-[#F7BF1D] bg-white animate-pulse h-64"
          />
        ))}
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-black">
        No inventory data available
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <InventoryBaseTable
        title="Inventory Status"
        items={data.items}
        cols={[
          { key: "available", label: "Available" },
          { key: "inbound", label: "Inbound" },
          { key: "unfulfillable", label: "Unfulfillable" },
          { key: "total_units", label: "Total Units" },
          { key: "fc_transfer", label: "FC Transfer" },
          { key: "fc_processing", label: "FC Processing" },
          { key: "customer_order", label: "Customer Orders" },
          { key: "working", label: "Working" },
          { key: "shipped", label: "Shipped" },
          { key: "receiving", label: "Receiving" },
        ]}
      />

      <InventoryBaseTable
        title="Latest Sales Breakdown"
        items={data.items}
        cols={[
          { key: "units_sold_30", label: "Units 30 Days" },
          { key: "sales_30", label: "Sales 30 Days", currency: true },
        ]}
      />

      <InventoryBaseTable
        title="Amazon Inventory Suggestions"
        items={data.items}
        cols={[
          { key: "days_of_supply", label: "Days of Supply" },
          { key: "total_days_of_supply", label: "Total Days of Supply" },
          { key: "days_of_supply_at_amazon", label: "Days of Supply at Amazon" },
          { key: "recommended_replenishment_qty", label: "Recommended Replenishment" },
          { key: "recommended_ship_date", label: "Recommended Ship Date", noTotal: true },
          { key: "utilization", label: "Utilization" },
          { key: "maximum_shipment_qty", label: "Max Shipment Qty" },
        ]}
      />
    </div>
  );
}
