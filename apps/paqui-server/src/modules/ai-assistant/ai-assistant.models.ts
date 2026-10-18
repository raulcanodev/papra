import type { AiReasoningEffort } from '../ai-usage/ai-usage.constants';

export type AiProvider = 'openai' | 'anthropic' | 'xai' | 'google';

export const AI_PROVIDERS: AiProvider[] = ['anthropic', 'openai', 'google', 'xai'];

export const AI_PROVIDER_LABELS: Record<AiProvider, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  xai: 'xAI (Grok)',
};

// US dollars per million tokens, which is also millionths of a dollar per token
export type AiTokenPrices = {
  input: number;
  cacheRead: number;
  // Writing a prompt to the cache, when the provider charges it (Anthropic)
  cacheWrite?: number;
  output: number;
};

export type AiModelDefinition = {
  id: string;
  provider: AiProvider;
  label: string;
  // The reasoning efforts the model accepts, empty when it does not reason or has no setting for it
  efforts: AiReasoningEffort[];
  prices: AiTokenPrices & {
    // Some models charge the whole request more when its prompt is longer than a threshold
    longPrompt?: AiTokenPrices & { aboveTokens: number };
  };
};

// The models that can be chosen from the admin panel, with their prices.
// Prices checked on the providers pages on 2026-10-18: update them here when a provider changes them,
// the usage already recorded keeps the cost computed at the time of the call.
export const AI_MODELS: AiModelDefinition[] = [
  // Anthropic, https://platform.claude.com/docs/en/about-claude/pricing
  {
    id: 'claude-haiku-5-5',
    provider: 'anthropic',
    label: 'Claude Haiku 5.5',
    efforts: ['low', 'medium', 'high', 'max'],
    prices: { input: 0.10, cacheRead: 0.01, cacheWrite: 0.125, output: 0.50, longPrompt: { aboveTokens: 100_000, input: 0.50, cacheRead: 0.05, cacheWrite: 0.625, output: 2.50 } },
  },
  { id: 'claude-sonnet-5-5', provider: 'anthropic', label: 'Claude Sonnet 5.5', efforts: ['low', 'medium', 'high', 'max'], prices: { input: 2, cacheRead: 0.10, cacheWrite: 2.50, output: 10 } },
  { id: 'claude-opus-5-5', provider: 'anthropic', label: 'Claude Opus 5.5', efforts: ['low', 'medium', 'high', 'max'], prices: { input: 4, cacheRead: 0.20, cacheWrite: 5, output: 20 } },

  // xAI, prices of the xAI models page
  { id: 'grok-4-1-fast-non-reasoning', provider: 'xai', label: 'Grok 4.1 Fast', efforts: [], prices: { input: 0.20, cacheRead: 0.05, output: 0.50 } },
  { id: 'grok-4-1-fast-reasoning', provider: 'xai', label: 'Grok 4.1 Fast (reasoning)', efforts: [], prices: { input: 0.20, cacheRead: 0.05, output: 0.50 } },

  // Earlier defaults, kept so a deployment still configured with them is priced
  { id: 'gpt-4o', provider: 'openai', label: 'GPT-4o', efforts: [], prices: { input: 2.50, cacheRead: 1.25, output: 10 } },
  { id: 'gemini-2.5-flash', provider: 'google', label: 'Gemini 2.5 Flash', efforts: [], prices: { input: 0.30, cacheRead: 0.075, output: 2.50 } },
];

export function findAiModel({ modelId }: { modelId: string }) {
  return AI_MODELS.find(model => model.id === modelId);
}

// Used when nothing is chosen: the first configured provider in this order, with its default model
export const DEFAULT_MODELS: Record<AiProvider, string> = {
  anthropic: 'claude-haiku-5-5',
  xai: 'grok-4-1-fast-non-reasoning',
  openai: 'gpt-4o',
  google: 'gemini-2.5-flash',
};

// Anthropic first: with its key set, every AI feature uses Claude Haiku 5.5 with a high reasoning effort,
// no other variable needed. The admin panel (/admin/ai) or AI_MODEL / AI_REASONING_EFFORT change it.
export const PROVIDER_PRIORITY: AiProvider[] = ['anthropic', 'xai', 'google', 'openai'];

// The reasoning effort used with the default model of each provider
export const DEFAULT_REASONING_EFFORTS: Partial<Record<AiProvider, AiReasoningEffort>> = {
  anthropic: 'high',
};
