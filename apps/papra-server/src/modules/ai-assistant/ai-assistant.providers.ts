import type { LanguageModel } from 'ai';
import type { Config } from '../config/config.types';
import type { AiProvider } from './ai-assistant.models';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createXai } from '@ai-sdk/xai';
import { createAiNotConfiguredError } from './ai-assistant.errors';
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
  const [provider] = configuredProviders;
  if (provider !== undefined) {
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

// The model of the first configured provider, for server side features (document reading, suggestions...)
export function getConfiguredLlmModel({ config }: { config: Config }): LanguageModel {
  const { openaiApiKey, anthropicApiKey, grokApiKey, googleApiKey, model } = config.aiAssistant;
  const apiKeys = { openaiApiKey, anthropicApiKey, grokApiKey, googleApiKey };
  const [provider] = getConfiguredProviders(apiKeys);
  const apiKey = provider === undefined ? undefined : getApiKeyForProvider({ provider, apiKeys });

  if (provider === undefined || apiKey === undefined || apiKey === '') {
    throw createAiNotConfiguredError();
  }

  return createLlmModel({ provider, apiKey, model });
}
