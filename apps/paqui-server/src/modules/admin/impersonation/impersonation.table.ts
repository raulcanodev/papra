import { boolean, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { createCreatedAtField, createPrimaryKeyField } from '../../shared/db/columns.helpers';
import { usersTable } from '../../users/users.table';
import { IMPERSONATION_ID_PREFIX } from './impersonation.constants';

// Audit trail of every time an admin entered someone's account: who, as whom, why, from where and until when.
// Kept when either user is deleted so the trail stays complete.
export const impersonationsTable = pgTable('admin_impersonations', {
  ...createPrimaryKeyField({ prefix: IMPERSONATION_ID_PREFIX }),
  ...createCreatedAtField(),
  adminUserId: text('admin_user_id').references(() => usersTable.id, { onDelete: 'set null', onUpdate: 'cascade' }),
  targetUserId: text('target_user_id').references(() => usersTable.id, { onDelete: 'set null', onUpdate: 'cascade' }),
  // Copied so the trail still reads after a user is deleted
  adminEmail: text('admin_email').notNull(),
  targetEmail: text('target_email').notNull(),
  reason: text('reason').notNull(),
  // Whether the admin entered able to change things, or only to look
  canWrite: boolean('can_write').notNull().default(false),
  // The auth session created for the visit, to close the row when it ends
  sessionId: text('session_id').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  expiresAt: timestamp('expires_at', { mode: 'date', withTimezone: true, precision: 3 }).notNull(),
  endedAt: timestamp('ended_at', { mode: 'date', withTimezone: true, precision: 3 }),
}, table => [
  index('admin_impersonations_target_user_id_created_at_index').on(table.targetUserId, table.createdAt),
  index('admin_impersonations_admin_user_id_created_at_index').on(table.adminUserId, table.createdAt),
  index('admin_impersonations_session_id_index').on(table.sessionId),
]);
