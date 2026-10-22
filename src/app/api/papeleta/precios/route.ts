import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      error: "Not implemented",
      detalle:
        "papeleta/precios is a pre-merge stub; port to sheets-client (GCP_* env vars) before enabling.",
    },
    { status: 501 }
  );
}
