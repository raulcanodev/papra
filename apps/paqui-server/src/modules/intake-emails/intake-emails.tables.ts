import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, jsonb, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { organizationsTable } from '../organizations/organizations.table';
import { createPrimaryKeyField, createTimestampColumns } from '../shared/db/columns.helpers';
import { INTAKE_EMAIL_DELIVERY_ID_PREFIX, INTAKE_EMAIL_DELIVERY_STATUSES, INTAKE_EMAIL_ID_PREFIX } from './intake-emails.constants';

export const intakeEmailsTable = pgTable('intake_emails', {
  ...createPrimaryKeyField({ prefix: INTAKE_EMAIL_ID_PREFIX }),
  ...createTimestampColumns(),

  emailAddress: text('email_address').notNull().unique(),
  organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  allowedOrigins: jsonb('allowed_origins').notNull().$type<string[]>().default([]),
  isEnabled: boolean('is_enabled').notNull().default(true),
});

// A compact audit trail for incoming messages. Bodies are deliberately not stored: the documents own accepted
// attachments, while ignored messages only need enough metadata to explain why nothing happened.
export const intakeEmailDeliveriesTable = pgTable('intake_email_deliveries', {
  ...createPrimaryKeyField({ prefix: INTAKE_EMAIL_DELIVERY_ID_PREFIX }),
  ...createTimestampColumns(),

  intakeEmailId: text('intake_email_id').notNull().references(() => intakeEmailsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  providerMessageId: text('provider_message_id'),
  fromAddress: text('from_address').notNull(),
  recipientAddress: text('recipient_address').notNull(),
  subject: text('subject'),
  attachmentCount: integer('attachment_count').notNull().default(0),
  status: text('status', { enum: INTAKE_EMAIL_DELIVERY_STATUSES }).notNull(),
}, table => [
  index('intake_email_deliveries_organization_created_at_index').on(table.organizationId, table.createdAt),
  index('intake_email_deliveries_intake_email_id_index').on(table.intakeEmailId),
  uniqueIndex('intake_email_deliveries_provider_message_unique').on(table.intakeEmailId, table.providerMessageId),
  check('intake_email_deliveries_status_check', sql.raw(`"status" IN (${INTAKE_EMAIL_DELIVERY_STATUSES.map(status => `'${status}'`).join(', ')})`)),
]);
