export const ROLES = {
  ADMIN: 'admin',
} as const;

export const PERMISSIONS = {
  BO_ACCESS: 'bo:access',
  VIEW_USERS: 'users:view',
  VIEW_ANALYTICS: 'analytics:view',
  MANAGE_GESTORIAS: 'gestorias:manage',
  MANAGE_AI: 'ai:manage',
} as const;

export const PERMISSIONS_BY_ROLE = {
  [ROLES.ADMIN]: [
    PERMISSIONS.VIEW_USERS,
    PERMISSIONS.BO_ACCESS,
    PERMISSIONS.VIEW_ANALYTICS,
    PERMISSIONS.MANAGE_GESTORIAS,
    PERMISSIONS.MANAGE_AI,
  ],
} as const;

export const ROLES_LIST = Object.values(ROLES);
