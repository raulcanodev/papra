import type { NonEmptyArray } from '../shared/types';
import type { CustomPropertyEntityType, CustomPropertyType } from './custom-properties.constants';
import { boolean, doublePrecision, foreignKey, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { documentsTable } from '../documents/documents.table';
import { transactionsTable } from '../finances/finances.table';
import { organizationsTable } from '../organizations/organizations.table';
import { createPrimaryKeyField, createTimestampColumns } from '../shared/db/columns.helpers';
import { usersTable } from '../users/users.table';
import {
  CUSTOM_PROPERTY_DEFINITION_ID_PREFIX,
  CUSTOM_PROPERTY_ENTITY_TYPES,
  CUSTOM_PROPERTY_ENTITY_TYPES_LIST,
  CUSTOM_PROPERTY_TYPES_LIST,
  DOCUMENT_CUSTOM_PROPERTY_VALUE_ID_PREFIX,
  ENTITY_CUSTOM_PROPERTY_VALUE_ID_PREFIX,
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
    entityType: text('entity_type', { enum: CUSTOM_PROPERTY_ENTITY_TYPES_LIST as NonEmptyArray<CustomPropertyEntityType> }).notNull().default(CUSTOM_PROPERTY_ENTITY_TYPES.DOCUMENT),
    config: jsonb('config').$type<Record<string, unknown>>(),
    displayOrder: integer('display_order').notNull().default(0),
  },
  table => [
    // Names and keys are unique per entity type: a "Region" property can exist for both customers and products
    uniqueIndex('custom_property_definitions_organization_id_entity_type_key_unique').on(table.organizationId, table.entityType, table.key),
    uniqueIndex('custom_property_definitions_organization_id_entity_type_name_unique').on(table.organizationId, table.entityType, table.name),
    // Target of the composite foreign key of entity values, guarantees a value matches its definition organization and entity type
    uniqueIndex('custom_property_definitions_id_organization_id_entity_type_unique').on(table.id, table.organizationId, table.entityType),
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

// Values of the custom properties of the generic entities (customers, products, sales representatives, ...).
// Adding a new entity type only requires registering it, no new table nor migration.
export const entityCustomPropertyValuesTable = pgTable(
  'entity_custom_property_values',
  {
    ...createPrimaryKeyField({ prefix: ENTITY_CUSTOM_PROPERTY_VALUE_ID_PREFIX }),
    ...createTimestampColumns(),

    // Denormalized from the definition so every read is tenant scoped without a join
    organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    entityType: text('entity_type', { enum: CUSTOM_PROPERTY_ENTITY_TYPES_LIST as NonEmptyArray<CustomPropertyEntityType> }).notNull(),
    entityId: text('entity_id').notNull(),
    propertyDefinitionId: text('property_definition_id').notNull(),

    textValue: text('text_value'),
    numberValue: doublePrecision('number_value'),
    dateValue: timestamp('date_value', { mode: 'date', withTimezone: true, precision: 3 }),
    booleanValue: boolean('boolean_value'),
    selectOptionId: text('select_option_id'),
  },
  table => [
    foreignKey({
      name: 'entity_cpv_definition_fk',
      columns: [table.propertyDefinitionId, table.organizationId, table.entityType],
      foreignColumns: [customPropertyDefinitionsTable.id, customPropertyDefinitionsTable.organizationId, customPropertyDefinitionsTable.entityType],
    }).onDelete('cascade').onUpdate('cascade'),
    foreignKey({
      name: 'entity_cpv_select_option_fk',
      columns: [table.selectOptionId, table.propertyDefinitionId],
      foreignColumns: [customPropertySelectOptionsTable.id, customPropertySelectOptionsTable.propertyDefinitionId],
    }).onDelete('cascade').onUpdate('cascade'),
    index('entity_cpv_organization_entity_index').on(table.organizationId, table.entityType, table.entityId, table.propertyDefinitionId),
    index('entity_cpv_property_definition_id_index').on(table.propertyDefinitionId),
    index('entity_cpv_select_option_id_index').on(table.selectOptionId),
  ],
);
