import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { aac } from "@/lib/db/schema";
import { asc } from "drizzle-orm";

/** All AAC spreadsheet columns — exact order from the Google Sheet */
const AAC_COLUMNS = [
  "ClientStatus","ClientName","ClientIDCode","BrandName",
  "MarketplaceClientName","Tier","RetainerType","Commission","Marketplace",
  "Country","OnboardingDate","OffboardingDate","ExecutiveStrategist_MF","AccountManager_MF",
  "ProjectManager_MF","ProjectManagerAsana_MF","DesignManager_MF",
  "SEOManager_MF","PPCManager_MF","CatalogManager_MF",
  "DesignUploadManager_MF","ExecutiveStrategist_1o8A","AccountManager_1o8A",
  "ProjectManager_1o8A","BrandURL",
  "Competitor1Name","Competitor1URL",
  "Competitor2Name","Competitor2URL","Competitor3Name","Competitor3URL",
  "Competitor4Name","Competitor4URL","Competitor5Name","Competitor5URL",
  "IntentwiseName","IntentwiseID","IntentwiseNameAMC","IntentwiseIDAMC",
  "IntentwiseShareOfVoice","PowerBIDashboardURL",
  "Levanta","FeedbackWhiz","Promo1Name","Promo1Discount","Promo1StartDate",
  "Promo1EndDate","Promo1Comment","Promo2Name","Promo2Discount",
  "Promo2StartDate","Promo2EndDate","Promo2Comment","Promo3Name",
  "Promo3Discount","Promo3StartDate","Promo3EndDate","Promo3Comment",
  "ClientContactName1","ClientContactEmail1",
  "ClientContactName2","ClientContactEmail2","ClientContactName3",
  "ClientContactEmail3","ClientContactName4","ClientContactEmail4",
  "ClientContactName5","ClientContactEmail5","ExpoWest2026Location",
  "BillingEmail1","BillingEmail2","BillingEmail3","BillingEmail4",
  "AmazonContactName","AmazonContactEmail",
  "BrandRegistry",
  "ADSpendBudget1D","ADSpendBudget1W","ADSpendBudget1M","ADSpendBudget3M",
  "ADSpendBudget6M","ADSpendBudget1Y","ADSpendBudgetComment",
  "SalesForecast1D","SalesForecast1W","SalesForecast1M","SalesForecast3M",
  "SalesForecast6M","SalesForecast1Y","SalesForecastComment",
  "PercentageOrgRevGoal1D","PercentageOrgRevGoal1W","PercentageOrgRevGoal1M",
  "PercentageOrgRevGoal3M","PercentageOrgRevGoal6M","PercentageOrgRevGoal1Y",
  "PercentageOrgRevComment","ACOSGoal1D","ACOSGoal1W","ACOSGoal1M",
  "ACOSGoal3M","ACOSGoal6M","ACOSGoal1Y","ACOSGoalComment",
  "ROASGoal1D","ROASGoal1W","ROASGoal1M","ROASGoal3M","ROASGoal6M",
  "ROASGoal1Y","ROASGoalComment","TACOSGoal1D","TACOSGoal1W","TACOSGoal1M",
  "TACOSGoal3M","TACOSGoal6M","TACOSGoal1Y","TACOSGoalComment",
] as const;

export async function GET() {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dbRows = await db
    .select({
      clientIdCode: aac.clientIdCode,
      clientStatus: aac.clientStatus,
      clientName: aac.clientName,
      rawData: aac.rawData,
      onboardingDate: aac.onboardingDate,
      offboardingDate: aac.offboardingDate,
    })
    .from(aac)
    .orderBy(asc(aac.clientIdCode));

  // raw_data is jsonb and may contain non-string scalars (e.g. booleans for
  // BrandRegistry / FeedbackWhiz / Levanta after the 2026-05-28 sync from
  // AAC_master). Optional chaining short-circuits on null/undefined but not
  // on booleans, so `raw[col]?.trim()` crashes on a boolean. Normalise first.
  const toStr = (v: unknown): string => {
    if (typeof v === "string") return v.trim();
    if (v === null || v === undefined) return "";
    return String(v);
  };

  const result = dbRows.map((row) => {
    let raw: Record<string, unknown> = {};
    if (typeof row.rawData === "string") {
      try { raw = JSON.parse(row.rawData); } catch { /* ignore */ }
    } else if (row.rawData) {
      raw = row.rawData as Record<string, unknown>;
    }

    const entry: Record<string, string> = {};
    for (const col of AAC_COLUMNS) {
      if (col === "ClientIDCode") {
        entry[col] = toStr(raw[col]) || row.clientIdCode || "";
      } else if (col === "ClientStatus") {
        entry[col] = toStr(raw[col]) || row.clientStatus || "";
      } else if (col === "ClientName") {
        entry[col] = toStr(raw[col]) || row.clientName || "";
      } else if (col === "OnboardingDate") {
        // Prefer rawData value (set via PUT), fall back to the typed DB column
        entry[col] = toStr(raw["OnboardingDate"]) ||
          (row.onboardingDate ? row.onboardingDate.toISOString().split("T")[0] : "");
      } else if (col === "OffboardingDate") {
        // Prefer rawData value (set via PUT), fall back to the typed DB column
        entry[col] = toStr(raw["OffboardingDate"]) ||
          (row.offboardingDate ? row.offboardingDate.toISOString().split("T")[0] : "");
      } else {
        entry[col] = toStr(raw[col]) || "";
      }
    }
    return entry;
  });

  // Active clients first, then by client name
  result.sort((a, b) => {
    const aActive = a.ClientStatus?.toLowerCase() === "active" ? 0 : 1;
    const bActive = b.ClientStatus?.toLowerCase() === "active" ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    return (a.ClientName || "").localeCompare(b.ClientName || "");
  });

  return NextResponse.json({ columns: [...AAC_COLUMNS], rows: result });
}
