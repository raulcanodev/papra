import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const invoicingMigration: Migration = {
  name: 'invoicing',
  description: 'Add fiscal profiles, customers, invoice series, invoices, line items and audit events',
  up: async ({ db }) => {
    await db.batch([
      db.run(sql`CREATE TABLE IF NOT EXISTS "invoicing_profiles" (
        "organization_id" text PRIMARY KEY NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        "created_at" integer NOT NULL, "updated_at" integer NOT NULL, "legal_name" text NOT NULL,
        "tax_id" text, "email" text, "address_line_1" text, "address_line_2" text, "postal_code" text,
        "city" text, "region" text, "country" text, "currency" text NOT NULL DEFAULT 'EUR',
        "locale" text NOT NULL DEFAULT 'es-ES', "payment_terms_days" integer NOT NULL DEFAULT 30,
        "default_notes" text, "default_terms" text, "template_id" text NOT NULL DEFAULT 'minimal'
      )`),
      db.run(sql`CREATE TABLE IF NOT EXISTS "invoicing_customers" (
        "id" text PRIMARY KEY NOT NULL, "created_at" integer NOT NULL, "updated_at" integer NOT NULL,
        "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        "name" text NOT NULL, "email" text, "tax_id" text, "address_line_1" text, "address_line_2" text,
        "postal_code" text, "city" text, "region" text, "country" text, "currency" text NOT NULL DEFAULT 'EUR',
        "payment_terms_days" integer NOT NULL DEFAULT 30, "notes" text, "archived_at" integer
      )`),
      db.run(sql`CREATE INDEX IF NOT EXISTS "invoicing_customers_organization_id_index" ON "invoicing_customers" ("organization_id")`),
      db.run(sql`CREATE TABLE IF NOT EXISTS "invoice_series" (
        "id" text PRIMARY KEY NOT NULL, "created_at" integer NOT NULL, "updated_at" integer NOT NULL,
        "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        "name" text NOT NULL, "prefix" text NOT NULL DEFAULT 'INV-', "next_number" integer NOT NULL DEFAULT 1,
        "padding" integer NOT NULL DEFAULT 4, "is_default" integer NOT NULL DEFAULT 0
      )`),
      db.run(sql`CREATE INDEX IF NOT EXISTS "invoice_series_organization_id_index" ON "invoice_series" ("organization_id")`),
      db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS "invoice_series_organization_name_unique" ON "invoice_series" ("organization_id", "name")`),
      db.run(sql`CREATE TABLE IF NOT EXISTS "invoices" (
        "id" text PRIMARY KEY NOT NULL, "created_at" integer NOT NULL, "updated_at" integer NOT NULL,
        "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        "customer_id" text NOT NULL REFERENCES "invoicing_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        "series_id" text REFERENCES "invoice_series"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        "document_id" text REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE,
        "status" text NOT NULL DEFAULT 'draft', "number" text, "issue_date" integer NOT NULL, "due_date" integer NOT NULL,
        "currency" text NOT NULL DEFAULT 'EUR', "customer_snapshot" text, "seller_snapshot" text,
        "subtotal_minor" integer NOT NULL DEFAULT 0, "tax_minor" integer NOT NULL DEFAULT 0, "total_minor" integer NOT NULL DEFAULT 0,
        "notes" text, "terms" text, "template_id" text NOT NULL DEFAULT 'minimal',
        "issued_at" integer, "sent_at" integer, "paid_at" integer, "voided_at" integer
      )`),
      db.run(sql`CREATE INDEX IF NOT EXISTS "invoices_organization_id_index" ON "invoices" ("organization_id")`),
      db.run(sql`CREATE INDEX IF NOT EXISTS "invoices_customer_id_index" ON "invoices" ("customer_id")`),
      db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS "invoices_organization_number_unique" ON "invoices" ("organization_id", "number")`),
      db.run(sql`CREATE TABLE IF NOT EXISTS "invoice_items" (
        "id" text PRIMARY KEY NOT NULL, "created_at" integer NOT NULL, "updated_at" integer NOT NULL,
        "invoice_id" text NOT NULL REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        "description" text NOT NULL, "quantity_millis" integer NOT NULL, "unit_price_minor" integer NOT NULL,
        "tax_rate_bps" integer NOT NULL DEFAULT 0, "discount_rate_bps" integer NOT NULL DEFAULT 0, "position" integer NOT NULL DEFAULT 0
      )`),
      db.run(sql`CREATE INDEX IF NOT EXISTS "invoice_items_invoice_id_index" ON "invoice_items" ("invoice_id")`),
      db.run(sql`CREATE TABLE IF NOT EXISTS "invoice_events" (
        "id" text PRIMARY KEY NOT NULL, "created_at" integer NOT NULL,
        "invoice_id" text NOT NULL REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        "user_id" text REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
        "type" text NOT NULL, "metadata" text
      )`),
      db.run(sql`CREATE INDEX IF NOT EXISTS "invoice_events_invoice_id_index" ON "invoice_events" ("invoice_id")`),
    ]);
  },
  down: async ({ db }) => {
    await db.batch([
      db.run(sql`DROP TABLE IF EXISTS "invoice_events"`),
      db.run(sql`DROP TABLE IF EXISTS "invoice_items"`),
      db.run(sql`DROP TABLE IF EXISTS "invoices"`),
      db.run(sql`DROP TABLE IF EXISTS "invoice_series"`),
      db.run(sql`DROP TABLE IF EXISTS "invoicing_customers"`),
      db.run(sql`DROP TABLE IF EXISTS "invoicing_profiles"`),
    ]);
  },
};
