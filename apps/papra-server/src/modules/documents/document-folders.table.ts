import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { contactsTable } from '../contacts/contacts.table';
import { organizationsTable } from '../organizations/organizations.table';
import { createPrimaryKeyField, createTimestampColumns } from '../shared/db/columns.helpers';
import { documentsTable } from './documents.table';

export const documentFoldersTable = pgTable('document_folders', {
  ...createPrimaryKeyField({ prefix: 'fld' }),
  ...createTimestampColumns(),
  organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  parentFolderId: text('parent_folder_id').references((): AnyPgColumn => documentFoldersTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  // Folder of a contact (customer or supplier), kept in sync with its name
  contactId: text('contact_id').references(() => contactsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  name: text('name').notNull(),
  kind: text('kind', { enum: ['manual', 'contact'] }).notNull().default('manual'),
}, table => [
  index('document_folders_organization_parent_index').on(table.organizationId, table.parentFolderId),
  uniqueIndex('document_folders_organization_contact_unique').on(table.organizationId, table.contactId).where(sql`${table.contactId} IS NOT NULL`),
  check('document_folders_kind_check', sql`${table.kind} IN ('manual', 'contact')`),
]);

export const documentsFoldersTable = pgTable('documents_folders', {
  documentId: text('document_id').primaryKey().references(() => documentsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  folderId: text('folder_id').notNull().references(() => documentFoldersTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  createdAt: timestamp('created_at', { mode: 'date', withTimezone: true, precision: 3 }).notNull().$default(() => new Date()),
}, table => [
  index('documents_folders_organization_folder_index').on(table.organizationId, table.folderId),
]);
