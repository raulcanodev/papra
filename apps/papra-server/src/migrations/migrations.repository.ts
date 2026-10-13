import type { Database } from '../modules/app/database/database.types';
import { asc, eq, sql } from 'drizzle-orm';
import { migrationsTable } from './migration.tables';

export async function setupMigrationTableIfNotExists({ db }: { db: Database }) {
  await db.execute(sql`CREATE TABLE IF NOT EXISTS migrations (id SERIAL PRIMARY KEY, name TEXT NOT NULL, run_at TIMESTAMP(3) WITH TIME ZONE NOT NULL)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS migrations_name_index ON migrations (name)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS migrations_run_at_index ON migrations (run_at)`);
}

export async function getMigrations({ db }: { db: Database }) {
  const migrations = await db.select().from(migrationsTable).orderBy(asc(migrationsTable.runAt), asc(migrationsTable.id));

  return { migrations };
}

export async function saveMigration({ db, migrationName, now = new Date() }: { db: Database; migrationName: string; now?: Date }) {
  await db.insert(migrationsTable).values({ name: migrationName, runAt: now });
}

export async function deleteMigration({ db, migrationName }: { db: Database; migrationName: string }) {
  await db.delete(migrationsTable).where(eq(migrationsTable.name, migrationName));
}

export async function deleteAllMigrations({ db }: { db: Database }) {
  await db.delete(migrationsTable);
}
