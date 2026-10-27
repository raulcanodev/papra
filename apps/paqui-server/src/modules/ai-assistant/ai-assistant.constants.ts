import { createPrefixedIdRegex } from '../shared/random/ids';

export const AI_CHAT_SESSION_ID_PREFIX = 'acs';
export const AI_CHAT_SESSION_ID_REGEX = createPrefixedIdRegex({ prefix: AI_CHAT_SESSION_ID_PREFIX });

export const AI_CHAT_MESSAGE_ID_PREFIX = 'acm';
export const AI_CHAT_MESSAGE_ID_REGEX = createPrefixedIdRegex({ prefix: AI_CHAT_MESSAGE_ID_PREFIX });

// A dictated message: a few minutes of compressed audio at most, under the 25 MB the transcription API accepts
export const MAX_DICTATION_AUDIO_SIZE_BYTES = 20 * 1024 * 1024;
