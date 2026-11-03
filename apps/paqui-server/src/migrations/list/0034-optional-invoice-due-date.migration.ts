import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const optionalInvoiceDueDateMigration = {
  name: 'optional-invoice-due-date',
  description: 'An issued invoice can go without a due date',

  up: async ({ db }) => {
    await db.execute(sql.raw(`ALTER TABLE "invoices" ALTER COLUMN "due_date" DROP NOT NULL`));
  },

  down: async ({ db }) => {
    await db.transaction(async (tx) => {
      for (const statement of [
        `UPDATE "invoices" SET "due_date" = "issue_date" WHERE "due_date" IS NULL`,
        `ALTER TABLE "invoices" ALTER COLUMN "due_date" SET NOT NULL`,
      ]) {
        await tx.execute(sql.raw(statement));
      }
    });
  },
} satisfies Migration;
