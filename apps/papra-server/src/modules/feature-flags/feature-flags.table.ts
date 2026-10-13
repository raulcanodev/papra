import { pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { createPrimaryKeyField, createTimestampColumns } from '../shared/db/columns.helpers';

export const featureFlagIdPrefix = 'ff';

export const featureFlagsTable = pgTable('feature_flags', {
  ...createPrimaryKeyField({ prefix: featureFlagIdPrefix }),
  ...createTimestampColumns(),
  flagId: text('flag_id').notNull(),
  userEmail: text('user_email').notNull(),
}, table => [
  uniqueIndex('feature_flags_flag_id_user_email_unique').on(table.flagId, table.userEmail),
]);
