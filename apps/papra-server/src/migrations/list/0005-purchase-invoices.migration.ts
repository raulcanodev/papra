import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const purchaseInvoicesMigration = {
  name: 'purchase-invoices',
  description: 'Invoices received from suppliers, with their lines',

  up: async ({ db }) => {
    await db.transaction(async (tx) => {
      for (const statement of [
        `CREATE TABLE "purchase_invoices" (
          "id" text PRIMARY KEY NOT NULL,
          "created_at" timestamp (3) with time zone NOT NULL,
          "updated_at" timestamp (3) with time zone NOT NULL,
          "organization_id" text NOT NULL,
          "supplier_id" text NOT NULL,
          "number" text NOT NULL,
          "issue_date" timestamp (3) with time zone NOT NULL,
          "due_date" timestamp (3) with time zone,
          "currency" text DEFAULT 'EUR' NOT NULL,
          "category" text DEFAULT 'other' NOT NULL,
          "status" text DEFAULT 'pending' NOT NULL,
          "subtotal_minor" integer DEFAULT 0 NOT NULL,
          "tax_minor" integer DEFAULT 0 NOT NULL,
          "deductible_tax_minor" integer DEFAULT 0 NOT NULL,
          "total_minor" integer DEFAULT 0 NOT NULL,
          "withholding_rate_bps" integer DEFAULT 0 NOT NULL,
          "withholding_minor" integer DEFAULT 0 NOT NULL,
          "notes" text,
          "document_id" text,
          "paid_at" timestamp (3) with time zone,
          CONSTRAINT "purchase_invoices_organization_supplier_number_unique" UNIQUE("organization_id","supplier_id","number")
        )`,
        `CREATE TABLE "purchase_invoice_items" (
          "id" text PRIMARY KEY NOT NULL,
          "created_at" timestamp (3) with time zone NOT NULL,
          "updated_at" timestamp (3) with time zone NOT NULL,
          "purchase_invoice_id" text NOT NULL,
          "description" text NOT NULL,
          "quantity_millis" integer NOT NULL,
          "unit_price_minor" integer NOT NULL,
          "tax_rate_bps" integer DEFAULT 0 NOT NULL,
          "discount_rate_bps" integer DEFAULT 0 NOT NULL,
          "deductible_rate_bps" integer DEFAULT 10000 NOT NULL,
          "position" integer DEFAULT 0 NOT NULL
        )`,
        `ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade`,
        `ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_supplier_id_contacts_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."contacts"("id") ON DELETE restrict ON UPDATE cascade`,
        `ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE cascade`,
        `ALTER TABLE "purchase_invoice_items" ADD CONSTRAINT "purchase_invoice_items_purchase_invoice_id_purchase_invoices_id_fk" FOREIGN KEY ("purchase_invoice_id") REFERENCES "public"."purchase_invoices"("id") ON DELETE cascade ON UPDATE cascade`,
        `CREATE INDEX "purchase_invoices_organization_issue_date_index" ON "purchase_invoices" USING btree ("organization_id","issue_date")`,
        `CREATE INDEX "purchase_invoices_supplier_id_index" ON "purchase_invoices" USING btree ("supplier_id")`,
        `CREATE INDEX "purchase_invoices_document_id_index" ON "purchase_invoices" USING btree ("document_id")`,
        `CREATE INDEX "purchase_invoice_items_purchase_invoice_id_index" ON "purchase_invoice_items" USING btree ("purchase_invoice_id")`,
        `ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_status_check" CHECK ("status" IN ('pending', 'paid'))`,
        `ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_category_check" CHECK ("category" IN ('goods', 'supplies', 'rent', 'professional_services', 'software', 'marketing', 'travel', 'vehicle', 'insurance', 'bank_fees', 'taxes_and_fees', 'other'))`,
        // Same policy as the initial schema: RLS enabled without policy, only the table owner role (the server) has access
        `ALTER TABLE "purchase_invoices" ENABLE ROW LEVEL SECURITY`,
        `ALTER TABLE "purchase_invoice_items" ENABLE ROW LEVEL SECURITY`,
      ]) {
        await tx.execute(sql.raw(statement));
      }
    });
  },

  down: async ({ db }) => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`DROP TABLE "purchase_invoice_items"`));
      await tx.execute(sql.raw(`DROP TABLE "purchase_invoices"`));
    });
  },
} satisfies Migration;
