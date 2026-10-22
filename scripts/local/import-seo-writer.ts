/**
 * Imports brand voice + SEO context from the 1o8 SEO blog tool (seo-writer)
 * into client_brand_voice. Reads, per client folder:
 *   brand.md (YAML front matter), keywords.md, product-facts.md, internal-links.md
 * Each folder is matched to a hub client by website domain (brand.md `url`
 * vs. aac raw_data BrandURL); pass --map slug=CODE to override.
 *
 * Never reads seo-writer's config.json (it holds API keys and OAuth tokens).
 *
 * Usage: npm run import:seo-writer -- [--dir ~/Documents/1o8/Ops/SEO/seo-writer] [--map le-petit-sucre=LPS] [--dry-run]
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import yaml from "js-yaml";

const args = process.argv.slice(2);
const argVal = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const dryRun = args.includes("--dry-run");
const baseDir = (argVal("--dir") ?? "~/Documents/1o8/Ops/SEO/seo-writer").replace(/^~/, os.homedir());
const overrides = Object.fromEntries(
  args.flatMap((a, i) => (args[i - 1] === "--map" ? [a.split("=") as [string, string]] : [])),
);

function frontMatter(raw: string): { data: Record<string, unknown>; body: string } {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: raw };
  return { data: (yaml.load(m[1]) as Record<string, unknown>) ?? {}, body: m[2] };
}

/** Rows of the first markdown pipe table in `body`, keyed by header. */
function table(body: string): Record<string, string>[] {
  const lines = body.split("\n").filter((l) => l.trim().startsWith("|"));
  if (lines.length < 2) return [];
  const cells = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  const head = cells(lines[0]).map((h) => h.toLowerCase());
  return lines.slice(2).map((l) => Object.fromEntries(cells(l).map((c, i) => [head[i], c])));
}

async function read(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return null;
  }
}

const domain = (u: unknown) =>
  typeof u === "string" && u ? u.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].toLowerCase() : "";
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const strArr = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
const int = (v: string | undefined) => (v && /^\d+$/.test(v.replace(/,/g, "")) ? Number(v.replace(/,/g, "")) : null);

async function main() {
  const { db } = await import("../../src/lib/db");
  const { aac } = await import("../../src/lib/db/schema");
  const { brandVoiceSchema } = await import("../../src/lib/brand-voice/types");
  const { saveBrandVoice } = await import("../../src/lib/brand-voice/queries");

  const clientsDir = path.join(baseDir, "clients");
  const slugs = (await fs.readdir(clientsDir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);

  const aacRows = await db.select({ code: aac.clientIdCode, raw: aac.rawData }).from(aac);
  const byDomain = new Map<string, string>();
  for (const r of aacRows) {
    const d = domain((r.raw as Record<string, string> | null)?.BrandURL);
    if (d) byDomain.set(d, r.code);
  }

  for (const slug of slugs) {
    const brandRaw = await read(path.join(clientsDir, slug, "brand.md"));
    if (!brandRaw) continue;
    const b = frontMatter(brandRaw).data;
    const code = overrides[slug] ?? byDomain.get(domain(b.url));
    if (!code) {
      console.log(`- ${slug}: no hub client with domain "${domain(b.url)}". Re-run with --map ${slug}=CODE`);
      continue;
    }

    const kw = await read(path.join(clientsDir, slug, "keywords.md"));
    const pf = await read(path.join(clientsDir, slug, "product-facts.md"));
    const il = await read(path.join(clientsDir, slug, "internal-links.md"));
    const pfParsed = pf ? frontMatter(pf) : null;
    const audience = (b.audience ?? {}) as Record<string, unknown>;

    const voice = brandVoiceSchema.parse({
      blogUrl: str(b.blogUrl),
      platform: str(b.platform),
      valueProp: str(b.valueProp),
      whyExists: str(b.whyExists),
      tone: str(b.tone),
      personality: strArr(b.personality),
      audience: { floor: str(audience.floor), middle: str(audience.middle), ceiling: str(audience.ceiling) },
      voiceExamples: (Array.isArray(b.voiceExamples) ? b.voiceExamples : [])
        .map((e: Record<string, unknown>) => ({ offBrand: str(e?.offBrand), onBrand: str(e?.onBrand) }))
        .filter((e) => e.offBrand || e.onBrand),
      signaturePhrases: strArr(b.signaturePhrases),
      bannedPhrases: strArr(b.bannedPhrases),
      competitors: (Array.isArray(b.competitors) ? b.competitors : [])
        .map((c: Record<string, unknown>) => ({ name: str(c?.name), url: str(c?.url) }))
        .filter((c) => c.name || c.url),
      referencePosts: strArr(b.referencePosts),
      keywords: kw
        ? table(frontMatter(kw).body)
            .filter((r) => r.keyword)
            .map((r) => ({
              keyword: r.keyword,
              volume: int(r.volume),
              kd: int(r.kd) === null ? null : Math.min(100, int(r.kd)!),
              intent: (r.intent ?? "").toLowerCase(),
              priority: (r.priority ?? "").toLowerCase(),
            }))
        : [],
      productFacts: pfParsed?.body.trim() ?? "",
      productFactsScannedUrls: strArr(pfParsed?.data.scannedUrls),
      internalLinks: il
        ? table(frontMatter(il).body)
            .filter((r) => r.url)
            .map((r) => ({ title: r.title ?? "", url: r.url, keyword: r.keyword ?? "" }))
        : [],
    });

    console.log(
      `- ${slug} → ${code}: ${voice.keywords.length} keywords, ${voice.internalLinks.length} internal links, ` +
        `${voice.competitors.length} competitors, product facts ${voice.productFacts.length} chars${dryRun ? " (dry run)" : ""}`,
    );
    if (!dryRun) await saveBrandVoice(code, voice, { source: `seo-writer:${slug}`, updatedBy: "import:seo-writer" });
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
