import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const productContactMigration = {
  name: 'product-contact',
  description: 'Products can belong to a contact (what a supplier sells us, what we sell a customer at its own price); none means our own catalog',

  up: async ({ db }) => {
    await db.transaction(async (tx) => {
      for (const statement of [
        `ALTER TABLE "invoicing_products" ADD COLUMN IF NOT EXISTS "contact_id" text REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
        `CREATE INDEX IF NOT EXISTS "invoicing_products_organization_id_contact_id_index" ON "invoicing_products" ("organization_id", "contact_id")`,
      ]) {
        await tx.execute(sql.raw(statement));
      }
    });
  },

  down: async ({ db }) => {
    await db.transaction(async (tx) => {
      for (const statement of [
        `DROP INDEX IF EXISTS "invoicing_products_organization_id_contact_id_index"`,
        `ALTER TABLE "invoicing_products" DROP COLUMN IF EXISTS "contact_id"`,
      ]) {
        await tx.execute(sql.raw(statement));
      }
    });
  },
} satisfies Migration;
