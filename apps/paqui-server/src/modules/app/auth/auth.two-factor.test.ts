import { describe, expect, test } from 'vitest';
import { getTwoFactorRequiredRedirectUrl, isOAuthCallbackPath, isTwoFactorRedirectResponse, keepLastSetCookieForEachName } from './auth.two-factor';

describe('auth two factor', () => {
  describe('getTwoFactorRequiredRedirectUrl', () => {
    test('a sign in going back to the web client is sent to the login page asking for the code', () => {
      expect(getTwoFactorRequiredRedirectUrl({ location: 'http://localhost:3000/', clientBaseUrl: 'http://localhost:3000' }))
        .to
        .eql('http://localhost:3000/login?two-factor=required');
      expect(getTwoFactorRequiredRedirectUrl({ location: '/documents', clientBaseUrl: 'http://localhost:3000' }))
        .to
        .eql('http://localhost:3000/login?two-factor=required');
      expect(getTwoFactorRequiredRedirectUrl({ location: undefined, clientBaseUrl: 'http://localhost:3000' }))
        .to
        .eql('http://localhost:3000/login?two-factor=required');
    });

    test('a sign in going back to another app gets a two factor error instead of a session', () => {
      expect(getTwoFactorRequiredRedirectUrl({ location: 'paqui://auth', clientBaseUrl: 'http://localhost:3000' }))
        .to
        .eql('paqui://auth?error=two_factor_required');
    });
  });

  test('isTwoFactorRedirectResponse spots the two factor answer, plain or wrapped in a json body', () => {
    expect(isTwoFactorRedirectResponse({ response: { twoFactorRedirect: true } })).to.eql(true);
    expect(isTwoFactorRedirectResponse({ response: { body: { twoFactorRedirect: true } } })).to.eql(true);
    expect(isTwoFactorRedirectResponse({ response: { twoFactorRedirect: false } })).to.eql(false);
    expect(isTwoFactorRedirectResponse({ response: null })).to.eql(false);
  });

  test('isOAuthCallbackPath matches the social and generic OAuth callbacks', () => {
    expect(isOAuthCallbackPath({ path: '/callback/:id' })).to.eql(true);
    expect(isOAuthCallbackPath({ path: '/oauth2/callback/:providerId' })).to.eql(true);
    expect(isOAuthCallbackPath({ path: '/sign-in/email' })).to.eql(false);
  });

  test('only the final value of a cookie is retained for an OAuth deep link', () => {
    const headers = new Headers();
    headers.append('set-cookie', 'better-auth.session_token=temporary; Path=/; HttpOnly');
    headers.append('set-cookie', 'better-auth.session_token=; Max-Age=0; Path=/; HttpOnly');
    headers.append('set-cookie', 'better-auth.two_factor=challenge; Path=/; HttpOnly');

    keepLastSetCookieForEachName({ headers });

    expect(headers.getSetCookie()).to.eql([
      'better-auth.session_token=; Max-Age=0; Path=/; HttpOnly',
      'better-auth.two_factor=challenge; Path=/; HttpOnly',
    ]);
  });
});
