import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const deliveryNotesMigration = {
  name: 'delivery-notes',
  description: 'Delivery notes handed to customers, invoiced several at a time, and photos of them taken with the phone',

  up: async ({ db }) => {
    await db.transaction(async (tx) => {
      for (const statement of [
        `CREATE TABLE IF NOT EXISTS "delivery_notes" (
          "id" text PRIMARY KEY NOT NULL,
          "created_at" timestamp (3) with time zone NOT NULL,
          "updated_at" timestamp (3) with time zone NOT NULL,
          "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "customer_id" text NOT NULL REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
          "number" text,
          "date" timestamp (3) with time zone NOT NULL,
          "notes" text,
          "document_id" text REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE,
          "invoice_id" text REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE
        )`,
        `CREATE INDEX IF NOT EXISTS "delivery_notes_organization_date_index" ON "delivery_notes" ("organization_id", "date")`,
        `CREATE INDEX IF NOT EXISTS "delivery_notes_customer_id_index" ON "delivery_notes" ("customer_id")`,
        `CREATE INDEX IF NOT EXISTS "delivery_notes_invoice_id_index" ON "delivery_notes" ("invoice_id")`,
        `CREATE TABLE IF NOT EXISTS "delivery_note_items" (
          "id" text PRIMARY KEY NOT NULL,
          "created_at" timestamp (3) with time zone NOT NULL,
          "updated_at" timestamp (3) with time zone NOT NULL,
          "delivery_note_id" text NOT NULL REFERENCES "delivery_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "product_id" text REFERENCES "invoicing_products"("id") ON DELETE SET NULL ON UPDATE CASCADE,
          "written_text" text,
          "description" text NOT NULL,
          "quantity_millis" integer NOT NULL,
          "position" integer DEFAULT 0 NOT NULL
        )`,
        `CREATE INDEX IF NOT EXISTS "delivery_note_items_delivery_note_id_index" ON "delivery_note_items" ("delivery_note_id")`,
        `CREATE INDEX IF NOT EXISTS "delivery_note_items_product_id_index" ON "delivery_note_items" ("product_id")`,
        `ALTER TABLE "capture_sessions" DROP CONSTRAINT IF EXISTS "capture_sessions_purpose_check"`,
        `ALTER TABLE "capture_sessions" ADD CONSTRAINT "capture_sessions_purpose_check" CHECK ("purpose" IN ('purchase', 'product_image', 'delivery_note'))`,
      ]) {
        await tx.execute(sql.raw(statement));
      }
    });
  },

  down: async ({ db }) => {
    await db.transaction(async (tx) => {
      for (const statement of [
        `DELETE FROM "capture_sessions" WHERE "purpose" = 'delivery_note'`,
        `ALTER TABLE "capture_sessions" DROP CONSTRAINT IF EXISTS "capture_sessions_purpose_check"`,
        `ALTER TABLE "capture_sessions" ADD CONSTRAINT "capture_sessions_purpose_check" CHECK ("purpose" IN ('purchase', 'product_image'))`,
        `DROP TABLE IF EXISTS "delivery_note_items"`,
        `DROP TABLE IF EXISTS "delivery_notes"`,
      ]) {
        await tx.execute(sql.raw(statement));
      }
    });
  },
} satisfies Migration;
