import { sql } from 'drizzle-orm';
import { check, index, jsonb, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { paymentInstalmentsTable } from '../due-dates/due-dates.tables';
import { organizationsTable } from '../organizations/organizations.table';
import { createPrimaryKeyField, createTimestampColumns } from '../shared/db/columns.helpers';
import { REMINDER_ENTITY_TYPES, REMINDER_ID_PREFIX, REMINDER_STATUSES, REMINDER_TYPES } from './notifications.constants';

export type ReminderData = {
  title: string;
  contactName?: string | null;
  documentNumber?: string | null;
  amountMinor?: number;
  currency?: string;
  dueDate?: string;
};

// Something to tell the organization on a given date. Generic: today due dates, tomorrow anything else.
// Rows are created ahead of time by whoever owns the entity (see due-dates.usecases.ts) and sent by a daily task.
export const remindersTable = pgTable('reminders', {
  ...createPrimaryKeyField({ prefix: REMINDER_ID_PREFIX }),
  ...createTimestampColumns(),
  organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  type: text('type', { enum: REMINDER_TYPES }).notNull(),
  status: text('status', { enum: REMINDER_STATUSES }).notNull().default('pending'),
  targetDate: timestamp('target_date', { mode: 'date', withTimezone: true, precision: 3 }).notNull(),
  // What the user opens from the reminder (the invoice), any kind of entity
  entityType: text('entity_type', { enum: REMINDER_ENTITY_TYPES }),
  entityId: text('entity_id'),
  // The due date it was created for: deleting the instalment deletes its reminders
  paymentInstalmentId: text('payment_instalment_id').references(() => paymentInstalmentsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  // Identifies a reminder among those of its source, so saving the source again updates it instead of adding another
  key: text('key').notNull(),
  // What the message says, kept with the reminder so it can be sent without reading the source again
  data: jsonb('data').notNull().$type<ReminderData>(),
  sentAt: timestamp('sent_at', { mode: 'date', withTimezone: true, precision: 3 }),
  dismissedAt: timestamp('dismissed_at', { mode: 'date', withTimezone: true, precision: 3 }),
}, table => [
  unique('reminders_organization_key_unique').on(table.organizationId, table.key),
  index('reminders_status_target_date_index').on(table.status, table.targetDate),
  index('reminders_payment_instalment_id_index').on(table.paymentInstalmentId),
  check('reminders_status_check', sql.raw(`"status" IN (${REMINDER_STATUSES.map(status => `'${status}'`).join(', ')})`)),
  check('reminders_type_check', sql.raw(`"type" IN (${REMINDER_TYPES.map(type => `'${type}'`).join(', ')})`)),
]);
