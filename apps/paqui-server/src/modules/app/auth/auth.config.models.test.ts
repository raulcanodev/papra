import { describe, expect, test } from 'vitest';
import { ensureAuthSecretIsNotDefaultInProduction, ensureGoogleAuthCredentialsAreSet } from './auth.config.models';
import { createAuthSecretIsDefaultError, createGoogleAuthCredentialsMissingError } from './auth.errors';

describe('auth config models', () => {
  describe('ensureAuthSecretIsNotDefaultInProduction', () => {
    const defaultAuthSecret = 'paqui-default-auth-secret-change-me';

    test('throws an error if in production and auth secret is the default one', () => {
      expect(() =>
        ensureAuthSecretIsNotDefaultInProduction({
          config: { auth: { secret: defaultAuthSecret }, env: 'production' },
          defaultAuthSecret,
        }),
      ).toThrow(createAuthSecretIsDefaultError());

      expect(() =>
        ensureAuthSecretIsNotDefaultInProduction({
          config: { auth: { secret: defaultAuthSecret }, env: 'dev' },
          defaultAuthSecret,
        }),
      ).not.toThrow();

      expect(() =>
        ensureAuthSecretIsNotDefaultInProduction({
          config: { auth: { secret: 'a-non-default-secure-secret' }, env: 'production' },
          defaultAuthSecret,
        }),
      ).not.toThrow();
    });
  });

  describe('ensureGoogleAuthCredentialsAreSet', () => {
    test('allows Google authentication when both credentials are set', () => {
      expect(() => ensureGoogleAuthCredentialsAreSet({
        config: {
          auth: {
            providers: {
              google: {
                isEnabled: true,
                clientId: 'google-client-id',
                clientSecret: 'google-client-secret',
              },
            },
          },
        },
      })).not.toThrow();
    });

    test.each([
      { clientId: '', clientSecret: 'google-client-secret' },
      { clientId: 'set-me', clientSecret: 'google-client-secret' },
      { clientId: 'google-client-id', clientSecret: '' },
      { clientId: 'google-client-id', clientSecret: 'set-me' },
    ])('rejects enabled Google authentication with incomplete credentials', ({ clientId, clientSecret }) => {
      expect(() => ensureGoogleAuthCredentialsAreSet({
        config: {
          auth: {
            providers: {
              google: { isEnabled: true, clientId, clientSecret },
            },
          },
        },
      })).toThrow(createGoogleAuthCredentialsMissingError());
    });

    test('allows empty credentials when Google authentication is disabled', () => {
      expect(() => ensureGoogleAuthCredentialsAreSet({
        config: {
          auth: {
            providers: {
              google: { isEnabled: false, clientId: '', clientSecret: '' },
            },
          },
        },
      })).not.toThrow();
    });
  });
});
