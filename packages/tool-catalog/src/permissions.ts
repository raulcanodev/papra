// What an API key may do. Declared here because a tool names the permission it needs, and the API server
// enforces the very same list on its routes: one vocabulary for both sides.
export const API_KEY_PERMISSIONS = {
  ORGANIZATIONS: {
    CREATE: 'organizations:create',
    READ: 'organizations:read',
    UPDATE: 'organizations:update',
    DELETE: 'organizations:delete',
  },
  DOCUMENTS: {
    CREATE: 'documents:create',
    READ: 'documents:read',
    UPDATE: 'documents:update',
    DELETE: 'documents:delete',
  },
  TAGS: {
    CREATE: 'tags:create',
    READ: 'tags:read',
    UPDATE: 'tags:update',
    DELETE: 'tags:delete',
  },
  CONTACTS: {
    CREATE: 'contacts:create',
    READ: 'contacts:read',
    UPDATE: 'contacts:update',
    DELETE: 'contacts:delete',
  },
  PRODUCTS: {
    CREATE: 'products:create',
    READ: 'products:read',
    UPDATE: 'products:update',
    DELETE: 'products:delete',
  },
  INVOICES: {
    CREATE: 'invoices:create',
    READ: 'invoices:read',
    UPDATE: 'invoices:update',
    DELETE: 'invoices:delete',
  },
  PURCHASES: {
    CREATE: 'purchases:create',
    READ: 'purchases:read',
    UPDATE: 'purchases:update',
    DELETE: 'purchases:delete',
  },
  TAXES: {
    READ: 'taxes:read',
  },
  CALENDAR: {
    READ: 'calendar:read',
  },
} as const;

export const API_KEY_PERMISSIONS_VALUES = Object.values(API_KEY_PERMISSIONS).flatMap(permissions => Object.values(permissions));

export type ApiKeyPermission = (typeof API_KEY_PERMISSIONS_VALUES)[number];
