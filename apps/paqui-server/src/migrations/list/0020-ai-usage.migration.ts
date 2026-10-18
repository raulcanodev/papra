import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const aiUsageMigration = {
  name: 'ai-usage',
  description: 'Usage and cost of every language model call, and the model chosen from the admin panel',

  up: async ({ db }) => {
    await db.transaction(async (tx) => {
      for (const statement of [
        `CREATE TABLE IF NOT EXISTS "ai_usage" (
          "id" text PRIMARY KEY NOT NULL,
          "created_at" timestamp (3) with time zone NOT NULL,
          "organization_id" text REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE,
          "user_id" text REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
          "feature" text NOT NULL,
          "provider" text NOT NULL,
          "model" text NOT NULL,
          "input_tokens" integer DEFAULT 0 NOT NULL,
          "cache_read_tokens" integer DEFAULT 0 NOT NULL,
          "cache_write_tokens" integer DEFAULT 0 NOT NULL,
          "output_tokens" integer DEFAULT 0 NOT NULL,
          "reasoning_tokens" integer DEFAULT 0 NOT NULL,
          "cost_usd_micros" integer,
          "duration_ms" integer DEFAULT 0 NOT NULL,
          "status" text DEFAULT 'success' NOT NULL
        )`,
        `CREATE INDEX IF NOT EXISTS "ai_usage_created_at_index" ON "ai_usage" ("created_at")`,
        `CREATE INDEX IF NOT EXISTS "ai_usage_feature_created_at_index" ON "ai_usage" ("feature", "created_at")`,
        `CREATE INDEX IF NOT EXISTS "ai_usage_organization_id_created_at_index" ON "ai_usage" ("organization_id", "created_at")`,
        `CREATE TABLE IF NOT EXISTS "ai_settings" (
          "id" text PRIMARY KEY NOT NULL,
          "created_at" timestamp (3) with time zone NOT NULL,
          "updated_at" timestamp (3) with time zone NOT NULL,
          "provider" text NOT NULL,
          "model" text NOT NULL,
          "reasoning_effort" text,
          "updated_by" text REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
        )`,
      ]) {
        await tx.execute(sql.raw(statement));
      }
    });
  },

  down: async ({ db }) => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`DROP TABLE IF EXISTS "ai_usage"`));
      await tx.execute(sql.raw(`DROP TABLE IF EXISTS "ai_settings"`));
    });
  },
} satisfies Migration;
