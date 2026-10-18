import type { AppConfigDefinition } from '../config/config.types';
import * as v from 'valibot';

export const aiAssistantConfig = {
  openaiApiKey: {
    doc: 'The API key for OpenAI.',
    schema: v.optional(v.string()),
    default: undefined,
    env: 'AI_OPENAI_API_KEY',
  },
  anthropicApiKey: {
    doc: 'The API key for Anthropic.',
    schema: v.optional(v.string()),
    default: undefined,
    env: 'AI_ANTHROPIC_API_KEY',
  },
  grokApiKey: {
    doc: 'The API key for xAI (Grok).',
    schema: v.optional(v.string()),
    default: undefined,
    env: 'AI_GROK_API_KEY',
  },
  googleApiKey: {
    doc: 'The API key for Google AI (Gemini).',
    schema: v.optional(v.string()),
    default: undefined,
    env: 'AI_GOOGLE_API_KEY',
  },
  model: {
    doc: 'The default model identifier (e.g. claude-haiku-5-5, grok-4-1-fast-non-reasoning); its provider is the one of the model. If not set, the first configured provider and its default model. The model chosen in the admin panel takes precedence.',
    schema: v.optional(v.string()),
    default: undefined,
    env: 'AI_MODEL',
  },
  reasoningEffort: {
    doc: 'The default reasoning effort of the model (low, medium, high, max) when it accepts one. The model and effort chosen in the admin panel take precedence.',
    schema: v.optional(v.picklist(['low', 'medium', 'high', 'max'])),
    default: undefined,
    env: 'AI_REASONING_EFFORT',
  },
  tavilyApiKey: {
    doc: 'The API key for Tavily web search.',
    schema: v.optional(v.string()),
    default: undefined,
    env: 'TAVILY_API_KEY',
  },
} as const satisfies AppConfigDefinition;
