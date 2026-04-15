import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const transactionTagsAndPropertiesMigration: Migration = {
  name: 'transaction-tags-and-properties',
  description: 'Add transaction_tags junction table, transaction_custom_property_values table, and tag_ids column to classification_rules',

  up: async ({ db }) => {
    await db.batch([
      // Junction table for transaction <-> tags (parallels documents_tags)
      db.run(sql`
        CREATE TABLE IF NOT EXISTS "transaction_tags" (
          "transaction_id" text NOT NULL REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "tag_id" text NOT NULL REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          PRIMARY KEY ("transaction_id", "tag_id")
        )
      `),

      // Custom property values for transactions (parallels document_custom_property_values)
      db.run(sql`
        CREATE TABLE IF NOT EXISTS "transaction_custom_property_values" (
          "id" text PRIMARY KEY NOT NULL,
          "created_at" integer NOT NULL,
          "updated_at" integer NOT NULL,
          "transaction_id" text NOT NULL REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "property_definition_id" text NOT NULL REFERENCES "custom_property_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "text_value" text,
          "number_value" real,
          "date_value" integer,
          "boolean_value" integer,
          "select_option_id" text REFERENCES "custom_property_select_options"("id") ON DELETE CASCADE ON UPDATE CASCADE
        )
      `),

      db.run(sql`
        CREATE INDEX IF NOT EXISTS "tx_cpv_transaction_id_property_id"
        ON "transaction_custom_property_values" ("transaction_id", "property_definition_id")
      `),

      // Add tag_ids (JSON array) to classification_rules for optional tag assignment on match
      db.run(sql`
        ALTER TABLE "classification_rules" ADD COLUMN "tag_ids" text NOT NULL DEFAULT '[]'
      `),
    ]);
  },

  down: async ({ db }) => {
    await db.batch([
      db.run(sql`DROP TABLE IF EXISTS "transaction_tags"`),
      db.run(sql`DROP TABLE IF EXISTS "transaction_custom_property_values"`),
      // SQLite doesn't support DROP COLUMN easily; leave tag_ids in place for down
    ]);
  },
};
