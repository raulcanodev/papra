import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const optionalPaymentTermsMigration = {
  name: 'optional-payment-terms',
  description: 'The payment terms of a contact are optional',

  up: async ({ db }) => {
    await db.transaction(async (tx) => {
      for (const statement of [
        `ALTER TABLE "contacts" ALTER COLUMN "payment_terms_days" DROP NOT NULL`,
        `ALTER TABLE "contacts" ALTER COLUMN "payment_terms_days" DROP DEFAULT`,
      ]) {
        await tx.execute(sql.raw(statement));
      }
    });
  },

  down: async ({ db }) => {
    await db.transaction(async (tx) => {
      for (const statement of [
        `UPDATE "contacts" SET "payment_terms_days" = 30 WHERE "payment_terms_days" IS NULL`,
        `ALTER TABLE "contacts" ALTER COLUMN "payment_terms_days" SET DEFAULT 30`,
        `ALTER TABLE "contacts" ALTER COLUMN "payment_terms_days" SET NOT NULL`,
      ]) {
        await tx.execute(sql.raw(statement));
      }
    });
  },
} satisfies Migration;
