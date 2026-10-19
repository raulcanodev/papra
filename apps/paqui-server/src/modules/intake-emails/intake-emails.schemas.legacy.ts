import { z } from 'zod';
import { INTAKE_EMAIL_ALIAS_MAX_LENGTH, INTAKE_EMAIL_ALIAS_MIN_LENGTH, INTAKE_EMAIL_ID_REGEX, RFC_5322_EMAIL_ADDRESS_REGEX } from './intake-emails.constants';
import { normalizeIntakeEmailAlias } from './intake-emails.models';

export const permissiveEmailAddressSchema = z.string().regex(RFC_5322_EMAIL_ADDRESS_REGEX);

export const intakeEmailIdSchema = z.string().regex(INTAKE_EMAIL_ID_REGEX);

export const allowedOriginsSchema = z.array(permissiveEmailAddressSchema.toLowerCase()).optional();

export const intakeEmailAliasSchema = z.string()
  .transform(alias => normalizeIntakeEmailAlias({ alias }))
  .pipe(z.string()
    .min(INTAKE_EMAIL_ALIAS_MIN_LENGTH)
    .max(INTAKE_EMAIL_ALIAS_MAX_LENGTH)
    .regex(/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/));
