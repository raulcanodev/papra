import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const userAiProfilesMigration: Migration = {
  name: 'user-ai-profiles',
  description: 'Create user_ai_profiles table for storing AI-managed user context (name, country, business info, etc.)',

  up: async ({ db }) => {
    await db.run(sql`
      CREATE TABLE "user_ai_profiles" (
        "user_id" text PRIMARY KEY NOT NULL,
        "profile" text NOT NULL DEFAULT '{}',
        "created_at" text NOT NULL DEFAULT (datetime('now')),
        "updated_at" text NOT NULL DEFAULT (datetime('now'))
      )
    `);
  },

  down: async ({ db }) => {
    await db.run(sql`DROP TABLE IF EXISTS "user_ai_profiles"`);
  },
};
