import { index, integer, real, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';
import { organizationsTable } from '../organizations/organizations.table';
import { createPrimaryKeyField, createTimestampColumns } from '../shared/db/columns.helpers';
import { BANK_CONNECTION_ID_PREFIX, CLASSIFICATION_RULE_ID_PREFIX, FINANCE_GOAL_BUCKET_ID_PREFIX, FINANCE_GOAL_ID_PREFIX, FINANCE_GOAL_VERSION_ID_PREFIX, SUBSCRIPTION_ID_PREFIX, TRANSACTION_ID_PREFIX } from './finances.constants';

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
  cachedBalance: real('cached_balance'),
  balanceCurrency: text('balance_currency'),
  lastBalanceFetchedAt: integer('last_balance_fetched_at', { mode: 'timestamp_ms' }),
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

export const classificationRulesTable = sqliteTable('classification_rules', {
  ...createPrimaryKeyField({ prefix: CLASSIFICATION_RULE_ID_PREFIX }),
  ...createTimestampColumns(),

  organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  name: text('name').notNull(),
  classification: text('classification').notNull(),
  conditions: text('conditions').notNull().default('[]'), // JSON array of { field, operator, value }
  conditionMatchMode: text('condition_match_mode').notNull().default('all'), // 'all' | 'any'
  tagIds: text('tag_ids').notNull().default('[]'), // JSON array of tag IDs to apply when rule matches
  priority: integer('priority').notNull().default(0),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
}, t => [
  index('classification_rules_organization_id_index').on(t.organizationId),
]);

export const subscriptionsTable = sqliteTable('finance_subscriptions', {
  ...createPrimaryKeyField({ prefix: SUBSCRIPTION_ID_PREFIX }),
  ...createTimestampColumns(),

  organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  name: text('name').notNull(),
  amount: real('amount').notNull(),
  currency: text('currency').notNull().default('USD'),
  billingCycle: text('billing_cycle').notNull().default('monthly'),
  nextPaymentAt: integer('next_payment_at', { mode: 'timestamp_ms' }),
  category: text('category'),
  notes: text('notes'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
}, t => [
  index('finance_subscriptions_organization_id_index').on(t.organizationId),
]);

export const financeGoalsTable = sqliteTable('finance_goals', {
  ...createPrimaryKeyField({ prefix: FINANCE_GOAL_ID_PREFIX }),
  ...createTimestampColumns(),

  organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  name: text('name').notNull().default('Budget'),
}, t => [
  index('finance_goals_organization_id_index').on(t.organizationId),
]);

export const financeGoalVersionsTable = sqliteTable('finance_goal_versions', {
  ...createPrimaryKeyField({ prefix: FINANCE_GOAL_VERSION_ID_PREFIX }),
  ...createTimestampColumns(),

  goalId: text('goal_id').notNull().references(() => financeGoalsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  versionNumber: integer('version_number').notNull(),
  name: text('name').notNull(),
  bucketsSnapshot: text('buckets_snapshot').notNull().default('[]'),
}, t => [
  index('finance_goal_versions_goal_id_index').on(t.goalId),
]);

export const financeGoalBucketsTable = sqliteTable('finance_goal_buckets', {
  ...createPrimaryKeyField({ prefix: FINANCE_GOAL_BUCKET_ID_PREFIX }),
  ...createTimestampColumns(),

  goalId: text('goal_id').notNull().references(() => financeGoalsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  name: text('name').notNull(),
  targetPercentage: integer('target_percentage').notNull().default(0),
  color: text('color').notNull().default('#6366f1'),
  position: integer('position').notNull().default(0),
  tagIds: text('tag_ids').notNull().default('[]'),
  classifications: text('classifications').notNull().default('[]'),
}, t => [
  index('finance_goal_buckets_goal_id_index').on(t.goalId),
]);
