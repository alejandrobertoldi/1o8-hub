/* eslint-disable react-doctor/async-await-in-loop */
/**
 * Amazon SP-API client with token management, rate limiting, and batch operations.
 */

export interface SPAPIConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  marketplaceId: string;
  sellerId: string;
  region: "na" | "eu" | "fe";
}

const REGION_ENDPOINTS: Record<string, string> = {
  na: "https://sellingpartnerapi-na.amazon.com",
  eu: "https://sellingpartnerapi-eu.amazon.com",
  fe: "https://sellingpartnerapi-fe.amazon.com",
};

export const MARKETPLACE_REGIONS: Record<string, string> = {
  ATVPDKIKX0DER: "na", // US
  A2EUQ1WTGCTBG2: "na", // CA
  A1AM78C64UM0Y8: "eu", // MX
  A1F83G8C2ARO7P: "eu", // UK
  A1PA6795UKMFR9: "eu", // DE
  A13V1IB3VIYZZH: "eu", // FR
  APJ6JRA9NG5V4: "eu", // IT
  A1RKKUPIHCS9HS: "eu", // ES
};

/* eslint-disable @typescript-eslint/no-explicit-any */
export type CatalogItem = any;
export type ListingItem = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

interface TokenCache {
  accessToken: string;
  expiresAt: number; // unix ms
}

export class SPAPIClient {
  private config: SPAPIConfig;
  private tokenCache: TokenCache | null = null;
  private endpoint: string;

  constructor(config: SPAPIConfig) {
    this.config = config;
    this.endpoint =
      REGION_ENDPOINTS[config.region] ?? REGION_ENDPOINTS.na;
  }

  /**
   * Exchange refresh token for an access token via LWA.
   * Caches the token and reuses it until 60s before expiry.
   */
  async getAccessToken(): Promise<string> {
    if (
      this.tokenCache &&
      Date.now() < this.tokenCache.expiresAt
    ) {
      return this.tokenCache.accessToken;
    }

    const res = await fetch("https://api.amazon.com/auth/o2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: this.config.refreshToken,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`LWA token exchange failed (${res.status}): ${body}`);
    }

    const data = (await res.json()) as {
      access_token: string;
      expires_in: number;
    };

    this.tokenCache = {
      accessToken: data.access_token,
      // Expire 60s early to avoid edge-case failures
      expiresAt: Date.now() + (data.expires_in - 60) * 1000,
    };

    return this.tokenCache.accessToken;
  }

  /**
   * Generic SP-API request with automatic auth and 429 retry.
   */
  async request(
    path: string,
    params?: Record<string, string>,
    maxRetries = 3
  ): Promise<unknown> {
    const token = await this.getAccessToken();
    const url = new URL(path, this.endpoint);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
      }
    }

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const res = await fetch(url.toString(), {
        headers: {
          "x-amz-access-token": token,
          "Content-Type": "application/json",
        },
      });

      if (res.status === 429) {
        const retryAfter = res.headers.get("Retry-After");
        const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 2000;
        const backoff = waitMs * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`SP-API ${path} failed (${res.status}): ${body}`);
      }

      return res.json();
    }

    throw new Error(`SP-API ${path} failed after ${maxRetries + 1} attempts (rate limited)`);
  }

  /**
   * Fetch a single catalog item by ASIN.
   */
  async getCatalogItem(asin: string): Promise<CatalogItem> {
    return this.request(
      `/catalog/2022-04-01/items/${encodeURIComponent(asin)}`,
      {
        marketplaceIds: this.config.marketplaceId,
        includedData: "attributes,images,summaries,productTypes",
      }
    );
  }

  /**
   * Fetch a listing item by SKU (includes keywords/search terms).
   */
  async getListingItem(sku: string): Promise<ListingItem> {
    return this.request(
      `/listings/2021-08-01/items/${encodeURIComponent(this.config.sellerId)}/${encodeURIComponent(sku)}`,
      {
        marketplaceIds: this.config.marketplaceId,
        includedData: "attributes,issues,offers",
      }
    );
  }

  /**
   * Batch-fetch catalog items with 250ms delay between requests.
   * Continues on per-ASIN errors.
   */
  async getCatalogItemsBatch(
    asins: string[],
    onProgress?: (completed: number, total: number) => void
  ): Promise<Map<string, CatalogItem>> {
    const results = new Map<string, CatalogItem>();

    for (let i = 0; i < asins.length; i++) {
      const asin = asins[i];
      try {
        const item = await this.getCatalogItem(asin);
        results.set(asin, item);
      } catch (err) {
        console.error(`SP-API: Failed to fetch ASIN ${asin}:`, err);
      }
      onProgress?.(i + 1, asins.length);

      // 250ms delay between requests to stay under rate limits
      if (i < asins.length - 1) {
        await new Promise((r) => setTimeout(r, 250));
      }
    }

    return results;
  }
}
