import { existsSync } from "fs";
import type { Report } from "@/components/monthly-report/types";
import {
  prepareServerlessChromium,
  retryOnChromiumBusy,
  withChromeMutex,
} from "@/lib/chromium-lambda-env";
import { buildStandaloneReportHtml } from "@/lib/monthly-report/html-archive";

prepareServerlessChromium();

const LOCAL_CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
];

const CHROMIUM_PACK_URL =
  process.env.CHROMIUM_PACK_URL ??
  "https://github.com/Sparticuz/chromium/releases/download/v131.0.1/chromium-v131.0.1-pack.tar";

function localChromePath(): string | undefined {
  if (process.env.CHROME_EXECUTABLE_PATH) return process.env.CHROME_EXECUTABLE_PATH;
  return LOCAL_CHROME_PATHS.find((p) => existsSync(p));
}

let inflightExecutable: Promise<string> | null = null;

async function resolveChromiumExecutable(
  chromium: { executablePath: (input?: string) => Promise<string> },
): Promise<string> {
  if (inflightExecutable) return inflightExecutable;
  inflightExecutable = (async () => {
    try {
      return await chromium.executablePath();
    } catch (err) {
      console.error("[monthly-report] bundled Chromium bin missing, downloading pack", err);
      return await chromium.executablePath(CHROMIUM_PACK_URL);
    }
  })().catch((err) => {
    inflightExecutable = null;
    throw err;
  });
  return inflightExecutable;
}

async function launchBrowser() {
  const puppeteer = (await import("puppeteer-core")).default;
  const local = process.platform === "darwin" ? localChromePath() : process.env.CHROME_EXECUTABLE_PATH;
  if (local) {
    return puppeteer.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      defaultViewport: { width: 1440, height: 900 },
      executablePath: local,
      headless: true,
    });
  }

  // Must run before the chromium import so LD_LIBRARY_PATH + AL2023 libs are set.
  prepareServerlessChromium();
  const chromium = (await import("@sparticuz/chromium")).default;
  chromium.setGraphicsMode = false;
  const executablePath = await resolveChromiumExecutable(chromium);
  return retryOnChromiumBusy(() => puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport ?? { width: 1440, height: 900 },
    executablePath,
    headless: chromium.headless,
  }));
}

/** True only for Next.js's uncaught-exception screen, not the always-on dev portal. */
export function isPrintCrashScreen(bodyText: string): boolean {
  return /Application error:\s*a client-side exception/i.test(bodyText);
}

export async function generatePrintArtifacts(
  origin: string,
  report: Report,
): Promise<{ pdf: Buffer; html: Buffer }> {
  return withChromeMutex(async () => {
  const browser = await launchBrowser();

  try {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument((data: Report) => {
      (window as Window & { __MONTHLY_REPORT__?: Report }).__MONTHLY_REPORT__ = data;
    }, report);
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => { pageErrors.push(err.message); });
    await page.goto(`${origin}/reports/monthly/print`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.waitForSelector("[data-report-ready]", { timeout: 30_000 });
    await page.waitForSelector(".report-doc", { timeout: 10_000 });
    await Promise.race([
      page.evaluate(async () => {
        const imgs = Array.from(document.images);
        await Promise.all(imgs.map((img) => {
          if (img.complete) {
            if (img.naturalWidth === 0) img.style.display = "none";
            return;
          }
          return new Promise<void>((resolve) => {
            const done = () => resolve();
            img.addEventListener("load", done, { once: true });
            img.addEventListener("error", () => {
              img.style.display = "none";
              done();
            }, { once: true });
            setTimeout(() => {
              if (!img.complete || img.naturalWidth === 0) img.style.display = "none";
              done();
            }, 8_000);
          });
        }));
      }),
      new Promise<void>((resolve) => setTimeout(resolve, 12_000)),
    ]);
    const bodyText = await page.evaluate(() => document.body.innerText);
    // nextjs-portal exists on every Next.js *dev* page — it is not a crash.
    if (isPrintCrashScreen(bodyText) || pageErrors.length > 0) {
      throw new Error(`Print page crashed: ${pageErrors.join("; ") || bodyText.slice(0, 120)}`);
    }

    const snapshot = await page.evaluate(() => {
      let css = "";
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          css += Array.from(sheet.cssRules).map((rule) => rule.cssText).join("\n");
        } catch {
          /* cross-origin sheet */
        }
      }
      const el = document.querySelector(".report-doc");
      return { css, bodyHtml: el?.outerHTML ?? "" };
    });

    const html = Buffer.from(buildStandaloneReportHtml({
      title: `${report.meta.client} · ${report.meta.month}`,
      origin,
      bodyHtml: snapshot.bodyHtml,
      css: snapshot.css,
    }), "utf8");

    const pdf = await page.pdf({
      format: "A4",
      landscape: true,
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", bottom: "0", left: "0", right: "0" },
    });

    return { pdf: Buffer.from(pdf), html };
  } finally {
    await browser.close();
  }
  });
}

export async function generatePdfBuffer(origin: string, report: Report): Promise<Buffer> {
  return (await generatePrintArtifacts(origin, report)).pdf;
}
