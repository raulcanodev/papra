import { EVENT_NAMES } from '@papra/webhooks';
import { boolean, integer, pgTable, text, unique } from 'drizzle-orm/pg-core';
import { organizationsTable } from '../organizations/organizations.table';
import { createPrimaryKeyField, createTimestampColumns } from '../shared/db/columns.helpers';
import { usersTable } from '../users/users.table';
import { WEBHOOK_ID_PREFIX } from './webhooks.constants';

export const webhooksTable = pgTable('webhooks', {
  ...createPrimaryKeyField({ prefix: WEBHOOK_ID_PREFIX }),
  ...createTimestampColumns(),

  name: text('name').notNull(),
  url: text('url').notNull(),
  secret: text('secret'),
  enabled: boolean('enabled').notNull().default(true),
  createdBy: text('created_by').references(() => usersTable.id, { onDelete: 'set null', onUpdate: 'cascade' }),
  organizationId: text('organization_id').references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
});

export const webhookEventsTable = pgTable('webhook_events', {
  ...createPrimaryKeyField({ prefix: 'wbh_ev' }),
  ...createTimestampColumns(),

  webhookId: text('webhook_id').notNull().references(() => webhooksTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  eventName: text('event_name', { enum: EVENT_NAMES }).notNull(),
}, t => [
  unique('webhook_events_webhook_id_event_name_unique').on(t.webhookId, t.eventName),
]);

export const webhookDeliveriesTable = pgTable('webhook_deliveries', {
  ...createPrimaryKeyField({ prefix: 'wbh_dlv' }),
  ...createTimestampColumns(),

  webhookId: text('webhook_id').notNull().references(() => webhooksTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  eventName: text('event_name').notNull(),
  requestPayload: text('request_payload').notNull(),
  responsePayload: text('response_payload').notNull(),
  responseStatus: integer('response_status').notNull(),
});
