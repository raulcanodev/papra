import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const classificationRulesConditionsMigration: Migration = {
  name: 'classification-rules-conditions',
  description: 'Migrate classification_rules table to use JSON conditions array instead of single field/operator/value columns',

  up: async ({ db }) => {
    // Create new table with the correct schema
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS "classification_rules_new" (
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
    `);

    // Migrate existing rows: wrap old field/operator/value into conditions JSON
    // The old table may have either schema depending on when migration 0020 ran
    const tableInfo = await db.run(sql`PRAGMA table_info(classification_rules)`);
    const hasOldColumns = (tableInfo.rows as unknown as Array<{ name: string }>).some(row => row.name === 'field');

    if (hasOldColumns) {
      await db.run(sql`
        INSERT INTO "classification_rules_new"
          ("id", "created_at", "updated_at", "organization_id", "name", "classification", "conditions", "condition_match_mode", "priority", "is_active")
        SELECT
          "id",
          "created_at",
          "updated_at",
          "organization_id",
          "name",
          "classification",
          json_array(json_object('field', "field", 'operator', "operator", 'value', "value")),
          'all',
          "priority",
          "is_active"
        FROM "classification_rules"
      `);
    }
    else {
      // Already has new schema (conditions column exists), just copy data
      await db.run(sql`
        INSERT INTO "classification_rules_new"
        SELECT * FROM "classification_rules"
      `);
    }

    await db.run(sql`DROP TABLE "classification_rules"`);
    await db.run(sql`ALTER TABLE "classification_rules_new" RENAME TO "classification_rules"`);
    await db.run(sql`
      CREATE INDEX IF NOT EXISTS "classification_rules_organization_id_index"
      ON "classification_rules" ("organization_id")
    `);
  },

  down: async ({ db }) => {
    // Recreate old schema (data loss expected)
    await db.run(sql`DROP TABLE IF EXISTS "classification_rules"`);
    await db.run(sql`
      CREATE TABLE "classification_rules" (
        "id" text PRIMARY KEY NOT NULL,
        "created_at" integer NOT NULL,
        "updated_at" integer NOT NULL,
        "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        "name" text NOT NULL,
        "classification" text NOT NULL,
        "field" text NOT NULL,
        "operator" text NOT NULL,
        "value" text NOT NULL,
        "priority" integer NOT NULL DEFAULT 0,
        "is_active" integer NOT NULL DEFAULT 1
      )
    `);
  },
};
