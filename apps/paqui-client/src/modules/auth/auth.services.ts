import type { Config } from '../config/config';

import type { SsoProviderConfig } from './auth.types';
import { buildUrl } from '@corentinth/chisels';
import { genericOAuthClient, twoFactorClient } from 'better-auth/client/plugins';
import { createAuthClient as createBetterAuthClient } from 'better-auth/solid';
import { buildTimeConfig, isDemoMode } from '../config/config';
import { queryClient } from '../shared/query/query-client';
import { trackingServices } from '../tracking/tracking.services';
import { createDemoAuthClient } from './auth.demo.services';

export function createAuthClient() {
  const client = createBetterAuthClient({
    baseURL: buildTimeConfig.baseApiUrl,
    plugins: [
      genericOAuthClient(),
      twoFactorClient(),
    ],
  });

  return {
    // we can't spread the client because it is a proxy object
    signIn: client.signIn,
    signUp: client.signUp,
    requestPasswordReset: client.requestPasswordReset,
    resetPassword: client.resetPassword,
    sendVerificationEmail: client.sendVerificationEmail,
    twoFactor: client.twoFactor,
    changePassword: client.changePassword,
    listAccounts: client.listAccounts,
    linkSocial: client.linkSocial,
    unlinkAccount: client.unlinkAccount,
    oauth2: client.oauth2,
    getSession: client.getSession,
    signOut: async () => {
      trackingServices.capture({ event: 'User logged out' });
      const result = await client.signOut();
      trackingServices.reset();

      queryClient.clear();

      return result;
    },
  };
}

export const {
  getSession,
  signIn,
  signUp,
  signOut,
  requestPasswordReset,
  resetPassword,
  sendVerificationEmail,
  twoFactor,
  changePassword,
  listAccounts,
  linkSocial,
  unlinkAccount,
  oauth2,
} = isDemoMode
  ? createDemoAuthClient()
  : createAuthClient();

export async function authWithProvider({ provider, config }: { provider: SsoProviderConfig; config: Config }) {
  const isCustomProvider = config.auth.providers.customs.some(({ providerId }) => providerId === provider.key);

  if (isCustomProvider) {
    const { error } = await signIn.oauth2({
      providerId: provider.key,
      callbackURL: config.baseUrl,
    });

    if (error) {
      throw error;
    }

    return;
  }

  const { error } = await signIn.social({ provider: provider.key as 'github' | 'google', callbackURL: config.baseUrl });

  if (error) {
    throw error;
  }
}

export async function linkProvider({ provider, config }: { provider: SsoProviderConfig; config: Config }) {
  const isCustomProvider = config.auth.providers.customs.some(({ providerId }) => providerId === provider.key);
  const callbackURL = buildUrl({ baseUrl: config.baseUrl, path: '/settings' });

  if (isCustomProvider) {
    const { error } = await oauth2.link({ providerId: provider.key, callbackURL });

    if (error) {
      throw error;
    }

    return;
  }

  const { error } = await linkSocial({
    provider: provider.key as 'github' | 'google',
    callbackURL,
    errorCallbackURL: callbackURL,
  });

  if (error) {
    throw error;
  }
}
