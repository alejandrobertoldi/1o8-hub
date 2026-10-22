// Helium 10 MCP as the review-intelligence channel: Amazon Customer Feedback
// topic analysis (themes, snippets, star-rating impact, 6-month trends) and
// daily rating history. Runs over the Hub's shared OAuth connection
// (`withSharedConnection` + `withMcp` in src/lib/helium10).
import { normalizeHeliumRatingHistory, normalizeHeliumReviewAnalysis, readMcpJson } from "./normalize";
import type { RatingHistoryPoint, ReviewMarketplace, TopicSnapshotInput } from "./types";

/** Minimal surface of the MCP SDK client we rely on (kept narrow so tests can stub it). */
export type ReviewMcpClient = {
  listTools(params?: { cursor?: string }, options?: { timeout: number }): Promise<{ tools: { name: string }[]; nextCursor?: string }>;
  callTool(params: { name: string; arguments: Record<string, unknown> }, schema?: undefined, options?: { timeout: number }): Promise<unknown>;
};

const ANALYSIS_TOOLS = ["get_asin_review_analysis", "helium_10_get_asin_review_analysis"];
const HISTORY_TOOLS = ["get_asin_reviews_history", "helium_10_get_asin_reviews_history"];
/** Marketplaces the review-analysis tool supports (history supports the full list). */
export const HELIUM_ANALYSIS_MARKETPLACES: ReadonlySet<string> = new Set(["US", "UK", "FR", "IT", "DE", "ES", "JP"]);

export type HeliumReviewTools = { analysis: string | null; history: string | null };

/**
 * Discover the exact review tool names once per connection. Only explicitly
 * recognised read-only tools are ever called, never a model-selected one.
 */
export async function discoverReviewTools(client: ReviewMcpClient, deadline: number): Promise<HeliumReviewTools> {
  const found: HeliumReviewTools = { analysis: null, history: null };
  let cursor: string | undefined;
  const visited = new Set<string>();
  do {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("Helium 10 tool discovery timed out.");
    const page = await client.listTools(cursor ? { cursor } : undefined, { timeout: Math.min(45_000, remaining) });
    for (const tool of page.tools) {
      if (!found.analysis && ANALYSIS_TOOLS.includes(tool.name)) found.analysis = tool.name;
      if (!found.history && HISTORY_TOOLS.includes(tool.name)) found.history = tool.name;
    }
    cursor = page.nextCursor;
    if (cursor && visited.has(cursor)) throw new Error("Helium 10 repeated a tool discovery page.");
    if (cursor) visited.add(cursor);
  } while ((!found.analysis || !found.history) && cursor && visited.size < 50);
  return found;
}

export type HeliumAsinInsights = {
  topics: TopicSnapshotInput | null;
  history: RatingHistoryPoint[];
  /** Helium 10 quota units consumed by this ASIN. */
  callsUsed: number;
  skipped: string[];
};

/** Helium 10 tags every response with a session id; echoing it keeps a sync as one task on their side. */
export function extractGatewaySession(result: unknown): string | null {
  const content = (result as { content?: unknown })?.content;
  if (!Array.isArray(content)) return null;
  for (const item of content) {
    const text = (item as { text?: unknown })?.text;
    if (typeof text !== "string") continue;
    const m = text.match(/\[gateway-meta\]\s*session_id=([A-Za-z0-9._:-]+)/);
    if (m) return m[1];
  }
  return null;
}

export type HeliumFetchOptions = {
  marketplace: ReviewMarketplace;
  tools: HeliumReviewTools;
  deadline: number;
  withTopics?: boolean;
  withHistory?: boolean;
  /** Days of rating history to request. Default 90. */
  historyDays?: number;
  session?: { id: string | null };
};

export async function fetchHeliumAsinInsights(client: ReviewMcpClient, asin: string, options: HeliumFetchOptions): Promise<HeliumAsinInsights> {
  const out: HeliumAsinInsights = { topics: null, history: [], callsUsed: 0, skipped: [] };
  const session = options.session ?? { id: null };
  const call = async (name: string, args: Record<string, unknown>) => {
    const remaining = options.deadline - Date.now();
    if (remaining <= 0) throw new Error("Helium 10 batch timed out.");
    const result = await client.callTool(
      { name, arguments: { ...args, ...(session.id ? { session_id: session.id } : {}), context: "1o8 Hub reviews sync" } },
      undefined,
      { timeout: Math.min(45_000, remaining) },
    );
    out.callsUsed++;
    session.id = session.id ?? extractGatewaySession(result);
    return result;
  };

  if (options.withTopics !== false) {
    if (!options.tools.analysis) out.skipped.push("Review analysis tool is not available for this Helium 10 account.");
    else if (!HELIUM_ANALYSIS_MARKETPLACES.has(options.marketplace)) out.skipped.push(`Review analysis is not offered for marketplace ${options.marketplace}.`);
    else {
      const result = await call(options.tools.analysis, { asin, marketplace: options.marketplace });
      out.topics = normalizeHeliumReviewAnalysis(readMcpJson(result, "Helium 10 review analysis"));
    }
  }

  if (options.withHistory !== false) {
    if (!options.tools.history) out.skipped.push("Rating history tool is not available for this Helium 10 account.");
    else {
      const days = Math.max(7, Math.min(options.historyDays ?? 90, 1095));
      const end = new Date();
      const start = new Date(end.getTime() - days * 86_400_000);
      const result = await call(options.tools.history, {
        asin,
        marketplace: options.marketplace,
        start_date: start.toISOString().slice(0, 10),
        end_date: end.toISOString().slice(0, 10),
      });
      out.history = normalizeHeliumRatingHistory(readMcpJson(result, "Helium 10 rating history"));
    }
  }

  return out;
}
