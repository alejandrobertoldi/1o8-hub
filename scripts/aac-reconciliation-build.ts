import { writeFileSync } from "fs";
import { resolve } from "path";

// Source data captured from FigJam, BigQuery, and Postgres on 2026-05-04.

const SECTIONS: [string, string[]][] = [
  ["Identity", ["ClientIDCode","ClientName","ClientStatus","merchantID","Tier","BrandName","Marketplace","Country","MarketplaceClientName","BrandRegistry","RetainerType","Commission","BrandURL"]],
  ["Contacts", ["ClientContactName1","ClientContactEmail1","ClientContactName2","ClientContactEmail2","ClientContactName3","ClientContactEmail3","ClientContactName4","ClientContactEmail4","ClientContactName5","ClientContactEmail5","ClientBillingName1","ClientBillingName2","ClientBillingName3","ClientBillingName4","ClientBillingEmail1","ClientBillingEmail2","ClientBillingEmail3","ClientBillingEmail4"]],
  ["Team 1o8M", ["ExecutiveStrategist_1o8M","AccountManager1_1o8M","AccountManager2_1o8M","ProjectManager_1o8M","ProjectManagerAsana_1o8M","PPCManager_1o8M","SEOManager_1o8M","CatalogManager_1o8M","DesignManager_1o8M","DesignUploadManager_1o8M"]],
  ["Team 1o8A", ["ExecutiveStrategist_1o8A","AccountManager_1o8A","ProjectManager_1o8A"]],
  ["Dates", ["ClientOnboardingDate","ClientOffboardingDate","ClientOnboardingEmailSendDate"]],
  ["Drive", ["ClientRootFolderURL"]],
  ["Intentwise", ["IntentwiseName","IntentwiseID","IntentwiseNameAMC","IntentwiseIDAMC","IntentwiseShareOfVoice"]],
  ["Competitors", ["Competitor1Name","Competitor1URL","Competitor2Name","Competitor2URL","Competitor3Name","Competitor3URL","Competitor4Name","Competitor4URL","Competitor5Name","Competitor5URL"]],
  ["Promotions", ["Promo1Name","Promo1Discount","Promo1StartDate","Promo1EndDate","Promo1Comment","Promo2Name","Promo2Discount","Promo2StartDate","Promo2EndDate","Promo2Comment","Promo3Name","Promo3Discount","Promo3StartDate","Promo3EndDate","Promo3Comment"]],
  ["External Services", ["Levanta","PowerBIDashboardURL","PowerBIEmbedURL","FeedbackWhiz"]],
  ["Goals", ["ADSpendBudget1D","ADSpendBudget1W","ADSpendBudget1M","ADSpendBudget3M","ADSpendBudget6M","ADSpendBudget1Y","ADSpendBudgetComment","SalesForecast1D","SalesForecast1W","SalesForecast1M","SalesForecast3M","SalesForecast6M","SalesForecast1Y","SalesForecastComment","PercentageOrgRevGoal1D","PercentageOrgRevGoal1W","PercentageOrgRevGoal1M","PercentageOrgRevGoal3M","PercentageOrgRevGoal6M","PercentageOrgRevGoal1Y","PercentageOrgRevComment","ROASGoal1D","ROASGoal1W","ROASGoal1M","ROASGoal3M","ROASGoal6M","ROASGoal1Y","ROASGoalComment","ACoSGoal1D","ACoSGoal1W","ACoSGoal1M","ACoSGoal3M","ACoSGoal6M","ACoSGoal1Y","ACoSGoalComment","TACoSGoal1D","TACoSGoal1W","TACoSGoal1M","TACoSGoal3M","TACoSGoal6M","TACoSGoal1Y","TACoSGoalComment"]],
  ["Amazon Contact", ["AmazonContactName","AmazonContactEmail"]],
  ["Others", ["ExpoWest2026Location"]],
];

const BQ = new Set("ClientStatus,ClientName,ClientIDCode,BrandName,MarketplaceClientName,Tier,RetainerType,Commission,Marketplace,Country,ExecutiveStrategist_1o8M,AccountManager_1o8M,ProjectManager_1o8M,ProjectManagerAsana_1o8M,DesignManager_1o8M,SEOManager_1o8M,PPCManager_1o8M,CatalogManager_1o8M,DesignUploadManager_1o8M,ExecutiveStrategist_1o8A,AccountManager_1o8A,ProjectManager_1o8A,BrandURL,Competitor1Name,Competitor1URL,Competitor2Name,Competitor2URL,Competitor3Name,Competitor3URL,Competitor4Name,Competitor4URL,Competitor5Name,Competitor5URL,IntentwiseName,IntentwiseID,IntentwiseNameAMC,IntentwiseIDAMC,IntentwiseShareOfVoice,PowerBIDashboardURL,Levanta,FeedbackWhiz,Promo1Name,Promo1Discount,Promo1StartDate,Promo1EndDate,Promo1Comment,Promo2Name,Promo2Discount,Promo2StartDate,Promo2EndDate,Promo2Comment,Promo3Name,Promo3Discount,Promo3StartDate,Promo3EndDate,Promo3Comment,ClientContactName1,ClientContactEmail1,ClientContactName2,ClientContactEmail2,ClientContactName3,ClientContactEmail3,ClientContactName4,ClientContactEmail4,ClientContactName5,ClientContactEmail5,ExpoWest2026Location,BillingEmail1,BillingEmail2,BillingEmail3,BillingEmail4,AmazonContactName,AmazonContactEmail,BrandRegistry,ADSpendBudget1D,ADSpendBudget1W,ADSpendBudget1M,ADSpendBudget3M,ADSpendBudget6M,ADSpendBudget1Y,ADSpendBudgetComment,SalesForecast1D,SalesForecast1W,SalesForecast1M,SalesForecast3M,SalesForecast6M,SalesForecast1Y,SalesForecastComment,PercentageOrgRevGoal1D,PercentageOrgRevGoal1W,PercentageOrgRevGoal1M,PercentageOrgRevGoal3M,PercentageOrgRevGoal6M,PercentageOrgRevGoal1Y,PercentageOrgRevComment,ACOSGoal1D,ACOSGoal1W,ACOSGoal1M,ACOSGoal3M,ACOSGoal6M,ACOSGoal1Y,ACOSGoalComment,ROASGoal1D,ROASGoal1W,ROASGoal1M,ROASGoal3M,ROASGoal6M,ROASGoal1Y,ROASGoalComment,TACOSGoal1D,TACOSGoal1W,TACOSGoal1M,TACOSGoal3M,TACOSGoal6M,TACOSGoal1Y,TACOSGoalComment,merchantID,PowerBIEmbedURL".split(","));

const PG: Record<string, number> = {"AccountManager_1o8A":37,"AccountManager_1o8M":39,"ACOSGoal1D":37,"ACOSGoal1M":37,"ACOSGoal1W":37,"ACOSGoal1Y":37,"ACOSGoal3M":37,"ACOSGoal6M":37,"ACOSGoalComment":37,"ADSpendBudget1D":37,"ADSpendBudget1M":37,"ADSpendBudget1W":37,"ADSpendBudget1Y":37,"ADSpendBudget3M":37,"ADSpendBudget6M":37,"ADSpendBudgetComment":37,"AINotetakerApproval":37,"AmazonContactEmail":37,"AmazonContactName":37,"BillingEmail1":37,"BillingEmail2":37,"BillingEmail3":37,"BillingEmail4":37,"BrandName":39,"BrandRegistry":37,"BrandURL":39,"CatalogManager_1o8M":39,"ClientBibleID":37,"ClientBibleURL":37,"ClientContactEmail1":40,"ClientContactEmail2":40,"ClientContactEmail3":40,"ClientContactEmail4":40,"ClientContactEmail5":40,"ClientContactName1":40,"ClientContactName2":40,"ClientContactName3":40,"ClientContactName4":40,"ClientContactName5":40,"ClientIdCode":5,"ClientIDCode":37,"ClientName":42,"ClientStatus":42,"Commission":37,"Competitor1Name":37,"Competitor1URL":37,"Competitor2Name":37,"Competitor2URL":37,"Competitor3Name":37,"Competitor3URL":37,"Competitor4Name":37,"Competitor4URL":37,"Competitor5Name":37,"Competitor5URL":37,"Country":41,"DashboardDataSource":37,"DashboardTrack":37,"DesignManager_1o8M":39,"DesignUploadManager_1o8M":37,"ExecutiveStrategist_1o8A":37,"ExecutiveStrategist_1o8M":40,"ExpoWest2026Location":37,"FeedbackWhiz":37,"GDSDashboard":37,"GeneralStructureNotes":37,"IntentwiseDashboard":37,"IntentwiseID":39,"IntentwiseIDAMC":38,"IntentwiseName":38,"IntentwiseNameAMC":38,"IntentwiseShareOfVoice":37,"Levanta":37,"Marketplace":41,"MarketplaceClientName":38,"MasterAACRow":37,"merchantID":37,"PercentageOrgRevComment":37,"PercentageOrgRevGoal1D":37,"PercentageOrgRevGoal1M":37,"PercentageOrgRevGoal1W":37,"PercentageOrgRevGoal1Y":37,"PercentageOrgRevGoal3M":37,"PercentageOrgRevGoal6M":37,"PowerBIDashboardURL":37,"PowerBIEmbedURL":38,"PPCManager_1o8M":39,"ProjectManager_1o8A":37,"ProjectManager_1o8M":39,"ProjectManagerAsana_1o8M":37,"Promo1Comment":37,"Promo1Discount":37,"Promo1EndDate":37,"Promo1Name":37,"Promo1StartDate":37,"Promo2Comment":37,"Promo2Discount":37,"Promo2EndDate":37,"Promo2Name":37,"Promo2StartDate":37,"Promo3Comment":37,"Promo3Discount":37,"Promo3EndDate":37,"Promo3Name":37,"Promo3StartDate":37,"RetainerType":37,"ROASGoal1D":37,"ROASGoal1M":37,"ROASGoal1W":37,"ROASGoal1Y":37,"ROASGoal3M":37,"ROASGoal6M":37,"ROASGoalComment":37,"RunningAgendaURL":37,"SalesForecast1D":37,"SalesForecast1M":37,"SalesForecast1W":37,"SalesForecast1Y":37,"SalesForecast3M":37,"SalesForecast6M":37,"SalesForecastComment":37,"SEOManager_1o8M":39,"TACOSGoal1D":37,"TACOSGoal1M":37,"TACOSGoal1W":37,"TACOSGoal1Y":37,"TACOSGoal3M":37,"TACOSGoal6M":37,"TACOSGoalComment":37,"Tier":37,"TimelineURL":37,"Walmart":37};

const RENAMES: Record<string, string> = {
  "AccountManager1_1o8M":"AccountManager_1o8M",
  "ClientBillingEmail1":"BillingEmail1","ClientBillingEmail2":"BillingEmail2","ClientBillingEmail3":"BillingEmail3","ClientBillingEmail4":"BillingEmail4",
  "ACoSGoal1D":"ACOSGoal1D","ACoSGoal1W":"ACOSGoal1W","ACoSGoal1M":"ACOSGoal1M","ACoSGoal3M":"ACOSGoal3M","ACoSGoal6M":"ACOSGoal6M","ACoSGoal1Y":"ACOSGoal1Y","ACoSGoalComment":"ACOSGoalComment",
  "TACoSGoal1D":"TACOSGoal1D","TACoSGoal1W":"TACOSGoal1W","TACoSGoal1M":"TACOSGoal1M","TACoSGoal3M":"TACOSGoal3M","TACoSGoal6M":"TACOSGoal6M","TACoSGoal1Y":"TACOSGoal1Y","TACoSGoalComment":"TACOSGoalComment",
};

const PG_ORPHANS: [string, number][] = [
  ["AINotetakerApproval",37],["ClientBibleID",37],["ClientBibleURL",37],
  ["ClientIdCode",5],["DashboardDataSource",37],["DashboardTrack",37],
  ["GDSDashboard",37],["GeneralStructureNotes",37],["IntentwiseDashboard",37],
  ["MasterAACRow",37],["RunningAgendaURL",37],["TimelineURL",37],["Walmart",37],
];

type Row = [string, string, string, string, string];
const rows: Row[] = [];
const counts = { aligned: 0, rename: 0, missing: 0, orphan: 0 };

for (const [section, attrs] of SECTIONS) {
  for (const attr of attrs) {
    const isCanonInBQ = BQ.has(attr);
    const oldName = RENAMES[attr];
    const oldInBQ = !!oldName && BQ.has(oldName);
    const oldInPG = !!oldName && PG[oldName] !== undefined;
    const canonInPG = PG[attr] !== undefined;

    let bqCell: string, pgCell: string, status: string;
    if (isCanonInBQ) bqCell = "✓ " + attr;
    else if (oldInBQ) bqCell = "→ " + oldName;
    else bqCell = "— missing";

    if (canonInPG) pgCell = "✓ " + attr + " (" + PG[attr] + ")";
    else if (oldInPG) pgCell = "→ " + oldName + " (" + PG[oldName!] + ")";
    else pgCell = "— missing";

    if (isCanonInBQ && canonInPG) { status = "Aligned"; counts.aligned++; }
    else if ((oldInBQ || oldInPG) && !isCanonInBQ) { status = "Pending rename"; counts.rename++; }
    else { status = "Missing in BQ+PG"; counts.missing++; }

    rows.push([section, attr, bqCell, pgCell, status]);
  }
}
for (const [k, c] of PG_ORPHANS) {
  rows.push(["[orphan]", k, "— dropped", "✓ " + k + " (" + c + ")", "PG orphan"]);
  counts.orphan++;
}

// CSV
const csvLines = [
  ["Group","Canonical (FigJam)","BigQuery","Supabase rawData","Status"].join(","),
  ...rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")),
];
writeFileSync(resolve(__dirname, "../docs/aac-reconciliation.csv"), csvLines.join("\n"));

// Markdown — column-padded per memory.feedback_md_table_formatting
const headers = ["Group","Canonical (FigJam)","BigQuery","Supabase rawData","Status"];
const widths = headers.map((h, i) =>
  Math.max(h.length, ...rows.map((r) => r[i].length))
);
const pad = (s: string, w: number) => s + " ".repeat(Math.max(0, w - s.length));
const mdLines: string[] = [];
mdLines.push(`# AAC Attribute Reconciliation\n`);
mdLines.push(`Generated 2026-05-04. Source of truth: FigJam diagram (canonical names).\n`);
mdLines.push(`**Summary:** ${counts.aligned} aligned · ${counts.rename} pending rename · ${counts.missing} missing in BQ+PG · ${counts.orphan} PG orphan keys (dropped from BQ, still in raw_data)\n`);
mdLines.push(`**Legend:** \`✓\` = canonical name found · \`→\` = uses old name (rename target) · \`—\` = not present\n`);
mdLines.push(`App code follows BigQuery column names — every BQ rename implies a code rename.\n`);
mdLines.push(`| ${headers.map((h, i) => pad(h, widths[i])).join(" | ")} |`);
mdLines.push(`| ${widths.map((w) => "-".repeat(w)).join(" | ")} |`);
for (const r of rows) {
  mdLines.push(`| ${r.map((c, i) => pad(c, widths[i])).join(" | ")} |`);
}
writeFileSync(resolve(__dirname, "../docs/aac-reconciliation.md"), mdLines.join("\n") + "\n");

console.log("Wrote:");
console.log("  docs/aac-reconciliation.csv (" + (rows.length + 1) + " rows)");
console.log("  docs/aac-reconciliation.md (" + (rows.length + 1) + " rows)");
console.log("Counts:", counts);
