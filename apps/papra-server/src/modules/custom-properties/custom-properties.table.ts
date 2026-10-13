import type { NonEmptyArray } from '../shared/types';
import type { CustomPropertyType } from './custom-properties.constants';
import { boolean, doublePrecision, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { documentsTable } from '../documents/documents.table';
import { transactionsTable } from '../finances/finances.table';
import { organizationsTable } from '../organizations/organizations.table';
import { createPrimaryKeyField, createTimestampColumns } from '../shared/db/columns.helpers';
import { usersTable } from '../users/users.table';
import {
  CUSTOM_PROPERTY_DEFINITION_ID_PREFIX,
  CUSTOM_PROPERTY_TYPES_LIST,
  DOCUMENT_CUSTOM_PROPERTY_VALUE_ID_PREFIX,
  TRANSACTION_CUSTOM_PROPERTY_VALUE_ID_PREFIX,
} from './custom-properties.constants';
import { customPropertySelectOptionsTable } from './options/custom-properties-options.table';

export const customPropertyDefinitionsTable = pgTable(
  'custom_property_definitions',
  {
    ...createPrimaryKeyField({ prefix: CUSTOM_PROPERTY_DEFINITION_ID_PREFIX }),
    ...createTimestampColumns(),

    organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    name: text('name').notNull(),
    key: text('key').notNull(),
    description: text('description'),
    type: text('type', { enum: CUSTOM_PROPERTY_TYPES_LIST as NonEmptyArray<CustomPropertyType> }).notNull(),
    config: jsonb('config').$type<Record<string, unknown>>(),
    displayOrder: integer('display_order').notNull().default(0),
  },
  table => [
    uniqueIndex('custom_property_definitions_organization_id_key_unique').on(table.organizationId, table.key),
    uniqueIndex('custom_property_definitions_organization_id_name_unique').on(table.organizationId, table.name),
  ],
);

export const documentCustomPropertyValuesTable = pgTable(
  'document_custom_property_values',
  {
    ...createPrimaryKeyField({ prefix: DOCUMENT_CUSTOM_PROPERTY_VALUE_ID_PREFIX }),
    ...createTimestampColumns(),

    documentId: text('document_id').notNull().references(() => documentsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    propertyDefinitionId: text('property_definition_id').notNull().references(() => customPropertyDefinitionsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),

    textValue: text('text_value'),
    numberValue: doublePrecision('number_value'),
    dateValue: timestamp('date_value', { mode: 'date', withTimezone: true, precision: 3 }),
    booleanValue: boolean('boolean_value'),
    selectOptionId: text('select_option_id').references(() => customPropertySelectOptionsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    userId: text('user_id').references(() => usersTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    relatedDocumentId: text('related_document_id').references(() => documentsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  },
  table => [
    index('document_custom_property_values_document_id_index').on(table.documentId, table.propertyDefinitionId),
    index('document_custom_property_values_definition_text_index').on(table.propertyDefinitionId, table.textValue),
    index('document_custom_property_values_definition_number_index').on(table.propertyDefinitionId, table.numberValue),
    index('document_custom_property_values_definition_date_index').on(table.propertyDefinitionId, table.dateValue),
    index('document_custom_property_values_definition_boolean_index').on(table.propertyDefinitionId, table.booleanValue),
    index('document_custom_property_values_definition_user_id_index').on(table.propertyDefinitionId, table.userId),
    index('document_custom_property_values_definition_related_document_id_index').on(table.propertyDefinitionId, table.relatedDocumentId),
  ],
);

export const transactionCustomPropertyValuesTable = pgTable(
  'transaction_custom_property_values',
  {
    ...createPrimaryKeyField({ prefix: TRANSACTION_CUSTOM_PROPERTY_VALUE_ID_PREFIX }),
    ...createTimestampColumns(),

    transactionId: text('transaction_id').notNull().references(() => transactionsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    propertyDefinitionId: text('property_definition_id').notNull().references(() => customPropertyDefinitionsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),

    textValue: text('text_value'),
    numberValue: doublePrecision('number_value'),
    dateValue: timestamp('date_value', { mode: 'date', withTimezone: true, precision: 3 }),
    booleanValue: boolean('boolean_value'),
    selectOptionId: text('select_option_id').references(() => customPropertySelectOptionsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  },
  table => [
    index('tx_cpv_transaction_id_property_id').on(table.transactionId, table.propertyDefinitionId),
  ],
);
