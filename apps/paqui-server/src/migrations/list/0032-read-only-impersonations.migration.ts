import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const readOnlyImpersonationsMigration = {
  name: 'read-only-impersonations',
  description: 'An impersonation is read-only unless the admin chooses to be able to change things before entering',

  up: async ({ db }) => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`ALTER TABLE "auth_sessions" ADD COLUMN IF NOT EXISTS "impersonation_can_write" boolean DEFAULT false NOT NULL`));
      await tx.execute(sql.raw(`ALTER TABLE "admin_impersonations" ADD COLUMN IF NOT EXISTS "can_write" boolean DEFAULT false NOT NULL`));
    });
  },

  down: async ({ db }) => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`ALTER TABLE "auth_sessions" DROP COLUMN IF EXISTS "impersonation_can_write"`));
      await tx.execute(sql.raw(`ALTER TABLE "admin_impersonations" DROP COLUMN IF EXISTS "can_write"`));
    });
  },
} satisfies Migration;
