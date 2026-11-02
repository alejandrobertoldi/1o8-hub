/* eslint-disable react-doctor/server-fetch-without-revalidate */
/* eslint-disable react-doctor/async-await-in-loop */
import { NextResponse } from "next/server";

export const maxDuration = 300;

const ROUTES = ["subscribe-save"];
const BATCH_SIZE = 3;

type Range = { id: string; start: string; end: string };
type Client = { name: string; accountIds: string[] };

export async function POST(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as { ranges: Range[]; clients: Client[] };
  const { ranges, clients } = body;

  const baseUrl = process.env.NEXTAUTH_URL || (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000");

  const headers = {
    Authorization: `Bearer ${cronSecret}`,
    "x-cron-refresh": "true",
  };

  let ok = 0;
  let errors = 0;

  for (const range of ranges) {
    for (let i = 0; i < clients.length; i += BATCH_SIZE) {
      const batch = clients.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (client) => {
          const accountId = client.accountIds.join(",");
          const promises = ROUTES.map((route) => {
            const url = `${baseUrl}/api/reports/${route}?accountId=${accountId}&start=${range.start}&end=${range.end}&refresh=true`;
            return fetch(url, { headers }).then((r) => r.ok).catch(() => false);
          });
          return Promise.all(promises);
        }),
      );
      for (const clientResults of results) {
        for (const success of clientResults) {
          if (success) ok++;
          else errors++;
        }
      }
    }
  }

  return NextResponse.json({ worker: "subscribe-save", ok, errors });
}
