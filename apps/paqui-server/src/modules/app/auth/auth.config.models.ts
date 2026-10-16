import { DEFAULT_AUTH_SECRET } from './auth.constants';
import { createAuthSecretIsDefaultError, createGoogleAuthCredentialsMissingError } from './auth.errors';

export function ensureAuthSecretIsNotDefaultInProduction({
  config,
  defaultAuthSecret = DEFAULT_AUTH_SECRET,
}: {
  config: { auth: { secret: string }; env: string };
  defaultAuthSecret?: string;
}) {
  if (config.env === 'production' && config.auth.secret === defaultAuthSecret) {
    throw createAuthSecretIsDefaultError();
  }
}

export function ensureGoogleAuthCredentialsAreSet({
  config,
}: {
  config: {
    auth: {
      providers: {
        google: {
          isEnabled: boolean;
          clientId: string;
          clientSecret: string;
        };
      };
    };
  };
}) {
  const { isEnabled, clientId, clientSecret } = config.auth.providers.google;
  const isMissing = (value: string) => value.trim() === '' || value === 'set-me';

  if (isEnabled && (isMissing(clientId) || isMissing(clientSecret))) {
    throw createGoogleAuthCredentialsMissingError();
  }
}
