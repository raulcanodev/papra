import { SPANISH_OFFICIAL_DOMAINS } from '@paqui/tool-catalog';
import { tool, zodSchema } from 'ai';
import { z } from 'zod';

type TavilyResponse = {
  answer?: string;
  results: Array<{ title: string; url: string; content: string; score: number; published_date?: string }>;
};

export async function searchTavily({ apiKey, query, searchDepth, maxResults, includeDomains, fetchFn = fetch }: {
  apiKey: string;
  query: string;
  searchDepth: 'basic' | 'advanced';
  maxResults: number;
  includeDomains?: readonly string[];
  fetchFn?: typeof fetch;
}) {
  const response = await fetchFn('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: searchDepth,
      max_results: maxResults,
      include_answer: true,
      ...(includeDomains === undefined ? {} : { include_domains: includeDomains }),
    }),
  });

  if (!response.ok) {
    return { error: `Web search failed (${response.status})` };
  }

  const data = await response.json() as TavilyResponse;

  return {
    answer: data.answer ?? null,
    results: data.results.map(result => ({
      title: result.title,
      url: result.url,
      snippet: result.content,
      relevanceScore: result.score,
      publishedDate: result.published_date ?? null,
    })),
    query,
  };
}

const searchSpanishTaxSourcesParams = z.object({
  query: z.string().min(1).max(400).describe('What to look up, in Spanish, with the year when it matters, e.g. "plazo modelo 303 cuarto trimestre 2026" or "retención IRPF profesionales inicio de actividad".'),
  searchDepth: z.enum(['basic', 'advanced']).default('advanced'),
  maxResults: z.number().int().min(1).max(10).default(6),
});

// Search restricted to the official domains (AEAT, BOE, Seguridad Social, Hacienda, EU): the way the assistant keeps
// its Spanish tax knowledge current instead of answering from memory.
export function createSpanishTaxSourcesTool({ tavilyApiKey }: { tavilyApiKey: string }) {
  return tool({
    description: 'Search the OFFICIAL Spanish sources only (Agencia Tributaria, BOE, Hacienda, Seguridad Social, EU). Use it to verify anything that changes: rates, thresholds, deadlines, new obligations, Verifactu dates. Pair it with get_spanish_tax_reference, and cite the url of what you used. Prefer it over webSearch for Spanish tax and invoicing questions.',
    inputSchema: zodSchema(searchSpanishTaxSourcesParams),
    execute: async ({ query, searchDepth, maxResults }) => searchTavily({ apiKey: tavilyApiKey, query, searchDepth, maxResults, includeDomains: SPANISH_OFFICIAL_DOMAINS }),
  });
}
