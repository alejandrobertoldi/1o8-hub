/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: [
      "@anthropic-ai/sdk",
      "@google-cloud/bigquery",
      "gcp-metadata",
      "gaxios",
    ],
  },
};

module.exports = nextConfig;
