import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const importedIssuedInvoicesMigration = {
  name: 'imported-issued-invoices',
  description: 'An issued invoice can come from outside the app (its paper uploaded), marked by when it was imported',

  up: async ({ db }) => {
    await db.execute(sql.raw(`ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "imported_at" timestamp (3) with time zone`));
  },

  down: async ({ db }) => {
    await db.execute(sql.raw(`ALTER TABLE "invoices" DROP COLUMN IF EXISTS "imported_at"`));
  },
} satisfies Migration;
