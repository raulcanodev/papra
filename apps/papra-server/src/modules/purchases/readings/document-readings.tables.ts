import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { documentsTable } from '../../documents/documents.table';
import { organizationsTable } from '../../organizations/organizations.table';
import { createPrimaryKeyField, createTimestampColumns } from '../../shared/db/columns.helpers';
import { DOCUMENT_READING_ID_PREFIX, DOCUMENT_READING_KINDS, DOCUMENT_READING_STATUSES } from './document-readings.constants';

// The AI reading of a document and its state: the database is the queue of record, the task queue only wakes
// the worker up, so nothing is lost on a restart whatever the task driver
export const documentReadingsTable = pgTable('document_readings', {
  ...createPrimaryKeyField({ prefix: DOCUMENT_READING_ID_PREFIX }),
  ...createTimestampColumns(),
  organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  documentId: text('document_id').notNull().references(() => documentsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  kind: text('kind', { enum: DOCUMENT_READING_KINDS }).notNull(),
  status: text('status', { enum: DOCUMENT_READING_STATUSES }).notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  // The extraction (draft, counterparty, AI warnings, printed total) as returned to the review screen
  result: jsonb('result').$type<Record<string, unknown>>(),
  // The automatic checks of the result, see document-readings.checks.ts
  checks: jsonb('checks').notNull().$type<unknown[]>().default([]),
  errorCode: text('error_code'),
  startedAt: timestamp('started_at', { mode: 'date', withTimezone: true, precision: 3 }),
  finishedAt: timestamp('finished_at', { mode: 'date', withTimezone: true, precision: 3 }),
}, table => [
  unique('document_readings_document_id_kind_unique').on(table.documentId, table.kind),
  index('document_readings_status_created_at_index').on(table.status, table.createdAt),
  index('document_readings_organization_id_index').on(table.organizationId),
  check('document_readings_status_check', sql.raw(`"status" IN (${DOCUMENT_READING_STATUSES.map(status => `'${status}'`).join(', ')})`)),
]);
