/**
 * Geocode `fulfillment_centers` rows that have no latitude/longitude.
 *
 *   tsx scripts/_geocode-fulfillment-centers.ts --out results.json            # geocode, no DB writes
 *   tsx scripts/_geocode-fulfillment-centers.ts --from results.json --apply   # write a reviewed results file
 *
 * Passes, most precise first:
 *   1. US Census batch geocoder (street address, US only, no key).
 *   2. OpenStreetMap Nominatim free-text address (CA + Census misses), 1 req/s per its usage policy.
 *   3. Nominatim postal code, then city — centroid fallbacks.
 * A point is kept ONLY if it falls in the row's own state/province; anything else stays NULL.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

type Row = { code: string; country: "US" | "CA"; region: string; city: string | null; postal_code: string | null; address: string | null };
type Hit = { code: string; lat: number; lon: number; precision: "street" | "osm-address" | "postal" | "city" };

const UA = "MFHub-FC-geocoder/1.0 (manu@marketfoundry.agency)";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function streetOf(address: string): string {
  return address.split(",")[0].split(/\s[–—-]\s/)[0].trim();
}

async function censusBatch(rows: Row[]): Promise<Map<string, Hit>> {
  const out = new Map<string, Hit>();
  const esc = (s: string) => `"${s.replace(/"/g, "'")}"`;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const csv = chunk
      .map((r) => [r.code, streetOf(r.address!), r.city ?? "", r.region, r.postal_code ?? ""].map(esc).join(","))
      .join("\n");
    const form = new FormData();
    form.append("addressFile", new Blob([csv], { type: "text/csv" }), "fc.csv");
    form.append("benchmark", "Public_AR_Current");
    const res = await fetch("https://geocoding.geo.census.gov/geocoder/locations/addressbatch", { method: "POST", body: form });
    if (!res.ok) throw new Error(`Census batch HTTP ${res.status}`);
    const text = await res.text();
    for (const line of text.split("\n")) {
      // "id","input","Match","Exact","matched address","lon,lat","tigerId","side"
      const cells = [...line.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
      if (cells[2] !== "Match") continue;
      const matched = cells[4] ?? "";
      const [lon, lat] = (cells[5] ?? "").split(",").map(Number);
      const row = chunk.find((r) => r.code === cells[0]);
      if (!row || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      if (!new RegExp(`, ${row.region}, \\d{5}`).test(matched)) continue; // state guard
      out.set(row.code, { code: row.code, lat, lon, precision: "street" });
    }
    console.log(`  census chunk ${i / 500 + 1}: ${out.size} matched so far`);
  }
  return out;
}

async function nominatim(params: Record<string, string>, row: Row): Promise<{ lat: number; lon: number } | null> {
  const qs = new URLSearchParams({ ...params, format: "jsonv2", addressdetails: "1", limit: "1", countrycodes: row.country.toLowerCase() });
  await sleep(1100);
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${qs}`, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;
  const [hit] = (await res.json()) as { lat: string; lon: string; address?: Record<string, string> }[];
  if (!hit) return null;
  const iso = hit.address?.["ISO3166-2-lvl4"] ?? "";
  if (iso !== `${row.country}-${row.region}`) return null; // state/province guard
  return { lat: Number(hit.lat), lon: Number(hit.lon) };
}

async function fallback(row: Row): Promise<Hit | null> {
  if (row.address) {
    const p = await nominatim({ q: row.address.replace(/\s[–—-]\s.*$/, "") }, row);
    if (p) return { code: row.code, ...p, precision: "osm-address" };
  }
  if (row.postal_code) {
    const p = await nominatim({ postalcode: row.postal_code, country: row.country }, row);
    if (p) return { code: row.code, ...p, precision: "postal" };
  }
  if (row.city) {
    const p = await nominatim({ city: row.city, state: row.region, country: row.country }, row);
    if (p) return { code: row.code, ...p, precision: "city" };
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const arg = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
  const fs = await import("fs");
  const postgres = (await import("postgres")).default;
  const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("Neither DIRECT_DATABASE_URL nor DATABASE_URL is set");
  const sql = postgres(url, { max: 1 });

  try {
    const from = arg("--from");
    if (from) {
      if (!args.includes("--apply")) throw new Error("--from requires --apply");
      const hits = JSON.parse(fs.default.readFileSync(from, "utf8")).hits as Hit[];
      await sql.begin(async (txRaw) => {
        const tx = txRaw as unknown as typeof sql;
        for (const h of hits) {
          await tx`UPDATE fulfillment_centers SET latitude = ${h.lat}, longitude = ${h.lon}, updated_at = now()
                   WHERE code = ${h.code} AND latitude IS NULL`;
        }
      });
      const [c] = await sql`SELECT count(*) FILTER (WHERE latitude IS NOT NULL)::int AS geo, count(*)::int AS n FROM fulfillment_centers`;
      console.log(`APPLIED ${hits.length} points. geocoded now ${c.geo}/${c.n}`);
      return;
    }

    const out = arg("--out");
    if (!out) throw new Error("usage: --out results.json | --from results.json --apply");
    const rows = (await sql`SELECT code, country, region, city, postal_code, address
                            FROM fulfillment_centers WHERE latitude IS NULL ORDER BY code`) as unknown as Row[];
    console.log(`rows to geocode: ${rows.length}`);

    const hits = await censusBatch(rows.filter((r) => r.country === "US" && r.address));
    const rest = rows.filter((r) => !hits.has(r.code));
    console.log(`census: ${hits.size}; falling back on ${rest.length} (~${Math.ceil((rest.length * 1.1 * 2) / 60)} min worst case)`);
    const misses: string[] = [];
    for (const [i, r] of rest.entries()) {
      const h = await fallback(r);
      if (h) hits.set(r.code, h);
      else misses.push(r.code);
      if ((i + 1) % 50 === 0) console.log(`  fallback ${i + 1}/${rest.length}`);
    }
    const list = [...hits.values()];
    const by = list.reduce<Record<string, number>>((a, h) => ((a[h.precision] = (a[h.precision] ?? 0) + 1), a), {});
    console.log(`\nDONE. located ${list.length}/${rows.length}`, by, `unlocated ${misses.length}`);
    fs.default.writeFileSync(out, JSON.stringify({ hits: list, misses }, null, 1));
    console.log(`wrote ${out} — no DB writes. Apply with --from ${out} --apply`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
