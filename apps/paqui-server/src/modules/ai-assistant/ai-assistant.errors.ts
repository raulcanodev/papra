import { createError } from '../shared/errors/errors';

export function createAiNotConfiguredError() {
  return createError({
    message: 'AI assistant is not configured. Set AI_OPENAI_API_KEY or AI_ANTHROPIC_API_KEY environment variables.',
    code: 'ai_assistant.not_configured',
    statusCode: 503,
  });
}

export function createTranscriptionFailedError() {
  return createError({
    message: 'The audio could not be transcribed.',
    code: 'ai_assistant.transcription_failed',
    statusCode: 502,
  });
}
