import type { ConfigDefinition } from 'figue';
import * as v from 'valibot';

export const autosendEmailDriverConfig = {
  autosendApiKey: {
    doc: 'The API key for the AutoSend email service',
    schema: v.string(),
    default: '',
    env: 'AUTOSEND_API_KEY',
  },
} as const satisfies ConfigDefinition;
