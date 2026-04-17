import type { LanguageModel } from 'ai';
import type { AiProvider } from './ai-assistant.models';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createXai } from '@ai-sdk/xai';
import { DEFAULT_MODELS, PROVIDER_PRIORITY } from './ai-assistant.models';

export type AiApiKeys = {
  openaiApiKey?: string;
  anthropicApiKey?: string;
  grokApiKey?: string;
  googleApiKey?: string;
};

const API_KEY_BY_PROVIDER: Record<AiProvider, keyof AiApiKeys> = {
  openai: 'openaiApiKey',
  anthropic: 'anthropicApiKey',
  xai: 'grokApiKey',
  google: 'googleApiKey',
};

function isKeySet(value: string | undefined): boolean {
  return value !== undefined && value !== '';
}

export function getConfiguredProviders(apiKeys: AiApiKeys): AiProvider[] {
  return PROVIDER_PRIORITY.filter(provider => isKeySet(apiKeys[API_KEY_BY_PROVIDER[provider]]));
}

export function getApiKeyForProvider({ provider, apiKeys }: { provider: AiProvider; apiKeys: AiApiKeys }): string | undefined {
  return apiKeys[API_KEY_BY_PROVIDER[provider]];
}

export function getDefaultModel({ configuredProviders }: { configuredProviders: AiProvider[] }): string {
  for (const provider of configuredProviders) {
    return DEFAULT_MODELS[provider];
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

  if (provider === 'xai') {
    const xai = createXai({ apiKey });
    return xai(modelId);
  }

  if (provider === 'google') {
    const google = createGoogleGenerativeAI({ apiKey });
    return google(modelId);
  }

  const openai = createOpenAI({ apiKey });
  return openai(modelId);
}
