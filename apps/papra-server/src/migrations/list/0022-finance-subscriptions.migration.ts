import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const financeSubscriptionsMigration: Migration = {
  name: 'finance-subscriptions',
  description: 'Add subscriptions table for finance module recurring cost tracking',

  up: async ({ db }) => {
    await db.batch([
      db.run(sql`
        CREATE TABLE IF NOT EXISTS "finance_subscriptions" (
          "id" text PRIMARY KEY NOT NULL,
          "created_at" integer NOT NULL,
          "updated_at" integer NOT NULL,
          "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "name" text NOT NULL,
          "amount" real NOT NULL,
          "currency" text NOT NULL DEFAULT 'USD',
          "billing_cycle" text NOT NULL DEFAULT 'monthly',
          "next_payment_at" integer,
          "category" text,
          "notes" text,
          "is_active" integer NOT NULL DEFAULT 1
        )
      `),
      db.run(sql`
        CREATE INDEX IF NOT EXISTS "finance_subscriptions_organization_id_index"
        ON "finance_subscriptions" ("organization_id")
      `),
    ]);
  },

  down: async ({ db }) => {
    await db.run(sql`DROP TABLE IF EXISTS "finance_subscriptions"`);
  },
};
