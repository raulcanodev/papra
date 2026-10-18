import { index, integer, pgTable, text } from 'drizzle-orm/pg-core';
import { organizationsTable } from '../organizations/organizations.table';
import { createCreatedAtField, createPrimaryKeyField, createTimestampColumns } from '../shared/db/columns.helpers';
import { usersTable } from '../users/users.table';
import { AI_USAGE_ID_PREFIX } from './ai-usage.constants';

// One row per language model call, written after the call without delaying it.
// The cost is computed with the prices of the day, so the history keeps what was really paid when prices change.
export const aiUsageTable = pgTable('ai_usage', {
  ...createPrimaryKeyField({ prefix: AI_USAGE_ID_PREFIX }),
  ...createCreatedAtField(),
  // Kept when the workspace or the user is deleted: the cost was paid anyway
  organizationId: text('organization_id').references(() => organizationsTable.id, { onDelete: 'set null', onUpdate: 'cascade' }),
  userId: text('user_id').references(() => usersTable.id, { onDelete: 'set null', onUpdate: 'cascade' }),
  feature: text('feature').notNull(),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  // Input tokens billed at the base price, without the cache reads and writes
  inputTokens: integer('input_tokens').notNull().default(0),
  cacheReadTokens: integer('cache_read_tokens').notNull().default(0),
  cacheWriteTokens: integer('cache_write_tokens').notNull().default(0),
  // Output tokens, reasoning included
  outputTokens: integer('output_tokens').notNull().default(0),
  reasoningTokens: integer('reasoning_tokens').notNull().default(0),
  // Millionths of a US dollar; null when the model has no known price
  costUsdMicros: integer('cost_usd_micros'),
  durationMs: integer('duration_ms').notNull().default(0),
  status: text('status').notNull().default('success'),
}, table => [
  index('ai_usage_created_at_index').on(table.createdAt),
  index('ai_usage_feature_created_at_index').on(table.feature, table.createdAt),
  index('ai_usage_organization_id_created_at_index').on(table.organizationId, table.createdAt),
]);

// The model every AI feature uses, chosen from the admin panel; without this row the environment configuration applies
export const aiSettingsTable = pgTable('ai_settings', {
  id: text('id').primaryKey(),
  ...createTimestampColumns(),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  // null: the model default (no reasoning options sent)
  reasoningEffort: text('reasoning_effort'),
  updatedBy: text('updated_by').references(() => usersTable.id, { onDelete: 'set null', onUpdate: 'cascade' }),
});
