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
    doc: 'The default model identifier to use (e.g. gpt-4o, grok-4-1-fast-non-reasoning). If not set, uses the first available provider\'s default model.',
    schema: v.optional(v.string()),
    default: undefined,
    env: 'AI_MODEL',
  },
} as const satisfies AppConfigDefinition;
