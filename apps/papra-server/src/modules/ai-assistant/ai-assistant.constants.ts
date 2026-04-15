import { createPrefixedIdRegex } from '../shared/random/ids';

export const AI_CHAT_SESSION_ID_PREFIX = 'acs';
export const AI_CHAT_SESSION_ID_REGEX = createPrefixedIdRegex({ prefix: AI_CHAT_SESSION_ID_PREFIX });

export const AI_CHAT_MESSAGE_ID_PREFIX = 'acm';
export const AI_CHAT_MESSAGE_ID_REGEX = createPrefixedIdRegex({ prefix: AI_CHAT_MESSAGE_ID_PREFIX });
