import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const dueDatesMigration = {
  name: 'due-dates',
  description: 'Payment method on invoices, their due dates (instalments) to pay and to collect, generic reminders and the due date settings',

  up: async ({ db }) => {
    await db.transaction(async (tx) => {
      for (const statement of [
        `ALTER TABLE "purchase_invoices" ADD COLUMN IF NOT EXISTS "payment_method" text`,
        `ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "payment_method" text`,
        `CREATE TABLE IF NOT EXISTS "payment_instalments" (
          "id" text PRIMARY KEY NOT NULL,
          "created_at" timestamp (3) with time zone NOT NULL,
          "updated_at" timestamp (3) with time zone NOT NULL,
          "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "direction" text NOT NULL,
          "purchase_invoice_id" text REFERENCES "purchase_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "invoice_id" text REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "contact_id" text NOT NULL REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "due_date" timestamp (3) with time zone NOT NULL,
          "amount_minor" integer NOT NULL,
          "currency" text DEFAULT 'EUR' NOT NULL,
          "payment_method" text,
          "status" text DEFAULT 'pending' NOT NULL,
          "paid_at" timestamp (3) with time zone,
          "returned_at" timestamp (3) with time zone,
          "position" integer DEFAULT 0 NOT NULL,
          CONSTRAINT "payment_instalments_status_check" CHECK ("status" IN ('pending', 'paid', 'returned')),
          CONSTRAINT "payment_instalments_direction_check" CHECK ("direction" IN ('payable', 'receivable')),
          CONSTRAINT "payment_instalments_source_check" CHECK (("direction" = 'payable' AND "purchase_invoice_id" IS NOT NULL AND "invoice_id" IS NULL) OR ("direction" = 'receivable' AND "invoice_id" IS NOT NULL AND "purchase_invoice_id" IS NULL))
        )`,
        `CREATE INDEX IF NOT EXISTS "payment_instalments_organization_due_date_index" ON "payment_instalments" ("organization_id", "due_date")`,
        `CREATE INDEX IF NOT EXISTS "payment_instalments_purchase_invoice_id_index" ON "payment_instalments" ("purchase_invoice_id")`,
        `CREATE INDEX IF NOT EXISTS "payment_instalments_invoice_id_index" ON "payment_instalments" ("invoice_id")`,
        `CREATE TABLE IF NOT EXISTS "reminders" (
          "id" text PRIMARY KEY NOT NULL,
          "created_at" timestamp (3) with time zone NOT NULL,
          "updated_at" timestamp (3) with time zone NOT NULL,
          "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "type" text NOT NULL,
          "status" text DEFAULT 'pending' NOT NULL,
          "target_date" timestamp (3) with time zone NOT NULL,
          "entity_type" text,
          "entity_id" text,
          "payment_instalment_id" text REFERENCES "payment_instalments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "key" text NOT NULL,
          "data" jsonb NOT NULL,
          "sent_at" timestamp (3) with time zone,
          "dismissed_at" timestamp (3) with time zone,
          CONSTRAINT "reminders_organization_key_unique" UNIQUE("organization_id", "key"),
          CONSTRAINT "reminders_status_check" CHECK ("status" IN ('pending', 'sent', 'dismissed')),
          CONSTRAINT "reminders_type_check" CHECK ("type" IN ('payment_due', 'collection_due', 'payment_overdue', 'collection_overdue'))
        )`,
        `CREATE INDEX IF NOT EXISTS "reminders_status_target_date_index" ON "reminders" ("status", "target_date")`,
        `CREATE INDEX IF NOT EXISTS "reminders_payment_instalment_id_index" ON "reminders" ("payment_instalment_id")`,
        `CREATE TABLE IF NOT EXISTS "due_date_settings" (
          "organization_id" text PRIMARY KEY NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "created_at" timestamp (3) with time zone NOT NULL,
          "updated_at" timestamp (3) with time zone NOT NULL,
          "email_reminders_enabled" boolean DEFAULT false NOT NULL,
          "reminder_email" text,
          "reminder_days_before" integer DEFAULT 3 NOT NULL,
          "read_intake_email_attachments" boolean DEFAULT true NOT NULL
        )`,
        // Invoices registered before: one due date each, on their due date or after the supplier payment terms
        `INSERT INTO "payment_instalments" ("id", "created_at", "updated_at", "organization_id", "direction", "purchase_invoice_id", "contact_id", "due_date", "amount_minor", "currency", "status", "paid_at")
          SELECT 'pins_' || substr(md5(random()::text || p."id"), 1, 24), now(), now(), p."organization_id", 'payable', p."id", p."supplier_id",
            COALESCE(p."due_date", p."issue_date" + make_interval(days => c."payment_terms_days")),
            p."total_minor" - p."withholding_minor", p."currency",
            CASE WHEN p."status" = 'paid' THEN 'paid' ELSE 'pending' END, p."paid_at"
          FROM "purchase_invoices" p
          INNER JOIN "contacts" c ON c."id" = p."supplier_id"
          WHERE p."kind" <> 'delivery_note'
            AND NOT EXISTS (SELECT 1 FROM "payment_instalments" i WHERE i."purchase_invoice_id" = p."id")`,
        `INSERT INTO "payment_instalments" ("id", "created_at", "updated_at", "organization_id", "direction", "invoice_id", "contact_id", "due_date", "amount_minor", "currency", "status", "paid_at")
          SELECT 'pins_' || substr(md5(random()::text || v."id"), 1, 24), now(), now(), v."organization_id", 'receivable', v."id", v."customer_id",
            v."due_date", v."total_minor" - v."withholding_minor", v."currency",
            CASE WHEN v."status" = 'paid' THEN 'paid' ELSE 'pending' END, v."paid_at"
          FROM "invoices" v
          WHERE NOT EXISTS (SELECT 1 FROM "payment_instalments" i WHERE i."invoice_id" = v."id")`,
      ]) {
        await tx.execute(sql.raw(statement));
      }
    });
  },

  down: async ({ db }) => {
    await db.transaction(async (tx) => {
      for (const statement of [
        `DROP TABLE IF EXISTS "reminders"`,
        `DROP TABLE IF EXISTS "payment_instalments"`,
        `DROP TABLE IF EXISTS "due_date_settings"`,
        `ALTER TABLE "invoices" DROP COLUMN IF EXISTS "payment_method"`,
        `ALTER TABLE "purchase_invoices" DROP COLUMN IF EXISTS "payment_method"`,
      ]) {
        await tx.execute(sql.raw(statement));
      }
    });
  },
} satisfies Migration;
