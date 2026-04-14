import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const financesMigration: Migration = {
  name: 'finances',
  description: 'Add bank connections and transactions tables for LLC finances module',

  up: async ({ db }) => {
    await db.batch([
      db.run(sql`
        CREATE TABLE IF NOT EXISTS "bank_connections" (
          "id" text PRIMARY KEY NOT NULL,
          "created_at" integer NOT NULL,
          "updated_at" integer NOT NULL,
          "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "provider" text NOT NULL,
          "name" text NOT NULL,
          "api_key" text NOT NULL,
          "is_active" integer NOT NULL DEFAULT 1,
          "last_synced_at" integer,
          "provider_account_id" text
        )
      `),
      db.run(sql`
        CREATE INDEX IF NOT EXISTS "bank_connections_organization_id_index"
        ON "bank_connections" ("organization_id")
      `),

      db.run(sql`
        CREATE TABLE IF NOT EXISTS "transactions" (
          "id" text PRIMARY KEY NOT NULL,
          "created_at" integer NOT NULL,
          "updated_at" integer NOT NULL,
          "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "bank_connection_id" text NOT NULL REFERENCES "bank_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "external_id" text NOT NULL,
          "date" integer NOT NULL,
          "description" text NOT NULL,
          "amount" real NOT NULL,
          "currency" text NOT NULL DEFAULT 'USD',
          "counterparty" text,
          "status" text NOT NULL DEFAULT 'posted',
          "classification" text,
          "provider" text NOT NULL,
          "raw_data" text
        )
      `),
      db.run(sql`
        CREATE INDEX IF NOT EXISTS "transactions_organization_id_index"
        ON "transactions" ("organization_id")
      `),
      db.run(sql`
        CREATE INDEX IF NOT EXISTS "transactions_bank_connection_id_index"
        ON "transactions" ("bank_connection_id")
      `),
      db.run(sql`
        CREATE INDEX IF NOT EXISTS "transactions_date_index"
        ON "transactions" ("date")
      `),
      db.run(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS "transactions_external_id_bank_connection_unique"
        ON "transactions" ("external_id", "bank_connection_id")
      `),
    ]);
  },

  down: async ({ db }) => {
    await db.batch([
      db.run(sql`DROP TABLE IF EXISTS "transactions"`),
      db.run(sql`DROP TABLE IF EXISTS "bank_connections"`),
    ]);
  },
};
