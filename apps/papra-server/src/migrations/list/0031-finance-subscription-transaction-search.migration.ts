import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const financeSubscriptionTransactionSearchMigration: Migration = {
  name: 'finance-subscription-transaction-search',
  description: 'Add transaction_search_query column to finance_subscriptions for auto-linking transactions by description search',

  up: async ({ db }) => {
    await db.run(sql`
      ALTER TABLE "finance_subscriptions" ADD COLUMN "transaction_search_query" text
    `);
  },

  down: async ({ db }) => {
    await db.run(sql`
      ALTER TABLE "finance_subscriptions" DROP COLUMN "transaction_search_query"
    `);
  },
};
