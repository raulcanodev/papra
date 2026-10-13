import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const documentFoldersMigration: Migration = {
  name: 'document-folders',
  description: 'Add hierarchical document folders and automatically provision customer folders',
  up: async ({ db }) => {
    await db.batch([
      db.run(sql`CREATE TABLE IF NOT EXISTS "document_folders" ("id" text PRIMARY KEY NOT NULL, "created_at" integer NOT NULL, "updated_at" integer NOT NULL, "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE, "parent_folder_id" text REFERENCES "document_folders"("id") ON DELETE CASCADE ON UPDATE CASCADE, "customer_id" text REFERENCES "invoicing_customers"("id") ON DELETE CASCADE ON UPDATE CASCADE, "name" text NOT NULL, "kind" text NOT NULL DEFAULT 'manual' CHECK("kind" IN ('manual','customer')))`),
      db.run(sql`CREATE INDEX IF NOT EXISTS "document_folders_organization_parent_index" ON "document_folders" ("organization_id", "parent_folder_id")`),
      db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS "document_folders_organization_customer_unique" ON "document_folders" ("organization_id", "customer_id") WHERE "customer_id" IS NOT NULL`),
      db.run(sql`CREATE TABLE IF NOT EXISTS "documents_folders" ("document_id" text PRIMARY KEY NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE, "folder_id" text NOT NULL REFERENCES "document_folders"("id") ON DELETE CASCADE ON UPDATE CASCADE, "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE, "created_at" integer NOT NULL)`),
      db.run(sql`CREATE INDEX IF NOT EXISTS "documents_folders_organization_folder_index" ON "documents_folders" ("organization_id", "folder_id")`),
      db.run(sql`INSERT OR IGNORE INTO "document_folders" ("id", "created_at", "updated_at", "organization_id", "customer_id", "name", "kind") SELECT 'fld_' || lower(hex(randomblob(12))), unixepoch() * 1000, unixepoch() * 1000, "organization_id", "id", "name", 'customer' FROM "invoicing_customers" WHERE "archived_at" IS NULL`),
      db.run(sql`INSERT OR IGNORE INTO "documents_folders" ("document_id", "folder_id", "organization_id", "created_at") SELECT i."document_id", f."id", i."organization_id", unixepoch() * 1000 FROM "invoices" i INNER JOIN "document_folders" f ON f."customer_id" = i."customer_id" AND f."organization_id" = i."organization_id" WHERE i."document_id" IS NOT NULL`),
    ]);
  },
  down: async ({ db }) => {
    await db.batch([db.run(sql`DROP TABLE IF EXISTS "documents_folders"`), db.run(sql`DROP TABLE IF EXISTS "document_folders"`)]);
  },
};
