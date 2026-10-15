import { sql } from 'drizzle-orm';
import { check, index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { organizationsTable } from '../organizations/organizations.table';
import { createPrimaryKeyField, createTimestampColumns } from '../shared/db/columns.helpers';
import { usersTable } from '../users/users.table';
import { CAPTURE_PURPOSES, CAPTURE_SESSION_ID_PREFIX } from './captures.constants';

// A short lived bridge between the computer where the user works and the phone that takes the photos (QR code)
export const captureSessionsTable = pgTable('capture_sessions', {
  ...createPrimaryKeyField({ prefix: CAPTURE_SESSION_ID_PREFIX }),
  ...createTimestampColumns(),
  organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  // Who opened it: the captured files are uploaded on their behalf, only they can follow it
  userId: text('user_id').notNull().references(() => usersTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  purpose: text('purpose', { enum: CAPTURE_PURPOSES }).notNull(),
  // Only the hash of the token in the QR code is stored, like a password
  tokenHash: text('token_hash').notNull().unique(),
  // The documents created from the captured files, in capture order
  documentIds: jsonb('document_ids').notNull().$type<string[]>().default([]),
  expiresAt: timestamp('expires_at', { mode: 'date', withTimezone: true, precision: 3 }).notNull(),
  // Set when the phone says it is done, or when the computer stops waiting
  completedAt: timestamp('completed_at', { mode: 'date', withTimezone: true, precision: 3 }),
}, table => [
  index('capture_sessions_organization_id_user_id_index').on(table.organizationId, table.userId),
  check('capture_sessions_purpose_check', sql.raw(`"purpose" IN (${CAPTURE_PURPOSES.map(purpose => `'${purpose}'`).join(', ')})`)),
]);
