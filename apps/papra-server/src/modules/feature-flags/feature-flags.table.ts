import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { createPrimaryKeyField, createTimestampColumns } from '../shared/db/columns.helpers';

export const featureFlagIdPrefix = 'ff';

export const featureFlagsTable = sqliteTable('feature_flags', {
  ...createPrimaryKeyField({ prefix: featureFlagIdPrefix }),
  ...createTimestampColumns(),
  flagId: text('flag_id').notNull(),
  userEmail: text('user_email').notNull(),
});
