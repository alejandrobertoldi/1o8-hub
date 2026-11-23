import { withChromeMutex } from "@/lib/chromium-lambda-env";
import { launchBrowser } from "@/lib/monthly-report/pdf-render";
import type { ClientReportData } from "./types";

/**
 * Prints a client monthly report to PDF (US Letter) with headless Chrome: it
 * opens /reports/monthly/print, hands it the report on `window` (so the page
 * itself holds no data and needs no sign-in) and prints it.
 */
export async function renderReportPdf(origin: string, data: ClientReportData): Promise<Buffer> {
  return withChromeMutex(async () => {
    const browser = await launchBrowser();
    try {
      const page = await browser.newPage();
      await page.evaluateOnNewDocument((d: ClientReportData) => {
        (window as Window & { __CLIENT_REPORT__?: ClientReportData }).__CLIENT_REPORT__ = d;
      }, data);
      const errors: string[] = [];
      page.on("pageerror", (err) => errors.push(err instanceof Error ? err.message : String(err)));
      await page.goto(`${origin}/reports/monthly/print`, { waitUntil: "networkidle0", timeout: 60_000 });
      await page.waitForSelector("[data-report-ready]", { timeout: 30_000 });
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      if (errors.length) throw new Error(`Report print page failed: ${errors.join("; ")}`);
      const pdf = await page.pdf({ format: "letter", printBackground: true, preferCSSPageSize: true, margin: { top: "0", right: "0", bottom: "0", left: "0" } });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  });
}

/** "KSS Monthly Report October 2026.pdf" */
export const reportPdfName = (data: ClientReportData) => `${data.client.code} Monthly Report ${data.period.label}.pdf`;
