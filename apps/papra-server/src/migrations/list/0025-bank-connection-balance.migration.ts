import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const bankConnectionBalanceMigration: Migration = {
  name: 'bank-connection-balance',
  description: 'Add cached balance columns to bank_connections for storing account balances from providers',

  up: async ({ db }) => {
    await db.batch([
      db.run(sql`ALTER TABLE "bank_connections" ADD COLUMN "cached_balance" real`),
      db.run(sql`ALTER TABLE "bank_connections" ADD COLUMN "balance_currency" text`),
      db.run(sql`ALTER TABLE "bank_connections" ADD COLUMN "last_balance_fetched_at" integer`),
    ]);
  },
};
