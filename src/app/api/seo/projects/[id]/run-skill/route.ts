/* eslint-disable react-doctor/server-sequential-independent-await */
// ═══════════════════════════════════════════════════════════════
// SEO Skill Runner API
// POST — trigger a skill (competitive)
// GET  — fetch saved results for skills
//
// Note: validation and geo_check skills were absorbed into the
// premium audit in S6.6 (/api/seo/claude/seo-audit).
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import {
  getSkillConfig,
  runCompetitiveAnalysis,
  loadCompetitiveData,
} from "@/lib/seo-skill-runner";

export const maxDuration = 300;

const VALID_SKILLS = ["competitive"] as const;
type SkillName = (typeof VALID_SKILLS)[number];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId } = await params;
  const body = await req.json();
  const skill = body.skill as SkillName;

  if (!VALID_SKILLS.includes(skill)) {
    return NextResponse.json({ error: `Invalid skill: ${skill}. Valid: ${VALID_SKILLS.join(", ")}` }, { status: 400 });
  }

  // Check if skill is enabled
  const config = await getSkillConfig();
  const configMap: Record<SkillName, boolean> = {
    competitive: config.s0_competitive,
  };

  if (!configMap[skill] && !body.force) {
    return NextResponse.json({ error: `Skill "${skill}" is disabled. Enable it in /seo/config or pass force: true.` }, { status: 403 });
  }

  const userEmail = session.user?.email || "system";

  try {
    let result;
    switch (skill) {
      case "competitive":
        result = await runCompetitiveAnalysis(projectId, userEmail);
        break;
    }
    return NextResponse.json({ skill, result });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId } = await params;

  const [competitive, config] = await Promise.all([
    loadCompetitiveData(projectId),
    getSkillConfig(),
  ]);

  return NextResponse.json({ competitive, config });
}
