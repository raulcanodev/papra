import { createError } from '../shared/errors/errors';

export const createAiNotConfiguredError = () => createError({
  message: 'AI assistant is not configured. Set AI_API_KEY and AI_PROVIDER environment variables.',
  code: 'ai_assistant.not_configured',
  statusCode: 503,
});
