import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const featureFlagsMigration: Migration = {
  name: 'feature-flags',
  description: 'Create feature_flags table for DB-driven feature flag management, replacing hardcoded email lists',

  up: async ({ db }) => {
    await db.batch([
      db.run(sql`
        CREATE TABLE IF NOT EXISTS "feature_flags" (
          "id" text PRIMARY KEY NOT NULL,
          "created_at" integer NOT NULL,
          "updated_at" integer NOT NULL,
          "flag_id" text NOT NULL,
          "user_email" text NOT NULL
        )
      `),
      db.run(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS "feature_flags_flag_id_user_email_unique"
        ON "feature_flags" ("flag_id", "user_email")
      `),
    ]);
  },
};
