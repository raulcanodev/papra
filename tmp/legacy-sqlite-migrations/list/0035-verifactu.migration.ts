import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const verifactuMigration: Migration = {
  name: 'verifactu',
  description: 'Add VERI*FACTU organization configuration, immutable records, delivery attempts and global pipeline state',
  up: async ({ db }) => {
    await db.batch([
      db.run(sql`CREATE TABLE IF NOT EXISTS "verifactu_configurations" (
        "organization_id" text PRIMARY KEY NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        "created_at" integer NOT NULL, "updated_at" integer NOT NULL, "mode" text NOT NULL DEFAULT 'disabled',
        "applicability_reason" text, "legal_name" text, "tax_id" text,
        "certificate_configured" integer NOT NULL DEFAULT 0, "aeat_validation_passed_at" integer, "responsible_declaration_accepted_at" integer,
        "activated_at" integer, "locked_until" integer, "transmissions_paused" integer NOT NULL DEFAULT 0, "pause_reason" text
      )`),
      db.run(sql`CREATE TABLE IF NOT EXISTS "verifactu_records" (
        "id" text PRIMARY KEY NOT NULL, "created_at" integer NOT NULL,
        "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        "invoice_id" text NOT NULL REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        "idempotency_key" text NOT NULL,
        "record_type" text NOT NULL DEFAULT 'alta', "invoice_type" text NOT NULL DEFAULT 'F1', "status" text NOT NULL DEFAULT 'pending',
        "previous_record_id" text, "previous_hash" text, "hash" text NOT NULL, "generated_at" integer NOT NULL,
        "payload" text NOT NULL, "xml_payload" text NOT NULL, "qr_url" text NOT NULL,
        "attempt_count" integer NOT NULL DEFAULT 0, "next_attempt_at" integer, "last_attempt_at" integer, "accepted_at" integer,
        "aeat_csv" text, "aeat_error_code" text, "aeat_error_description" text, "aeat_response" text
      )`),
      db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS "verifactu_records_idempotency_key_unique" ON "verifactu_records" ("idempotency_key")`),
      db.run(sql`CREATE INDEX IF NOT EXISTS "verifactu_records_invoice_id_index" ON "verifactu_records" ("invoice_id")`),
      db.run(sql`CREATE INDEX IF NOT EXISTS "verifactu_records_organization_created_at_index" ON "verifactu_records" ("organization_id", "created_at")`),
      db.run(sql`CREATE INDEX IF NOT EXISTS "verifactu_records_status_next_attempt_index" ON "verifactu_records" ("status", "next_attempt_at")`),
      db.run(sql`CREATE TRIGGER IF NOT EXISTS "verifactu_records_immutable_update"
        BEFORE UPDATE OF "organization_id", "invoice_id", "idempotency_key", "record_type", "invoice_type", "previous_record_id", "previous_hash", "hash", "generated_at", "payload", "xml_payload", "qr_url"
        ON "verifactu_records" BEGIN SELECT RAISE(ABORT, 'VERI*FACTU fiscal fields are immutable'); END`),
      db.run(sql`CREATE TRIGGER IF NOT EXISTS "verifactu_records_immutable_delete"
        BEFORE DELETE ON "verifactu_records" BEGIN SELECT RAISE(ABORT, 'VERI*FACTU records cannot be deleted'); END`),
      db.run(sql`CREATE TABLE IF NOT EXISTS "verifactu_attempts" (
        "id" text PRIMARY KEY NOT NULL, "created_at" integer NOT NULL,
        "record_id" text NOT NULL REFERENCES "verifactu_records"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        "environment" text NOT NULL, "outcome" text NOT NULL, "http_status" integer, "response" text, "error" text
      )`),
      db.run(sql`CREATE INDEX IF NOT EXISTS "verifactu_attempts_record_id_index" ON "verifactu_attempts" ("record_id")`),
      db.run(sql`CREATE TABLE IF NOT EXISTS "verifactu_system_state" (
        "id" text PRIMARY KEY NOT NULL, "created_at" integer NOT NULL, "updated_at" integer NOT NULL,
        "dispatch_paused" integer NOT NULL DEFAULT 0, "reason" text
      )`),
    ]);
  },
  down: async ({ db }) => {
    await db.batch([
      db.run(sql`DROP TRIGGER IF EXISTS "verifactu_records_immutable_delete"`),
      db.run(sql`DROP TRIGGER IF EXISTS "verifactu_records_immutable_update"`),
      db.run(sql`DROP TABLE IF EXISTS "verifactu_attempts"`),
      db.run(sql`DROP TABLE IF EXISTS "verifactu_records"`),
      db.run(sql`DROP TABLE IF EXISTS "verifactu_configurations"`),
      db.run(sql`DROP TABLE IF EXISTS "verifactu_system_state"`),
    ]);
  },
};
