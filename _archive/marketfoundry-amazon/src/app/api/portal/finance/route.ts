/* eslint-disable react-doctor/async-parallel */
/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable react-doctor/js-set-map-lookups */
/* eslint-disable react-doctor/js-flatmap-filter */
/* eslint-disable react-doctor/nextjs-no-side-effect-in-get-handler */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { isEditorOrAbove } from "@/lib/roles";
import { db } from "@/lib/db";
import { aac } from "@/lib/db/schema";
import { queryRedshift } from "@/lib/redshift";
import { PORTAL_DEMO } from "@/lib/portal-demo";
import { parseClientIdCodes } from "@/lib/client-codes";
import {
  DEMO_CLIENT_DISPLAY,
  isDemoAliasedClient,
  resolveDemoDataSource,
} from "@/lib/demo-client-alias";

export const maxDuration = 60;

const ITEM_TABLE = `"amazon_source_data"."sellercentral_financialtransactions_itemlevelbreakdowns"`;
const TXN_TABLE = `"amazon_source_data"."sellercentral_financialtransactions_transactionlevelbreakdowns"`;

// ── Helpers ───────────────────────────────────────────────────

function parseRawData(rawData: unknown): Record<string, string> {
  if (typeof rawData === "string") {
    try { return JSON.parse(rawData); } catch { return {}; }
  }
  if (rawData && typeof rawData === "object") return rawData as Record<string, string>;
  return {};
}

async function resolveClient(session: { user: { role: string; clientIdCode?: string | null } }, clientParam: string | null) {
  const canSelectClient = isEditorOrAbove(session.user.role);
  let clientFilter: string | null = null;

  if (clientParam && canSelectClient) {
    clientFilter = clientParam;
  } else if ((session.user.role === "client" || session.user.role === "prospect") && session.user.clientIdCode) {
    const assigned = parseClientIdCodes(session.user.clientIdCode);
    clientFilter =
      (clientParam && assigned.includes(clientParam) ? clientParam : assigned[0]) || null;
  }

  if (!clientFilter) return null;

  const allClients = await db.select().from(aac);
  const record = allClients.find(
    (c) => (c.clientIdCode ?? "").toLowerCase() === clientFilter!.toLowerCase()
  );
  if (!record) return null;

  const rawData = parseRawData(record.rawData);
  const adSpendBudget = parseFloat(rawData["AdSpendBudget1M"] || "0") || null;

  // Demo aliases borrow donor Intentwise account IDs (Zingora ← Pura).
  let intentwiseId = rawData["IntentwiseID"] || rawData["Intentwise ID"] || "";
  if (!intentwiseId && isDemoAliasedClient(clientFilter)) {
    const donorCode = resolveDemoDataSource(clientFilter);
    const donor = allClients.find(
      (c) => (c.clientIdCode ?? "").toLowerCase() === donorCode.toLowerCase()
    );
    if (donor) {
      const donorRaw = parseRawData(donor.rawData);
      intentwiseId = donorRaw["IntentwiseID"] || donorRaw["Intentwise ID"] || "";
    }
  }
  const accountIds = intentwiseId.split(",").map((s: string) => s.trim()).filter(Boolean);
  const display = DEMO_CLIENT_DISPLAY[clientFilter];

  return {
    clientFilter,
    clientName: display?.clientName ?? record.clientName,
    accountIds,
    adSpendBudget,
  };
}

// ── Types ─────────────────────────────────────────────────────

type View = "statement" | "statements" | "transactions";

interface TxnBreakdownRow {
  breakdown_type: string;
  total: string;
  cnt: string;
}

interface StatementPeriodRow {
  report_start_date: string;
  report_end_date: string;
  download_date: string;
  breakdown_type: string;
  total: string;
}

interface TransactionRow {
  transaction_id: string;
  breakdown_type: string;
  amount: string;
  posted_date: string;
}

interface ItemBreakdownRow {
  breakdown_type: string;
  total: string;
}

// ── Main handler ──────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user?.clientStatus === "Prospect") return NextResponse.json(PORTAL_DEMO.finance);

  const clientParam = req.nextUrl.searchParams.get("client");
  const view = (req.nextUrl.searchParams.get("view") || "statement") as View;
  const periodStart = req.nextUrl.searchParams.get("periodStart");
  const periodEnd = req.nextUrl.searchParams.get("periodEnd");
  const periodExact = req.nextUrl.searchParams.get("periodExact") === "1";

  const client = await resolveClient(session, clientParam);
  if (!client) {
    return NextResponse.json({ error: "Client not found or no client specified" }, { status: 400 });
  }
  if (client.accountIds.length === 0) {
    return NextResponse.json({
      client: client.clientFilter,
      clientName: client.clientName,
      error: "No Intentwise account linked",
    });
  }

  const accountList = client.accountIds.map((id: string) => `'${id}'`).join(",");

  // ── Statement View (current/selected period) ───────────────
  if (view === "statement") {
    // Get settlement periods — first try actual ranges (start != end)
    let allPeriods = await queryRedshift<{ report_start_date: string; report_end_date: string }>(`
      SELECT DISTINCT report_start_date, report_end_date
      FROM ${TXN_TABLE}
      WHERE account_id IN (${accountList})
        AND report_start_date <> report_end_date
      ORDER BY report_start_date DESC
      LIMIT 30
    `);

    let closedPeriods: { start: string; end: string; open: boolean }[];

    if (allPeriods.length > 0) {
      // Real settlement ranges exist — use them directly
      closedPeriods = allPeriods.map((p) => ({
        start: new Date(p.report_start_date).toISOString().slice(0, 10),
        end: new Date(p.report_end_date).toISOString().slice(0, 10),
        open: false,
      }));
    } else {
      // Only same-date entries exist — derive biweekly settlement periods
      // from the FundTransfer (disbursement) dates, which mark settlement boundaries
      const disbursementDates = await queryRedshift<{ settle_date: string }>(`
        SELECT DISTINCT report_start_date AS settle_date
        FROM ${TXN_TABLE}
        WHERE account_id IN (${accountList})
          AND breakdown_type = 'FundTransfer'
        ORDER BY settle_date DESC
        LIMIT 20
      `);

      if (disbursementDates.length >= 2) {
        // Each disbursement date marks the end of a settlement period
        // The start is the previous disbursement date
        closedPeriods = [];
        for (let i = 0; i < disbursementDates.length - 1; i++) {
          const end = new Date(disbursementDates[i].settle_date).toISOString().slice(0, 10);
          const start = new Date(disbursementDates[i + 1].settle_date).toISOString().slice(0, 10);
          closedPeriods.push({ start, end, open: false });
        }
      } else {
        // Fallback: get the full date range and create a single period
        const dateRange = await queryRedshift<{ min_date: string; max_date: string }>(`
          SELECT MIN(report_start_date) AS min_date, MAX(report_start_date) AS max_date
          FROM ${TXN_TABLE}
          WHERE account_id IN (${accountList})
        `);
        if (dateRange.length > 0) {
          closedPeriods = [{
            start: new Date(dateRange[0].min_date).toISOString().slice(0, 10),
            end: new Date(dateRange[0].max_date).toISOString().slice(0, 10),
            open: false,
          }];
        } else {
          closedPeriods = [];
        }
      }
    }

    // Add "Present (Open)" option
    const nowDate = new Date();
    const todayStr = nowDate.toISOString().slice(0, 10);
    const latestEnd = closedPeriods.length > 0
      ? closedPeriods[0].end
      : `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, "0")}-01`;

    const availablePeriods = [
      { start: latestEnd, end: todayStr, open: true },
      ...closedPeriods,
    ];

    // Use selected or default to "Present (Open)"
    let startDate = periodStart;
    let endDate = periodEnd;

    if (!startDate || !endDate) {
      if (closedPeriods.length === 0) {
        return NextResponse.json({ client: client.clientFilter, clientName: client.clientName, statement: null, availablePeriods: [] });
      }
      // Default to open period
      startDate = latestEnd;
      endDate = todayStr;
    }

    // Always use daily rows (start=end) to avoid non-existent settlement period rows
    const dateFilter = `report_start_date = report_end_date AND report_start_date >= '${startDate}'::DATE AND report_start_date <= '${endDate}'::DATE`;

    // ── Query TXN table leaf types (exclude hierarchical parents: Sales, Expenses, AmazonFees, Base) ──
    const TXN_PARENT_TYPES = ["'Sales'", "'Expenses'", "'AmazonFees'", "'Base'"].join(",");

    const txnBreakdown = await queryRedshift<TxnBreakdownRow>(`
      SELECT
        breakdown_type,
        SUM(CAST(breakdown_amount AS DECIMAL(18,2))) AS total,
        COUNT(*) AS cnt
      FROM ${TXN_TABLE}
      WHERE account_id IN (${accountList})
        AND ${dateFilter}
        AND breakdown_type NOT IN (${TXN_PARENT_TYPES})
      GROUP BY breakdown_type
      ORDER BY total
    `);

    // ── Query ITEM table leaf types for the right-panel detail breakdown ──
    const EXCLUDE_ITEM_TYPES = ["'ProductCharges'", "'AmazonFees'", "'Shipping'", "'Base'", "'Tax'"].join(",");

    const itemBreakdown = await queryRedshift<ItemBreakdownRow>(`
      SELECT
        breakdown_type,
        SUM(CAST(breakdown_amount AS DECIMAL(18,2))) AS total
      FROM ${ITEM_TABLE}
      WHERE account_id IN (${accountList})
        AND ${dateFilter}
        AND breakdown_type NOT IN (${EXCLUDE_ITEM_TYPES})
      GROUP BY breakdown_type
      ORDER BY total
    `);

    // ── Query individual ReserveDebit entries to identify the latest settlement's reserve ──
    const reserveEntries = await queryRedshift<{ amount: string; report_date: string }>(`
      SELECT
        CAST(breakdown_amount AS DECIMAL(18,2)) AS amount,
        report_start_date AS report_date
      FROM ${TXN_TABLE}
      WHERE account_id IN (${accountList})
        AND ${dateFilter}
        AND breakdown_type = 'ReserveDebit'
      ORDER BY report_start_date DESC, breakdown_amount
    `);

    // ── Query individual FundTransfer entries to find the latest disbursement ──
    const fundEntries = await queryRedshift<{ amount: string; report_date: string }>(`
      SELECT
        CAST(breakdown_amount AS DECIMAL(18,2)) AS amount,
        report_start_date AS report_date
      FROM ${TXN_TABLE}
      WHERE account_id IN (${accountList})
        AND ${dateFilter}
        AND breakdown_type = 'FundTransfer'
      ORDER BY report_start_date DESC
    `);

    // Build lookups
    const txnMap: Record<string, number> = {};
    for (const row of txnBreakdown) {
      txnMap[row.breakdown_type] = parseFloat(row.total) || 0;
    }

    const itemDetail: Record<string, number> = {};
    for (const row of itemBreakdown) {
      itemDetail[row.breakdown_type] = parseFloat(row.total) || 0;
    }

    // ── Compute Amazon-style categories ──

    // Sales = Product charges + Shipping + Inventory Reimbursements
    // (matches Amazon's "Sales" which is "Product Price, Shipping, Gift Wrap and Taxes less Promotions")
    const sales = (txnMap["ProductCharges"] || 0) + (txnMap["Shipping"] || 0)
      + (txnMap["FBAInventoryReimbursement"] || 0);

    // Refunds = Refunded Sales + Refunded Expenses (combined like Amazon)
    const refundedSales = txnMap["Refunded Sales"] || 0;
    const refundedExpenses = txnMap["Refunded Expenses"] || 0;
    const refunds = refundedSales + refundedExpenses;

    // Expenses = ALL fees including advertising (Amazon combines them)
    const expenseLeafTypes = [
      "Commission", "FBAPerUnitFulfillmentFee", "FBAFees",
      "StorageBillingFee", "AWDStorageFees", "LongTermStorageFee",
      "InboundTransportationFee", "AmazonUpstreamStorageTransportationFee",
      "AmazonUpstreamProcessingFee", "SubscriptionFee",
      "PromoRebates", "ShippingChargeback",
      "AdvertisingFee", "FBAReversedReimbursement", "COMPENSATED_CLAWBACK",
    ];
    const expenses = expenseLeafTypes.reduce((s, t) => s + (txnMap[t] || 0), 0);

    // Account Level Reserve — de-duplicate ReserveDebit entries
    // Redshift stores duplicate ReserveDebit rows per settlement event.
    // Find the latest settlement's reserve by looking at the most recent ReserveDebit date,
    // then take just ONE entry from that date (they're duplicated).
    let accountLevelReserve = 0;
    if (reserveEntries.length > 0) {
      // Get unique (amount, date) pairs — the latest date's debit is the current reserve
      const latestDate = new Date(reserveEntries[0].report_date).toISOString().slice(0, 10);
      const latestReserveAmount = parseFloat(reserveEntries[0].amount) || 0;
      accountLevelReserve = latestReserveAmount; // single entry, not the duplicate
    }

    // Beginning Balance — the previous period's reserve carried forward
    // This is the ReserveCredit amount (release of previous reserve).
    // Since ReserveCredit isn't duplicated, use total minus the current period's release.
    const totalReserveCredit = txnMap["ReserveCredit"] || 0;
    // The current period's reserve release equals the absolute value of the previous period's reserve
    // Beginning balance = total ReserveCredit - current period's release
    // But simpler: Beginning Balance = Net Proceeds - Sales - Refunds - Expenses - Reserve
    // where Net Proceeds = latest FundTransfer (the actual disbursement)
    const latestFundTransfer = fundEntries.length > 0 ? parseFloat(fundEntries[0].amount) || 0 : 0;
    const beginningBalance = latestFundTransfer - sales - refunds - expenses - accountLevelReserve;

    // Net Proceeds = Beginning Balance + Sales + Refunds + Expenses + Account Level Reserve
    const netProceeds = beginningBalance + sales + refunds + expenses + accountLevelReserve;
    // (This equals latestFundTransfer by construction, which matches Amazon's disbursement)

    const fundTransfer = latestFundTransfer;

    // Combine into breakdown for backward compatibility
    const breakdown: Record<string, number> = {
      Sales: sales,
      Refunds: refunds,
      Expenses: expenses,
      AccountLevelReserve: accountLevelReserve,
      BeginningBalance: beginningBalance,
      FundTransfer: fundTransfer,
    };

    // Budget pacing (current month)
    const now = new Date();
    const currentMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const today = now.toISOString().slice(0, 10);
    const adSpendRows = await queryRedshift<{ mtd_ad_spend: string }>(`
      SELECT COALESCE(SUM(ad_spend), 0) AS mtd_ad_spend
      FROM (
        SELECT report_date, MAX(ad_spend) AS ad_spend
        FROM "intentwise_ecommerce_graph"."account_summary"
        WHERE account_id IN (${accountList})
          AND report_date >= '${currentMonthStart}'::DATE
          AND report_date <= '${today}'::DATE
        GROUP BY report_date
      ) daily
    `);
    const mtdAdSpend = parseFloat(adSpendRows[0]?.mtd_ad_spend || "0");
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const projectedSpend = daysInMonth > 0 ? (mtdAdSpend / dayOfMonth) * daysInMonth : 0;
    const budgetPacing = client.adSpendBudget ? {
      budget: client.adSpendBudget,
      mtdSpend: mtdAdSpend,
      projectedSpend: Math.round(projectedSpend * 100) / 100,
      pacePercent: Math.round((projectedSpend / client.adSpendBudget) * 100),
      dayOfMonth,
      daysInMonth,
      status: projectedSpend <= client.adSpendBudget * 0.9
        ? "under" as const
        : projectedSpend <= client.adSpendBudget * 1.1
          ? "on-track" as const
          : "over" as const,
    } : null;

    return NextResponse.json({
      client: client.clientFilter,
      clientName: client.clientName,
      statement: {
        periodStart: startDate,
        periodEnd: endDate,
        netProceeds,
        beginningBalance,
        sales,
        refunds,
        expenses,
        accountLevelReserve,
        fundTransfer,
        // Legacy fields for backward compat
        refundedSales,
        refundedExpenses,
        advertisingFee: 0,
        reserveDebit: accountLevelReserve,
        reserveCredit: 0,
        breakdown,
        itemDetail,
      },
      budgetPacing,
      availablePeriods,
    });
  }

  // ── All Statements View ────────────────────────────────────
  if (view === "statements") {
    const monthsBack = parseInt(req.nextUrl.searchParams.get("months") || "6", 10);
    const lookback = new Date();
    lookback.setMonth(lookback.getMonth() - Math.min(Math.max(monthsBack, 1), 12));
    const lookbackDate = lookback.toISOString().slice(0, 10);

    // First try settlement ranges (start != end)
    let rows = await queryRedshift<StatementPeriodRow>(`
      SELECT
        report_start_date,
        report_end_date,
        MAX(download_date) AS download_date,
        breakdown_type,
        SUM(CAST(breakdown_amount AS DECIMAL(18,2))) AS total
      FROM ${TXN_TABLE}
      WHERE account_id IN (${accountList})
        AND report_start_date >= '${lookbackDate}'::DATE
        AND report_start_date <> report_end_date
      GROUP BY report_start_date, report_end_date, breakdown_type
      ORDER BY report_start_date DESC, breakdown_type
    `);

    // Fallback: same-date entries — derive periods from FundTransfer dates
    if (rows.length === 0) {
      rows = await queryRedshift<StatementPeriodRow>(`
        WITH disbursements AS (
          SELECT DISTINCT report_start_date AS settle_date
          FROM ${TXN_TABLE}
          WHERE account_id IN (${accountList})
            AND breakdown_type = 'FundTransfer'
            AND report_start_date >= '${lookbackDate}'::DATE
          ORDER BY settle_date DESC
        ),
        periods AS (
          SELECT
            LAG(settle_date) OVER (ORDER BY settle_date) AS period_start,
            settle_date AS period_end
          FROM disbursements
        )
        SELECT
          COALESCE(p.period_start, t.report_start_date) AS report_start_date,
          p.period_end AS report_end_date,
          MAX(t.download_date) AS download_date,
          t.breakdown_type,
          SUM(CAST(t.breakdown_amount AS DECIMAL(18,2))) AS total
        FROM ${TXN_TABLE} t
        JOIN periods p
          ON t.report_start_date > COALESCE(p.period_start, '1900-01-01'::DATE)
          AND t.report_start_date <= p.period_end
        WHERE t.account_id IN (${accountList})
          AND t.report_start_date >= '${lookbackDate}'::DATE
          AND p.period_start IS NOT NULL
        GROUP BY COALESCE(p.period_start, t.report_start_date), p.period_end, t.breakdown_type
        ORDER BY report_start_date DESC, breakdown_type
      `);
    }

    // Group by period
    const periodMap = new Map<string, {
      periodStart: string;
      periodEnd: string;
      downloadDate: string;
      sales: number;
      refunds: number;
      expenses: number;
      advertising: number;
      other: number;
      netProceeds: number;
      breakdown: Record<string, number>;
    }>();

    for (const row of rows) {
      const startStr = new Date(row.report_start_date).toISOString().slice(0, 10);
      const endStr = new Date(row.report_end_date).toISOString().slice(0, 10);
      const key = `${startStr}_${endStr}`;

      if (!periodMap.has(key)) {
        periodMap.set(key, {
          periodStart: startStr,
          periodEnd: endStr,
          downloadDate: new Date(row.download_date).toISOString().slice(0, 10),
          sales: 0,
          refunds: 0,
          expenses: 0,
          advertising: 0,
          other: 0,
          netProceeds: 0,
          breakdown: {},
        });
      }

      const period = periodMap.get(key)!;
      const amount = parseFloat(row.total) || 0;
      period.breakdown[row.breakdown_type] = amount;

      // Categorize
      if (["Sales", "ProductCharges", "Shipping"].includes(row.breakdown_type)) {
        period.sales += amount;
      } else if (["Refunded Sales", "Refunded Expenses", "ShippingChargeback"].includes(row.breakdown_type)) {
        period.refunds += amount;
      } else if (["AdvertisingFee"].includes(row.breakdown_type)) {
        period.advertising += amount;
      } else if (["Expenses", "AmazonFees", "Commission", "FBAPerUnitFulfillmentFee", "FBAFees",
                   "StorageBillingFee", "AWDStorageFees", "SubscriptionFee", "InboundTransportationFee",
                   "AmazonUpstreamStorageTransportationFee", "AmazonUpstreamProcessingFee",
                   "LongTermStorageFee"].includes(row.breakdown_type)) {
        period.expenses += amount;
      } else {
        period.other += amount;
      }
    }

    // Calculate net
    for (const period of periodMap.values()) {
      period.netProceeds = Object.values(period.breakdown).reduce((s, v) => s + v, 0);
    }

    const statements = Array.from(periodMap.values()).sort(
      (a, b) => b.periodStart.localeCompare(a.periodStart)
    );

    return NextResponse.json({
      client: client.clientFilter,
      clientName: client.clientName,
      statements,
    });
  }

  // ── Transaction View ───────────────────────────────────────
  if (view === "transactions") {
    if (!periodStart || !periodEnd) {
      return NextResponse.json({ error: "periodStart and periodEnd required for transaction view" }, { status: 400 });
    }

    // Check if this account has real settlement ranges or only same-date entries
    const hasRanges = await queryRedshift<{ cnt: string }>(`
      SELECT COUNT(*) AS cnt FROM ${TXN_TABLE}
      WHERE account_id IN (${accountList})
        AND report_start_date = '${periodStart}'::DATE
        AND report_end_date = '${periodEnd}'::DATE
      LIMIT 1
    `);
    const useRange = !hasRanges.length || parseInt(hasRanges[0].cnt) === 0;

    // For real settlement ranges, match exact dates; for derived periods, match date range
    const txnDateFilter = useRange
      ? `report_start_date > '${periodStart}'::DATE AND report_start_date <= '${periodEnd}'::DATE`
      : periodStart !== periodEnd
        ? `report_start_date = '${periodStart}'::DATE AND report_end_date = '${periodEnd}'::DATE`
        : `report_start_date = report_end_date AND report_start_date = '${periodStart}'::DATE`;
    const txnRows = await queryRedshift<TransactionRow>(`
      SELECT
        transaction_id,
        breakdown_type,
        CAST(breakdown_amount AS DECIMAL(18,2)) AS amount,
        report_start_date AS posted_date
      FROM ${TXN_TABLE}
      WHERE account_id IN (${accountList})
        AND ${txnDateFilter}
      ORDER BY report_start_date DESC, transaction_id, breakdown_type
    `);

    // Get SKU/ASIN info from item-level table
    const itemRows = await queryRedshift<{ transaction_id: string; sku: string; quantity: string }>(`
      SELECT
        transaction_id,
        MAX(sku) AS sku,
        SUM(CAST(COALESCE(NULLIF(quantity, ''), '0') AS INT)) AS quantity
      FROM ${ITEM_TABLE}
      WHERE account_id IN (${accountList})
        AND ${txnDateFilter}
      GROUP BY transaction_id
    `);
    const itemMap = new Map(itemRows.map((r) => [r.transaction_id, { sku: r.sku, quantity: parseInt(r.quantity) || 0 }]));

    // Group by transaction
    const txnMap = new Map<string, {
      transactionId: string;
      postedDate: string;
      sku: string;
      quantity: number;
      productCharges: number;
      promoRebates: number;
      amazonFees: number;
      other: number;
      total: number;
    }>();

    for (const row of txnRows) {
      if (!txnMap.has(row.transaction_id)) {
        const item = itemMap.get(row.transaction_id);
        txnMap.set(row.transaction_id, {
          transactionId: row.transaction_id,
          postedDate: row.posted_date ? new Date(row.posted_date).toISOString().slice(0, 10) : "",
          sku: item?.sku || "",
          quantity: item?.quantity || 0,
          productCharges: 0,
          promoRebates: 0,
          amazonFees: 0,
          other: 0,
          total: 0,
        });
      }
      const txn = txnMap.get(row.transaction_id)!;
      const amount = parseFloat(row.amount) || 0;

      if (["ProductCharges", "Sales", "Shipping"].includes(row.breakdown_type)) {
        txn.productCharges += amount;
      } else if (["PromoRebates"].includes(row.breakdown_type)) {
        txn.promoRebates += amount;
      } else if (["AmazonFees", "Commission", "FBAPerUnitFulfillmentFee", "FBAFees",
                   "Expenses"].includes(row.breakdown_type)) {
        txn.amazonFees += amount;
      } else {
        txn.other += amount;
      }
      txn.total += amount;
    }

    const transactions = Array.from(txnMap.values());

    return NextResponse.json({
      client: client.clientFilter,
      clientName: client.clientName,
      periodStart,
      periodEnd,
      transactions,
      transactionCount: transactions.length,
    });
  }

  return NextResponse.json({ error: "Invalid view parameter" }, { status: 400 });
}
