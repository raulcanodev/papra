import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const documentAiDataMigration = {
  name: 'document-ai-data',
  description: 'What the assistant understood of a document that fits no entity of the app (price lists, statements...), kept with the document',

  up: async ({ db }) => {
    await db.transaction(async (tx) => {
      for (const statement of [
        `CREATE TABLE IF NOT EXISTS "document_ai_data" (
          "document_id" text PRIMARY KEY NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "created_at" timestamp (3) with time zone NOT NULL,
          "updated_at" timestamp (3) with time zone NOT NULL,
          "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "document_type" text NOT NULL,
          "summary" text NOT NULL,
          "data" jsonb NOT NULL
        )`,
        `CREATE INDEX IF NOT EXISTS "document_ai_data_organization_id_document_type_index" ON "document_ai_data" ("organization_id", "document_type")`,
      ]) {
        await tx.execute(sql.raw(statement));
      }
    });
  },

  down: async ({ db }) => {
    await db.execute(sql.raw(`DROP TABLE IF EXISTS "document_ai_data"`));
  },
} satisfies Migration;
