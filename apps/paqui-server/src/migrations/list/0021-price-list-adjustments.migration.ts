import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const priceListAdjustmentsMigration = {
  name: 'price-list-adjustments',
  description: 'History of the raises and cuts of all the prices of a price list',

  up: async ({ db }) => {
    await db.transaction(async (tx) => {
      for (const statement of [
        `CREATE TABLE IF NOT EXISTS "price_list_adjustments" (
          "id" text PRIMARY KEY NOT NULL,
          "created_at" timestamp (3) with time zone NOT NULL,
          "updated_at" timestamp (3) with time zone NOT NULL,
          "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "price_list_id" text NOT NULL REFERENCES "price_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "user_id" text REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
          "rate_bps" integer NOT NULL,
          "product_count" integer NOT NULL
        )`,
        `CREATE INDEX IF NOT EXISTS "price_list_adjustments_price_list_id_index" ON "price_list_adjustments" ("price_list_id", "created_at")`,
      ]) {
        await tx.execute(sql.raw(statement));
      }
    });
  },

  down: async ({ db }) => {
    await db.execute(sql.raw(`DROP TABLE IF EXISTS "price_list_adjustments"`));
  },
} satisfies Migration;
