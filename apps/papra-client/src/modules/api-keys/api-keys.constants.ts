// export const API_KEY_PERMISSIONS = {
//   documents: {
//     create: 'documents:create',
//   },
// } as const;

export const API_KEY_PERMISSIONS = [
  {
    section: 'organizations',
    permissions: [
      'organizations:create',
      'organizations:read',
      'organizations:update',
      'organizations:delete',
    ],
  },
  {
    section: 'documents',
    permissions: [
      'documents:create',
      'documents:read',
      'documents:update',
      'documents:delete',
    ],
  },
  {
    section: 'tags',
    permissions: [
      'tags:create',
      'tags:read',
      'tags:update',
      'tags:delete',
    ],
  },
  {
    section: 'contacts',
    permissions: [
      'contacts:create',
      'contacts:read',
      'contacts:update',
      'contacts:delete',
    ],
  },
  {
    section: 'products',
    permissions: [
      'products:create',
      'products:read',
      'products:update',
      'products:delete',
    ],
  },
  {
    section: 'invoices',
    permissions: [
      'invoices:create',
      'invoices:read',
      'invoices:update',
      'invoices:delete',
    ],
  },
  {
    section: 'purchases',
    permissions: [
      'purchases:create',
      'purchases:read',
      'purchases:update',
      'purchases:delete',
    ],
  },
  {
    section: 'taxes',
    permissions: [
      'taxes:read',
    ],
  },
  {
    section: 'calendar',
    permissions: [
      'calendar:read',
    ],
  },
] as const;

export const API_KEY_PERMISSIONS_LIST = API_KEY_PERMISSIONS.flatMap(permission => permission.permissions);
