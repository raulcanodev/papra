import type { LanguageModel } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';

export type AiProvider = 'openai' | 'anthropic';

const DEFAULT_MODELS: Record<AiProvider, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-20250514',
};

export function getConfiguredProviders({ openaiApiKey, anthropicApiKey }: {
  openaiApiKey?: string;
  anthropicApiKey?: string;
}): AiProvider[] {
  const providers: AiProvider[] = [];

  if (openaiApiKey !== undefined && openaiApiKey !== '') {
    providers.push('openai');
  }

  if (anthropicApiKey !== undefined && anthropicApiKey !== '') {
    providers.push('anthropic');
  }

  return providers;
}

export function getDefaultModel({ configuredProviders }: { configuredProviders: AiProvider[] }): string {
  if (configuredProviders.includes('openai')) {
    return DEFAULT_MODELS.openai;
  }

  if (configuredProviders.includes('anthropic')) {
    return DEFAULT_MODELS.anthropic;
  }

  return DEFAULT_MODELS.openai;
}

export function createLlmModel({ provider, apiKey, model }: {
  provider: AiProvider;
  apiKey: string;
  model?: string;
}): LanguageModel {
  const modelId = model !== undefined && model !== '' ? model : DEFAULT_MODELS[provider];

  if (provider === 'anthropic') {
    const anthropic = createAnthropic({ apiKey });
    return anthropic(modelId);
  }

  const openai = createOpenAI({ apiKey });
  return openai(modelId);
}
