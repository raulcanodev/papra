import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const purchaseDocumentKindMigration = {
  name: 'purchase-document-kind',
  description: 'Purchases record what the paper is (invoice, ticket, delivery note) and the data read on it that has no column of its own',

  up: async ({ db }) => {
    await db.transaction(async (tx) => {
      for (const statement of [
        `ALTER TABLE "purchase_invoices" ADD COLUMN IF NOT EXISTS "kind" text NOT NULL DEFAULT 'invoice'`,
        `ALTER TABLE "purchase_invoices" ADD COLUMN IF NOT EXISTS "metadata" jsonb NOT NULL DEFAULT '[]'::jsonb`,
        `ALTER TABLE "purchase_invoices" DROP CONSTRAINT IF EXISTS "purchase_invoices_kind_check"`,
        `ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_kind_check" CHECK ("kind" IN ('invoice', 'simplified_invoice', 'delivery_note'))`,
      ]) {
        await tx.execute(sql.raw(statement));
      }
    });
  },

  down: async ({ db }) => {
    await db.transaction(async (tx) => {
      for (const statement of [
        `ALTER TABLE "purchase_invoices" DROP CONSTRAINT IF EXISTS "purchase_invoices_kind_check"`,
        `ALTER TABLE "purchase_invoices" DROP COLUMN IF EXISTS "metadata"`,
        `ALTER TABLE "purchase_invoices" DROP COLUMN IF EXISTS "kind"`,
      ]) {
        await tx.execute(sql.raw(statement));
      }
    });
  },
} satisfies Migration;
