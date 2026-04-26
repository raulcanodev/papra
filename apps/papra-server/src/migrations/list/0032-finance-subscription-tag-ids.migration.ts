import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const financeSubscriptionTagIdsMigration: Migration = {
  name: 'finance-subscription-tag-ids',
  description: 'Add tag_ids column to finance_subscriptions for auto-applying tags to matching transactions',

  up: async ({ db }) => {
    await db.run(sql`
      ALTER TABLE "finance_subscriptions" ADD COLUMN "tag_ids" text NOT NULL DEFAULT '[]'
    `);
  },

  down: async ({ db }) => {
    await db.run(sql`
      ALTER TABLE "finance_subscriptions" DROP COLUMN "tag_ids"
    `);
  },
};
