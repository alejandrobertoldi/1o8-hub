import { hasAdminPowers } from "@/lib/roles";
/* eslint-disable react-doctor/js-combine-iterations */
/* eslint-disable react-doctor/async-await-in-loop */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { stagedAlrLinks, stagedClrProducts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { parseAlr, type AlrRow } from "@/lib/alr-parser";

export const maxDuration = 60;

interface AlrLinkRow {
  sku: string;
  asin: string;
  status: string;
}

interface PreviewResponse {
  totalRows: number;
  statusCounts: { active: number; inactive: number; incomplete: number; other: number };
  joinReport: { matched: number; alrOnly: number; clrOnly: number };
  parsedRows: AlrLinkRow[];
}

interface ExecuteRequestBody {
  clientIdCode: string;
  parsedRows: AlrLinkRow[];
}

interface ExecuteResponse {
  staged: number;
}

function isAuthorizedRole(role: unknown): boolean {
  return hasAdminPowers(typeof role === "string" ? role : null) || role === "editor";
}

function statusBucket(status: string): "active" | "inactive" | "incomplete" | "other" {
  const s = status.trim().toLowerCase();
  if (s === "active") return "active";
  if (s === "inactive") return "inactive";
  if (s === "incomplete") return "incomplete";
  return "other";
}

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAuthorizedRole(session.user?.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const phase = new URL(req.url).searchParams.get("phase");
  if (phase !== "preview" && phase !== "execute") {
    return NextResponse.json(
      { error: "Missing or invalid ?phase= (must be 'preview' or 'execute')" },
      { status: 400 }
    );
  }

  if (phase === "preview") {
    const formData = await req.formData();
    const fileEntry = formData.get("file");
    const file = fileEntry instanceof File ? fileEntry : null;
    const clientIdCode = String(formData.get("clientIdCode") ?? "").trim();
    if (!file) return NextResponse.json({ error: "Missing file" }, { status: 400 });
    if (!clientIdCode) {
      return NextResponse.json({ error: "Missing clientIdCode" }, { status: 400 });
    }

    let alrRows: AlrRow[];
    try {
      alrRows = parseAlr(await file.text());
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Parse error";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    // Strip down to SKU↔ASIN link rows (drop empty-sku rows — those are
    // parent-variation rows that have no link to make).
    const linkRows: AlrLinkRow[] = alrRows
      .filter((r) => r.sellerSku && r.sellerSku.trim() !== "")
      .map((r) => ({
        sku: r.sellerSku,
        asin: r.asin1 ?? "",
        status: r.status ?? "",
      }));

    const counts = { active: 0, inactive: 0, incomplete: 0, other: 0 };
    for (const r of linkRows) counts[statusBucket(r.status)] += 1;

    // Join report against staged_clr_products
    const clrRows = await db
      .select({ sku: stagedClrProducts.sku })
      .from(stagedClrProducts)
      .where(eq(stagedClrProducts.clientIdCode, clientIdCode));
    const clrSkus = new Set(clrRows.map((r) => r.sku));
    const alrSkus = new Set(linkRows.map((r) => r.sku));
    let matched = 0;
    let alrOnly = 0;
    for (const sku of alrSkus) {
      if (clrSkus.has(sku)) matched += 1;
      else alrOnly += 1;
    }
    let clrOnly = 0;
    for (const sku of clrSkus) {
      if (!alrSkus.has(sku)) clrOnly += 1;
    }

    const body: PreviewResponse = {
      totalRows: linkRows.length,
      statusCounts: counts,
      joinReport: { matched, alrOnly, clrOnly },
      parsedRows: linkRows,
    };
    return NextResponse.json(body);
  }

  // phase === execute
  const body = (await req.json()) as ExecuteRequestBody;
  if (!body.clientIdCode || !Array.isArray(body.parsedRows)) {
    return NextResponse.json(
      { error: "Missing clientIdCode or parsedRows" },
      { status: 400 }
    );
  }

  await db
    .delete(stagedAlrLinks)
    .where(eq(stagedAlrLinks.clientIdCode, body.clientIdCode));

  if (body.parsedRows.length > 0) {
    const inserts = body.parsedRows.map((r) => ({
      clientIdCode: body.clientIdCode,
      sku: r.sku,
      asin: r.asin || null,
      status: r.status || null,
    }));
    for (let i = 0; i < inserts.length; i += 200) {
      await db.insert(stagedAlrLinks).values(inserts.slice(i, i + 200));
    }
  }

  const response: ExecuteResponse = { staged: body.parsedRows.length };
  return NextResponse.json(response);
}
