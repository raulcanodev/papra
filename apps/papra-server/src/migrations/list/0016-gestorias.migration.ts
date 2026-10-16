import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const gestoriasMigration = {
  name: 'gestorias',
  description: 'Gestorías: accounting firms whose members read the books of the companies an admin gave them access to, module by module',

  up: async ({ db }) => {
    await db.transaction(async (tx) => {
      for (const statement of [
        `CREATE TABLE IF NOT EXISTS "gestorias" (
          "id" text PRIMARY KEY NOT NULL,
          "created_at" timestamp (3) with time zone NOT NULL,
          "updated_at" timestamp (3) with time zone NOT NULL,
          "name" text NOT NULL,
          "tax_id" text,
          "email" text
        )`,
        `CREATE TABLE IF NOT EXISTS "gestoria_members" (
          "id" text PRIMARY KEY NOT NULL,
          "created_at" timestamp (3) with time zone NOT NULL,
          "updated_at" timestamp (3) with time zone NOT NULL,
          "gestoria_id" text NOT NULL REFERENCES "gestorias"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          CONSTRAINT "gestoria_members_gestoria_user_unique" UNIQUE("gestoria_id", "user_id")
        )`,
        `CREATE INDEX IF NOT EXISTS "gestoria_members_user_id_index" ON "gestoria_members" ("user_id")`,
        `CREATE TABLE IF NOT EXISTS "gestoria_clients" (
          "id" text PRIMARY KEY NOT NULL,
          "created_at" timestamp (3) with time zone NOT NULL,
          "updated_at" timestamp (3) with time zone NOT NULL,
          "gestoria_id" text NOT NULL REFERENCES "gestorias"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "modules" jsonb DEFAULT '[]'::jsonb NOT NULL,
          "granted_by" text REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
          CONSTRAINT "gestoria_clients_gestoria_organization_unique" UNIQUE("gestoria_id", "organization_id")
        )`,
        `CREATE INDEX IF NOT EXISTS "gestoria_clients_organization_id_index" ON "gestoria_clients" ("organization_id")`,
      ]) {
        await tx.execute(sql.raw(statement));
      }
    });
  },

  down: async ({ db }) => {
    await db.transaction(async (tx) => {
      for (const statement of [
        `DROP TABLE IF EXISTS "gestoria_clients"`,
        `DROP TABLE IF EXISTS "gestoria_members"`,
        `DROP TABLE IF EXISTS "gestorias"`,
      ]) {
        await tx.execute(sql.raw(statement));
      }
    });
  },
} satisfies Migration;
