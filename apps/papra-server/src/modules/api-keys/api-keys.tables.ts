import type { ApiKeyPermissions } from './api-keys.types';

import { boolean, index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { organizationMembersTable } from '../organizations/organizations.table';
import { createPrimaryKeyField, createTimestampColumns } from '../shared/db/columns.helpers';
import { usersTable } from '../users/users.table';
import { API_KEY_ID_PREFIX } from './api-keys.constants';

export const apiKeysTable = pgTable(
  'api_keys',
  {
    ...createPrimaryKeyField({ prefix: API_KEY_ID_PREFIX }),
    ...createTimestampColumns(),

    name: text('name').notNull(),
    keyHash: text('key_hash').notNull().unique(),
    // the prefix is used to identify the key, it is the
    prefix: text('prefix').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    lastUsedAt: timestamp('last_used_at', { mode: 'date', withTimezone: true, precision: 3 }),
    expiresAt: timestamp('expires_at', { mode: 'date', withTimezone: true, precision: 3 }),
    permissions: jsonb('permissions').notNull().$type<ApiKeyPermissions[]>().default([]),
    allOrganizations: boolean('all_organizations').notNull().default(false),
  },
  table => [
    // To get an API key by its token
    index('key_hash_index').on(table.keyHash),
  ],
);

// We use an intermediate table (instead of a json array) to link API keys to organization members, so the relationship between
// the api key and the organization is deleted on cascade when the organization is deleted or the member is removed from the organization.
export const apiKeyOrganizationsTable = pgTable('api_key_organizations', {
  apiKeyId: text('api_key_id')
    .notNull()
    .references(() => apiKeysTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),

  organizationMemberId: text('organization_member_id')
    .notNull()
    .references(() => organizationMembersTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
});
