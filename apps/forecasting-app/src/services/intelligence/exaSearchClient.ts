import type { ExaSearchResult, IntelligenceQuery } from "./types";

type ExaClientOptions = {
  apiKey: string;
  fetchImpl?: typeof fetch;
};

type ExaResponse = {
  results?: Array<{
    id?: string;
    url?: string;
    title?: string;
    publishedDate?: string;
    author?: string;
    text?: string;
    highlights?: string[];
    summary?: string;
  }>;
};

export class ExaSearchClient {
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ExaClientOptions) {
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async search(query: IntelligenceQuery): Promise<ExaSearchResult[]> {
    const sinceDate = new Date(Date.now() - query.recencyDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const response = await this.fetchImpl("https://api.exa.ai/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey
      },
      body: JSON.stringify({
        query: query.query,
        numResults: query.maxResults,
        startPublishedDate: sinceDate,
        type: "auto",
        contents: {
          text: {
            maxCharacters: 1200
          },
          highlights: true,
          summary: true
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Exa search failed with status ${response.status}.`);
    }

    const payload = (await response.json()) as ExaResponse;
    return (payload.results ?? [])
      .filter((result) => typeof result.url === "string" && result.url.trim())
      .map((result) => ({
        id: result.id ?? null,
        url: result.url ?? "",
        title: result.title ?? null,
        publishedAt: result.publishedDate ?? null,
        authorOrSource: result.author ?? null,
        snippet: result.summary ?? result.highlights?.join(" ") ?? result.text?.slice(0, 500) ?? null,
        raw: result
      }));
  }
}

