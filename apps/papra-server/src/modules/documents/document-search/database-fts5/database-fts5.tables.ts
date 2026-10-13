import { sql } from 'drizzle-orm';
import { customType, index, pgTable, text } from 'drizzle-orm/pg-core';

const tsvector = customType<{ data: string }>({
  dataType: () => 'tsvector',
});

// Full-text search index of documents, kept in sync with the documents table by the document search event handlers
// The 'simple' configuration is used as documents can be in any language (no stemming, no stop words)
export const documentsFtsTable = pgTable('documents_fts', {
  documentId: text('document_id').primaryKey(),
  organizationId: text('organization_id').notNull(),
  name: text('name').notNull(),
  content: text('content').notNull(),
  nameTsv: tsvector('name_tsv').generatedAlwaysAs(sql`to_tsvector('simple', coalesce("name", ''))`),
  contentTsv: tsvector('content_tsv').generatedAlwaysAs(sql`to_tsvector('simple', coalesce("content", ''))`),
}, table => [
  index('documents_fts_organization_id_index').on(table.organizationId),
  index('documents_fts_name_tsv_index').using('gin', table.nameTsv),
  index('documents_fts_content_tsv_index').using('gin', table.contentTsv),
]);
