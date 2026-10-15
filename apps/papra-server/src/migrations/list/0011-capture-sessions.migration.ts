import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const captureSessionsMigration = {
  name: 'capture-sessions',
  description: 'Short lived capture sessions: the phone scans a QR code on the computer and sends the photos of an invoice or a product, and the photo of a product',

  up: async ({ db }) => {
    await db.transaction(async (tx) => {
      for (const statement of [
        `CREATE TABLE IF NOT EXISTS "capture_sessions" (
          "id" text PRIMARY KEY NOT NULL,
          "created_at" timestamp (3) with time zone NOT NULL,
          "updated_at" timestamp (3) with time zone NOT NULL,
          "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "purpose" text NOT NULL,
          "token_hash" text NOT NULL,
          "document_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
          "expires_at" timestamp (3) with time zone NOT NULL,
          "completed_at" timestamp (3) with time zone,
          CONSTRAINT "capture_sessions_token_hash_unique" UNIQUE("token_hash"),
          CONSTRAINT "capture_sessions_purpose_check" CHECK ("purpose" IN ('purchase', 'product_image'))
        )`,
        `CREATE INDEX IF NOT EXISTS "capture_sessions_organization_id_user_id_index" ON "capture_sessions" ("organization_id", "user_id")`,
        `ALTER TABLE "invoicing_products" ADD COLUMN IF NOT EXISTS "image_document_id" text REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
      ]) {
        await tx.execute(sql.raw(statement));
      }
    });
  },

  down: async ({ db }) => {
    await db.transaction(async (tx) => {
      for (const statement of [
        `ALTER TABLE "invoicing_products" DROP COLUMN IF EXISTS "image_document_id"`,
        `DROP TABLE IF EXISTS "capture_sessions"`,
      ]) {
        await tx.execute(sql.raw(statement));
      }
    });
  },
} satisfies Migration;
