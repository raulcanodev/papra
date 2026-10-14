import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

// Customers and sales representatives become a single address book: the customers table is renamed (so invoices and
// folders keep pointing at the same ids) and the sales representatives are moved in with their ids, flagged by role.
export const contactsMigration = {
  name: 'contacts',
  description: 'Merge customers and sales representatives into a contacts address book with roles, contact folders',

  up: async ({ db }) => {
    await db.transaction(async (tx) => {
      const statements = [
        `ALTER TABLE "invoicing_customers" RENAME TO "contacts"`,
        `ALTER TABLE "contacts" RENAME CONSTRAINT "invoicing_customers_pkey" TO "contacts_pkey"`,
        `ALTER TABLE "contacts" RENAME CONSTRAINT "invoicing_customers_organization_id_organizations_id_fk" TO "contacts_organization_id_organizations_id_fk"`,
        `ALTER INDEX "invoicing_customers_organization_id_index" RENAME TO "contacts_organization_id_index"`,

        `ALTER TABLE "contacts" ADD COLUMN "kind" text DEFAULT 'company' NOT NULL`,
        `ALTER TABLE "contacts" ADD COLUMN "phone" text`,
        `ALTER TABLE "contacts" ADD COLUMN "is_customer" boolean DEFAULT false NOT NULL`,
        `ALTER TABLE "contacts" ADD COLUMN "is_supplier" boolean DEFAULT false NOT NULL`,
        `ALTER TABLE "contacts" ADD COLUMN "is_sales_representative" boolean DEFAULT false NOT NULL`,
        `ALTER TABLE "contacts" ADD CONSTRAINT "contacts_kind_check" CHECK ("kind" IN ('company', 'person'))`,
        `UPDATE "contacts" SET "is_customer" = true`,

        `INSERT INTO "contacts" ("id", "created_at", "updated_at", "organization_id", "kind", "name", "email", "phone", "tax_id", "notes", "archived_at", "is_sales_representative")
         SELECT "id", "created_at", "updated_at", "organization_id", 'person', "name", "email", "phone", "tax_id", "notes", "archived_at", true FROM "invoicing_sales_representatives"`,
        `CREATE INDEX "contacts_organization_id_tax_id_index" ON "contacts" USING btree ("organization_id","tax_id")`,

        `ALTER TABLE "invoices" RENAME CONSTRAINT "invoices_customer_id_invoicing_customers_id_fk" TO "invoices_customer_id_contacts_id_fk"`,
        `ALTER TABLE "invoices" DROP CONSTRAINT "invoices_sales_representative_id_invoicing_sales_representatives_id_fk"`,
        `ALTER TABLE "invoices" ADD CONSTRAINT "invoices_sales_representative_id_contacts_id_fk" FOREIGN KEY ("sales_representative_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE cascade`,
        `DROP TABLE "invoicing_sales_representatives"`,

        // Folders belong to a contact (customer or supplier) instead of a customer
        `ALTER TABLE "document_folders" DROP CONSTRAINT "document_folders_kind_check"`,
        `ALTER TABLE "document_folders" RENAME COLUMN "customer_id" TO "contact_id"`,
        `UPDATE "document_folders" SET "kind" = 'contact' WHERE "kind" = 'customer'`,
        `ALTER TABLE "document_folders" ADD CONSTRAINT "document_folders_kind_check" CHECK ("kind" IN ('manual', 'contact'))`,
        `ALTER TABLE "document_folders" RENAME CONSTRAINT "document_folders_customer_id_invoicing_customers_id_fk" TO "document_folders_contact_id_contacts_id_fk"`,
        `ALTER INDEX "document_folders_organization_customer_unique" RENAME TO "document_folders_organization_contact_unique"`,
      ];

      for (const statement of statements) {
        await tx.execute(sql.raw(statement));
      }
    });
  },

  down: async ({ db }) => {
    await db.transaction(async (tx) => {
      const statements = [
        `ALTER INDEX "document_folders_organization_contact_unique" RENAME TO "document_folders_organization_customer_unique"`,
        `ALTER TABLE "document_folders" RENAME CONSTRAINT "document_folders_contact_id_contacts_id_fk" TO "document_folders_customer_id_invoicing_customers_id_fk"`,
        `ALTER TABLE "document_folders" DROP CONSTRAINT "document_folders_kind_check"`,
        // Folders of supplier only contacts have no customer to belong to anymore
        `DELETE FROM "document_folders" WHERE "kind" = 'contact' AND "contact_id" IN (SELECT "id" FROM "contacts" WHERE NOT "is_customer")`,
        `UPDATE "document_folders" SET "kind" = 'customer' WHERE "kind" = 'contact'`,
        `ALTER TABLE "document_folders" RENAME COLUMN "contact_id" TO "customer_id"`,
        `ALTER TABLE "document_folders" ADD CONSTRAINT "document_folders_kind_check" CHECK ("kind" IN ('manual', 'customer'))`,

        `CREATE TABLE "invoicing_sales_representatives" (
          "id" text PRIMARY KEY NOT NULL,
          "created_at" timestamp (3) with time zone NOT NULL,
          "updated_at" timestamp (3) with time zone NOT NULL,
          "organization_id" text NOT NULL,
          "name" text NOT NULL,
          "email" text,
          "phone" text,
          "tax_id" text,
          "notes" text,
          "archived_at" timestamp (3) with time zone
        )`,
        `INSERT INTO "invoicing_sales_representatives" SELECT "id", "created_at", "updated_at", "organization_id", "name", "email", "phone", "tax_id", "notes", "archived_at" FROM "contacts" WHERE "is_sales_representative"`,
        `ALTER TABLE "invoicing_sales_representatives" ADD CONSTRAINT "invoicing_sales_representatives_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade`,
        `CREATE INDEX "invoicing_sales_representatives_organization_id_index" ON "invoicing_sales_representatives" USING btree ("organization_id")`,
        `ALTER TABLE "invoicing_sales_representatives" ENABLE ROW LEVEL SECURITY`,
        `ALTER TABLE "invoices" DROP CONSTRAINT "invoices_sales_representative_id_contacts_id_fk"`,
        `ALTER TABLE "invoices" ADD CONSTRAINT "invoices_sales_representative_id_invoicing_sales_representatives_id_fk" FOREIGN KEY ("sales_representative_id") REFERENCES "public"."invoicing_sales_representatives"("id") ON DELETE set null ON UPDATE cascade`,
        `ALTER TABLE "invoices" RENAME CONSTRAINT "invoices_customer_id_contacts_id_fk" TO "invoices_customer_id_invoicing_customers_id_fk"`,

        // Contacts that were not customers cannot stay in the customers table, unless an invoice points to them
        `DELETE FROM "contacts" WHERE NOT "is_customer" AND "id" NOT IN (SELECT "customer_id" FROM "invoices")`,
        `DROP INDEX "contacts_organization_id_tax_id_index"`,
        `ALTER TABLE "contacts" DROP CONSTRAINT "contacts_kind_check"`,
        `ALTER TABLE "contacts" DROP COLUMN "kind"`,
        `ALTER TABLE "contacts" DROP COLUMN "phone"`,
        `ALTER TABLE "contacts" DROP COLUMN "is_customer"`,
        `ALTER TABLE "contacts" DROP COLUMN "is_supplier"`,
        `ALTER TABLE "contacts" DROP COLUMN "is_sales_representative"`,
        `ALTER INDEX "contacts_organization_id_index" RENAME TO "invoicing_customers_organization_id_index"`,
        `ALTER TABLE "contacts" RENAME CONSTRAINT "contacts_organization_id_organizations_id_fk" TO "invoicing_customers_organization_id_organizations_id_fk"`,
        `ALTER TABLE "contacts" RENAME CONSTRAINT "contacts_pkey" TO "invoicing_customers_pkey"`,
        `ALTER TABLE "contacts" RENAME TO "invoicing_customers"`,
      ];

      for (const statement of statements) {
        await tx.execute(sql.raw(statement));
      }
    });
  },
} satisfies Migration;
