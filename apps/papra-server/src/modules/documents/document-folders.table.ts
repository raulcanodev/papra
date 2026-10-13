import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { invoicingCustomersTable } from '../invoicing/invoicing.tables';
import { organizationsTable } from '../organizations/organizations.table';
import { createPrimaryKeyField, createTimestampColumns } from '../shared/db/columns.helpers';
import { documentsTable } from './documents.table';

export const documentFoldersTable = pgTable('document_folders', {
  ...createPrimaryKeyField({ prefix: 'fld' }),
  ...createTimestampColumns(),
  organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  parentFolderId: text('parent_folder_id').references((): AnyPgColumn => documentFoldersTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  customerId: text('customer_id').references(() => invoicingCustomersTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  name: text('name').notNull(),
  kind: text('kind', { enum: ['manual', 'customer'] }).notNull().default('manual'),
}, table => [
  index('document_folders_organization_parent_index').on(table.organizationId, table.parentFolderId),
  uniqueIndex('document_folders_organization_customer_unique').on(table.organizationId, table.customerId).where(sql`${table.customerId} IS NOT NULL`),
  check('document_folders_kind_check', sql`${table.kind} IN ('manual', 'customer')`),
]);

export const documentsFoldersTable = pgTable('documents_folders', {
  documentId: text('document_id').primaryKey().references(() => documentsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  folderId: text('folder_id').notNull().references(() => documentFoldersTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  createdAt: timestamp('created_at', { mode: 'date', withTimezone: true, precision: 3 }).notNull().$default(() => new Date()),
}, table => [
  index('documents_folders_organization_folder_index').on(table.organizationId, table.folderId),
]);
