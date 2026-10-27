import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const optionalDefaultPaymentTermsMigration = {
  name: 'optional-default-payment-terms',
  description: 'The default payment terms of the fiscal profile are optional',

  up: async ({ db }) => {
    await db.transaction(async (tx) => {
      for (const statement of [
        `ALTER TABLE "invoicing_profiles" ALTER COLUMN "payment_terms_days" DROP NOT NULL`,
        `ALTER TABLE "invoicing_profiles" ALTER COLUMN "payment_terms_days" DROP DEFAULT`,
      ]) {
        await tx.execute(sql.raw(statement));
      }
    });
  },

  down: async ({ db }) => {
    await db.transaction(async (tx) => {
      for (const statement of [
        `UPDATE "invoicing_profiles" SET "payment_terms_days" = 30 WHERE "payment_terms_days" IS NULL`,
        `ALTER TABLE "invoicing_profiles" ALTER COLUMN "payment_terms_days" SET DEFAULT 30`,
        `ALTER TABLE "invoicing_profiles" ALTER COLUMN "payment_terms_days" SET NOT NULL`,
      ]) {
        await tx.execute(sql.raw(statement));
      }
    });
  },
} satisfies Migration;
