import { integer, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { createPrimaryKeyField, createTimestampColumns } from '../../shared/db/columns.helpers';
import { customPropertyDefinitionsTable } from '../custom-properties.table';
import { CUSTOM_PROPERTY_SELECT_OPTION_ID_PREFIX } from './custom-properties-options.constants';

export const customPropertySelectOptionsTable = pgTable(
  'custom_property_select_options',
  {
    ...createPrimaryKeyField({ prefix: CUSTOM_PROPERTY_SELECT_OPTION_ID_PREFIX }),
    ...createTimestampColumns(),

    propertyDefinitionId: text('property_definition_id').notNull().references(() => customPropertyDefinitionsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    name: text('name').notNull(),
    key: text('key').notNull(),
    displayOrder: integer('display_order').notNull().default(0),
  },
  table => [
    uniqueIndex('custom_property_select_options_definition_id_key_unique').on(table.propertyDefinitionId, table.key),
    uniqueIndex('custom_property_select_options_definition_id_name_unique').on(table.propertyDefinitionId, table.name),
    // Target of the composite foreign key of entity values, guarantees a selected option belongs to the value definition
    uniqueIndex('custom_property_select_options_id_definition_id_unique').on(table.id, table.propertyDefinitionId),
  ],
);
