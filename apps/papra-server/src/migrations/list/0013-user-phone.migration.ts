import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const userPhoneMigration = {
  name: 'user-phone',
  description: 'The phone of the person, asked during the onboarding',

  up: async ({ db }) => {
    await db.execute(sql.raw(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone" text`));
  },

  down: async ({ db }) => {
    await db.execute(sql.raw(`ALTER TABLE "users" DROP COLUMN IF EXISTS "phone"`));
  },
} satisfies Migration;
