import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const gestoriaInvitationsMigration = {
  name: 'gestoria-invitations',
  description: 'Invitations by email to join a gestoría, for people who do not have an account yet',

  up: async ({ db }) => {
    await db.transaction(async (tx) => {
      for (const statement of [
        `CREATE TABLE IF NOT EXISTS "gestoria_invitations" (
          "id" text PRIMARY KEY NOT NULL,
          "created_at" timestamp (3) with time zone NOT NULL,
          "updated_at" timestamp (3) with time zone NOT NULL,
          "gestoria_id" text NOT NULL REFERENCES "gestorias"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "email" text NOT NULL,
          "status" text DEFAULT 'pending' NOT NULL,
          "expires_at" timestamp (3) with time zone NOT NULL,
          "inviter_id" text REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
          CONSTRAINT "gestoria_invitations_gestoria_email_unique" UNIQUE("gestoria_id", "email")
        )`,
        `CREATE INDEX IF NOT EXISTS "gestoria_invitations_email_index" ON "gestoria_invitations" ("email")`,
      ]) {
        await tx.execute(sql.raw(statement));
      }
    });
  },

  down: async ({ db }) => {
    await db.execute(sql.raw(`DROP TABLE IF EXISTS "gestoria_invitations"`));
  },
} satisfies Migration;
