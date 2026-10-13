import { bigint, boolean, index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { organizationsTable } from '../organizations/organizations.table';
import { createPrimaryKeyField, createTimestampColumns } from '../shared/db/columns.helpers';
import { usersTable } from '../users/users.table';
import { generateDocumentId } from './documents.models';

export const documentsTable = pgTable('documents', {
  ...createPrimaryKeyField({ idGenerator: generateDocumentId }),
  ...createTimestampColumns(),

  organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  createdBy: text('created_by').references(() => usersTable.id, { onDelete: 'set null', onUpdate: 'cascade' }),

  originalName: text('original_name').notNull(),
  originalSize: bigint('original_size', { mode: 'number' }).notNull().default(0),
  originalStorageKey: text('original_storage_key').notNull(),
  originalSha256Hash: text('original_sha256_hash').notNull(),

  name: text('name').notNull(),
  mimeType: text('mime_type').notNull(),
  content: text('content').notNull().default(''),
  documentDate: timestamp('document_date', { mode: 'date', withTimezone: true, precision: 3 }),

  fileEncryptionKeyWrapped: text('file_encryption_key_wrapped'), // The wrapped encryption key
  fileEncryptionKekVersion: text('file_encryption_kek_version'), // The key encryption key version used to encrypt the file encryption key
  fileEncryptionAlgorithm: text('file_encryption_algorithm'),

  deletedAt: timestamp('deleted_at', { mode: 'date', withTimezone: true, precision: 3 }),
  deletedBy: text('deleted_by').references(() => usersTable.id, { onDelete: 'set null', onUpdate: 'cascade' }),
  isDeleted: boolean('is_deleted').notNull().default(false),
}, table => [
  // To select paginated documents by organization
  index('documents_organization_id_is_deleted_created_at_index').on(table.organizationId, table.isDeleted, table.createdAt),
  // To count/stats documents by organization
  index('documents_organization_id_is_deleted_index').on(table.organizationId, table.isDeleted),
  // Unique document by organization and hash
  uniqueIndex('documents_organization_id_original_sha256_hash_unique').on(table.organizationId, table.originalSha256Hash),
  // To verify if a document exists by hash
  index('documents_original_sha256_hash_index').on(table.originalSha256Hash),
  // To sum the size of documents by organization
  index('documents_organization_id_size_index').on(table.organizationId, table.originalSize),
  // To filter documents by date
  index('documents_organization_id_document_date_index').on(table.organizationId, table.documentDate),
  // To list documents by file encryption KEK version
  index('documents_file_encryption_kek_version_index').on(table.fileEncryptionKekVersion),
]);
