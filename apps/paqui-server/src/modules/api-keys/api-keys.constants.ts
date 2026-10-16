import { createPrefixedIdRegex } from '../shared/random/ids';

export const API_KEY_ID_PREFIX = 'ak';
export const API_KEY_ID_REGEX = createPrefixedIdRegex({ prefix: API_KEY_ID_PREFIX });

export const API_KEY_PREFIX = 'ppapi';
export const API_KEY_TOKEN_LENGTH = 64;
export const API_KEY_TOKEN_REGEX = new RegExp(`^${API_KEY_PREFIX}_[A-Za-z0-9]{${API_KEY_TOKEN_LENGTH}}$`);

// Declared in the tool catalog: a tool names the permission it needs, the routes enforce the same list
export { API_KEY_PERMISSIONS, API_KEY_PERMISSIONS_VALUES } from '@paqui/tool-catalog';
