import { NextResponse } from "next/server";
import { requireTeamUser } from "../route";
import { listActiveCategories } from "@/lib/hours/queries";

export async function GET() {
  const auth = await requireTeamUser();
  if (auth instanceof NextResponse) return auth;
  const categories = await listActiveCategories();
  return NextResponse.json({ categories });
}
