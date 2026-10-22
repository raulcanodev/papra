import type { Permission } from '../../roles/roles.types';
import { PERMISSIONS } from '../../roles/roles.constants';
import {
  AUTH_PATH_PREFIXES_FORBIDDEN_DURING_IMPERSONATION,
  AUTH_PATHS_FORBIDDEN_DURING_IMPERSONATION,
  IMPERSONATION_DURATION_MS,
} from './impersonation.constants';

export function isAuthPathForbiddenDuringImpersonation({ path }: { path?: string }) {
  if (path === undefined) {
    return false;
  }

  return (AUTH_PATHS_FORBIDDEN_DURING_IMPERSONATION as readonly string[]).includes(path)
    || AUTH_PATH_PREFIXES_FORBIDDEN_DURING_IMPERSONATION.some(prefix => path.startsWith(prefix));
}

export function canImpersonate({ permissions }: { permissions: readonly Permission[] }) {
  return permissions.includes(PERMISSIONS.IMPERSONATE_USERS);
}

// Admins (anyone holding a role) are never impersonated: it would hand over their powers
export function getImpersonationTargetError({ adminUserId, targetUserId, targetRoles }: { adminUserId: string; targetUserId: string; targetRoles: readonly string[] }) {
  if (adminUserId === targetUserId) {
    return 'self' as const;
  }

  if (targetRoles.length > 0) {
    return 'privileged-target' as const;
  }

  return undefined;
}

// The session expiry is already one hour, this also bounds it by its creation in case the expiry was ever extended
export function isImpersonationSessionWithinDuration({ createdAt, expiresAt, now = new Date() }: { createdAt: Date; expiresAt: Date; now?: Date }) {
  return expiresAt.getTime() > now.getTime()
    && now.getTime() - createdAt.getTime() <= IMPERSONATION_DURATION_MS;
}

// Signed cookie value: the admin session token and whether it was a "don't remember me" session
export function serializeAdminSessionCookie({ token, dontRememberMe }: { token: string; dontRememberMe: boolean }) {
  return `${token}:${dontRememberMe ? 'true' : ''}`;
}

export function parseAdminSessionCookie({ value }: { value: string }) {
  const [token, dontRememberMe] = value.split(':');

  if (token === undefined || token === '') {
    return undefined;
  }

  return { token, dontRememberMe: dontRememberMe === 'true' };
}
