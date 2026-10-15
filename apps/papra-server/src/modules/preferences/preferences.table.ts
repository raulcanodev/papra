import { jsonb, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';
import { organizationsTable } from '../organizations/organizations.table';
import { createTimestampColumns } from '../shared/db/columns.helpers';
import { usersTable } from '../users/users.table';

// One row per member of an organization: the same person can lay out each of their workspaces differently
export const memberPreferencesTable = pgTable('member_preferences', {
  ...createTimestampColumns(),
  organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  userId: text('user_id').notNull().references(() => usersTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  preferences: jsonb('preferences').notNull().$type<Record<string, unknown>>().default({}),
}, table => [
  primaryKey({ columns: [table.organizationId, table.userId] }),
]);
