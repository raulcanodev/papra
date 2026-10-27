import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const invoiceItemFixedDiscountMigration = {
  name: 'invoice-item-fixed-discount',
  description: 'An invoice line can take a fixed amount off, besides the percentage discount',

  up: async ({ db }) => {
    await db.execute(sql.raw(`ALTER TABLE "invoice_items" ADD COLUMN IF NOT EXISTS "discount_minor" integer DEFAULT 0 NOT NULL`));
  },

  down: async ({ db }) => {
    await db.execute(sql.raw(`ALTER TABLE "invoice_items" DROP COLUMN IF EXISTS "discount_minor"`));
  },
} satisfies Migration;
