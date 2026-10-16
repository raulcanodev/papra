import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const documentReadingsMigration = {
  name: 'document-readings',
  description: 'AI readings of documents with their status and automatic checks: the queue of record, safe across restarts',

  up: async ({ db }) => {
    await db.transaction(async (tx) => {
      for (const statement of [
        `CREATE TABLE IF NOT EXISTS "document_readings" (
          "id" text PRIMARY KEY NOT NULL,
          "created_at" timestamp (3) with time zone NOT NULL,
          "updated_at" timestamp (3) with time zone NOT NULL,
          "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "document_id" text NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "kind" text NOT NULL,
          "status" text DEFAULT 'pending' NOT NULL,
          "attempts" integer DEFAULT 0 NOT NULL,
          "result" jsonb,
          "checks" jsonb DEFAULT '[]'::jsonb NOT NULL,
          "error_code" text,
          "started_at" timestamp (3) with time zone,
          "finished_at" timestamp (3) with time zone,
          CONSTRAINT "document_readings_document_id_kind_unique" UNIQUE("document_id", "kind"),
          CONSTRAINT "document_readings_status_check" CHECK ("status" IN ('pending', 'reading', 'ready', 'needs_review', 'failed'))
        )`,
        `CREATE INDEX IF NOT EXISTS "document_readings_status_created_at_index" ON "document_readings" ("status", "created_at")`,
        `CREATE INDEX IF NOT EXISTS "document_readings_organization_id_index" ON "document_readings" ("organization_id")`,
      ]) {
        await tx.execute(sql.raw(statement));
      }
    });
  },

  down: async ({ db }) => {
    await db.execute(sql.raw(`DROP TABLE IF EXISTS "document_readings"`));
  },
} satisfies Migration;
