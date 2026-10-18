import { createAuthMiddleware } from 'better-auth/api';
import { twoFactor } from 'better-auth/plugins';

// better-auth only asks for the second factor on password sign-ins, these are the
// other routes that create a session from a third party identity
const OAUTH_CALLBACK_PATHS = ['/callback/:id', '/oauth2/callback/:providerId'];
const ID_TOKEN_SIGN_IN_PATH = '/sign-in/social';

export const TWO_FACTOR_REQUIRED_QUERY_PARAM = 'two-factor';

export function isOAuthCallbackPath({ path }: { path?: string }) {
  return OAUTH_CALLBACK_PATHS.includes(path ?? '');
}

export function isTwoFactorRedirectResponse({ response }: { response: unknown }): boolean {
  if (typeof response !== 'object' || response === null) {
    return false;
  }

  if ('twoFactorRedirect' in response) {
    return response.twoFactorRedirect === true;
  }

  // better-call json responses wrap the payload in a body
  return 'body' in response && isTwoFactorRedirectResponse({ response: response.body });
}

export function keepLastSetCookieForEachName({ headers }: { headers: Headers }) {
  const cookies = headers.getSetCookie();
  const lastCookieByName = new Map<string, string>();

  for (const cookie of cookies) {
    const name = cookie.slice(0, cookie.indexOf('='));
    lastCookieByName.set(name, cookie);
  }

  headers.delete('set-cookie');
  for (const cookie of lastCookieByName.values()) {
    headers.append('set-cookie', cookie);
  }
}

export function getTwoFactorRequiredRedirectUrl({ location, clientBaseUrl }: { location?: string | null; clientBaseUrl: string }) {
  const loginUrl = new URL('/login', clientBaseUrl);
  loginUrl.searchParams.set(TWO_FACTOR_REQUIRED_QUERY_PARAM, 'required');

  if (location == null || location === '') {
    return loginUrl.toString();
  }

  let target: URL;
  try {
    target = new URL(location, clientBaseUrl);
  } catch {
    return loginUrl.toString();
  }

  if (target.origin === loginUrl.origin) {
    return loginUrl.toString();
  }

  // Other targets (the mobile app deep link) can't complete the code challenge in this
  // browser, they get the error and no session
  target.searchParams.set('error', 'two_factor_required');
  return target.toString();
}

export function twoFactorPlugin({ clientBaseUrl }: { clientBaseUrl: string }) {
  const plugin = twoFactor();

  const afterHooks = (plugin.hooks?.after ?? []).map(hook => ({
    ...hook,
    matcher: (context: Parameters<typeof hook.matcher>[0]) => hook.matcher(context)
      || isOAuthCallbackPath({ path: context.path })
      || context.path === ID_TOKEN_SIGN_IN_PATH,
  }));

  return {
    ...plugin,
    hooks: {
      ...plugin.hooks,
      after: [
        ...afterHooks,
        {
          // The two factor hook answers json, an OAuth callback is a browser navigation
          // so it is turned into a redirect to the page asking for the code
          matcher: (context: Parameters<typeof afterHooks[number]['matcher']>[0]) => isOAuthCallbackPath({ path: context.path }),
          handler: createAuthMiddleware(async (context) => {
            if (!isTwoFactorRedirectResponse({ response: context.context.returned })) {
              return;
            }

            const location = context.context.responseHeaders?.get('location');

            if (context.context.responseHeaders) {
              // OAuth creates a session before the 2FA hook revokes it. Only forward
              // the final value of each cookie through Expo's deep-link bridge so a
              // revoked session token is not exposed in the callback URL.
              keepLastSetCookieForEachName({ headers: context.context.responseHeaders });
            }

            throw context.redirect(getTwoFactorRequiredRedirectUrl({ location, clientBaseUrl }));
          }),
        },
      ],
    },
  };
}
