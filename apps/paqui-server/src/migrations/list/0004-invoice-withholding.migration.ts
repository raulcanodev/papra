import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const invoiceWithholdingMigration = {
  name: 'invoice-withholding',
  description: 'IRPF withholding on issued invoices, with a default rate in the fiscal profile',

  up: async ({ db }) => {
    await db.transaction(async (tx) => {
      for (const statement of [
        `ALTER TABLE "invoices" ADD COLUMN "withholding_rate_bps" integer DEFAULT 0 NOT NULL`,
        `ALTER TABLE "invoices" ADD COLUMN "withholding_minor" integer DEFAULT 0 NOT NULL`,
        `ALTER TABLE "invoicing_profiles" ADD COLUMN "default_withholding_rate_bps" integer DEFAULT 0 NOT NULL`,
      ]) {
        await tx.execute(sql.raw(statement));
      }
    });
  },

  down: async ({ db }) => {
    await db.transaction(async (tx) => {
      for (const statement of [
        `ALTER TABLE "invoicing_profiles" DROP COLUMN "default_withholding_rate_bps"`,
        `ALTER TABLE "invoices" DROP COLUMN "withholding_minor"`,
        `ALTER TABLE "invoices" DROP COLUMN "withholding_rate_bps"`,
      ]) {
        await tx.execute(sql.raw(statement));
      }
    });
  },
} satisfies Migration;
