export const IMPERSONATION_ID_PREFIX = 'imp';

// An impersonation is a short support visit: the session ends on its own after this, never refreshed
export const IMPERSONATION_DURATION_MS = 60 * 60 * 1000;

export const IMPERSONATION_REASON_MIN_LENGTH = 10;
export const IMPERSONATION_REASON_MAX_LENGTH = 500;

// Holds the admin's own session token (signed) while they act as someone else, to restore it afterwards
export const IMPERSONATION_ADMIN_SESSION_COOKIE = 'admin_session';

// better-auth routes that would let the admin take over the account or leave a way back in after the visit
export const AUTH_PATHS_FORBIDDEN_DURING_IMPERSONATION = [
  '/change-password',
  '/set-password',
  '/change-email',
  '/delete-user',
  '/link-social',
  '/unlink-account',
  '/oauth2/link',
  '/revoke-session',
  '/revoke-sessions',
  '/revoke-other-sessions',
  '/list-sessions',
  '/impersonation/start',
] as const;

// Every two-factor route: enabling, disabling, reading backup codes
export const AUTH_PATH_PREFIXES_FORBIDDEN_DURING_IMPERSONATION = ['/two-factor/'] as const;

// The only requests a read-only impersonation may make besides reading: leaving it
export const AUTH_PATHS_ALLOWED_DURING_READ_ONLY_IMPERSONATION = ['/impersonation/stop', '/sign-out'] as const;

export const READ_ONLY_HTTP_METHODS = ['GET', 'HEAD', 'OPTIONS'] as const;
