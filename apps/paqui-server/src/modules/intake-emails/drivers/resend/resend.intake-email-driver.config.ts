import type { ConfigDefinition } from 'figue';
import * as v from 'valibot';

export const resendIntakeEmailDriverConfig = {
  domain: {
    doc: 'The custom domain configured for inbound email in Resend',
    schema: v.string(),
    default: 'heypaqui.com',
    env: 'INTAKE_EMAILS_RESEND_DOMAIN',
  },
} as const satisfies ConfigDefinition;
