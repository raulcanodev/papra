import { createErrorFactory } from '../../shared/errors/errors';

export const createUnauthorizedError = createErrorFactory({
  message: 'Unauthorized',
  code: 'auth.unauthorized',
  statusCode: 401,
});

export const createForbiddenError = createErrorFactory({
  message: 'Forbidden',
  code: 'auth.forbidden',
  statusCode: 403,
});

export const createForbiddenDuringImpersonationError = createErrorFactory({
  message: 'Not available while impersonating a user',
  code: 'auth.forbidden_during_impersonation',
  statusCode: 403,
});

export const createForbiddenEmailDomainError = createErrorFactory({
  message: 'Email domain is not allowed',
  code: 'auth.forbidden_email_domain',
  statusCode: 403,
});

export const createAuthSecretIsDefaultError = createErrorFactory({
  code: 'auth.config.secret_is_default',
  message: 'In production, the auth secret must not be the default one. Please set a secure auth secret using the AUTH_SECRET environment variable.',
  statusCode: 500,
  isInternal: true,
});

export const createGoogleAuthCredentialsMissingError = createErrorFactory({
  code: 'auth.config.google_credentials_missing',
  message: 'Google authentication is enabled, but its credentials are missing. Please set AUTH_PROVIDERS_GOOGLE_CLIENT_ID and AUTH_PROVIDERS_GOOGLE_CLIENT_SECRET.',
  statusCode: 500,
  isInternal: true,
});
