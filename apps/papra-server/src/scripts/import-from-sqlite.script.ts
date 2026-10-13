import type { Table } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { Database } from '../modules/app/database/database.types';
import type { Logger } from '../modules/shared/logger/logger';
import process from 'node:process';
import { createClient } from '@libsql/client';
import { getTableColumns, getTableName, is, sql } from 'drizzle-orm';
import { getTableConfig, PgTable as PgTableClass } from 'drizzle-orm/pg-core';
import { runMigrations } from '../migrations/migrations.usecases';
import * as aiAssistantTables from '../modules/ai-assistant/ai-assistant.table';
import * as apiKeysTables from '../modules/api-keys/api-keys.tables';
import * as authTables from '../modules/app/auth/auth.tables';
import { getRawQueryRows } from '../modules/app/database/database.usecases';
import * as customPropertiesTables from '../modules/custom-properties/custom-properties.table';
import * as customPropertiesOptionsTables from '../modules/custom-properties/options/custom-properties-options.table';
import * as documentActivityTables from '../modules/documents/document-activity/document-activity.table';
import * as documentFoldersTables from '../modules/documents/document-folders.table';
import { documentsFtsTable } from '../modules/documents/document-search/database-fts5/database-fts5.tables';
import * as documentsTables from '../modules/documents/documents.table';
import * as featureFlagsTables from '../modules/feature-flags/feature-flags.table';
import * as financesTables from '../modules/finances/finances.table';
import * as intakeEmailsTables from '../modules/intake-emails/intake-emails.tables';
import * as invoicingTables from '../modules/invoicing/invoicing.tables';
import * as organizationsTables from '../modules/organizations/organizations.table';
import * as rolesTables from '../modules/roles/roles.table';
import * as subscriptionsTables from '../modules/subscriptions/subscriptions.tables';
import * as taggingRulesTables from '../modules/tagging-rules/tagging-rules.tables';
import * as tagsTables from '../modules/tags/tags.table';
import * as usersTables from '../modules/users/users.table';
import * as webhooksTables from '../modules/webhooks/webhooks.tables';
import { runScriptWithDb } from './commons/run-script';

// One-shot import of the data of a legacy SQLite/libSQL database (all 37 legacy migrations applied) into the PostgreSQL database
//
// Usage:
//   SQLITE_SOURCE_URL=http://localhost:8090 DATABASE_URL=postgresql://... pnpm script:import-from-sqlite [--dry-run]
//   SQLITE_SOURCE_URL=file:./app-data/db/db.sqlite DATABASE_URL=postgresql://... pnpm script:import-from-sqlite
//
// The target database is migrated first, and must be empty (no user data)

const INSERT_BATCH_SIZE = 200;

const tableModules = [
  usersTables,
  organizationsTables,
  authTables,
  rolesTables,
  apiKeysTables,
  documentsTables,
  documentFoldersTables,
  documentActivityTables,
  tagsTables,
  taggingRulesTables,
  intakeEmailsTables,
  subscriptionsTables,
  webhooksTables,
  customPropertiesTables,
  customPropertiesOptionsTables,
  financesTables,
  invoicingTables,
  featureFlagsTables,
  aiAssistantTables,
];

function getTablesToImport(): PgTable[] {
  return tableModules
    .flatMap(module => Object.values(module) as unknown[])
    .filter((value): value is PgTable => is(value, PgTableClass))
    // The full-text index is rebuilt from the documents table
    .filter(table => table !== documentsFtsTable);
}

// Order tables so that referenced tables are imported before the tables referencing them
function sortTablesByDependencies({ tables }: { tables: PgTable[] }): PgTable[] {
  const tablesByName = new Map(tables.map(table => [getTableName(table), table]));
  const sorted: PgTable[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  const visit = (table: PgTable) => {
    const name = getTableName(table);

    if (visited.has(name)) {
      return;
    }

    if (visiting.has(name)) {
      throw new Error(`Circular foreign key dependency detected on table ${name}`);
    }

    visiting.add(name);

    for (const foreignKey of getTableConfig(table).foreignKeys) {
      const referencedTableName = getTableName(foreignKey.reference().foreignTable as Table);

      // Self references (e.g. folders tree) are handled by ordering rows
      if (referencedTableName !== name) {
        const referencedTable = tablesByName.get(referencedTableName);
        if (referencedTable) {
          visit(referencedTable);
        }
      }
    }

    visiting.delete(name);
    visited.add(name);
    sorted.push(table);
  };

  tables.forEach(visit);

  return sorted;
}

function convertTimestamp({ value }: { value: unknown }): Date | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number' || typeof value === 'bigint') {
    return new Date(Number(value));
  }

  const asString = String(value);

  if (/^\d+$/.test(asString)) {
    return new Date(Number(asString));
  }

  // Legacy rows inserted with SQLite datetime('now'), in UTC without timezone marker
  const date = new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(asString) ? `${asString.replace(' ', 'T')}Z` : asString);

  if (Number.isNaN(date.getTime())) {
    throw new TypeError(`Invalid timestamp value: ${asString}`);
  }

  return date;
}

export function convertSqliteValue({ value, column }: { value: unknown; column: PgColumn }): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  switch (column.columnType) {
    case 'PgTimestamp':
      return convertTimestamp({ value });
    case 'PgBoolean':
      return typeof value === 'string' ? ['1', 'true'].includes(value.toLowerCase()) : Boolean(Number(value));
    case 'PgInteger':
    case 'PgBigInt53':
    case 'PgDoublePrecision':
    case 'PgSerial':
      return Number(value);
    case 'PgJsonb':
      return typeof value === 'string' ? JSON.parse(value) : value;
    default:
      return typeof value === 'bigint' ? Number(value) : value;
  }
}

// For self referencing tables, insert parents before children
function sortRowsBySelfReference({ rows, table }: { rows: Record<string, unknown>[]; table: PgTable }) {
  const selfForeignKey = getTableConfig(table).foreignKeys.find(foreignKey => foreignKey.reference().foreignTable === table);

  if (!selfForeignKey) {
    return rows;
  }

  const [childColumn] = selfForeignKey.reference().columns;
  const [parentColumn] = selfForeignKey.reference().foreignColumns;

  if (!childColumn || !parentColumn) {
    return rows;
  }

  const sorted: Record<string, unknown>[] = [];
  const insertedIds = new Set<unknown>();
  let remaining = rows;

  while (remaining.length > 0) {
    const ready = remaining.filter(row => row[childColumn.name] === null || insertedIds.has(row[childColumn.name]));

    if (ready.length === 0) {
      throw new Error(`Orphan rows detected in table ${getTableName(table)}`);
    }

    ready.forEach(row => insertedIds.add(row[parentColumn.name]));
    sorted.push(...ready);
    remaining = remaining.filter(row => !ready.includes(row));
  }

  return sorted;
}

async function ensureTargetIsEmpty({ db, tables }: { db: Database; tables: PgTable[] }) {
  for (const table of tables) {
    const result = await db.execute(sql`SELECT EXISTS (SELECT 1 FROM ${table}) AS "hasRows"`);
    const [row] = getRawQueryRows<{ hasRows: boolean }>(result);

    if (row?.hasRows === true) {
      throw new Error(`Target table ${getTableName(table)} is not empty, aborting import to avoid mixing data`);
    }
  }
}

async function importTable({ db, table, sourceRows, logger }: { db: Database; table: PgTable; sourceRows: Record<string, unknown>[]; logger: Logger }) {
  const tableName = getTableName(table);
  const columns = Object.entries(getTableColumns(table))
    // Generated columns are computed by postgres
    .filter(([, column]) => column.generated === undefined);

  const rows = sortRowsBySelfReference({ rows: sourceRows, table }).map(sourceRow => Object.fromEntries(
    columns
      .filter(([, column]) => column.name in sourceRow)
      .map(([key, column]) => [key, convertSqliteValue({ value: sourceRow[column.name], column })]),
  ));

  for (let index = 0; index < rows.length; index += INSERT_BATCH_SIZE) {
    await db.insert(table).values(rows.slice(index, index + INSERT_BATCH_SIZE) as never[]);
  }

  logger.info({ tableName, rowsCount: rows.length }, 'Table imported');
}

await runScriptWithDb(
  { scriptName: 'import-from-sqlite' },
  async ({ db, logger, isDryRun }) => {
    const sourceUrl = process.env.SQLITE_SOURCE_URL;

    if (sourceUrl === undefined || sourceUrl === '') {
      throw new Error('SQLITE_SOURCE_URL is required (e.g. http://localhost:8090 or file:./db.sqlite)');
    }

    const source = createClient({ url: sourceUrl, authToken: process.env.SQLITE_SOURCE_AUTH_TOKEN });
    const sourceTablesResult = await source.execute(`SELECT name FROM sqlite_master WHERE type = 'table'`);
    const sourceTableNames = new Set(sourceTablesResult.rows.map(({ name }) => String(name)));

    const tables = sortTablesByDependencies({ tables: getTablesToImport() });

    await runMigrations({ db, logger });
    await ensureTargetIsEmpty({ db, tables });

    const sourceRowsByTable = new Map<PgTable, Record<string, unknown>[]>();

    for (const table of tables) {
      const tableName = getTableName(table);

      if (!sourceTableNames.has(tableName)) {
        logger.warn({ tableName }, 'Table not found in source database, skipping');
        continue;
      }

      const { rows } = await source.execute(`SELECT * FROM "${tableName}"`);
      sourceRowsByTable.set(table, rows.map(row => ({ ...row })));
    }

    source.close();

    logger.info(Object.fromEntries([...sourceRowsByTable].map(([table, rows]) => [getTableName(table), rows.length])), 'Rows found in source database');

    if (isDryRun) {
      logger.info('Dry run, nothing imported');
      return;
    }

    await db.transaction(async (tx) => {
      for (const [table, sourceRows] of sourceRowsByTable) {
        await importTable({ db: tx, table, sourceRows, logger });
      }

      // Rebuild the full-text search index
      await tx.execute(sql`INSERT INTO ${documentsFtsTable} (document_id, organization_id, name, content) SELECT id, organization_id, name, content FROM ${documentsTables.documentsTable}`);

      // Existing users and organizations should not go through the onboarding flow
      await tx.update(usersTables.usersTable).set({ onboardingCompletedAt: new Date() });
      await tx.update(organizationsTables.organizationsTable).set({ onboardingCompletedAt: new Date() });
    });

    logger.info('Import from SQLite done');
  },
);
