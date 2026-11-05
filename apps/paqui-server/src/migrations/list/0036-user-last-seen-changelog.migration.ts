import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const userLastSeenChangelogMigration = {
  name: 'user-last-seen-changelog',
  description: 'Each user remembers the last news from Paqui they read, so they are only told what is new',

  up: async ({ db }) => {
    await db.execute(sql.raw(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_seen_changelog_id" text`));
  },

  down: async ({ db }) => {
    await db.execute(sql.raw(`ALTER TABLE "users" DROP COLUMN IF EXISTS "last_seen_changelog_id"`));
  },
} satisfies Migration;
