// Shared formatters for sales/analytics tables
import { format, formatISO } from "date-fns";
import { enUS } from "date-fns/locale";

const enUSLocale = enUS;

export function fmtDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "—";
  return format(d, "MM/dd/yyyy", { locale: enUSLocale });
}

export function fmtDateTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "—";
  return format(d, "MM/dd/yyyy h:mm a", { locale: enUSLocale });
}

export function fmtDateShort(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "—";
  return format(d, "MMM d, yyyy", { locale: enUSLocale });
}

export function fmtDateISO(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  return formatISO(d);
}

export function fmtCurrency(n: number | null | undefined): string {
  if (n == null) return "\u2014";
  const formatted = Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `-$${formatted}` : `$${formatted}`;
}

export function fmtInt(n: number | null | undefined): string {
  if (n == null) return "\u2014";
  return Math.round(n).toLocaleString();
}

export function fmtPct(n: number | null | undefined): string {
  if (n == null) return "\u2014";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";
}

export function fmtDec(n: number | null | undefined): string {
  if (n == null) return "\u2014";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
