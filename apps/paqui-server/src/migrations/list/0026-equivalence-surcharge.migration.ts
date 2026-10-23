import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const equivalenceSurchargeMigration = {
  name: 'equivalence-surcharge',
  description: 'Equivalence surcharge on issued invoices, and the customers under that regime',

  up: async ({ db }) => {
    await db.transaction(async (tx) => {
      for (const statement of [
        `ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "equivalence_surcharge" boolean DEFAULT false NOT NULL`,
        `ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "equivalence_surcharge_minor" integer DEFAULT 0 NOT NULL`,
        `ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "equivalence_surcharge" boolean DEFAULT false NOT NULL`,
      ]) {
        await tx.execute(sql.raw(statement));
      }
    });
  },

  down: async ({ db }) => {
    await db.transaction(async (tx) => {
      for (const statement of [
        `ALTER TABLE "contacts" DROP COLUMN IF EXISTS "equivalence_surcharge"`,
        `ALTER TABLE "invoices" DROP COLUMN IF EXISTS "equivalence_surcharge_minor"`,
        `ALTER TABLE "invoices" DROP COLUMN IF EXISTS "equivalence_surcharge"`,
      ]) {
        await tx.execute(sql.raw(statement));
      }
    });
  },
} satisfies Migration;
