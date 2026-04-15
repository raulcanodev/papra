import { createError } from '../shared/errors/errors';

export const createAiNotConfiguredError = () => createError({
  message: 'AI assistant is not configured. Set AI_OPENAI_API_KEY or AI_ANTHROPIC_API_KEY environment variables.',
  code: 'ai_assistant.not_configured',
  statusCode: 503,
});
