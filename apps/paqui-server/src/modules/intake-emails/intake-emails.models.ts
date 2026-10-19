import { createError } from '../shared/errors/errors';
import { isDefined, isNil, uniq } from '../shared/utils';
import { INTAKE_EMAIL_ALIAS_MAX_LENGTH, INTAKE_EMAIL_ALIAS_MIN_LENGTH } from './intake-emails.constants';

export function buildEmailAddress({
  username,
  domain,
  plusPart,
}: {
  username: string;
  domain: string;
  plusPart?: string;
}) {
  return `${username}${isDefined(plusPart) ? `+${plusPart}` : ''}@${domain}`;
}

export function normalizeIntakeEmailAlias({ alias }: { alias: string }) {
  return alias.trim().toLowerCase();
}

export function extractEmailAddress({ value }: { value: string }) {
  const angleBracketAddress = value.match(/<([^<>]+)>\s*$/)?.[1];

  return (angleBracketAddress ?? value).trim().toLowerCase();
}

export function getIsValidIntakeEmailAlias({ alias }: { alias: string }) {
  const normalizedAlias = normalizeIntakeEmailAlias({ alias });

  return normalizedAlias.length >= INTAKE_EMAIL_ALIAS_MIN_LENGTH
    && normalizedAlias.length <= INTAKE_EMAIL_ALIAS_MAX_LENGTH
    && /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(normalizedAlias);
}

export function parseEmailAddress({ email }: { email: string }) {
  const [fullUsername, domain] = email.split('@');

  if (isNil(fullUsername) || isNil(domain)) {
    throw createError({
      message: 'Invalid email address',
      code: 'intake_emails.invalid_email_address',
      statusCode: 400,
    });
  }

  const [username, ...plusParts] = fullUsername.split('+');
  const plusPart = plusParts.length > 0 ? plusParts.join('+') : undefined;

  if (isNil(username)) {
    throw createError({
      message: 'Badly formatted email address',
      code: 'intake_emails.badly_formatted_email_address',
      statusCode: 400,
    });
  }

  return { username, domain, plusPart };
}

export function getEmailUsername({ email }: { email: string | undefined }) {
  if (isNil(email)) {
    return { username: undefined };
  }

  return {
    username: email.split('@')[0],
  };
}

export function getIsFromAllowedOrigin({
  origin,
  allowedOrigins,
}: {
  origin: string;
  allowedOrigins: string[];
}) {
  return allowedOrigins
    .map(allowedOrigin => allowedOrigin.toLowerCase())
    .includes(origin.toLowerCase());
}

export function getRecipientAddresses({ email }: { email: {
  to: { address: string }[];
  originalTo: { address: string }[];
}; }): string[] {
  const { to, originalTo } = email;

  return uniq([...to, ...originalTo].map(({ address }) => address.toLowerCase()));
}

export function getRecipientAddressesFromValues({ recipients }: { recipients: string[] }) {
  return uniq(recipients.map(value => extractEmailAddress({ value })));
}
