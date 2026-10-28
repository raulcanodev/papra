import { describe, expect, test } from 'vitest';
import {
  canImpersonate,
  getImpersonationTargetError,
  isAuthPathForbiddenDuringImpersonation,
  isImpersonationSessionWithinDuration,
  isRequestAllowedDuringReadOnlyImpersonation,
  parseAdminSessionCookie,
  serializeAdminSessionCookie,
} from './impersonation.models';

describe('impersonation models', () => {
  describe('isAuthPathForbiddenDuringImpersonation', () => {
    test('the routes that change credentials, sessions or the second factor are forbidden', () => {
      expect(isAuthPathForbiddenDuringImpersonation({ path: '/change-password' })).to.eql(true);
      expect(isAuthPathForbiddenDuringImpersonation({ path: '/two-factor/disable' })).to.eql(true);
      expect(isAuthPathForbiddenDuringImpersonation({ path: '/revoke-other-sessions' })).to.eql(true);
      expect(isAuthPathForbiddenDuringImpersonation({ path: '/impersonation/start' })).to.eql(true);
    });

    test('reading the session, signing out and stopping the impersonation stay available', () => {
      expect(isAuthPathForbiddenDuringImpersonation({ path: '/get-session' })).to.eql(false);
      expect(isAuthPathForbiddenDuringImpersonation({ path: '/sign-out' })).to.eql(false);
      expect(isAuthPathForbiddenDuringImpersonation({ path: '/impersonation/stop' })).to.eql(false);
      expect(isAuthPathForbiddenDuringImpersonation({ path: undefined })).to.eql(false);
    });
  });

  describe('isRequestAllowedDuringReadOnlyImpersonation', () => {
    test('reading is allowed', () => {
      expect(isRequestAllowedDuringReadOnlyImpersonation({ method: 'GET' })).to.eql(true);
      expect(isRequestAllowedDuringReadOnlyImpersonation({ method: 'head' })).to.eql(true);
      expect(isRequestAllowedDuringReadOnlyImpersonation({ method: 'OPTIONS' })).to.eql(true);
    });

    test('anything that could change something is refused', () => {
      for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
        expect(isRequestAllowedDuringReadOnlyImpersonation({ method })).to.eql(false);
      }

      expect(isRequestAllowedDuringReadOnlyImpersonation({ method: 'POST', authPath: '/update-user' })).to.eql(false);
    });

    test('leaving the impersonation stays available', () => {
      expect(isRequestAllowedDuringReadOnlyImpersonation({ method: 'POST', authPath: '/impersonation/stop' })).to.eql(true);
      expect(isRequestAllowedDuringReadOnlyImpersonation({ method: 'POST', authPath: '/sign-out' })).to.eql(true);
    });
  });

  describe('canImpersonate', () => {
    test('only with the dedicated permission', () => {
      expect(canImpersonate({ permissions: ['users:impersonate'] })).to.eql(true);
      expect(canImpersonate({ permissions: ['users:view', 'bo:access'] })).to.eql(false);
    });
  });

  describe('getImpersonationTargetError', () => {
    test('a user without any role can be impersonated by someone else', () => {
      expect(getImpersonationTargetError({ adminUserId: 'usr_a', targetUserId: 'usr_b', targetRoles: [] })).to.eql(undefined);
    });

    test('nobody impersonates themselves nor a user holding a role', () => {
      expect(getImpersonationTargetError({ adminUserId: 'usr_a', targetUserId: 'usr_a', targetRoles: [] })).to.eql('self');
      expect(getImpersonationTargetError({ adminUserId: 'usr_a', targetUserId: 'usr_b', targetRoles: ['admin'] })).to.eql('privileged-target');
    });
  });

  describe('isImpersonationSessionWithinDuration', () => {
    const now = new Date('2026-10-22T12:00:00Z');

    test('valid during the hour after it was opened', () => {
      expect(isImpersonationSessionWithinDuration({ createdAt: new Date('2026-10-22T11:30:00Z'), expiresAt: new Date('2026-10-22T12:30:00Z'), now })).to.eql(true);
    });

    test('invalid once expired, or past one hour even if its expiry was extended', () => {
      expect(isImpersonationSessionWithinDuration({ createdAt: new Date('2026-10-22T10:30:00Z'), expiresAt: new Date('2026-10-22T11:30:00Z'), now })).to.eql(false);
      expect(isImpersonationSessionWithinDuration({ createdAt: new Date('2026-10-22T10:30:00Z'), expiresAt: new Date('2026-10-29T10:30:00Z'), now })).to.eql(false);
    });
  });

  describe('admin session cookie', () => {
    test('round trips the token and the remember me choice', () => {
      expect(parseAdminSessionCookie({ value: serializeAdminSessionCookie({ token: 'tok', dontRememberMe: true }) })).to.eql({ token: 'tok', dontRememberMe: true });
      expect(parseAdminSessionCookie({ value: serializeAdminSessionCookie({ token: 'tok', dontRememberMe: false }) })).to.eql({ token: 'tok', dontRememberMe: false });
    });

    test('an empty token is rejected', () => {
      expect(parseAdminSessionCookie({ value: ':true' })).to.eql(undefined);
    });
  });
});
