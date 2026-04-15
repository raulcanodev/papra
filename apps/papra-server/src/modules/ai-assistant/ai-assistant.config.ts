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
  model: {
    doc: 'The default model identifier to use (e.g. gpt-4o, claude-sonnet-4-20250514). If not set, uses the first available provider\'s default model.',
    schema: v.optional(v.string()),
    default: undefined,
    env: 'AI_MODEL',
  },
} as const satisfies AppConfigDefinition;
