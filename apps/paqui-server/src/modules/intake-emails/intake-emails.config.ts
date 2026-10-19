import type { ConfigDefinition } from 'figue';
import * as v from 'valibot';
import { booleanishSchema } from '../config/config.schemas';
import { CATCH_ALL_INTAKE_EMAIL_DRIVER_NAME } from './drivers/catch-all/catch-all.intake-email-driver';
import { catchAllIntakeEmailDriverConfig } from './drivers/catch-all/catch-all.intake-email-driver.config';
import { intakeEmailDrivers } from './drivers/intake-emails.drivers';
import { resendIntakeEmailDriverConfig } from './drivers/resend/resend.intake-email-driver.config';
import { intakeEmailUsernameConfig } from './username-drivers/intake-email-username.config';

export const intakeEmailsConfig = {
  isEnabled: {
    doc: 'Whether intake emails are enabled',
    schema: booleanishSchema,
    default: false,
    env: 'INTAKE_EMAILS_IS_ENABLED',
  },
  webhookSecret: {
    doc: 'The Resend webhook signing secret (whsec_...) used to verify inbound email events',
    schema: v.pipe(v.string(), v.minLength(16), v.maxLength(128)),
    default: 'please-change-me',
    env: 'INTAKE_EMAILS_WEBHOOK_SECRET',
  },
  driver: {
    doc: `The driver to use when generating email addresses for intake emails, value can be one of: ${Object.keys(intakeEmailDrivers).map(x => `\`${x}\``).join(', ')}.`,
    schema: v.picklist(Object.keys(intakeEmailDrivers)),
    default: CATCH_ALL_INTAKE_EMAIL_DRIVER_NAME,
    env: 'INTAKE_EMAILS_DRIVER',
  },
  drivers: {
    resend: resendIntakeEmailDriverConfig,
    catchAll: catchAllIntakeEmailDriverConfig,
  },
  username: intakeEmailUsernameConfig,
} as const satisfies ConfigDefinition;
