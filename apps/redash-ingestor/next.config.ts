import type { NextConfig } from "next";

const rawBasePath = process.env.NEXT_PUBLIC_REDASH_INGESTOR_BASE_PATH?.trim() ?? "";
const redashIngestorBasePath = rawBasePath === "/" ? "" : rawBasePath.replace(/\/+$/, "");

if (redashIngestorBasePath && !redashIngestorBasePath.startsWith("/")) {
  throw new Error("NEXT_PUBLIC_REDASH_INGESTOR_BASE_PATH must start with / when set.");
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(redashIngestorBasePath ? { basePath: redashIngestorBasePath } : {})
};

export default nextConfig;
