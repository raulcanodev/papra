import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const memberPreferencesMigration = {
  name: 'member-preferences',
  description: 'Per member layout preferences of an organization: home cards and main menu entries',

  up: async ({ db }) => {
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS "member_preferences" (
        "created_at" timestamp (3) with time zone NOT NULL,
        "updated_at" timestamp (3) with time zone NOT NULL,
        "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE cascade ON UPDATE cascade,
        "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade ON UPDATE cascade,
        "preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
        PRIMARY KEY ("organization_id", "user_id")
      )
    `));
  },

  down: async ({ db }) => {
    await db.execute(sql.raw(`DROP TABLE IF EXISTS "member_preferences"`));
  },
} satisfies Migration;
