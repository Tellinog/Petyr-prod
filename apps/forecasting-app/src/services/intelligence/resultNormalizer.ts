import { createHash } from "node:crypto";
import type { ExaSearchResult, NormalizedSignalResult } from "./types";

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function canonicalizeUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]) {
      url.searchParams.delete(key);
    }
    const path = url.pathname.replace(/\/+$/, "") || "/";
    return `${url.protocol}//${url.hostname.toLowerCase()}${path}${url.search}`;
  } catch {
    return value.trim();
  }
}

export function getSourceDomain(value: string) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function normalizeTitle(value: string | null) {
  const normalized = value?.trim().replace(/\s+/g, " ");
  return normalized || null;
}

function parseDate(value: string | null) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp);
}

export function normalizeExaResult(result: ExaSearchResult): NormalizedSignalResult | null {
  const url = result.url?.trim();
  if (!url) return null;

  const canonicalUrl = canonicalizeUrl(url);
  const normalizedTitle = normalizeTitle(result.title);
  const snippet = result.snippet?.trim() || null;
  const publishedAt = parseDate(result.publishedAt);
  const eventBasis = [
    canonicalUrl,
    normalizedTitle?.toLowerCase() ?? "",
    publishedAt ? publishedAt.toISOString().slice(0, 10) : "",
    snippet?.toLowerCase().slice(0, 240) ?? ""
  ].join("|");

  return {
    providerResultId: result.id,
    url,
    canonicalUrl,
    sourceDomain: getSourceDomain(canonicalUrl),
    title: normalizedTitle,
    normalizedTitle,
    publishedAt,
    authorOrSource: result.authorOrSource?.trim() || null,
    snippet,
    raw: result.raw,
    contentHash: hash(eventBasis),
    eventSignature: hash(eventBasis).slice(0, 32)
  };
}

