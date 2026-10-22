// ═══════════════════════════════════════════════════════════════
// Projects API
// GET /api/projects — List all projects
// POST /api/projects — Create new project
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db";
import { createAuthServerClient } from "@/lib/auth";

export async function GET() {
  try {
    const auth = createAuthServerClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("projects")
      .select("id, name, brand_name, status, current_phase, created_at, updated_at, s1_approved_at, s2_approved_at, s3_approved_at, s4_approved_at, s5_approved_at, s6_approved_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json(data || []);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = createAuthServerClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = createServerClient();
    const body = await req.json();

    const { data, error } = await supabase
      .from("projects")
      .insert({
        user_id: user.id,
        name: body.name || "New Project",
        brand_name: body.brand_name || "",
        status: "draft",
        current_phase: "S1",
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
