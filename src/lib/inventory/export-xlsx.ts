// The file the team attaches to their client email. Built from SNAPSHOT rows
// only, never live data, and never contains internal notes.
import { describeMethod } from "./rec-settings";
import type { PortalSnapshotRow, SnapshotHeader } from "./snapshot";

const sendDate = (sentAt: string) => sentAt.slice(0, 10);

function basisLabel(h: SnapshotHeader, today: string): string {
  if (h.method === "recent") return `Units last ${h.recentDays}d`;
  const label = describeMethod({ ...h, upliftPct: 0 }, today); // "Seasonal a→b" | "Average of Nd & a→b" | "Greater of Nd & a→b"
  if (h.method === "seasonal") return `Units ${label.replace("Seasonal ", "")}`;
  if (h.method === "greater") return `Units (greater) ${label.replace("Greater of ", "")}`;
  return `Units (avg) ${label.replace("Average of ", "")}`;
}

export function buildExportAoa(
  header: SnapshotHeader,
  clientName: string,
  rows: PortalSnapshotRow[],
  today: string = sendDate(header.sentAt),
): (string | number)[][] {
  const title = `${clientName} — sent ${sendDate(header.sentAt)} by ${header.sentBy} · ${describeMethod(header, today)}`;
  return [
    [title],
    [],
    ["Product", "ASIN", "SKU", "On-hand", "Inbound", "Reserved", "AWD available", "AWD inbound", "Stock position", basisLabel(header, today), "Recommended to send"],
    // Only the sent number — the calculated one would reveal overrides to the client.
    ...rows.map((r) => [r.productName, r.asin, r.sku, r.available, r.inbound, r.reserved, r.awdAvailable ?? 0, r.awdInbound ?? 0, r.stockPosition, r.basisUnits, r.final]),
  ];
}

export function exportFilename(clientIdCode: string, sentAt: string): string {
  return `${clientIdCode}-inventory-recommendation-${sendDate(sentAt)}.xlsx`;
}

export async function downloadSnapshotXlsx(header: SnapshotHeader, clientName: string, rows: PortalSnapshotRow[]): Promise<void> {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet(buildExportAoa(header, clientName, rows));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Recommendation");
  XLSX.writeFile(wb, exportFilename(header.clientIdCode, header.sentAt));
}
