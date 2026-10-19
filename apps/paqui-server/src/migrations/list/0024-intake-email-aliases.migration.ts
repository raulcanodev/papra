import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const intakeEmailAliasesMigration = {
  name: 'intake-email-aliases',
  description: 'Globally unique intake aliases and a privacy-conscious delivery activity log',

  up: async ({ db }) => {
    await db.transaction(async (tx) => {
      for (const statement of [
        `UPDATE "intake_emails" SET "email_address" = lower("email_address")`,
        `CREATE UNIQUE INDEX IF NOT EXISTS "intake_emails_email_address_lower_unique" ON "intake_emails" (lower("email_address"))`,
        `CREATE TABLE IF NOT EXISTS "intake_email_deliveries" (
          "id" text PRIMARY KEY NOT NULL,
          "created_at" timestamp (3) with time zone NOT NULL,
          "updated_at" timestamp (3) with time zone NOT NULL,
          "intake_email_id" text NOT NULL REFERENCES "intake_emails"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "provider_message_id" text,
          "from_address" text NOT NULL,
          "recipient_address" text NOT NULL,
          "subject" text,
          "attachment_count" integer DEFAULT 0 NOT NULL,
          "status" text NOT NULL,
          CONSTRAINT "intake_email_deliveries_status_check" CHECK ("status" IN ('processed', 'no_attachments', 'blocked_sender', 'address_disabled'))
        )`,
        `CREATE INDEX IF NOT EXISTS "intake_email_deliveries_organization_created_at_index" ON "intake_email_deliveries" ("organization_id", "created_at")`,
        `CREATE INDEX IF NOT EXISTS "intake_email_deliveries_intake_email_id_index" ON "intake_email_deliveries" ("intake_email_id")`,
        `CREATE UNIQUE INDEX IF NOT EXISTS "intake_email_deliveries_provider_message_unique" ON "intake_email_deliveries" ("intake_email_id", "provider_message_id")`,
      ]) {
        await tx.execute(sql.raw(statement));
      }
    });
  },

  down: async ({ db }) => {
    await db.transaction(async (tx) => {
      for (const statement of [
        `DROP TABLE IF EXISTS "intake_email_deliveries"`,
        `DROP INDEX IF EXISTS "intake_emails_email_address_lower_unique"`,
      ]) {
        await tx.execute(sql.raw(statement));
      }
    });
  },
} satisfies Migration;
