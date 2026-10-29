import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const purchaseItemPreciseUnitPriceMigration = {
  name: 'purchase-item-precise-unit-price',
  description: 'A received invoice line keeps its unit price beyond the cent (0,365 €), so the line adds up to the printed amount',

  up: async ({ db }) => {
    await db.execute(sql.raw(`ALTER TABLE "purchase_invoice_items" ADD COLUMN IF NOT EXISTS "unit_price_micros" bigint`));
  },

  down: async ({ db }) => {
    await db.execute(sql.raw(`ALTER TABLE "purchase_invoice_items" DROP COLUMN IF EXISTS "unit_price_micros"`));
  },
} satisfies Migration;
