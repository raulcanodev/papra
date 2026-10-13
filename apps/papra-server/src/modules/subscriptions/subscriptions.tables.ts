import { boolean, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { organizationsTable } from '../organizations/organizations.table';
import { createTimestampColumns } from '../shared/db/columns.helpers';

export const organizationSubscriptionsTable = pgTable('organization_subscriptions', {
  // stripe subscription id, no auto-generated id
  id: text('id').primaryKey(),
  customerId: text('customer_id').notNull(),
  organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  planId: text('plan_id').notNull(),
  status: text('status').notNull(),
  seatsCount: integer('seats_count').notNull(),
  currentPeriodEnd: timestamp('current_period_end', { mode: 'date', withTimezone: true, precision: 3 }).notNull(),
  currentPeriodStart: timestamp('current_period_start', { mode: 'date', withTimezone: true, precision: 3 }).notNull(),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),

  ...createTimestampColumns(),

});
