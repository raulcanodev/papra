import { index, jsonb, pgTable, text } from 'drizzle-orm/pg-core';
import { documentsTable } from '../../documents/documents.table';
import { organizationsTable } from '../../organizations/organizations.table';
import { createTimestampColumns } from '../../shared/db/columns.helpers';

// What the assistant understood of a document that fits no entity of the app (a supplier price list, a account statement,
// a delivery note without invoice yet...): kept with the document so it can be used later without reading the file again
export const documentAiDataTable = pgTable('document_ai_data', {
  documentId: text('document_id').primaryKey().references(() => documentsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  ...createTimestampColumns(),
  organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  // Free text chosen by the assistant ("supplier_price_list", "account_statement"...): no fixed list, any paper fits
  documentType: text('document_type').notNull(),
  summary: text('summary').notNull(),
  data: jsonb('data').notNull().$type<unknown>(),
}, table => [
  index('document_ai_data_organization_id_document_type_index').on(table.organizationId, table.documentType),
]);
