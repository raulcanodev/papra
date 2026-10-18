import { Buffer } from 'node:buffer';
import { base32 } from '@better-auth/utils/base32';
import { createOTP } from '@better-auth/utils/otp';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { overrideConfig } from '../../../config/config.test-utils';
import { createInMemoryDatabase } from '../../database/database.test-utils';
import { createEventServices } from '../../events/events.services';
import { createServer } from '../../server';
import { createTestServerDependencies } from '../../server.test-utils';
import { createAuthEmailsServices } from '../auth.emails.services';
import { getAuth } from '../auth.services';

function encodeJwtPart(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function createGoogleIdToken({ email }: { email: string }) {
  const payload = {
    sub: 'google-user-1',
    email,
    email_verified: true,
    name: 'Test User',
    aud: 'google-client-id',
    iss: 'https://accounts.google.com',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
  };

  return `${encodeJwtPart({ alg: 'RS256', typ: 'JWT' })}.${encodeJwtPart(payload)}.signature`;
}

function getCookieHeader({ response }: { response: Response }) {
  return response.headers.getSetCookie().map(cookie => cookie.split(';')[0]).join('; ');
}

async function setupGoogleLogin({
  twoFactorEnabled,
  withPassword = true,
  callbackURL = 'http://localhost:3000/',
}: {
  twoFactorEnabled: boolean;
  withPassword?: boolean;
  callbackURL?: string;
}) {
  const email = 'test@example.com';
  const { db } = await createInMemoryDatabase();

  const config = overrideConfig({
    auth: {
      providers: {
        google: { isEnabled: true, clientId: 'google-client-id', clientSecret: 'google-client-secret' },
      },
    },
  });

  const authEmailsServices = createAuthEmailsServices({ emailsServices: { name: 'test', sendEmail: async () => {} } });
  const { auth } = getAuth({ db, config, authEmailsServices, eventServices: createEventServices() });
  const { app } = createServer(createTestServerDependencies({ db, config, auth }));
  let totpSecret: string | undefined;

  if (withPassword) {
    const signUpResponse = await app.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'StrongPassword123!', name: 'Test User' }),
    });
    expect(signUpResponse.status).to.eql(200);

    if (twoFactorEnabled) {
      const sessionCookie = getCookieHeader({ response: signUpResponse });
      const enableResponse = await app.request('/api/auth/two-factor/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': sessionCookie },
        body: JSON.stringify({ password: 'StrongPassword123!' }),
      });
      expect(enableResponse.status).to.eql(200);

      const { totpURI } = await enableResponse.json() as { totpURI: string };
      const encodedSecret = new URL(totpURI).searchParams.get('secret');
      if (encodedSecret === null) {
        throw new Error('The TOTP URI has no secret');
      }
      totpSecret = new TextDecoder().decode(base32.decode(encodedSecret));

      const verifyResponse = await app.request('/api/auth/two-factor/verify-totp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': sessionCookie },
        body: JSON.stringify({ code: await createOTP(totpSecret).totp() }),
      });
      expect(verifyResponse.status).to.eql(200);
    }
  }

  vi.stubGlobal('fetch', vi.fn(async () => Response.json({
    access_token: 'google-access-token',
    id_token: createGoogleIdToken({ email }),
    token_type: 'Bearer',
    expires_in: 3600,
  })));

  const signInResponse = await app.request('/api/auth/sign-in/social', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost:3000' },
    body: JSON.stringify({ provider: 'google', callbackURL }),
  });
  expect(signInResponse.status).to.eql(200);

  const { url } = await signInResponse.json() as { url: string };
  const state = new URL(url).searchParams.get('state');

  const callbackResponse = await app.request(`/api/auth/callback/google?code=google-code&state=${state}`, {
    headers: { Cookie: getCookieHeader({ response: signInResponse }) },
  });

  return { callbackResponse, app, email, totpSecret };
}

describe('oauth two factor e2e', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('a google sign in on an account with two factor enabled is sent to the code challenge without a session', async () => {
    const { callbackResponse, app, totpSecret } = await setupGoogleLogin({ twoFactorEnabled: true });

    expect(callbackResponse.status).to.eql(302);
    expect(callbackResponse.headers.get('location')).to.eql('http://localhost:3000/login?two-factor=required');

    const cookies = callbackResponse.headers.getSetCookie();
    const sessionCookies = cookies.filter(cookie => cookie.startsWith('better-auth.session_token='));

    expect(sessionCookies.at(-1)).to.match(/^better-auth\.session_token=;/);
    expect(cookies.some(cookie => cookie.startsWith('better-auth.two_factor='))).to.eql(true);

    const verifyResponse = await app.request('/api/auth/two-factor/verify-totp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': getCookieHeader({ response: callbackResponse }) },
      body: JSON.stringify({ code: await createOTP(totpSecret!).totp() }),
    });
    expect(verifyResponse.status).to.eql(200);
    expect(verifyResponse.headers.getSetCookie().some(cookie => /^better-auth\.session_token=[^;]+;/.test(cookie))).to.eql(true);
  });

  test('a google sign in on an account without two factor gets a session and goes to the callback url', async () => {
    const { callbackResponse } = await setupGoogleLogin({ twoFactorEnabled: false });

    expect(callbackResponse.status).to.eql(302);
    expect(callbackResponse.headers.get('location')).to.eql('http://localhost:3000/');

    const sessionCookies = callbackResponse.headers.getSetCookie().filter(cookie => cookie.startsWith('better-auth.session_token='));

    expect(sessionCookies.at(-1)).to.match(/^better-auth\.session_token=[^;]+;/);
  });

  test('a mobile google sign in forwards only the two factor challenge to the app', async () => {
    const { callbackResponse } = await setupGoogleLogin({ twoFactorEnabled: true, callbackURL: 'paqui:///' });

    expect(callbackResponse.status).to.eql(302);

    const location = new URL(callbackResponse.headers.get('location') ?? '');
    expect(location.protocol).to.eql('paqui:');
    expect(location.searchParams.get('error')).to.eql('two_factor_required');

    const forwardedCookie = location.searchParams.get('cookie') ?? '';
    expect(forwardedCookie).to.contain('better-auth.two_factor=');
    expect(forwardedCookie).not.to.match(/better-auth\.session_token=[^;,]+/);
  });

  test('an account created with google can set its first password once, then sign in with it', async () => {
    const { callbackResponse, app, email } = await setupGoogleLogin({ twoFactorEnabled: false, withPassword: false });
    const sessionCookie = getCookieHeader({ response: callbackResponse });

    const setPassword = async () => app.request('/api/users/me/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': sessionCookie },
      body: JSON.stringify({ newPassword: 'NewPassword123!' }),
    });

    expect((await setPassword()).status).to.eql(200);
    expect((await setPassword()).status).to.eql(400);

    const signInResponse = await app.request('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'NewPassword123!' }),
    });

    expect(signInResponse.status).to.eql(200);
  });
});
