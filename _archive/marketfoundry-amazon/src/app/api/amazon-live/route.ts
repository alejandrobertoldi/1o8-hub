/* eslint-disable react-doctor/nextjs-no-side-effect-in-get-handler */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.RAINFOREST_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Rainforest API key not configured" },
      { status: 500 }
    );
  }

  const { searchParams } = req.nextUrl;
  const asin = searchParams.get("asin");
  const amazonDomain = searchParams.get("amazon_domain") || "amazon.com";

  if (!asin) {
    return NextResponse.json(
      { error: "Missing required parameter: asin" },
      { status: 400 }
    );
  }

  try {
    const url = new URL("https://api.rainforestapi.com/request");
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("type", "product");
    url.searchParams.set("asin", asin);
    url.searchParams.set("amazon_domain", amazonDomain);

    const response = await fetch(url.toString(), { signal: AbortSignal.timeout(50000), cache: "no-store" });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Rainforest API returned ${response.status}` },
        { status: response.status >= 500 ? 503 : response.status }
      );
    }

    const data = await response.json();

    if (data.request_info?.success === false) {
      return NextResponse.json(
        { error: data.request_info?.message || "Rainforest request failed" },
        { status: 502 }
      );
    }

    return NextResponse.json({ product: data.product });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return NextResponse.json(
        { error: "Rainforest API request timed out" },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: "Failed to fetch from Rainforest API" },
      { status: 503 }
    );
  }
}
