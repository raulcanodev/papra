import type { TranslationsDictionary } from '../i18n/locales.types';
import type { CustomPropertyEntityType, CustomPropertyType } from './custom-properties.types';

export const PROPERTY_TYPE_LABEL_I18N_KEYS: Record<CustomPropertyType, keyof TranslationsDictionary> = {
  text: 'custom-properties.types.text',
  number: 'custom-properties.types.number',
  date: 'custom-properties.types.date',
  boolean: 'custom-properties.types.boolean',
  select: 'custom-properties.types.select',
  multi_select: 'custom-properties.types.multi_select',
  user_relation: 'custom-properties.types.user_relation',
  document_relation: 'custom-properties.types.document_relation',
} as const;

export const CUSTOM_PROPERTY_ENTITY_TYPES: CustomPropertyEntityType[] = ['document', 'transaction', 'customer', 'product', 'sales_representative'];

export const ENTITY_TYPE_LABEL_I18N_KEYS: Record<CustomPropertyEntityType, keyof TranslationsDictionary> = {
  document: 'custom-properties.entities.document',
  transaction: 'custom-properties.entities.transaction',
  customer: 'custom-properties.entities.customer',
  product: 'custom-properties.entities.product',
  sales_representative: 'custom-properties.entities.sales_representative',
} as const;

const SCALAR_PROPERTY_TYPES: CustomPropertyType[] = ['text', 'number', 'date', 'boolean', 'select', 'multi_select'];

// Mirrors the server rules: relation types are only available for documents
export const PROPERTY_TYPES_BY_ENTITY_TYPE: Record<CustomPropertyEntityType, CustomPropertyType[]> = {
  document: ['text', 'number', 'date', 'boolean', 'select', 'multi_select', 'user_relation', 'document_relation'],
  transaction: SCALAR_PROPERTY_TYPES,
  customer: SCALAR_PROPERTY_TYPES,
  product: SCALAR_PROPERTY_TYPES,
  sales_representative: SCALAR_PROPERTY_TYPES,
};
