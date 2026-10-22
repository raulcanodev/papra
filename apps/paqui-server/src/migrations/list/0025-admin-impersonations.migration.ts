import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const adminImpersonationsMigration = {
  name: 'admin-impersonations',
  description: 'Sessions an admin opens as another user, and the audit trail of every one of them',

  up: async ({ db }) => {
    await db.transaction(async (tx) => {
      for (const statement of [
        `ALTER TABLE "auth_sessions" ADD COLUMN IF NOT EXISTS "impersonated_by" text REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
        `CREATE TABLE IF NOT EXISTS "admin_impersonations" (
          "id" text PRIMARY KEY NOT NULL,
          "created_at" timestamp (3) with time zone NOT NULL,
          "admin_user_id" text REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
          "target_user_id" text REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
          "admin_email" text NOT NULL,
          "target_email" text NOT NULL,
          "reason" text NOT NULL,
          "session_id" text NOT NULL,
          "ip_address" text,
          "user_agent" text,
          "expires_at" timestamp (3) with time zone NOT NULL,
          "ended_at" timestamp (3) with time zone
        )`,
        `CREATE INDEX IF NOT EXISTS "admin_impersonations_target_user_id_created_at_index" ON "admin_impersonations" ("target_user_id", "created_at")`,
        `CREATE INDEX IF NOT EXISTS "admin_impersonations_admin_user_id_created_at_index" ON "admin_impersonations" ("admin_user_id", "created_at")`,
        `CREATE INDEX IF NOT EXISTS "admin_impersonations_session_id_index" ON "admin_impersonations" ("session_id")`,
      ]) {
        await tx.execute(sql.raw(statement));
      }
    });
  },

  down: async ({ db }) => {
    await db.transaction(async (tx) => {
      // Impersonation sessions must not survive as ordinary sessions of the user
      await tx.execute(sql.raw(`DELETE FROM "auth_sessions" WHERE "impersonated_by" IS NOT NULL`));
      await tx.execute(sql.raw(`ALTER TABLE "auth_sessions" DROP COLUMN IF EXISTS "impersonated_by"`));
      await tx.execute(sql.raw(`DROP TABLE IF EXISTS "admin_impersonations"`));
    });
  },
} satisfies Migration;
