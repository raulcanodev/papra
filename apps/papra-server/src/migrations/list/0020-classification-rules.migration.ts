import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const classificationRulesMigration: Migration = {
  name: 'classification-rules',
  description: 'Add classification rules table for auto-classifying transactions',

  up: async ({ db }) => {
    await db.batch([
      db.run(sql`
        CREATE TABLE IF NOT EXISTS "classification_rules" (
          "id" text PRIMARY KEY NOT NULL,
          "created_at" integer NOT NULL,
          "updated_at" integer NOT NULL,
          "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "name" text NOT NULL,
          "classification" text NOT NULL,
          "conditions" text NOT NULL DEFAULT '[]',
          "condition_match_mode" text NOT NULL DEFAULT 'all',
          "priority" integer NOT NULL DEFAULT 0,
          "is_active" integer NOT NULL DEFAULT 1
        )
      `),
      db.run(sql`
        CREATE INDEX IF NOT EXISTS "classification_rules_organization_id_index"
        ON "classification_rules" ("organization_id")
      `),
    ]);
  },

  down: async ({ db }) => {
    await db.run(sql`DROP TABLE IF EXISTS "classification_rules"`);
  },
};
