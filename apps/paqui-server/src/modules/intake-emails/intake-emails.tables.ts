import { boolean, jsonb, pgTable, text } from 'drizzle-orm/pg-core';
import { organizationsTable } from '../organizations/organizations.table';
import { createPrimaryKeyField, createTimestampColumns } from '../shared/db/columns.helpers';
import { INTAKE_EMAIL_ID_PREFIX } from './intake-emails.constants';

export const intakeEmailsTable = pgTable('intake_emails', {
  ...createPrimaryKeyField({ prefix: INTAKE_EMAIL_ID_PREFIX }),
  ...createTimestampColumns(),

  emailAddress: text('email_address').notNull().unique(),
  organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  allowedOrigins: jsonb('allowed_origins').notNull().$type<string[]>().default([]),
  isEnabled: boolean('is_enabled').notNull().default(true),
});
