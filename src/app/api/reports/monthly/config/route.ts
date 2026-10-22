import { hasAdminPowers } from "@/lib/roles";
/* eslint-disable react-doctor/js-set-map-lookups */
/* eslint-disable react-doctor/async-await-in-loop */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reportSectionConfig } from "@/lib/db/schema";
import { getAuthSession } from "@/lib/auth-db";
import { ALL_SECTION_KEYS } from "@/lib/monthly-report";
import type { SectionKey } from "@/lib/monthly-report";
import { badRequest, forbidden, unauthorized, serverError } from "@/lib/api-utils";

type SectionFlags = Partial<Record<SectionKey, boolean>>;
interface ConfigPayload {
  global: Record<SectionKey, boolean>;
  clients: Record<string, SectionFlags>;
}

export async function GET() {
  const session = await getAuthSession();
  if (!session) return unauthorized();
  if (!hasAdminPowers(session.user.role)) return forbidden();

  try {
    const rows = await db.select().from(reportSectionConfig);

    const global = Object.fromEntries(ALL_SECTION_KEYS.map((k) => [k, true])) as Record<SectionKey, boolean>;
    const clients: Record<string, SectionFlags> = {};
    for (const r of rows as Array<{ scope: string; scopeKey: string; sectionKey: string; enabled: boolean }>) {
      const key = r.sectionKey as SectionKey;
      if (!ALL_SECTION_KEYS.includes(key)) continue;
      if (r.scope === "global" && r.scopeKey === "default") {
        global[key] = r.enabled;
      } else if (r.scope === "client") {
        clients[r.scopeKey] = clients[r.scopeKey] ?? {};
        clients[r.scopeKey][key] = r.enabled;
      }
    }
    return NextResponse.json({ global, clients } satisfies ConfigPayload);
  } catch (err) {
    return serverError(err);
  }
}

function isValidFlags(obj: unknown): obj is SectionFlags {
  if (!obj || typeof obj !== "object") return false;
  for (const k of Object.keys(obj)) {
    if (!ALL_SECTION_KEYS.includes(k as SectionKey)) return false;
    const v = (obj as Record<string, unknown>)[k];
    if (typeof v !== "boolean") return false;
  }
  return true;
}

export async function PUT(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return unauthorized();
  if (!hasAdminPowers(session.user.role)) return forbidden();

  let body: { global?: unknown; clients?: unknown };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  if (!isValidFlags(body.global)) return badRequest("Invalid `global` section flags");
  const clientsRaw = body.clients ?? {};
  if (!clientsRaw || typeof clientsRaw !== "object") return badRequest("Invalid `clients` object");
  for (const [code, flags] of Object.entries(clientsRaw as Record<string, unknown>)) {
    if (!isValidFlags(flags)) return badRequest(`Invalid flags for client ${code}`);
  }

  try {
    // Upsert global rows
    for (const [section, enabled] of Object.entries(body.global)) {
      await db
        .insert(reportSectionConfig)
        .values({ scope: "global", scopeKey: "default", sectionKey: section, enabled: enabled as boolean })
        .onConflictDoUpdate({
          target: [reportSectionConfig.scope, reportSectionConfig.scopeKey, reportSectionConfig.sectionKey],
          set: { enabled: enabled as boolean },
        });
    }
    // Upsert per-client rows
    for (const [code, flags] of Object.entries(clientsRaw as Record<string, SectionFlags>)) {
      for (const [section, enabled] of Object.entries(flags)) {
        await db
          .insert(reportSectionConfig)
          .values({ scope: "client", scopeKey: code, sectionKey: section, enabled: enabled as boolean })
          .onConflictDoUpdate({
            target: [reportSectionConfig.scope, reportSectionConfig.scopeKey, reportSectionConfig.sectionKey],
            set: { enabled: enabled as boolean },
          });
      }
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return serverError(err);
  }
}
