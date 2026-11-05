import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const proformaInvoicesMigration = {
  name: 'proforma-invoices',
  description: 'A proforma is kept with the invoices, in its own status, and remembers the invoice made from it',

  up: async ({ db }) => {
    await db.transaction(async (tx) => {
      for (const statement of [
        `ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "converted_invoice_id" text`,
        `ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_converted_invoice_id_invoices_id_fk"`,
        `ALTER TABLE "invoices" ADD CONSTRAINT "invoices_converted_invoice_id_invoices_id_fk" FOREIGN KEY ("converted_invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
      ]) {
        await tx.execute(sql.raw(statement));
      }
    });
  },

  down: async ({ db }) => {
    await db.transaction(async (tx) => {
      for (const statement of [
        `DELETE FROM "invoices" WHERE "status" = 'proforma'`,
        `ALTER TABLE "invoices" DROP COLUMN IF EXISTS "converted_invoice_id"`,
      ]) {
        await tx.execute(sql.raw(statement));
      }
    });
  },
} satisfies Migration;
