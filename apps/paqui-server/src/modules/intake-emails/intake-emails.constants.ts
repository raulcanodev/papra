import { createPrefixedIdRegex } from '../shared/random/ids';

export const INTAKE_EMAIL_ID_PREFIX = 'ie';
export const INTAKE_EMAIL_ID_REGEX = createPrefixedIdRegex({ prefix: INTAKE_EMAIL_ID_PREFIX });
export const INTAKE_EMAIL_DELIVERY_ID_PREFIX = 'ied';

export const INTAKE_EMAIL_DELIVERY_STATUSES = ['processed', 'no_attachments', 'blocked_sender', 'address_disabled'] as const;

export const INTAKE_EMAIL_ALIAS_MIN_LENGTH = 3;
export const INTAKE_EMAIL_ALIAS_MAX_LENGTH = 48;

export const INTAKE_EMAILS_INGEST_ROUTE = '/api/intake-emails/ingest' as const;

// Copied from https://github.com/colinhacks/zod/blob/main/packages/zod/src/v4/core/regexes.ts#L42 while waiting to migrate to zod v4
// eslint-disable-next-line regexp/no-useless-escape, regexp/prefer-d, regexp/strict, regexp/use-ignore-case
export const RFC_5322_EMAIL_ADDRESS_REGEX = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
