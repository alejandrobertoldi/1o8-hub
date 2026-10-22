import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { seoSettings } from "@/lib/db/schema";
import { getAuthSession } from "@/lib/auth-db";
import { eq } from "drizzle-orm";
import { hasAdminPowers } from "@/lib/roles";

export const maxDuration = 60;

export interface AsanaTaskTemplate {
  name: string;
  notes: string;
}

export interface AsanaSectionTemplate {
  name: string;
  tasks: AsanaTaskTemplate[];
}

export interface AsanaConfig {
  teamGid: string;
  projectNameFormat: string; // e.g. "{CIC} - {ClientName}"
  defaultView: string;
  sections: AsanaSectionTemplate[];
}

const CONFIG_KEY = "asana_config";

/** GET — return current Asana config */
export async function GET() {
  const session = await getAuthSession();
  if (!session || !hasAdminPowers(session.user.role)) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  try {
    const [row] = await db
      .select({
        value: seoSettings.value,
        updatedAt: seoSettings.updatedAt,
        updatedBy: seoSettings.updatedBy,
      })
      .from(seoSettings)
      .where(eq(seoSettings.key, CONFIG_KEY))
      .limit(1);

    const config: AsanaConfig | null = row?.value ? JSON.parse(row.value) : null;

    return NextResponse.json({
      config,
      updatedAt: row?.updatedAt ?? null,
      updatedBy: row?.updatedBy ?? null,
    });
  } catch (err) {
    console.error("Failed to load Asana config:", err);
    return NextResponse.json({ error: "Failed to load config" }, { status: 500 });
  }
}

/** PUT — save Asana config */
export async function PUT(req: NextRequest) {
  const session = await getAuthSession();
  if (!session || !hasAdminPowers(session.user.role)) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const config = body.config as AsanaConfig;

    if (!config || !config.teamGid || !Array.isArray(config.sections)) {
      return NextResponse.json({ error: "Invalid config" }, { status: 400 });
    }

    const updatedBy = session.user.email ?? session.user.name ?? "admin";
    const value = JSON.stringify(config);

    await db
      .insert(seoSettings)
      .values({
        key: CONFIG_KEY,
        value,
        updatedAt: new Date(),
        updatedBy,
      })
      .onConflictDoUpdate({
        target: seoSettings.key,
        set: { value, updatedAt: new Date(), updatedBy },
      });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to save Asana config:", err);
    return NextResponse.json({ error: "Failed to save config" }, { status: 500 });
  }
}
