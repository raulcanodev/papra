import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const pricingMigration = {
  name: 'pricing',
  description: 'Product cost breakdowns, shipping rates and price lists shared by several contacts',

  up: async ({ db }) => {
    await db.transaction(async (tx) => {
      for (const statement of [
        `CREATE TABLE IF NOT EXISTS "cost_concepts" (
          "id" text PRIMARY KEY NOT NULL,
          "created_at" timestamp (3) with time zone NOT NULL,
          "updated_at" timestamp (3) with time zone NOT NULL,
          "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "name" text NOT NULL,
          CONSTRAINT "cost_concepts_organization_name_unique" UNIQUE("organization_id", "name")
        )`,
        `CREATE TABLE IF NOT EXISTS "product_cost_lines" (
          "id" text PRIMARY KEY NOT NULL,
          "created_at" timestamp (3) with time zone NOT NULL,
          "updated_at" timestamp (3) with time zone NOT NULL,
          "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "product_id" text NOT NULL REFERENCES "invoicing_products"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "concept_id" text NOT NULL REFERENCES "cost_concepts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "amount_minor" integer NOT NULL,
          "position" integer DEFAULT 0 NOT NULL
        )`,
        `CREATE INDEX IF NOT EXISTS "product_cost_lines_product_id_index" ON "product_cost_lines" ("product_id")`,
        `CREATE INDEX IF NOT EXISTS "product_cost_lines_organization_id_index" ON "product_cost_lines" ("organization_id")`,
        `CREATE TABLE IF NOT EXISTS "shipping_rates" (
          "id" text PRIMARY KEY NOT NULL,
          "created_at" timestamp (3) with time zone NOT NULL,
          "updated_at" timestamp (3) with time zone NOT NULL,
          "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "name" text NOT NULL,
          "carrier_contact_id" text REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE,
          "amount_minor" integer NOT NULL,
          "notes" text,
          "archived_at" timestamp (3) with time zone
        )`,
        `CREATE INDEX IF NOT EXISTS "shipping_rates_organization_id_index" ON "shipping_rates" ("organization_id")`,
        `CREATE TABLE IF NOT EXISTS "price_lists" (
          "id" text PRIMARY KEY NOT NULL,
          "created_at" timestamp (3) with time zone NOT NULL,
          "updated_at" timestamp (3) with time zone NOT NULL,
          "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "name" text NOT NULL,
          "description" text,
          "discount_rate_bps" integer DEFAULT 0 NOT NULL,
          "default_shipping_rate_id" text REFERENCES "shipping_rates"("id") ON DELETE SET NULL ON UPDATE CASCADE,
          "is_default" boolean DEFAULT false NOT NULL,
          "archived_at" timestamp (3) with time zone
        )`,
        `CREATE INDEX IF NOT EXISTS "price_lists_organization_id_index" ON "price_lists" ("organization_id")`,
        `CREATE TABLE IF NOT EXISTS "price_list_items" (
          "id" text PRIMARY KEY NOT NULL,
          "created_at" timestamp (3) with time zone NOT NULL,
          "updated_at" timestamp (3) with time zone NOT NULL,
          "price_list_id" text NOT NULL REFERENCES "price_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "product_id" text NOT NULL REFERENCES "invoicing_products"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "price_minor" integer NOT NULL,
          "overrides_shipping" boolean DEFAULT false NOT NULL,
          "shipping_rate_id" text REFERENCES "shipping_rates"("id") ON DELETE SET NULL ON UPDATE CASCADE,
          "position" integer DEFAULT 0 NOT NULL,
          CONSTRAINT "price_list_items_price_list_product_unique" UNIQUE("price_list_id", "product_id")
        )`,
        `CREATE TABLE IF NOT EXISTS "price_list_contacts" (
          "contact_id" text PRIMARY KEY NOT NULL REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "created_at" timestamp (3) with time zone NOT NULL,
          "updated_at" timestamp (3) with time zone NOT NULL,
          "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "price_list_id" text NOT NULL REFERENCES "price_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE
        )`,
        `CREATE INDEX IF NOT EXISTS "price_list_contacts_price_list_id_index" ON "price_list_contacts" ("price_list_id")`,
      ]) {
        await tx.execute(sql.raw(statement));
      }
    });
  },

  down: async ({ db }) => {
    await db.transaction(async (tx) => {
      for (const table of ['price_list_contacts', 'price_list_items', 'price_lists', 'shipping_rates', 'product_cost_lines', 'cost_concepts']) {
        await tx.execute(sql.raw(`DROP TABLE IF EXISTS "${table}"`));
      }
    });
  },
} satisfies Migration;
