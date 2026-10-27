import type { LanguageModelV3, LanguageModelV3CallOptions } from '@ai-sdk/provider';
import type { AiFeature, AiReasoningEffort } from '../ai-usage/ai-usage.constants';
import type { Database } from '../app/database/database.types';
import type { Config } from '../config/config.types';
import type { AiProvider } from './ai-assistant.models';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createXai } from '@ai-sdk/xai';
import { createLogger } from '@crowlog/logger';
import { getRequestAiUsageContext } from '../ai-usage/ai-usage.context';
import { getAiCallCostUsdMicros } from '../ai-usage/ai-usage.prices';
import { createAiUsageRepository } from '../ai-usage/ai-usage.repository';
import { createUsageTrackedModel } from '../ai-usage/ai-usage.tracking';
import { createAiNotConfiguredError } from './ai-assistant.errors';
import { AI_PROVIDERS, DEFAULT_MODELS, DEFAULT_REASONING_EFFORTS, findAiModel, PROVIDER_PRIORITY } from './ai-assistant.models';

// THE ONLY PLACE LANGUAGE MODELS ARE CREATED. Every AI feature gets its model from getAiModel, which:
// - uses the provider, model and reasoning effort chosen in the admin panel (or the environment),
// - records the tokens and cost of every call in ai_usage, attributed to the feature, workspace and member.
// ai-usage.guard.test.ts fails if provider SDKs are imported, or models created, anywhere else.

const logger = createLogger({ namespace: 'ai' });

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

function isKeySet(value: string | undefined): value is string {
  return value !== undefined && value !== '';
}

function getApiKeys({ config }: { config: Config }): AiApiKeys {
  const { openaiApiKey, anthropicApiKey, grokApiKey, googleApiKey } = config.aiAssistant;
  return { openaiApiKey, anthropicApiKey, grokApiKey, googleApiKey };
}

export function getConfiguredProviders(apiKeys: AiApiKeys): AiProvider[] {
  return PROVIDER_PRIORITY.filter(provider => isKeySet(apiKeys[API_KEY_BY_PROVIDER[provider]]));
}

export function isAiConfigured({ config }: { config: Config }) {
  return getConfiguredProviders(getApiKeys({ config })).length > 0;
}

export type AiModelSelection = { provider: AiProvider; model: string; reasoningEffort: AiReasoningEffort | null };

// The model the environment asks for: AI_MODEL with the provider it belongs to, else the first configured provider
export function getEnvironmentAiModelSelection({ config }: { config: Config }): AiModelSelection | null {
  const configuredProviders = getConfiguredProviders(getApiKeys({ config }));
  const { model, reasoningEffort } = config.aiAssistant;
  const known = isKeySet(model) ? findAiModel({ modelId: model }) : undefined;
  const provider = known && configuredProviders.includes(known.provider) ? known.provider : configuredProviders[0];

  if (provider === undefined) {
    return null;
  }

  const modelId = known?.provider === provider ? known.id : (isKeySet(model) && !known ? model : DEFAULT_MODELS[provider]);
  const defaultEffort = modelId === DEFAULT_MODELS[provider] ? DEFAULT_REASONING_EFFORTS[provider] : undefined;

  return { provider, model: modelId, reasoningEffort: reasoningEffort ?? defaultEffort ?? null };
}

// The admin panel choice when its provider has a key, else the environment one
export async function getAiModelSelection({ config, db }: { config: Config; db: Database }): Promise<AiModelSelection> {
  const { settings } = await createAiUsageRepository({ db }).getSettings();
  const configuredProviders = getConfiguredProviders(getApiKeys({ config }));

  if (settings && (AI_PROVIDERS as string[]).includes(settings.provider) && configuredProviders.includes(settings.provider as AiProvider)) {
    return { provider: settings.provider as AiProvider, model: settings.model, reasoningEffort: settings.reasoningEffort };
  }

  if (settings) {
    logger.warn({ provider: settings.provider }, 'The AI provider chosen in the admin panel has no API key, using the environment configuration');
  }

  const selection = getEnvironmentAiModelSelection({ config });
  if (!selection) {
    throw createAiNotConfiguredError();
  }
  return selection;
}

function createProviderModel({ provider, apiKey, model }: { provider: AiProvider; apiKey: string; model: string }): LanguageModelV3 {
  if (provider === 'anthropic') {
    // Explicit, so an ANTHROPIC_BASE_URL meant for another tool on the machine never redirects the calls
    return createAnthropic({ apiKey, baseURL: 'https://api.anthropic.com/v1' })(model);
  }
  if (provider === 'xai') {
    return createXai({ apiKey })(model);
  }
  if (provider === 'google') {
    return createGoogleGenerativeAI({ apiKey })(model);
  }
  return createOpenAI({ apiKey })(model);
}

// Anthropic structured outputs reject a schema with more parameters typed as a union (nullable, anyOf) than this
const ANTHROPIC_MAX_UNION_PARAMETERS = 16;

export function countUnionParameters({ schema }: { schema: unknown }): number {
  if (Array.isArray(schema)) {
    return schema.reduce((count: number, item) => count + countUnionParameters({ schema: item }), 0);
  }

  if (schema === null || typeof schema !== 'object') {
    return 0;
  }

  const node = schema as Record<string, unknown>;
  const isUnion = Array.isArray(node.type) || Array.isArray(node.anyOf) || Array.isArray(node.oneOf);

  return (isUnion ? 1 : 0) + Object.values(node).reduce((count: number, value) => count + countUnionParameters({ schema: value }), 0);
}

// The reasoning effort in the shape each provider expects, merged with what the call already asks for
export function withReasoningEffort({ options, selection }: { options: LanguageModelV3CallOptions; selection: AiModelSelection }): LanguageModelV3CallOptions {
  const effort = selection.reasoningEffort;
  const model = findAiModel({ modelId: selection.model });

  if (effort === null || model === undefined || !model.efforts.includes(effort)) {
    return options;
  }

  const providerOptions = { ...options.providerOptions };

  if (selection.provider === 'anthropic') {
    // Thinking needs the native output format, which refuses schemas with many nullable fields: those are read without it
    if (options.responseFormat?.type === 'json' && countUnionParameters({ schema: options.responseFormat.schema }) > ANTHROPIC_MAX_UNION_PARAMETERS) {
      logger.warn({ model: selection.model }, 'Structured output schema has too many nullable fields for thinking, reading it without');
      return { ...options, providerOptions: { ...providerOptions, anthropic: { ...providerOptions.anthropic, thinking: { type: 'disabled' }, structuredOutputMode: 'jsonTool' } } };
    }

    // Structured outputs through the native output format: forcing a tool is not allowed while thinking
    providerOptions.anthropic = { effort, thinking: { type: 'adaptive' }, structuredOutputMode: 'outputFormat', ...providerOptions.anthropic };
  } else if (selection.provider === 'openai' || selection.provider === 'xai') {
    providerOptions[selection.provider] = { reasoningEffort: effort === 'max' ? 'high' : effort, ...providerOptions[selection.provider] };
  }

  return { ...options, providerOptions };
}

/**
 * The language model of an AI feature. Use it for every AI call (generateText, streamText, generateObject...):
 * the model, provider and reasoning effort come from the admin panel, and the usage is recorded without slowing the call.
 * The workspace and member are taken from the current request; background jobs pass the organization themselves.
 */
export function getAiModel({ config, db, feature, organizationId, userId }: {
  config: Config;
  db: Database;
  feature: AiFeature;
  organizationId?: string | null;
  userId?: string | null;
}): LanguageModelV3 {
  const requestContext = getRequestAiUsageContext();
  const attribution = { feature, organizationId: organizationId ?? requestContext.organizationId, userId: userId ?? requestContext.userId };

  const resolve = async () => {
    const effective = await getAiModelSelection({ config, db });
    const apiKey = getApiKeys({ config })[API_KEY_BY_PROVIDER[effective.provider]];

    if (!isKeySet(apiKey)) {
      throw createAiNotConfiguredError();
    }

    const model = createProviderModel({ provider: effective.provider, apiKey, model: effective.model });
    return { provider: effective.provider, modelId: effective.model, model, transformOptions: (options: LanguageModelV3CallOptions) => withReasoningEffort({ options, selection: effective }) };
  };

  return createUsageTrackedModel({
    resolve,
    // Written after the call, never awaited by it: a failing insert is logged, the feature keeps working
    onUsage: (usage) => {
      createAiUsageRepository({ db })
        .recordUsage({ usage: { ...attribution, ...usage, costUsdMicros: getAiCallCostUsdMicros({ model: findAiModel({ modelId: usage.model }), tokens: usage }) } })
        .catch(error => logger.error({ error, feature }, 'Could not record the AI usage'));
    },
  });
}
