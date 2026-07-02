function normalizeBasePath(value: string | undefined) {
  const trimmed = (value ?? "").trim();

  if (!trimmed || trimmed === "/") {
    return "";
  }

  const withoutTrailingSlash = trimmed.replace(/\/+$/, "");
  return withoutTrailingSlash.startsWith("/") ? withoutTrailingSlash : `/${withoutTrailingSlash}`;
}

export const redashIngestorBasePath = normalizeBasePath(
  process.env.NEXT_PUBLIC_REDASH_INGESTOR_BASE_PATH
);

export function withRedashIngestorBasePath(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${redashIngestorBasePath}${normalizedPath}`;
}
