import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  turbopack: {
    root: path.join(__dirname),
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "m.media-amazon.com" },
      { protocol: "https", hostname: "images-na.ssl-images-amazon.com" },
    ],
  },
  env: {
    NEXT_PUBLIC_DEPLOY_URL_SLUG: process.env.VERCEL_URL?.split("-").slice(1, -1).join("-") || "local",
    NEXT_PUBLIC_DEPLOY_COMMIT: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "local",
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },
  serverExternalPackages: [
    "@anthropic-ai/sdk",
    "@google-cloud/bigquery",
    "mammoth",
    "gcp-metadata",
    "gaxios",
    "docx",
    "pg",
    "@sparticuz/chromium",
    "puppeteer-core",
  ],
  outputFileTracingIncludes: {
    "/api/reports/monthly": [
      "./node_modules/@sparticuz/chromium/**/*",
    ],
    "/api/reports/monthly/route": [
      "./node_modules/@sparticuz/chromium/**/*",
    ],
    "/api/reports/monthly/pdf": [
      "./node_modules/@sparticuz/chromium/**/*",
    ],
    "/api/reports/monthly/pdf/drive": [
      "./node_modules/@sparticuz/chromium/**/*",
    ],
    "/help/[slug]": [
      "./src/content/help/**/*",
    ],
    "/api/portal/audit": [
      "./src/content/portal-audits/**/*",
    ],
  },
  async redirects() {
    return [
      { source: "/admin", destination: "/admin/users", permanent: false },
      { source: "/sales", destination: "/sales-summary", permanent: false },
      { source: "/aplus2", destination: "/design/aplus2", permanent: false },
      { source: "/aplus2/:path*", destination: "/design/aplus2/:path*", permanent: false },
      // Legacy hub A+ v1. Do not catch public/aplus/*.jpeg previews.
      { source: "/aplus", destination: "/design/aplus2", permanent: false },
      { source: "/aplus/import", destination: "/design/aplus2", permanent: false },
      { source: "/aplus/:productId/compare", destination: "/design/aplus2", permanent: false },
      { source: "/aplus/:productId([^/.]+)", destination: "/design/aplus2", permanent: false },
      { source: "/portal/aplus2", destination: "/portal/design/aplus2", permanent: false },
      { source: "/portal/aplus2/:path*", destination: "/portal/design/aplus2/:path*", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
