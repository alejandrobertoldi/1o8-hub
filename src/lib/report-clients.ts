export type ReportClient = {
  name: string;
  accountIds: string[];
};

export const REPORT_CLIENTS: ReportClient[] = [
  { name: "Cloud23 Seller Central", accountIds: ["2348430"] },
  { name: "Cloud23 Whole Foods", accountIds: ["2557190"] },
  { name: "Pura", accountIds: ["2706460"] },
  { name: "Fresh Vintage Farms", accountIds: ["1067740"] },
  { name: "Whitney Jordan", accountIds: ["3388210"] },
  { name: "Trejo's Tacos", accountIds: ["910420"] },
  { name: "Trejo's Spirits", accountIds: ["1268300"] },
  { name: "Dreamiere", accountIds: ["2572940"] },
  { name: "Dr. Wolff USA", accountIds: ["1145180"] },
  { name: "Hotshot US", accountIds: ["272970"] },
  { name: "BNutty", accountIds: ["1707700"] },
  { name: "Brad's", accountIds: ["3629290"] },
  { name: "ReadyRESCUE", accountIds: ["1899670"] },
  { name: "Poochie Butter", accountIds: ["3415610"] },
  { name: "Glo Health Foods", accountIds: ["3735620"] },
  { name: "Gaffer", accountIds: ["154290"] },
  { name: "This PKN", accountIds: ["563510"] },
];

export function getReportClients(): ReportClient[] {
  return REPORT_CLIENTS;
}

/**
 * Returns the legacy { [name]: accountId } shape used by the
 * existing /reports/page.tsx UI dropdown.
 */
export function getReportClientsAsRecord(): Record<string, string> {
  return Object.fromEntries(
    REPORT_CLIENTS.map((c) => [c.name, c.accountIds[0]]),
  );
}
