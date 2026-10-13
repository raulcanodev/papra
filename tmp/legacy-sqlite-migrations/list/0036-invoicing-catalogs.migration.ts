import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const invoicingCatalogsMigration: Migration = {
  name: 'invoicing-catalogs',
  description: 'Add reusable products, taxes, sales representatives, invoice branding and invoice snapshots',
  up: async ({ db }) => {
    const seriesColumns = new Set((await db.all<{ name: string }>(sql`PRAGMA table_info("invoice_series")`)).map(column => column.name));
    const invoiceColumns = new Set((await db.all<{ name: string }>(sql`PRAGMA table_info("invoices")`)).map(column => column.name));
    const itemColumns = new Set((await db.all<{ name: string }>(sql`PRAGMA table_info("invoice_items")`)).map(column => column.name));
    if (!seriesColumns.has('archived_at')) {
      await db.run(sql`ALTER TABLE "invoice_series" ADD COLUMN "archived_at" integer`);
    }
    await db.batch([
      db.run(sql`CREATE TABLE IF NOT EXISTS "invoicing_products" ("id" text PRIMARY KEY NOT NULL, "created_at" integer NOT NULL, "updated_at" integer NOT NULL, "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE, "name" text NOT NULL, "description" text, "unit" text NOT NULL DEFAULT 'unit', "unit_price_minor" integer NOT NULL DEFAULT 0, "currency" text NOT NULL DEFAULT 'EUR', "tax_rate_bps" integer NOT NULL DEFAULT 2100, "archived_at" integer)`),
      db.run(sql`CREATE INDEX IF NOT EXISTS "invoicing_products_organization_id_index" ON "invoicing_products" ("organization_id")`),
      db.run(sql`CREATE TABLE IF NOT EXISTS "invoicing_tax_rates" ("id" text PRIMARY KEY NOT NULL, "created_at" integer NOT NULL, "updated_at" integer NOT NULL, "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE, "name" text NOT NULL, "rate_bps" integer NOT NULL, "is_default" integer NOT NULL DEFAULT 0, "archived_at" integer)`),
      db.run(sql`CREATE INDEX IF NOT EXISTS "invoicing_tax_rates_organization_id_index" ON "invoicing_tax_rates" ("organization_id")`),
      db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS "invoicing_tax_rates_organization_name_unique" ON "invoicing_tax_rates" ("organization_id", "name")`),
      db.run(sql`CREATE TABLE IF NOT EXISTS "invoicing_sales_representatives" ("id" text PRIMARY KEY NOT NULL, "created_at" integer NOT NULL, "updated_at" integer NOT NULL, "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE, "name" text NOT NULL, "email" text, "phone" text, "tax_id" text, "notes" text, "archived_at" integer)`),
      db.run(sql`CREATE INDEX IF NOT EXISTS "invoicing_sales_representatives_organization_id_index" ON "invoicing_sales_representatives" ("organization_id")`),
      db.run(sql`CREATE TABLE IF NOT EXISTS "invoicing_branding" ("organization_id" text PRIMARY KEY NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE, "created_at" integer NOT NULL, "updated_at" integer NOT NULL, "accent_color" text NOT NULL DEFAULT '#111827', "footer_text" text, "payment_details" text)`),
    ]);
    if (!invoiceColumns.has('sales_representative_id')) {
      await db.run(sql`ALTER TABLE "invoices" ADD COLUMN "sales_representative_id" text REFERENCES "invoicing_sales_representatives"("id") ON DELETE SET NULL ON UPDATE CASCADE`);
    }
    if (!invoiceColumns.has('sales_representative_snapshot')) {
      await db.run(sql`ALTER TABLE "invoices" ADD COLUMN "sales_representative_snapshot" text`);
    }
    if (!invoiceColumns.has('branding_snapshot')) {
      await db.run(sql`ALTER TABLE "invoices" ADD COLUMN "branding_snapshot" text`);
    }
    if (!itemColumns.has('product_id')) {
      await db.run(sql`ALTER TABLE "invoice_items" ADD COLUMN "product_id" text REFERENCES "invoicing_products"("id") ON DELETE SET NULL ON UPDATE CASCADE`);
    }
  },
  down: async ({ db }) => {
    await db.batch([
      db.run(sql`ALTER TABLE "invoice_items" DROP COLUMN "product_id"`),
      db.run(sql`ALTER TABLE "invoices" DROP COLUMN "branding_snapshot"`),
      db.run(sql`ALTER TABLE "invoices" DROP COLUMN "sales_representative_snapshot"`),
      db.run(sql`ALTER TABLE "invoices" DROP COLUMN "sales_representative_id"`),
      db.run(sql`ALTER TABLE "invoice_series" DROP COLUMN "archived_at"`),
      db.run(sql`DROP TABLE IF EXISTS "invoicing_branding"`),
      db.run(sql`DROP TABLE IF EXISTS "invoicing_sales_representatives"`),
      db.run(sql`DROP TABLE IF EXISTS "invoicing_tax_rates"`),
      db.run(sql`DROP TABLE IF EXISTS "invoicing_products"`),
    ]);
  },
};
