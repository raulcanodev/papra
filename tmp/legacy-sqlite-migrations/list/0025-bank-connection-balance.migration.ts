import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const bankConnectionBalanceMigration: Migration = {
  name: 'bank-connection-balance',
  description: 'Add cached balance columns to bank_connections for storing account balances from providers',

  up: async ({ db }) => {
    const tableInfo = await db.run(sql`PRAGMA table_info(bank_connections)`);
    const columns = new Set((tableInfo.rows as unknown as Array<{ name: string }>).map(row => row.name));
    if (!columns.has('cached_balance')) await db.run(sql`ALTER TABLE "bank_connections" ADD COLUMN "cached_balance" real`);
    if (!columns.has('balance_currency')) await db.run(sql`ALTER TABLE "bank_connections" ADD COLUMN "balance_currency" text`);
    if (!columns.has('last_balance_fetched_at')) await db.run(sql`ALTER TABLE "bank_connections" ADD COLUMN "last_balance_fetched_at" integer`);
  },

  down: async ({ db }) => {
    await db.batch([
      db.run(sql`ALTER TABLE "bank_connections" DROP COLUMN "cached_balance"`),
      db.run(sql`ALTER TABLE "bank_connections" DROP COLUMN "balance_currency"`),
      db.run(sql`ALTER TABLE "bank_connections" DROP COLUMN "last_balance_fetched_at"`),
    ]);
  },
};
