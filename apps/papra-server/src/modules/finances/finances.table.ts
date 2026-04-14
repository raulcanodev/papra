import { index, integer, real, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';
import { organizationsTable } from '../organizations/organizations.table';
import { createPrimaryKeyField, createTimestampColumns } from '../shared/db/columns.helpers';
import { BANK_CONNECTION_ID_PREFIX, TRANSACTION_ID_PREFIX } from './finances.constants';

export const bankConnectionsTable = sqliteTable('bank_connections', {
  ...createPrimaryKeyField({ prefix: BANK_CONNECTION_ID_PREFIX }),
  ...createTimestampColumns(),

  organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  provider: text('provider').notNull(),
  name: text('name').notNull(),
  apiKey: text('api_key').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  lastSyncedAt: integer('last_synced_at', { mode: 'timestamp_ms' }),
  providerAccountId: text('provider_account_id'),
}, t => [
  index('bank_connections_organization_id_index').on(t.organizationId),
]);

export const transactionsTable = sqliteTable('transactions', {
  ...createPrimaryKeyField({ prefix: TRANSACTION_ID_PREFIX }),
  ...createTimestampColumns(),

  organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  bankConnectionId: text('bank_connection_id').notNull().references(() => bankConnectionsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  externalId: text('external_id').notNull(),
  date: integer('date', { mode: 'timestamp_ms' }).notNull(),
  description: text('description').notNull(),
  amount: real('amount').notNull(),
  currency: text('currency').notNull().default('USD'),
  counterparty: text('counterparty'),
  status: text('status').notNull().default('posted'),
  classification: text('classification'),
  provider: text('provider').notNull(),
  rawData: text('raw_data'),
}, t => [
  index('transactions_organization_id_index').on(t.organizationId),
  index('transactions_bank_connection_id_index').on(t.bankConnectionId),
  index('transactions_date_index').on(t.date),
  unique('transactions_external_id_bank_connection_unique').on(t.externalId, t.bankConnectionId),
]);
